import { ProposalStatus } from "src/shared/constants";
import { zChainId, zPagination } from "src/shared/types";
import { z } from "zod";

export const zGetListProposalsReq = z.object({
  ...zPagination.shape,
  chainId: zChainId.optional().describe("Chain ID to filter proposals"),
  status: z.coerce
    .number()
    .pipe(z.enum(ProposalStatus))
    .optional()
    .describe("Proposal status to filter"),
});

export type IGetListProposalsReq = z.infer<typeof zGetListProposalsReq>;
