import "dotenv/config";
import Safe from "@safe-global/protocol-kit";
import dotenv from "dotenv";
import { sepolia } from "viem/chains";

dotenv.config();

async function main() {
  let pk = process.env.SAFE_DEPLOYER_KEY;
  if (!pk) throw new Error("SAFE_DEPLOYER_KEY missing");

  if (!pk.startsWith("0x")) pk = `0x${pk}`;
  if (pk.length !== 66) throw new Error("Invalid private key");

  const protocolKit = await Safe.init({
    provider: sepolia.rpcUrls.default.http[0],
    signer: pk,
    predictedSafe: {
      safeAccountConfig: {
        owners: [
          process.env.SAFE_OWNER_1 || "",
          process.env.SAFE_OWNER_2 || "",
          process.env.SAFE_OWNER_3 || "",
        ],
        threshold: 2,
      },
    },
  });

  const safeAddress = await protocolKit.getAddress();
  console.log("Predicted Safe:", safeAddress);

  const tx = await protocolKit.createSafeDeploymentTransaction();

  const client = await protocolKit.getSafeProvider().getExternalSigner();

  if (!client) throw new Error("No signer available");

  const hash = await client.sendTransaction({
    to: tx.to,
    value: BigInt(tx.value),
    data: tx.data as `0x${string}`,
    chain: sepolia,
  });

  console.log("Deployment tx:", hash);
}

main().catch(console.error);
