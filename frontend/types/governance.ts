export enum ProposalStatus {
  Proposed = 0,
  Scheduled = 1,
  Executed = 2,
  Cancelled = 3,
}

export type ProposalStatusFilter = ProposalStatus | "all";

export interface DecodedTimelockScheduleAction {
  kind: "timelock-schedule";
  target: string;
  value: string;
  calldata: string;
  predecessor: string;
  salt: string;
  delay: number;
}

export interface DecodedTimelockScheduleBatchAction {
  kind: "timelock-schedule-batch";
  targets: string[];
  values: string[];
  payloads: string[];
  predecessor: string;
  salt: string;
  delay: number;
}

export type DecodedAction =
  | DecodedTimelockScheduleAction
  | DecodedTimelockScheduleBatchAction;

export interface ProposalHistoryItem {
  id: number;
  chainId: string | number;
  operationId?: string | null;
  target?: string | null;
  value?: string | null;
  calldata?: string | null;
  predecessors?: string | null;
  salt?: string | null;
  delay?: number | null;
  eta?: string | null;
  timelockExecutedTxHash?: string | null;
  safeTxHash?: string | null;
  proposer: string;
  currentSigners: number;
  multisigThreshold: number;
  safeExecutedTxHash?: string | null;
  status: ProposalStatus;
  decodedAction?: DecodedAction | null;
  createdAt: string;
  updatedAt: string;
}

export const proposalStatusLabel: Record<ProposalStatus, string> = {
  [ProposalStatus.Proposed]: "Proposed",
  [ProposalStatus.Scheduled]: "Scheduled",
  [ProposalStatus.Executed]: "Executed",
  [ProposalStatus.Cancelled]: "Cancelled",
};

export function normalizeProposalStatus(status: unknown): ProposalStatus {
  if (typeof status === "number" && status in ProposalStatus) {
    return status as ProposalStatus;
  }

  if (typeof status === "string") {
    const lower = status.toLowerCase();
    if (lower === "0" || lower === "proposed") return ProposalStatus.Proposed;
    if (lower === "1" || lower === "scheduled") return ProposalStatus.Scheduled;
    if (lower === "2" || lower === "executed") return ProposalStatus.Executed;
    if (lower === "3" || lower === "cancelled") return ProposalStatus.Cancelled;
  }

  return ProposalStatus.Proposed;
}

export function getProposalStatusColor(
  status: ProposalStatus,
): "warning" | "info" | "success" | "error" {
  if (status === ProposalStatus.Proposed) return "warning";
  if (status === ProposalStatus.Scheduled) return "info";
  if (status === ProposalStatus.Executed) return "success";
  return "error";
}
