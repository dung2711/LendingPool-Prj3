import { AdminEventType } from "../constants";
import type { ChainId } from "./blockchain";

export type TransactionDetails = {
  safeTxHash: string;
  safe: string;
  nonce: string;
  data: string;
  value: string;
  to: string;
  submissionDate: string;
  executionDate: string | null;
  txHash: string | null;
  proposer: string | null;
  isExecuted: boolean;
  confirmations: Array<{
    signer: { value: string } | string | null;
    owner: string | null;
  }>;
  confirmationsRequired: number;
};

export type DecodedTimelockScheduleAction = {
  kind: "timelock-schedule";
  target: string;
  value: string;
  calldata: string;
  predecessor: string;
  salt: string;
  delay: number;
};

export type DecodedTimelockScheduleBatchAction = {
  kind: "timelock-schedule-batch";
  targets: string[];
  values: string[];
  payloads: string[];
  predecessor: string;
  salt: string;
  delay: number;
};

export type DecodedAction =
  | DecodedTimelockScheduleAction
  | DecodedTimelockScheduleBatchAction;

export type ProposalDetails = {
  [AdminEventType.SAFE_PROPOSED]: {
    chainId: ChainId;
    operationId: string;
    target: string;
    value: string;
    calldata: string;
    predecessors: string;
    salt: string;
    delay: number;
    eta: Date;
    decodedAction: DecodedAction;
    safeTxHash: string;
    proposer: string;
    currentSigners: number;
    multisigThreshold: number;
  };
  [AdminEventType.SAFE_CONFIRMED]: {
    chainId: ChainId;
    safeTxHash: string;
    currentSigners: number;
    multisigThreshold: number;
  };
  [AdminEventType.TIMELOCK_SCHEDULED]: {
    chainId: ChainId;
    operationId: string;
    target: string;
    value: string;
    calldata: string;
    predecessors: string;
    salt: string;
    delay: number;
    eta: Date;
  };
  [AdminEventType.TIMELOCK_EXECUTED]: {
    chainId: ChainId;
    operationId: string;
    timelockExecutedTxHash: string;
  };
  [AdminEventType.TIMELOCK_CANCELLED]: {
    chainId: ChainId;
    operationId: string;
  };
};

export type ProposalPayload<T extends AdminEventType = AdminEventType> = {
  type: T;
  payload: ProposalDetails[T];
};

export type ProposalEvent = {
  [K in AdminEventType]: ProposalPayload<K>;
}[AdminEventType];
