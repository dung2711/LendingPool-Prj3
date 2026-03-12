import { TransactionType } from "src/shared/constants";
import { z } from "zod";

const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .optional();

export const ZGetTransactionsDetailsReq = z.object({
  userAddress: z
    .string()
    .describe(
      "The address of the user whose transactions details are being requested",
    ),
  cursorTS: zDate.describe(
    "The timestamp to paginate transactions details (YYYY-MM-DD)",
  ),
  cursorID: z
    .string()
    .optional()
    .describe("The ID of the cursor transaction for pagination"),
  type: z
    .enum(TransactionType)
    .optional()
    .describe("The type of transactions to retrieve"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .describe(
      "The maximum number of transactions details to retrieve (default: 10, max: 100)",
    )
    .default(10),
});

export type IGetTransactionsDetailsReq = z.infer<
  typeof ZGetTransactionsDetailsReq
>;

export const ZGetTransactionsDetailsBody = z.object({
  id: z.string().describe("The unique identifier of the transaction"),
  transactionHash: z.string().describe("The hash of the transaction"),
  assetAddress: z
    .string()
    .describe("The address of the asset involved in the transaction"),
  type: z.enum(TransactionType).describe("The type of the transaction"),
  amount: z.string().describe("The amount involved in the transaction"),
  amountUSD: z
    .string()
    .describe("The USD value of the amount involved in the transaction"),
  blockNumber: z
    .string()
    .describe("The block number at which the transaction was recorded"),
});

export type IGetTransactionsDetailsRes = z.infer<
  typeof ZGetTransactionsDetailsBody
>;

export const ZGetTransactionsListBody = z.object({
  transactions: z
    .array(ZGetTransactionsDetailsBody)
    .describe("The list of transactions details"),
  nextCursor: z
    .object({
      cursorTS: z.string(),
      cursorID: z.string(),
    })
    .nullable()
    .describe("Cursor for the next page, null if no more pages"),
  hasNextPage: z
    .boolean()
    .describe("Indicates if there are more transactions details to retrieve"),
});

export type IGetTransactionsListRes = z.infer<typeof ZGetTransactionsListBody>;
