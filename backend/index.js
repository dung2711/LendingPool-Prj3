import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import sequelize from "./config/database.js";
import assetRoute from './routes/assetRoute.js';
import userRoute from './routes/userRoute.js';
import transactionRoute from './routes/transactionRoute.js';
import userAssetRoute from './routes/userAssetRoute.js';
import marketConfigRoute from './routes/marketConfigRoute.js';
import liquidatableUserRoute from './routes/liquidatableUsersRoute.js';
import { initializeBlockchainServices, stopBlockchainServices, getBlockchainStatus, getEventListener } from './services/blockchain/index.js';

const app = express();
const PORT = process.env.PORT;

// Create HTTP server and Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

try {
    await sequelize.authenticate();
    console.log('✅ DB connected');
    await sequelize.sync(); // or { alter: true }
    console.log('✅ Models synced');
  } catch (err) {
    console.error('❌ DB connection error:', err);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const blockchainStatus = await getBlockchainStatus();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      blockchain: blockchainStatus
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// API Routes
app.use("/api/assets", assetRoute);
app.use("/api/users", userRoute);
app.use("/api/transactions", transactionRoute);
app.use("/api/user-assets", userAssetRoute);
app.use("/api/market-config", marketConfigRoute);
app.use("/api/liquidatable-users", liquidatableUserRoute);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is ready`);
  
  // Initialize blockchain event listeners
  try {
    await initializeBlockchainServices();
    
    // Subscribe to liquidatable users updates
    const eventListener = getEventListener();
    eventListener.on('liquidatableUsersUpdated', (data) => {
      console.log(`📡 Broadcasting liquidatable users update to ${io.engine.clientsCount} clients`);
      io.emit('liquidatableUsersUpdated', {
        count: data.users.length,
        users: data.users,
        blockNumber: data.blockNumber,
        timestamp: data.timestamp
      });
    });
  } catch (error) {
    console.error('Failed to start blockchain services:', error.message);
    console.log('Server running without blockchain event listening\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nSIGTERM signal received: closing HTTP server');
  await stopBlockchainServices();
  io.close();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  await stopBlockchainServices();
  io.close();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});