import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PriceRouterOnly", (m) => {
  const myOracle = m.contractAt(
    "MyOracle",
    "0x81807943182071C525efE400e98DdBc03DCF3897",
  );
  const lendingPool = m.contractAt(
    "LendingPool",
    "0xe2627F4028c82CBa92744a4DC1dB6098305401E0",
  );
  const liquidation = m.contractAt(
    "Liquidation",
    "0xbeFFDfDD05e444dE2472C9FA533d22708c3367FA",
  );

  const priceRouter = m.contract("PriceRouter", [myOracle]);

  m.call(lendingPool, "setPriceRouter", [priceRouter]);
  m.call(liquidation, "setPriceRouter", [priceRouter]);

  return {
    priceRouter,
    myOracle,
    lendingPool,
    liquidation,
  };
});
