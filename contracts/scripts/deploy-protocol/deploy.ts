import hardhat from "hardhat";
import { protocolConfig, type SupportedNetwork } from "./config";
import { deployPhase1, deployPhase2, deployPhase3 } from "./phases";
import { type Addresses, exportABIs, saveAddresses } from "./utils";

async function main() {
  const network = hardhat.network.name as SupportedNetwork;
  let addresses: Addresses = {};
  const config = protocolConfig[network];

  if (!config) {
    console.error(`No configuration found for network: ${network}`);
    return;
  }

  try {
    addresses = await deployPhase1(config, network);
    await deployPhase2(network, addresses);
    await deployPhase3(network, addresses);
    try {
      saveAddresses(network, addresses);
      exportABIs(network);
    } catch (error) {
      console.log(
        `Warning: Failed to save addresses or export ABIs for ${network}.`,
        error,
      );
      return;
    }
    console.log("\nDeployment complete!");
  } catch (error) {
    console.error(
      `Error occurred while deploying on network: ${network}`,
      error,
    );
    return;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
