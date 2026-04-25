import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { ZodError } from "zod";
import { zGetListProposalsReq } from "./proposal.dto";
import type { ProposalService } from "./services/proposal.service";

export function createProposalController(deps: {
  proposalService: ProposalService;
}) {
  const { proposalService } = deps;
  const router = Router();

  router.get(
    "/list",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = zGetListProposalsReq.safeParse({
          ...req.query,
        });

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await proposalService.listProposals(parsed.data);

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
