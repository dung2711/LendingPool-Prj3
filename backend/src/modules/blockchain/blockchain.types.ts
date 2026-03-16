import type { ChainId } from "src/shared/types";

export type IScanContract = {
  chainId: ChainId;
  fromBlock: number;
  toBlock: number;
};
