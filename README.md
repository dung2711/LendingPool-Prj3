# Lending Pool Project – Web3 DeFi Application

A decentralized lending and borrowing platform built on Ethereum.  
This project is developed as a full-stack Web3 application, including smart contracts, backend services, and a frontend interface.  
It allows users to deposit assets, borrow against collateral, and manage lending positions in a transparent and secure manner.

---

## Features

- Deposit and withdraw ERC20 assets
- Borrow assets using collateral
- Health factor calculation and risk monitoring
- Liquidation mechanism for unsafe positions
- Real-time updates via WebSocket
- On-chain event tracking and backend synchronization
- MetaMask wallet integration

---

## System Architecture

The system consists of three main layers:

### 1. Smart Contract Layer
- Implements core lending logic
- Handles asset management, borrowing, repayment, and liquidation
- Deployed on Ethereum Sepolia Testnet

### 2. Backend Layer
- Provides RESTful APIs for frontend
- Stores off-chain data in PostgreSQL
- Listens to blockchain events
- Sends real-time updates via WebSocket

### 3. Frontend Layer
- User interface for interacting with the protocol
- Connects to wallet and blockchain
- Displays real-time system state

---

## Technologies Used

### Smart Contracts
- Solidity ^0.8.28
- Hardhat & Hardhat Ignition
- OpenZeppelin (AccessControl, ReentrancyGuard, Pausable)
- Mocha & Chai (Unit Testing)

### Backend
- Node.js
- Express.js
- PostgreSQL
- Sequelize ORM
- ethers.js
- socket.io

### Frontend
- React.js
- Next.js (App Router)
- ethers.js
- axios
- socket.io-client
- Material-UI (MUI)

---

## Prerequisites
Ensure the following are installed:

- Node.js (v18 or later)
- npm or yarn
- PostgreSQL
- MetaMask browser extension
- Ethereum Sepolia testnet account with test ETH

## Getting Started

### 1. Clone Repository

```bash
git clone https://github.com/dung2711/LendingPool-Prj3.git
cd LendingPool-Prj3
```
### 2. Smart Contract Setup

Add required configuration in .env file

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat ignition deploy ignition/modules/DeployLendingPool.js --network sepolia
```
After deployment:
Save deployed contract addresses into frontend/lending-pool/.env and backend/.env
Export ABI files for frontend and backend usage (/contracts/abis.js)

```bash
node scripts/deploy-safe.js
```

Save deployed Safe contract address into .env

### 3. Backend Setup

Add required configuration in .env file

```bash
cd backend
npm install
npx nodemon index.js
```

Backend runs at: http://localhost:4000

### 4. Frontend Setup

Add required configuration in .env file

```bash
cd frontend/lending-pool
npm install
npm run dev
```
Frontend runs at: http://localhost:3000

Make sure MetaMask is connected to Sepolia Testnet.

## Testing

### Smart Contract Testing

Unit tests using Mocha & Chai

Each test is isolated with beforeEach

```bash
npx hardhat test
```

### Backend Testing

API testing using Postman
Base URL: http://localhost:4000

### Frontend Testing

Manual black-box testing

Tools: Chrome, Edge, MetaMask, Etherscan

Verify blockchain events and UI updates

## Security

Reentrancy protection via ReentrancyGuard

Role-based access control using AccessControl

Emergency pause mechanism using Pausable

Health factor validation before borrow, withdraw and liquidation

This project is developed for educational purposes and has not been audited.

## Future Improvements

Multi-chain support

Multiple wallet integrations

DAO governance

Treasury management

Flash loans

Upgradeable smart contracts

Gas optimization

Professional security audits

## License

This project is developed for academic and learning purposes.

## Author

Dũng Hoàng

GitHub: https://github.com/dung2711