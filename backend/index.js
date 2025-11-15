import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import sequelize from "./config/database.js";
import assetRoute from './routes/assetRoute.js';
import userRoute from './routes/userRoute.js';
import transactionRoute from './routes/transactionRoute.js';
import userAssetRoute from './routes/userAssetRoute.js';
import { initializeBlockchainServices, stopBlockchainServices, getBlockchainStatus } from './services/blockchain/index.js';

const app = express();
const PORT = process.env.PORT;

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
app.use("/api", assetRoute);
app.use("/api", userRoute);
app.use("/api", transactionRoute);
app.use("/api", userAssetRoute);

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

// Start server
const server = app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  
  // Initialize blockchain event listeners
  try {
    await initializeBlockchainServices();
  } catch (error) {
    console.error('Failed to start blockchain services:', error.message);
    console.log('Server running without blockchain event listening\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM signal received: closing HTTP server');
  await stopBlockchainServices();
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT signal received: closing HTTP server');
  await stopBlockchainServices();
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});