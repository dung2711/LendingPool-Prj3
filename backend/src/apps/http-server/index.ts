import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import {
  getBlockchainStatus,
  getEventListener,
  initializeBlockchainServices,
  stopBlockchainServices,
} from "../../../services/blockchain/index.js";
import { createAssetController } from "../../modules/assets/asset.controller.js";
import { createTransactionController } from "../../modules/transactions/transaction.controller.js";
import { createUserController } from "../../modules/users/user.controller.js";
import assetRoute from "../../routes/assetRoute.js";
import liquidatableUserRoute from "../../routes/liquidatableUsersRoute.js";
import marketConfigRoute from "../../routes/marketConfigRoute.js";
import transactionRoute from "../../routes/transactionRoute.js";
import userAssetRoute from "../../routes/userAssetRoute.js";
import userRoute from "../../routes/userRoute.js";
import { setupInfrastructure } from "../../shared/bootstrap/common-setup.js";
import {
  createErrorHandler,
  createNotFoundHandler,
} from "../../shared/config/error.js";
import { baseEnvSchema, validateEnv } from "../../shared/config/index.js";
import { setupHttpServerDependencies } from "./setup";

const env = validateEnv(baseEnvSchema);
const infrastructure = await setupInfrastructure(env, "http-server");
const { logger } = infrastructure;
const deps = setupHttpServerDependencies({ infrastructure });

const app = express();
const PORT = process.env.PORT;

// Create HTTP server and Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://lending-pool-prj3.vercel.app"],
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", async (req, res, next) => {
  try {
    const blockchainStatus = await getBlockchainStatus();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      blockchain: blockchainStatus,
    });
  } catch (error) {
    next(error);
  }
});

// API Routes — legacy (kept until blockchain service rebuild)
app.use("/api/assets", assetRoute);
app.use("/api/users", userRoute);
app.use("/api/user-assets", userAssetRoute);
app.use("/api/market-config", marketConfigRoute);
app.use("/api/liquidatable-users", liquidatableUserRoute);
app.use("/api/transactions", transactionRoute);

// v2 module-based routes
app.use(
  "/api/v2/assets",
  createAssetController({ assetService: deps.assetService }),
);
app.use(
  "/api/v2/transactions",
  createTransactionController({ transactionService: deps.transactionService }),
);
app.use(
  "/api/v2/users",
  createUserController({ userService: deps.userService }),
);

// 404 handler — must come AFTER all routes
app.use(createNotFoundHandler(logger));

// Global error handler — must be LAST middleware (4 params)
app.use(createErrorHandler(logger));

// WebSocket connection handling
io.on("connection", (socket) => {
  logger.info("Client connected: {socketId}", { socketId: socket.id });

  socket.on("disconnect", () => {
    logger.info("Client disconnected: {socketId}", { socketId: socket.id });
  });
});

// Start server
httpServer.listen(PORT, async () => {
  logger.info("Server is running on http://localhost:{port}", { port: PORT });
  logger.info("WebSocket server is ready");

  // Initialize blockchain event listeners
  try {
    await initializeBlockchainServices();

    // Subscribe to liquidatable users updates
    const eventListener = getEventListener();
    eventListener.on("liquidatableUsersUpdated", (data) => {
      logger.info(
        "Broadcasting liquidatable users update to {clientCount} clients",
        { clientCount: io.engine.clientsCount },
      );
      io.emit("liquidatableUsersUpdated", {
        count: data.users.length,
        users: data.users,
        blockNumber: data.blockNumber,
        timestamp: data.timestamp,
      });
    });
  } catch (error) {
    logger.error("Failed to start blockchain services: {message}", {
      message: (error as Error).message,
    });
    logger.warn("Server running without blockchain event listening");
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.warn("SIGTERM signal received: closing HTTP server");
  await stopBlockchainServices();
  io.close();
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.warn("SIGINT signal received: closing HTTP server");
  await stopBlockchainServices();
  io.close();
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
