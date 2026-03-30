import fs from "fs-extra";
import path from "path";
import type { SupportedNetwork } from "../config";

export type Addresses = Partial<
  Record<
    SupportedNetwork,
    Partial<{
      stableCoinIRM: string;
      volatileCoinIRM: string;
      myOracle: string;
      priceRouter: string;
      priceRouterImpl: string;
      lendingPool: string;
      lendingPoolImpl: string;
      liquidation: string;
      timelock: string;
      controller: string;
    }>
  >
>;

export function saveAddresses(network: SupportedNetwork, addresses: Addresses) {
  const filePath = path.join(__dirname, "../../../deployments/addresses.json");
  fs.ensureDirSync(path.dirname(filePath));

  let existingData: Addresses = {};
  if (fs.existsSync(filePath)) {
    try {
      const fileSize = fs.statSync(filePath).size;
      if (fileSize > 0) {
        existingData = fs.readJSONSync(filePath);
      }
    } catch (error) {
      console.warn(
        "Start fresh: Failed to read existing addresses, initializing new file.",
        error,
      );
    }
  }

  const updatedData = {
    ...existingData,
    [network]: {
      ...existingData[network],
      ...addresses[network],
    },
  };

  fs.writeJSONSync(filePath, updatedData, { spaces: 2 });
  console.log(`Addresses for ${network} saved to deployments/addresses.json`);
}
