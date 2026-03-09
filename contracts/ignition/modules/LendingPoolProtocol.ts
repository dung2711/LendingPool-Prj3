import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hardhat from "hardhat";

const { ethers } = hardhat;

export default buildModule("LendingPoolProtocol", (m) => {
  const SAFE_ADDRESS = process.env.SAFE_ADDRESS;
  if (!SAFE_ADDRESS) {
    throw new Error("SAFE_ADDRESS environment variable not set");
  }
  if (!ethers.isAddress(SAFE_ADDRESS)) {
    throw new Error("SAFE_ADDRESS is not a valid address");
  }
  const myToken = m.contract("MyToken");

  const myOracle = m.contract("MyOracle");

  const priceRouter = m.contract("PriceRouter", [myOracle]);

  const baseRate = m.getParameter("_baseRate", ethers.parseUnits("0.02", 18));
  const rateSlope1 = m.getParameter(
    "_rateSlope1",
    ethers.parseUnits("0.08", 18),
  );
  const rateSlope2 = m.getParameter("_rateSlope2", ethers.parseUnits("1", 18));
  const optimalUtilization = m.getParameter(
    "_optimalUtilization",
    ethers.parseUnits("0.8", 18),
  );
  const reserveFactor = m.getParameter(
    "_reserveFactor",
    ethers.parseUnits("0.1", 18),
  );

  const interestRateModel = m.contract("InterestRateModel", [
    baseRate,
    rateSlope1,
    rateSlope2,
    optimalUtilization,
    reserveFactor,
  ]);

  const collateralFactor = m.getParameter(
    "_collateralFactor",
    ethers.parseUnits("0.8", 18),
  );

  const lendingPool = m.contract("LendingPool", [
    ethers.ZeroAddress,
    priceRouter,
    collateralFactor,
    SAFE_ADDRESS,
  ]);

  const liquidationThreshold = m.getParameter(
    "_liquidationThreshold",
    ethers.parseUnits("0.9", 18),
  );
  const closeFactor = m.getParameter(
    "_closeFactor",
    ethers.parseUnits("0.5", 18),
  );
  const liquidationIncentive = m.getParameter(
    "_liquidationIncentive",
    ethers.parseUnits("0.05", 18),
  );

  const liquidation = m.contract("Liquidation", [
    priceRouter,
    lendingPool,
    liquidationThreshold,
    closeFactor,
    liquidationIncentive,
  ]);

  m.call(myOracle, "setPrice", [myToken, ethers.parseUnits("1", 18)]);
  m.call(priceRouter, "setMyOracleFeed", [myToken]);
  m.call(interestRateModel, "setLendingPool", [lendingPool]);
  m.call(lendingPool, "setLiquidation", [liquidation]);
  m.call(lendingPool, "supportMarket", [myToken, interestRateModel]);

  return {
    myToken,
    myOracle,
    priceRouter,
    interestRateModel,
    liquidation,
    lendingPool,
  };
});
