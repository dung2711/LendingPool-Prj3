import hardhat from "hardhat";

const { ethers } = hardhat;

import type { SupportedNetwork } from "../config";
import type { Addresses } from "../utils/save";

export async function deployPhase2(
  network: SupportedNetwork,
  addresses: Addresses,
): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("\n========== PHASE 2: WIRE ==========");
  console.log("Wiring contracts with the account:", deployer.address);

  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    addresses[network]?.lendingPool!,
  );
  const tx = await lendingPool.setLiquidation(addresses[network]?.liquidation!);
  await tx.wait();
  console.log("LendingPool wired to Liquidation");
  console.log("\nPhase 2 wiring completed.");
}
