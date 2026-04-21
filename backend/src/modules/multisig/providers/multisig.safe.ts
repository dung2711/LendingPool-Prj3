import type { Logger } from "@logtape/logtape";
import SafeApiKit from "@safe-global/api-kit";
import type { CronerEnv } from "src/shared/config";
import { AppErr, ErrCode } from "src/shared/constants";
import type { ChainId } from "src/shared/types";
import type { TransactionDetails } from "src/shared/types/proposal";

export function createMultisigSafeProvider(deps: {
  env: CronerEnv;
  logger: Logger;
}) {
  const { env, logger } = deps;

  function normalizeTransactionDetails(
    transaction: unknown,
  ): TransactionDetails {
    const tx = (transaction ?? {}) as Record<string, unknown>;
    const confirmationsRaw = Array.isArray(tx.confirmations)
      ? tx.confirmations
      : [];

    return {
      safeTxHash: String(tx.safeTxHash ?? ""),
      safe: String(tx.safe ?? env.SAFE_ADDRESS),
      nonce: String(tx.nonce ?? "0"),
      data: String(tx.data ?? "0x"),
      value: String(tx.value ?? "0"),
      to: String(tx.to ?? ""),
      submissionDate: String(tx.submissionDate ?? new Date().toISOString()),
      executionDate: tx.executionDate == null ? null : String(tx.executionDate),
      txHash:
        tx.txHash == null
          ? tx.transactionHash == null
            ? null
            : String(tx.transactionHash)
          : String(tx.txHash),
      proposer: tx.proposer == null ? null : String(tx.proposer),
      isExecuted: Boolean(
        tx.isExecuted ?? tx.executionDate ?? tx.txHash ?? tx.transactionHash,
      ),
      confirmations: confirmationsRaw.map((confirmation) => {
        const c = (confirmation ?? {}) as Record<string, unknown>;
        const signerRaw = c.signer;

        let signer: { value: string } | string | null = null;
        if (typeof signerRaw === "string") {
          signer = signerRaw;
        } else if (
          signerRaw &&
          typeof signerRaw === "object" &&
          "value" in signerRaw &&
          typeof (signerRaw as { value?: unknown }).value === "string"
        ) {
          signer = { value: (signerRaw as { value: string }).value };
        }

        return {
          signer,
          owner: c.owner == null ? null : String(c.owner),
        };
      }),
      confirmationsRequired: Number(tx.confirmationsRequired ?? 0),
    };
  }

  function getSafeApiKit(chainId: ChainId): SafeApiKit {
    return new SafeApiKit({
      chainId: BigInt(chainId),
      apiKey: env.SAFE_API_KEY,
    });
  }

  async function getPendingTransactions(
    chainId: ChainId,
  ): Promise<TransactionDetails[]> {
    try {
      const apiKit = getSafeApiKit(chainId);
      const pendingTxs = await apiKit.getPendingTransactions(env.SAFE_ADDRESS);
      return pendingTxs.results.map(normalizeTransactionDetails);
    } catch (error) {
      logger.error("Error fetching pending Safe transactions", {
        chainId,
        safeAddress: env.SAFE_ADDRESS,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppErr(ErrCode.ExternalAPIError, {
        errors: error,
      });
    }
  }

  async function getMultisigTransactions(
    chainId: ChainId,
  ): Promise<TransactionDetails[]> {
    try {
      const apiKit = getSafeApiKit(chainId);
      const transactions = await apiKit.getAllTransactions(env.SAFE_ADDRESS, {
        limit: 20,
      });
      return transactions.results.map(normalizeTransactionDetails);
    } catch (error) {
      logger.error("Error fetching multisig Safe transactions", {
        chainId,
        safeAddress: env.SAFE_ADDRESS,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppErr(ErrCode.ExternalAPIError, {
        errors: error,
      });
    }
  }

  return {
    getPendingTransactions,
    getMultisigTransactions,
  };
}

export type MultisigSafeProvider = ReturnType<
  typeof createMultisigSafeProvider
>;
