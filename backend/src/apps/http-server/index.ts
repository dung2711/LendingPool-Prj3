import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import {
  createAuthController,
  createAuthCookieOptions,
} from "src/modules/auth";
import { createLogController } from "src/modules/logs-chart";
import { createProposalController } from "src/modules/proposals/proposal.controller";
import { createSnapshotController } from "src/modules/snapshots";
import { createAssetController } from "../../modules/assets/asset.controller";
import { createEmailController } from "../../modules/email/email.controller";
import { createTransactionController } from "../../modules/transactions/transaction.controller";
import { createUserController } from "../../modules/users/user.controller";
import { setupInfrastructure } from "../../shared/bootstrap/common-setup.js";
import {
  createErrorHandler,
  createNotFoundHandler,
} from "../../shared/config/error.js";
import { baseEnvSchema, validateEnv } from "../../shared/config/index.js";
import { createWsServer } from "../../shared/ws/index.js";
import { setupHttpServerDependencies } from "./setup";

dotenv.config();

const env = validateEnv(baseEnvSchema);
const infrastructure = await setupInfrastructure(env, "http-server");
const { logger, redisClient, cleanup } = infrastructure;
const deps = setupHttpServerDependencies({ infrastructure, env });
const authCookieOptions = createAuthCookieOptions(env);
const corsOptions = {
  origin: ["http://localhost:3000", "https://lending-pool-prj3.vercel.app"],
  methods: ["GET", "POST"],
  credentials: true,
};

const app = express();

// Create HTTP server and Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  deps.ipRateLimit({
    limit: 60,
    windowMs: 60_000,
    message: "Too many requests. Please slow down.",
    keyPrefix: "ip_rl:global",
  }),
);

app.use(
  "/api/auth",
  createAuthController({
    signatureService: deps.signatureService,
    sessionService: deps.sessionService,
    authMiddleware: deps.authMiddleware,
    cookieOptions: authCookieOptions,
  }),
);
app.use(
  "/api/assets",
  createAssetController({ assetService: deps.assetService }),
);
app.use(
  "/api/transactions",
  createTransactionController({
    transactionService: deps.transactionService,
    authMiddleware: deps.authMiddleware,
  }),
);
app.use(
  "/api/users",
  createUserController({
    userService: deps.userService,
    authMiddleware: deps.authMiddleware,
  }),
);
app.use(
  "/api/email",
  createEmailController({
    otpService: deps.otpService,
    emailRegistrationService: deps.emailRegistrationService,
    authMiddleware: deps.authMiddleware,
    ipRateLimit: deps.ipRateLimit,
  }),
);
app.use(
  "/api/proposals",
  createProposalController({ proposalService: deps.proposalService }),
);
app.use(
  "/api/snapshots",
  createSnapshotController({
    snapshotQueryService: deps.snapshotQueryService,
    authMiddleware: deps.authMiddleware,
  }),
);
app.use(
  "/api/logs",
  createLogController({ logQueryService: deps.logQueryService }),
);

app.get("/health", (req, res, next) => {
  try {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.use(createNotFoundHandler(logger));

app.use(createErrorHandler(logger));

// Initialize WebSocket event server (listens to Redis pub/sub)
const wsServer = createWsServer({
  io,
  redis: redisClient,
  logger,
  env,
});

// Start server
httpServer.listen(env.PORT, "0.0.0.0", async () => {
  logger.info("Server is running on http://localhost:{port}", {
    port: env.PORT,
  });
  logger.info("WebSocket server is ready");

  // Start WebSocket event subscription
  try {
    await wsServer.start();
  } catch (error) {
    logger.warn("Failed to start WebSocket event server: {message}", {
      message: (error as Error).message,
    });
  }
});

async function shutdown() {
  try {
    await wsServer.stop();
  } catch (error) {
    logger.warn("Error stopping WebSocket server: {message}", {
      message: (error as Error).message,
    });
  }

  // Close HTTP server
  httpServer.close(() => {
    logger.info("HTTP server closed");
  });

  await cleanup();
  process.exit(0);
}

let isShuttingDown = false;

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn("SIGTERM signal received: closing HTTP server");
  await shutdown();
});

process.on("SIGINT", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn("SIGINT signal received: closing HTTP server");
  await shutdown();
});
