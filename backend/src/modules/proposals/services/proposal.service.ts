import type { InferAttributes } from "sequelize";
import type { Proposal } from "src/models";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import type { IGetListProposalsReq } from "../proposal.dto";

export function createProposalService(deps: { dbClient: DatabaseClient }) {
  const { dbClient } = deps;

  async function listProposals(params: IGetListProposalsReq) {
    const { take, skip, chainId, status } = params;

    const where: Partial<InferAttributes<Proposal>> = {};
    if (chainId) where.chainId = chainId as unknown as ChainId;
    if (status !== undefined) where.status = status;

    const proposals = await dbClient.proposal.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: take,
      offset: skip,
    });

    return proposals;
  }

  return {
    listProposals,
  };
}

export type ProposalService = ReturnType<typeof createProposalService>;
