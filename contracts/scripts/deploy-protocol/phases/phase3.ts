import hardhat from "hardhat";

const { ethers } = hardhat;

import type { SupportedNetwork } from "../config";
import type { Addresses } from "../utils/save";

export async function deployPhase3(
  network: SupportedNetwork,
  addresses: Addresses,
): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("\n========== PHASE 3: MIGRATE ==========");
  console.log("Migrating contracts with the account:", deployer.address);

  const myOracle = await ethers.getContractAt(
    "MyOracle",
    addresses[network]?.myOracle!,
  );
  const priceRouter = await ethers.getContractAt(
    "PriceRouter",
    addresses[network]?.priceRouter!,
  );
  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    addresses[network]?.lendingPool!,
  );
  const liquidation = await ethers.getContractAt(
    "Liquidation",
    addresses[network]?.liquidation!,
  );
  const controllerAddress = addresses[network]?.controller!;

  const tx1 = await myOracle.setController(controllerAddress);
  await tx1.wait();
  console.log("MyOracle migrated to Controller");

  const tx2 = await priceRouter.setController(controllerAddress);
  await tx2.wait();
  console.log("PriceRouter migrated to Controller");

  const tx3 = await lendingPool.setController(controllerAddress);
  await tx3.wait();
  console.log("LendingPool migrated to Controller");

  const tx4 = await liquidation.setController(controllerAddress);
  await tx4.wait();
  console.log("Liquidation migrated to Controller");

  console.log("\nPhase 3 migration completed.");
}
