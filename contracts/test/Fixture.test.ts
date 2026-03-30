import hardhat from "hardhat";

const { ethers } = hardhat;

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { protocolConfig } from "../scripts/deploy-protocol/config";
import {
  deployPhase1,
  deployPhase2,
  deployPhase3,
} from "../scripts/deploy-protocol/phases";
import type { Addresses } from "../scripts/deploy-protocol/utils/save";
import type {
  InterestRateModel,
  LendingPool,
  Liquidation,
  MockERC20,
  MyOracle,
  PriceRouter,
  ProtocolController,
  ProtocolTimelock,
} from "../typechain-types";

const TEST_NETWORK = "sepolia";
const testConfig = protocolConfig[TEST_NETWORK];

export interface TestContracts {
  addresses: Addresses;
  lendingPool: LendingPool;
  liquidation: Liquidation;
  myOracle: MyOracle;
  priceRouter: PriceRouter;
  timelock: ProtocolTimelock;
  stableCoinIRM: InterestRateModel;
  volatileCoinIRM: InterestRateModel;
  protocolController: ProtocolController;
}

async function executeControllerViaTimelock(
  timelock: ProtocolTimelock,
  proposer: HardhatEthersSigner,
  protocolController: ProtocolController,
  functionName: string,
  args: readonly unknown[],
) {
  const controllerAddress = await protocolController.getAddress();
  // Use a generic Interface encoder because this helper takes dynamic function names.
  const data = new ethers.Interface(
    protocolController.interface.fragments,
  ).encodeFunctionData(functionName, [...args]);
  const predecessor = ethers.ZeroHash;
  const salt = ethers.hexlify(ethers.randomBytes(32));

  await (
    await timelock
      .connect(proposer)
      .schedule(controllerAddress, 0n, data, predecessor, salt, 0n)
  ).wait();

  return timelock
    .connect(proposer)
    .execute(controllerAddress, 0n, data, predecessor, salt);
}

export async function deployProtocolFixture(): Promise<TestContracts> {
  const [deployer] = await ethers.getSigners();
  process.env.SAFE_ADDRESS = deployer.address;
  process.env.TIMELOCK_MIN_DELAY_SECONDS = "0";

  const addresses: Addresses = await deployPhase1(testConfig, TEST_NETWORK);
  await deployPhase2(TEST_NETWORK, addresses);
  await deployPhase3(TEST_NETWORK, addresses);

  const networkAddresses = addresses[TEST_NETWORK];
  const lendingPool = (await ethers.getContractAt(
    "LendingPool",
    networkAddresses.lendingPool,
  )) as LendingPool;
  const liquidation = (await ethers.getContractAt(
    "Liquidation",
    networkAddresses.liquidation,
  )) as Liquidation;
  const myOracle = (await ethers.getContractAt(
    "MyOracle",
    networkAddresses.myOracle,
  )) as MyOracle;
  const priceRouter = (await ethers.getContractAt(
    "PriceRouter",
    networkAddresses.priceRouter,
  )) as PriceRouter;
  const timelockAddress = networkAddresses.timelock;
  if (!timelockAddress) {
    throw new Error("Timelock address missing in deployment output");
  }
  const timelock = (await ethers.getContractAt(
    "ProtocolTimelock",
    timelockAddress,
  )) as ProtocolTimelock;
  const stableCoinIRM = (await ethers.getContractAt(
    "InterestRateModel",
    networkAddresses.stableCoinIRM,
  )) as InterestRateModel;
  const volatileCoinIRM = (await ethers.getContractAt(
    "InterestRateModel",
    networkAddresses.volatileCoinIRM,
  )) as InterestRateModel;
  const protocolController = (await ethers.getContractAt(
    "ProtocolController",
    networkAddresses.controller,
  )) as ProtocolController;

  const adminRole = await protocolController.DEFAULT_ADMIN_ROLE();

  await (
    await executeControllerViaTimelock(
      timelock,
      deployer,
      protocolController,
      "grantRole",
      [adminRole, deployer.address],
    )
  ).wait();

  return {
    addresses,
    lendingPool,
    liquidation,
    myOracle,
    priceRouter,
    timelock,
    stableCoinIRM,
    volatileCoinIRM,
    protocolController,
  };
}

export async function deployProtocolWithMarketsFixture() {
  const contracts = await deployProtocolFixture();
  const [admin, alice, bob, liquidator] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  const wbtc = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8);
  await usdc.waitForDeployment();
  await weth.waitForDeployment();
  await wbtc.waitForDeployment();

  const stableIRM = contracts.addresses[TEST_NETWORK].stableCoinIRM;
  const volatileIRM = contracts.addresses[TEST_NETWORK].volatileCoinIRM;

  await (
    await executeControllerViaTimelock(
      contracts.timelock,
      admin,
      contracts.protocolController,
      "supportMarketWithMyOracleFeed",
      [usdc.target, stableIRM, ethers.parseEther("1")],
    )
  ).wait();
  await (
    await executeControllerViaTimelock(
      contracts.timelock,
      admin,
      contracts.protocolController,
      "supportMarketWithMyOracleFeed",
      [weth.target, volatileIRM, ethers.parseEther("2000")],
    )
  ).wait();
  await (
    await executeControllerViaTimelock(
      contracts.timelock,
      admin,
      contracts.protocolController,
      "supportMarketWithMyOracleFeed",
      [wbtc.target, volatileIRM, ethers.parseEther("30000")],
    )
  ).wait();

  return {
    ...contracts,
    tokens: {
      usdc,
      weth,
      wbtc,
    },
    signers: {
      admin,
      alice,
      bob,
      liquidator,
    },
  };
}

export async function fundUser(
  token: MockERC20,
  user: HardhatEthersSigner,
  amount: bigint,
  minter: HardhatEthersSigner,
) {
  await token.connect(minter).mint(user, amount);
}

export async function fundAndDeposit(
  token: MockERC20,
  user: HardhatEthersSigner,
  amount: bigint,
  lendingPool: LendingPool,
  minter: HardhatEthersSigner,
) {
  await fundUser(token, user, amount, minter);
  await token.connect(user).approve(lendingPool.target, amount);
  await lendingPool.connect(user).deposit(token.target, amount);
}

export async function donateToPool(
  token: MockERC20,
  amount: bigint,
  lendingPool: LendingPool,
) {
  const [donor] = await ethers.getSigners();
  await token.connect(donor).approve(lendingPool.target, amount);
  await lendingPool.connect(donor).donate(token.target, amount);
}

export async function setupLiquidatablePosition(
  usdc: MockERC20,
  weth: MockERC20,
  lendingPool: LendingPool,
  bob: HardhatEthersSigner,
  alice: HardhatEthersSigner,
  admin: HardhatEthersSigner,
  protocolController: ProtocolController,
  timelock?: ProtocolTimelock,
) {
  const wethAmount = ethers.parseEther("1"); // 1 WETH
  const usdcLiquidity = ethers.parseUnits("5000", 6);
  const borrowAmount = ethers.parseUnits("1500", 6); // $1500

  // Bob cung cấp thanh khoản
  await fundAndDeposit(usdc, bob, usdcLiquidity, lendingPool, admin);
  // Alice deposit WETH + borrow USDC
  await fundAndDeposit(weth, alice, wethAmount, lendingPool, admin);
  await lendingPool.connect(alice).borrow(usdc.target, borrowAmount);

  // Giá WETH giảm từ $2000 → $1500 → Alice health = 1500*0.9/1500 = 0.9 → dưới threshold
  // liquidationThreshold=0.9e18 nghĩa là borrowedUSD/depositedUSD >= 0.9 → liquidatable
  if (timelock) {
    await (
      await executeControllerViaTimelock(
        timelock,
        admin,
        protocolController,
        "setPrice",
        [weth.target, ethers.parseEther("1500")],
      )
    ).wait();
  } else {
    await protocolController.setPrice(weth.target, ethers.parseEther("1500"));
  }

  return { wethAmount, borrowAmount };
}
