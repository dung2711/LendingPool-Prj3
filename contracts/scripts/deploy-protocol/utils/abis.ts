import fs from "fs-extra";
import path from "path";
import type { SupportedNetwork } from "../config";

const Contract = {
  LendingPool: "LendingPool",
  PriceRouter: "PriceRouter",
  MyOracle: "MyOracle",
  Liquidation: "Liquidation",
  ProtocolTimelock: "ProtocolTimelock",
  ProtocolController: "ProtocolController",
  InterestRateModel: "InterestRateModel",
} as const;

export type ProtocolContract = `${keyof typeof Contract}ABI`;

export type ABIExport = Partial<
  Record<SupportedNetwork, Partial<Record<ProtocolContract, any[]>>>
>;

export function exportABIs(network: SupportedNetwork): void {
  console.log(`Exporting ABIs for ${network}...`);

  const output: ABIExport = {};
  const artifactsDir = path.join(__dirname, "../../../artifacts/contracts");
  const outputPath = path.join(__dirname, "../../../deployments/abis.json");

  const outputDir = path.dirname(outputPath);
  fs.ensureDirSync(outputDir);

  for (const contractKey in Contract) {
    const contractName = Contract[contractKey as keyof typeof Contract];
    const artifactPath = findArtifact(artifactsDir, contractName);
    if (!artifactPath) {
      console.warn(`Artifact for ${contractName} not found, skipping...`);
      continue;
    }

    const artifact = fs.readJSONSync(artifactPath);
    if (!output[network]) {
      output[network] = {};
    }
    output[network][`${contractName}ABI` as ProtocolContract] = artifact.abi;
  }
  fs.writeJSONSync(outputPath, output, { spaces: 2 });
  console.log(`ABIs for ${network} exported to deployments/abis.json`);
}

function findArtifact(dir: string, contractName: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findArtifact(fullPath, contractName);
      if (found) return found;
    } else if (entry.name === `${contractName}.json`) {
      return fullPath;
    }
  }

  return null;
}
