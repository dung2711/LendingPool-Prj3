import hardhat from "hardhat";

const { ethers, upgrades } = hardhat;

import type { ProtocolConfig, SupportedNetwork } from "../config";
import type { Addresses } from "../utils/save";

export async function deployPhase1(
  protocolConfig: ProtocolConfig,
  network: SupportedNetwork,
): Promise<Addresses> {
  const safeAddress = process.env.SAFE_ADDRESS;
  const [deployer] = await ethers.getSigners();
  console.log("\n========== PHASE 1: DEPLOY ==========");
  console.log("Deploying contracts with the account:", deployer.address);

  const addresses: Addresses = {};
  addresses[network] = {};
  const IRM = await ethers.getContractFactory("InterestRateModel");
  const stableCoinIRM = await IRM.deploy(
    ethers.parseEther(protocolConfig.irm.stable.baseRate.toString()),
    ethers.parseEther(protocolConfig.irm.stable.rateSlope1.toString()),
    ethers.parseEther(protocolConfig.irm.stable.rateSlope2.toString()),
    ethers.parseEther(protocolConfig.irm.stable.optimalUtilization.toString()),
    ethers.parseEther(protocolConfig.irm.stable.reserveFactor.toString()),
  );
  await stableCoinIRM.waitForDeployment();
  console.log("Stablecoin IRM deployed at:", stableCoinIRM.target);
  addresses[network].stableCoinIRM = await stableCoinIRM.getAddress();

  const volatileCoinIRM = await IRM.deploy(
    ethers.parseEther(protocolConfig.irm.volatile.baseRate.toString()),
    ethers.parseEther(protocolConfig.irm.volatile.rateSlope1.toString()),
    ethers.parseEther(protocolConfig.irm.volatile.rateSlope2.toString()),
    ethers.parseEther(
      protocolConfig.irm.volatile.optimalUtilization.toString(),
    ),
    ethers.parseEther(protocolConfig.irm.volatile.reserveFactor.toString()),
  );
  await volatileCoinIRM.waitForDeployment();
  console.log("Volatilecoin IRM deployed at:", volatileCoinIRM.target);
  addresses[network].volatileCoinIRM = await volatileCoinIRM.getAddress();

  const MyOracle = await ethers.getContractFactory("MyOracle");
  const myOracle = await MyOracle.deploy(deployer.address);
  await myOracle.waitForDeployment();
  console.log("MyOracle deployed at:", myOracle.target);
  addresses[network].myOracle = await myOracle.getAddress();

  const PriceRouter = await ethers.getContractFactory("PriceRouter");
  const priceRouter = await upgrades.deployProxy(
    PriceRouter,
    [addresses[network].myOracle, deployer.address],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );
  await priceRouter.waitForDeployment();
  console.log("PriceRouter deployed at:", priceRouter.target);
  addresses[network].priceRouter = await priceRouter.getAddress();
  addresses[network].priceRouterImpl =
    await upgrades.erc1967.getImplementationAddress(
      addresses[network].priceRouter,
    );
  console.log(
    "PriceRouter implementation deployed at:",
    addresses[network].priceRouterImpl,
  );

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await upgrades.deployProxy(
    LendingPool,
    [
      deployer.address,
      addresses[network].priceRouter,
      ethers.parseEther(protocolConfig.collateralFactor.toString()),
      deployer.address,
    ],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );
  await lendingPool.waitForDeployment();
  console.log("LendingPool deployed at:", lendingPool.target);
  addresses[network].lendingPool = await lendingPool.getAddress();
  addresses[network].lendingPoolImpl =
    await upgrades.erc1967.getImplementationAddress(
      addresses[network].lendingPool,
    );
  console.log(
    "LendingPool implementation deployed at:",
    addresses[network].lendingPoolImpl,
  );

  const Liquidation = await ethers.getContractFactory("Liquidation");
  const liquidation = await Liquidation.deploy(
    addresses[network].priceRouter,
    addresses[network].lendingPool,
    ethers.parseEther(protocolConfig.liquidationThreshold.toString()),
    ethers.parseEther(protocolConfig.closeFactor.toString()),
    ethers.parseEther(protocolConfig.liquidationIncentive.toString()),
    deployer.address,
  );
  await liquidation.waitForDeployment();
  console.log("Liquidation deployed at:", liquidation.target);
  addresses[network].liquidation = await liquidation.getAddress();

  const Controller = await ethers.getContractFactory("ProtocolController");
  const controller = await Controller.deploy(
    addresses[network].lendingPool,
    addresses[network].priceRouter,
    addresses[network].myOracle,
    addresses[network].liquidation,
    safeAddress,
  );
  await controller.waitForDeployment();
  console.log("Controller deployed at:", controller.target);
  addresses[network].controller = await controller.getAddress();

  console.log("\nPhase 1 deployment completed.");
  return addresses;
}
