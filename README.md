# Lending Pool — Decentralized Lending & Borrowing Protocol

A full-stack decentralized lending and borrowing application built on Ethereum, inspired by the architectures of **Compound v2** and **Aave v2**. Users can deposit ERC-20 assets to earn interest, borrow against collateral, and participate in liquidations — all governed by smart contracts with no intermediaries.

> **Thesis Project** — Developed as a graduation thesis at SOICT, Hanoi University of Science and Technology.  
> **Live Demo**: [lending-pool-prj3.vercel.app](https://lending-pool-prj3.vercel.app)  
> **Network**: Ethereum Sepolia Testnet

---

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Smart Contracts](#smart-contracts)
- [Technologies Used](#technologies-used)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Security](#security)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Features

### Core Protocol
- **Deposit & Withdraw** — Supply ERC-20 assets to earn interest (no lock-up period)
- **Borrow & Repay** — Borrow against overcollateralized positions with floating interest rates
- **Liquidation** — Liquidate undercollateralized positions with liquidation incentive bonus
- **Interest Rate Model** — Two-Slope (Kinked Rate) model with algorithmic rate adjustment based on utilization
- **Lazy Accrual** — Gas-efficient O(1) interest accumulation via Global Interest Index (inspired by Compound v2)

### Governance & Security
- **UUPS Upgradeable Proxy** — Upgrade contract logic without losing user data or contract address
- **5-Layer Defense-in-Depth Security** — ReentrancyGuard, initialization safety, access control, business logic guards, treasury protection
- **Multisig + Timelock** — All admin actions require multi-signature approval and mandatory time delay
- **Chainlink Oracle Integration** — Decentralized price feeds with stale price protection

### Backend Infrastructure
- **Multi-Process Event-Driven Architecture** — 5 independent workers coordinated via RabbitMQ
- **Blockchain Indexer** — Custom-built indexer with polling-based event scanning
- **Blockchain Reorganization Handling** — Automatic detection, rollback, and re-index with Redis distributed lock
- **Daily Snapshots** — Historical data for TVL charts and user position tracking
- **Real-time Updates** — WebSocket push for liquidatable positions via Redis pub/sub

### Frontend
- **Sign-In with Ethereum (EIP-4361)** — Wallet-based authentication, no username/password
- **Dual Data Strategy** — Financial data from blockchain (view functions), historical data from backend API
- **Real-time Interest Display** — Balance updates every 15 seconds via on-chain view functions
- **Admin Panel** — Multisig proposal management with timelock queue visualization

---

## System Architecture

The system follows a **three-layer architecture** where Smart Contracts serve as the central authority (unlike traditional Web2 where backend is the source of truth):

```
┌─────────────┐     EIP-1193      ┌──────────────┐    JSON-RPC     ┌─────────────────┐
│   Frontend   │◄────────────────►│   MetaMask    │◄──────────────►│  RPC Provider   │
│  (Next.js)   │                  │  (Wallet)     │                │ (Alchemy/Infura) │
└──────┬───────┘                  └───────────────┘                └────────┬────────┘
       │ HTTPS / WebSocket                                                  │
       │                                                                    │
┌──────▼───────┐     RabbitMQ     ┌──────────────┐    eth_getLogs   ┌──────▼────────┐
│   Backend    │◄────────────────►│  blc-indexer  │◄──────────────►│  Blockchain    │
│ (5 workers)  │                  │  blc-worker   │                │  (Ethereum)    │
└──────┬───────┘                  │  croner       │                │                │
       │                          │  noti-worker  │                │ Smart Contracts│
┌──────▼───────┐                  │  http-server  │                └────────────────┘
│  PostgreSQL  │                  └───────┬───────┘
│  Redis       │◄─────────────────────────┘
│  RabbitMQ    │
└──────────────┘
```

---

## Smart Contracts

7 logic contracts + 2 UUPS proxies deployed on Sepolia:

| Contract | Type | Purpose |
|---|---|---|
| **LendingPool** | UUPS Proxy | Core protocol — deposit, borrow, repay, withdraw, interest accrual, treasury |
| **LendingPoolStorage** | Storage | Separated storage for UUPS upgrade safety (50-slot gap) |
| **Liquidation** | Standard | Liquidation logic — health factor check, seize calculation, close factor |
| **InterestRateModel** | Standard (Immutable) | Two-Slope interest rate calculation (multiple instances per asset type) |
| **PriceRouter** | UUPS Proxy | Oracle abstraction layer — routes to Chainlink or MyOracle |
| **PriceRouterStorage** | Storage | Separated storage for PriceRouter |
| **MyOracle** | Standard | Self-managed oracle for testnet price feeds |
| **ProtocolController** | Standard | Single entry point for all admin actions, atomic multi-contract updates |
| **ProtocolTimelock** | Standard | Mandatory time delay for admin actions (inherits OpenZeppelin TimelockController) |

### Contract Interaction Flow
```
[User]  ──► LendingPool ──► InterestRateModel (get rates)
                │           ──► PriceRouter ──► Chainlink / MyOracle (get prices)
                │
[Liquidator] ──► Liquidation ──► LendingPool.seizeCollateral()
                               ──► LendingPool.repayFromLiquidation()
                               ──► PriceRouter.getPrice()

[Admin/Multisig] ──► ProtocolTimelock ──► ProtocolController ──► All contracts
```

---

## Technologies Used

### Smart Contracts
| Technology | Version | Purpose |
|---|---|---|
| Solidity | ^0.8.28 | Smart contract language |
| Hardhat | ^2.26.5 | Development framework, testing, deployment |
| OpenZeppelin Contracts | ^5.4.0 | UUPS, ReentrancyGuard, Pausable, AccessControl, TimelockController |
| OpenZeppelin Upgradeable | ^5.6.1 | Upgradeable contract base classes |
| Chainlink Contracts | ^1.5.0 | AggregatorV3Interface for price feeds |
| ethers.js | ^6.15.0 | Blockchain interaction in scripts and tests |
| TypeScript | ^5.9.3 | Type-safe deploy scripts and tests |
| Chai + Mocha | ^4.5.0 | Assertion and test framework |
| solidity-coverage | ^0.8.16 | Code coverage analysis |
| hardhat-gas-reporter | ^2.3.0 | Gas consumption reporting |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 22.19.0 | Runtime |
| TypeScript | ^5.9.3 | Type safety |
| Express.js | ^5.1.0 | REST API |
| Sequelize | ^6.37.8 | ORM for PostgreSQL |
| PostgreSQL | 18.1 | Primary database (DECIMAL(78,0) for uint256) |
| RabbitMQ | 4.2.3 | Message broker (at-least-once delivery) |
| Redis | 8.4.0 | Reorg lock, pub/sub, cache |
| ethers.js | ^6.15.0 | Blockchain event scanning |
| Socket.io | ^4.8.1 | Real-time WebSocket |
| Vitest | ^4.1.7 | Unit testing framework |
| Zod | ^4.3.6 | Input validation |
| Nodemailer | ^8.0.5 | Email notifications |
| Jose | ^6.2.3 | JWT token management |
| Croner | ^10.0.1 | Cron job scheduler |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | ^16.1.1 | React framework with SSR |
| React | 19.2.0 | UI library |
| ethers.js | ^6.15.0 | Wallet and contract interaction |
| Material-UI (MUI) | ^7.3.5 | UI component library |
| Socket.io-client | ^4.8.1 | Real-time updates |
| Axios | ^1.13.2 | HTTP client |
| Safe Global SDK | ^6.1.2 | Multisig wallet integration |

---

## Project Structure

```
lending-pool-prj3/
├── contracts/                    # Smart contract layer
│   ├── contracts/                # Solidity source files
│   │   ├── LendingPool.sol       # Core lending protocol
│   │   ├── LendingPoolStorage.sol
│   │   ├── Liquidation.sol       # Liquidation logic
│   │   ├── InterestRateModel.sol # Two-Slope rate model
│   │   ├── PriceRouter.sol       # Oracle abstraction
│   │   ├── PriceRouterStorage.sol
│   │   ├── MyOracle.sol          # Test oracle
│   │   ├── ProtocolController.sol # Admin entry point
│   │   ├── ProtocolTimelock.sol  # Timelock governance
│   │   ├── interfaces/           # Contract interfaces
│   │   └── test/MockERC20.sol    # Test token
│   ├── test/                     # Test suites (127 tests)
│   ├── scripts/deploy-protocol/  # 3-phase deploy scripts
│   ├── deployments/              # Deployed addresses & ABIs
│   └── hardhat.config.ts
│
├── backend/                      # Backend layer
│   ├── src/
│   │   ├── apps/                 # 5 independent worker entry points
│   │   │   ├── blc-indexer/      # Blockchain scanner
│   │   │   ├── blc-worker/       # Event processor
│   │   │   ├── croner/           # Snapshot & Safe scanner
│   │   │   ├── noti_proposal-worker/ # Email & proposal notifications
│   │   │   ├── http-server/      # REST API & WebSocket
│   │   │   └── seed/             # Database seeding
│   │   ├── models/               # Sequelize models (15 tables)
│   │   ├── modules/              # Business logic by domain
│   │   └── shared/               # Database, config, utils
│   ├── test/                     # Test suites (71 tests)
│   ├── infra/docker-compose.local.yaml  # PostgreSQL, Redis, RabbitMQ
│   └── logs/                     # Worker log files
│
├── frontend/                     # Frontend layer
│   ├── app/                      # Next.js App Router pages
│   │   ├── dashboard/            # User position dashboard
│   │   ├── supply/               # Deposit page
│   │   ├── borrow/               # Borrow page
│   │   ├── liquidation/          # Liquidation page
│   │   ├── history/              # Transaction history
│   │   ├── proposals/            # Governance proposals
│   │   └── admin/                # Admin panel
│   ├── components/               # Reusable UI components
│   ├── hooks/                    # React hooks (useContracts)
│   ├── services/                 # API service layer
│   ├── lib/                      # Web3 & axios config
│   └── types/                    # TypeScript type definitions
│
├── shared/                       # Shared utilities across layers
└── thesis/                       # Graduation thesis LaTeX source
```

---

## Prerequisites

- **Node.js** v22+ (v18+ minimum)
- **npm** (included with Node.js)
- **Docker & Docker Compose** (for PostgreSQL, Redis, RabbitMQ)
- **MetaMask** browser extension
- Ethereum Sepolia testnet account with test ETH
- RPC Provider URL (Alchemy or Infura)

---

## Getting Started

### 1. Clone Repository

```bash
git clone https://github.com/dung2711/LendingPool-Prj3.git
cd LendingPool-Prj3
```

### 2. Smart Contract Setup

```bash
cd contracts
npm install
cp .env.example .env
# Edit .env with your private key, RPC URL, and Safe configuration
```

**Compile & Test:**
```bash
npx hardhat compile
npx hardhat test
```

**Deploy to Sepolia (3-phase deployment):**
```bash
# Phase 1: Deploy all contracts
# Phase 2: Wire contracts together
# Phase 3: Migrate admin to ProtocolController + Timelock
npm run deploy:sepolia
```

After deployment, addresses are saved to `deployments/addresses.json` and ABIs to `deployments/abis.json`.

**Deploy Safe Multisig Wallet:**
```bash
npx hardhat run scripts/deploy-safe.ts --network sepolia
```

### 3. Backend Setup

**Start infrastructure services:**
```bash
cd backend
docker compose -f infra/docker-compose.local.yaml up -d
```

This starts:
- **PostgreSQL** (port 5432) — primary database
- **Redis** (port 6379) — reorg lock, pub/sub, cache
- **RabbitMQ** (port 5672, management UI at 15672) — message broker

**Configure environment:**
```bash
cp .env.example .env
# Edit .env with RPC URLs, contract addresses, database credentials, etc.
npm install
```

**Start all 5 workers** (each in a separate terminal):
```bash
npm run dev:indexer       # Blockchain scanner + reorg handler
npm run dev:worker        # Event processor (RabbitMQ consumer)
npm run dev:croner        # Daily snapshots + Safe Multisig scanner
npm run dev:noti-worker   # Email notifications + proposal tracker
npm run dev:server        # REST API + WebSocket (http://localhost:4000)
```

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Edit .env with backend URL and contract addresses
npm install
npm run dev
```

Frontend runs at: **http://localhost:3000**

> Make sure MetaMask is connected to Sepolia Testnet.

---

## Testing

### Smart Contract Tests

**127 test cases** across 4 test suites — **100% pass rate**

```bash
cd contracts
npx hardhat test
```

| Test Suite | Tests | Coverage |
|---|---|---|
| LendingPool.test.ts | 38 | Deposit, withdraw, borrow, repay, accrueInterest, preview functions |
| Liquidation.test.ts | 31 | Constructor validation, health factor, seize calculation, liquidate execution |
| InterestRateModel.test.ts | 8 | Two-Slope model at various utilization levels |
| ProtocolController.test.ts | 50 | Admin functions, UUPS upgrade, access control, treasury management |

**Code Coverage:**
```bash
npx hardhat coverage
```

| Metric | Coverage |
|---|---|
| Statements | 93.14% |
| Functions | 95% |
| Lines | 91.93% |
| Branches | 73.63% |

**Gas Report:**

| Function | Avg Gas |
|---|---|
| deposit | ~136,393 |
| borrow | ~127,718 |
| withdraw | ~84,541 |
| repay | ~59,217 |
| liquidate | ~164,849 |

### Backend Tests

**71 test cases** across 9 test suites — **100% pass rate**

```bash
cd backend
npm test
```

Tests cover: authentication (SIWE + JWT + session), blockchain event handlers (idempotency + reorg protection), asset/user/transaction services, rate limiting, and input validation.

### Frontend Tests

Manual black-box testing across Chrome, Edge with MetaMask integration. End-to-end flow: blockchain event → indexer → RabbitMQ → worker → database → frontend display.

---

## Security

The protocol implements a **5-layer defense-in-depth** security architecture:

| Layer | Mechanism | Protection |
|---|---|---|
| 1 | ReentrancyGuard, SafeERC20, Pausable | Contract-level attack prevention |
| 2 | `_disableInitializers()` | Initialization hijack prevention |
| 3 | `onlyController`, `onlyLiquidation` modifiers | Access control |
| 4 | Business logic guards in every function | Parameter and state validation |
| 5 | Treasury invariant checks | Protocol fund protection |

**Governance:**
- All admin actions go through **Safe Multisig** (k-of-n signatures required)
- **ProtocolTimelock** enforces mandatory delay before execution
- **Atomic multi-contract updates** prevent inconsistent state

> ⚠️ This project is developed for academic purposes and has **not been audited** by a third party. Do not use in production with real funds.

---

## Future Improvements

| Priority | Improvement |
|---|---|
| Short-term | Automated frontend tests (Playwright), increase PriceRouter branch coverage, Slither CI integration |
| Mid-term | Professional security audit, Flash Loan support, DAO governance with token voting, E-Mode for correlated assets |
| Long-term | Multi-chain deployment (Polygon, Arbitrum, Base), gas optimization, mainnet deployment |

---

## License

This project is developed for academic and learning purposes.

---

## Author

**Đinh Tạ Hoàng Dũng**  
Hanoi University of Science and Technology — School of ICT (SOICT)  
GitHub: [github.com/dung2711](https://github.com/dung2711)