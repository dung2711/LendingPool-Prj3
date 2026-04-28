import axiosClient from "@/lib/axios";
import {
  normalizeProposalStatus,
  type ProposalHistoryItem,
  type ProposalStatusFilter,
} from "@/types/governance";

interface ListProposalsParams {
  take?: number;
  skip?: number;
  chainId?: string;
  status?: ProposalStatusFilter;
}

interface ListProposalHistoryParams {
  take?: number;
  skip?: number;
  chainId?: string;
  status?: ProposalStatusFilter;
}

const normalizeProposal = (item: any): ProposalHistoryItem => ({
  ...item,
  status: normalizeProposalStatus(item?.status),
});

const sortByNewest = (items: ProposalHistoryItem[]): ProposalHistoryItem[] =>
  [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const getProposalUniqueKey = (proposal: ProposalHistoryItem): string => {
  if (proposal.id !== undefined && proposal.id !== null) {
    return String(proposal.id);
  }

  return `${proposal.operationId || ""}-${proposal.safeTxHash || ""}-${proposal.createdAt}`;
};

const mergeWithoutDuplicates = (
  proposals: ProposalHistoryItem[],
): ProposalHistoryItem[] => {
  const map = new Map<string, ProposalHistoryItem>();

  for (const proposal of proposals) {
    map.set(getProposalUniqueKey(proposal), proposal);
  }

  return sortByNewest(Array.from(map.values()));
};

const listProposalsByStatus = async (
  params: ListProposalsParams,
): Promise<ProposalHistoryItem[]> => {
  const { status, ...restParams } = params;

  const response = await axiosClient.get("/api/proposals/list", {
    params: {
      ...restParams,
      ...(status === "all" ? {} : { status }),
    },
  });

  return (response.data as any[]).map(normalizeProposal);
};

export const proposalService = {
  async getProposalHistory(
    params: ListProposalHistoryParams = {},
  ): Promise<ProposalHistoryItem[]> {
    const { take = 50, skip = 0, chainId, status = "all" } = params;

    const proposals = await listProposalsByStatus({
      take,
      skip,
      chainId,
      status,
    });

    return mergeWithoutDuplicates(proposals);
  },

  async getLatestProposals(
    limit: number = 6,
    chainId?: string,
  ): Promise<ProposalHistoryItem[]> {
    const proposals = await this.getProposalHistory({
      take: limit,
      skip: 0,
      chainId,
      status: "all",
    });

    return proposals.slice(0, limit);
  },
};
