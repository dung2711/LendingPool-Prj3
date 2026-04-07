import { z } from "zod";
import { baseEnvSchema } from "./base";

const zEvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

export const blockchainEnvSchema = baseEnvSchema.extend({
  ETHEREUM_RPC_URL: z.url().describe("Sepolia JSON-RPC URL"),
  BSC_RPC_URL: z.url().optional().describe("BSC Testnet JSON-RPC URL"),

  SEPOLIA_LENDING_POOL_ADDRESS: zEvmAddress,
  SEPOLIA_INTEREST_RATE_MODEL_ADDRESS: zEvmAddress,
  SEPOLIA_MY_ORACLE_ADDRESS: zEvmAddress,
  SEPOLIA_LIQUIDATION_ADDRESS: zEvmAddress,
  SEPOLIA_PRICE_ROUTER_ADDRESS: zEvmAddress,

  BSC_TESTNET_LENDING_POOL_ADDRESS: zEvmAddress.optional(),
  BSC_TESTNET_INTEREST_RATE_MODEL_ADDRESS: zEvmAddress.optional(),
  BSC_TESTNET_MY_ORACLE_ADDRESS: zEvmAddress.optional(),
  BSC_TESTNET_LIQUIDATION_ADDRESS: zEvmAddress.optional(),
  BSC_TESTNET_PRICE_ROUTER_ADDRESS: zEvmAddress.optional(),

  MAX_BLOCK_RANGE: z.coerce
    .number()
    .int()
    .positive()
    .default(100)
    .describe("Maximum block range to scan in one batch"),
});

export type BlockchainEnv = z.infer<typeof blockchainEnvSchema>;
