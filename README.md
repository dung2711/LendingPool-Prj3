# Lending Pool Dapp

.env:
PRIVATE_KEY
INFURA_URL

# Contracts(Deploy via hardhat to Sepolia, using INFURA URL)
LendingPool
Liquidation
MyOracle
PriceRouter
InterestRateModel
MyToken(for testing)

# Frontend(Nextjs, MUI)
-- cd frontend/lending pool
-- npm install

.env:
NEXT_PUBLIC_LENDING_POOL_ADDRESS
NEXT_PUBLIC_INTEREST_RATE_MODEL_ADDRESS
NEXT_PUBLIC_MY_ORACLE_ADDRESS
NEXT_PUBLIC_MY_TOKEN_ADDRESS
NEXT_PUBLIC_PRICE_ROUTER_ADDRESS
NEXT_PUBLIC_LIQUIDATION_ADDRESS
NEXT_PUBLIC_WETH_ADDRESS
NEXT_PUBLIC_API_BASE_URL

# Backend(Express, Sequelize)
-- cd backend
-- npm install

Listen to events emitted from contracts, sync data to postgre database
Provide API for getting data

