import type { Logger } from "@logtape/logtape";
import { ethers } from "ethers";
import type { ProposalPublisherService } from "src/modules/proposals";
import { type AdminEventType, ZERO_BYTES32 } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import type {
  DecodedAction,
  ProposalDetails,
  TransactionDetails,
} from "src/shared/types/proposal";
import type { MultisigSafeProvider } from "./providers";

const TIMELOCK_SCHEDULE_ABI = [
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
];

const timelockIface = new ethers.Interface(TIMELOCK_SCHEDULE_ABI);

export function createMultisigService(deps: {
  safeProvider: MultisigSafeProvider;
  dbClient: DatabaseClient;
  logger: Logger;
  proposalPublisher: ProposalPublisherService;
}) {
  const { safeProvider, dbClient, logger, proposalPublisher } = deps;

  function getSignerCount(transaction: TransactionDetails): number {
    return transaction.confirmations?.length ?? 0;
  }

  function getExecutionHash(
    transaction: TransactionDetails,
  ): string | undefined {
    return transaction.txHash ?? undefined;
  }

  function getOperationId(params: {
    target: string;
    value: string;
    calldata: string;
    predecessor: string;
    salt: string;
  }): string {
    const { target, value, calldata, predecessor, salt } = params;

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes", "bytes32", "bytes32"],
      [target, value, calldata, predecessor, salt],
    );

    return ethers.keccak256(encoded);
  }

  function decodeTimelockCalldata(data: string): DecodedAction | null {
    if (!data || data === "0x") return null;

    try {
      const decoded = timelockIface.parseTransaction({ data });
      if (!decoded) return null;

      if (decoded.name === "schedule") {
        return {
          kind: "timelock-schedule",
          target: decoded.args[0],
          value: decoded.args[1].toString(),
          calldata: decoded.args[2],
          predecessor: decoded.args[3],
          salt: decoded.args[4],
          delay: Number(decoded.args[5]),
        };
      }

      if (decoded.name === "scheduleBatch") {
        return {
          kind: "timelock-schedule-batch",
          targets: decoded.args[0] as string[],
          values: (decoded.args[1] as bigint[]).map((value) =>
            value.toString(),
          ),
          payloads: decoded.args[2] as string[],
          predecessor: decoded.args[3],
          salt: decoded.args[4],
          delay: Number(decoded.args[5]),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  function getEta(params: { submissionDate: string; delay: number }): Date {
    const { submissionDate, delay } = params;
    const submittedAt = new Date(submissionDate);
    const baseMs = Number.isNaN(submittedAt.getTime())
      ? Date.now()
      : submittedAt.getTime();

    return new Date(baseMs + delay * 1000);
  }

  function getProposer(transaction: TransactionDetails): string {
    if (transaction.proposer) {
      return transaction.proposer;
    }

    const firstConfirmation = transaction.confirmations?.[0];
    if (!firstConfirmation) {
      return transaction.safe;
    }

    if (typeof firstConfirmation.signer === "string") {
      return firstConfirmation.signer;
    }

    if (
      firstConfirmation.signer &&
      typeof firstConfirmation.signer === "object" &&
      firstConfirmation.signer.value
    ) {
      return firstConfirmation.signer.value;
    }

    return firstConfirmation.owner ?? transaction.safe;
  }

  function buildSafeProposedPayload(params: {
    chainId: ChainId;
    transaction: TransactionDetails;
  }): ProposalDetails[AdminEventType.SAFE_PROPOSED] | null {
    const { chainId, transaction } = params;
    const decodedAction = decodeTimelockCalldata(transaction.data);
    if (!decodedAction) {
      logger.warn(
        `Skip SAFE_PROPOSED publish because calldata is not timelock schedule: ${transaction.safeTxHash}`,
      );
      return null;
    }

    const decodedSchedule =
      decodedAction.kind === "timelock-schedule" ? decodedAction : null;
    if (!decodedSchedule) {
      logger.warn(
        `Skip SAFE_PROPOSED publish because scheduleBatch is not supported in proposal table format: ${transaction.safeTxHash}`,
      );
      return null;
    }

    const target = decodedSchedule?.target ?? transaction.to;
    const value = decodedSchedule?.value ?? transaction.value;
    const calldata = decodedSchedule?.calldata ?? transaction.data;
    const predecessors = decodedSchedule?.predecessor ?? ZERO_BYTES32;
    const salt = decodedSchedule?.salt ?? ZERO_BYTES32;
    const delay = decodedSchedule?.delay ?? 0;
    const eta = getEta({
      submissionDate: transaction.submissionDate,
      delay,
    });

    return {
      chainId,
      operationId: getOperationId({
        target,
        value,
        calldata,
        predecessor: predecessors,
        salt,
      }),
      target,
      value,
      calldata,
      predecessors,
      salt,
      delay,
      eta,
      safeTxHash: transaction.safeTxHash,
      proposer: getProposer(transaction),
      currentSigners: getSignerCount(transaction),
      multisigThreshold: transaction.confirmationsRequired,
      decodedAction,
    };
  }

  function buildSafeConfirmedPayload(params: {
    chainId: ChainId;
    transaction: TransactionDetails;
  }): ProposalDetails[AdminEventType.SAFE_CONFIRMED] {
    const { chainId, transaction } = params;

    return {
      chainId,
      safeTxHash: transaction.safeTxHash,
      currentSigners: getSignerCount(transaction),
      multisigThreshold: transaction.confirmationsRequired,
    };
  }

  async function scanMultisigTransactions(chainId: ChainId) {
    try {
      logger.info(`Scanning multisig transactions for chainId: ${chainId}`);
      const [pending] = await Promise.all([
        safeProvider.getPendingTransactions(chainId),
      ]);

      const txMap = new Map<string, TransactionDetails>();
      for (const tx of [...pending]) {
        txMap.set(tx.safeTxHash, tx);
      }

      await Promise.all(
        Array.from(txMap.values()).map((tx) => detectChange(chainId, tx)),
      );
    } catch (error) {
      logger.error("Error scanning multisig transactions", {
        chainId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function detectChange(
    chainId: ChainId,
    transaction: TransactionDetails,
  ): Promise<void> {
    const existingTx = await dbClient.proposal.findOne({
      where: {
        safeTxHash: transaction.safeTxHash,
        chainId,
      },
    });

    const currentSigners = getSignerCount(transaction);
    const executionHash = getExecutionHash(transaction);

    if (!existingTx) {
      logger.info(
        `New multisig transaction detected: ${transaction.safeTxHash} on chainId: ${chainId}`,
      );
      const payload = buildSafeProposedPayload({
        chainId,
        transaction,
      });
      if (!payload) {
        return;
      }

      await proposalPublisher.publishSafeProposed(payload);
      return;
    }

    const hasSignerChanged = existingTx.currentSigners !== currentSigners;
    const hasExecutionHashChanged =
      Boolean(executionHash) && existingTx.safeExecutedTxHash !== executionHash;

    if (hasSignerChanged) {
      logger.info(
        `Multisig transaction updated: ${transaction.safeTxHash} on chainId: ${chainId}`,
      );
      await proposalPublisher.publishSafeConfirmed(
        buildSafeConfirmedPayload({
          chainId,
          transaction,
        }),
      );
    }

    if (hasExecutionHashChanged) {
      await existingTx.update({
        safeExecutedTxHash: executionHash,
      });
      logger.info(
        `Safe execution detected for ${transaction.safeTxHash} on chainId: ${chainId}. Timelock scanner will publish lifecycle events.`,
      );
    }
  }

  return {
    scanMultisigTransactions,
  };
}
