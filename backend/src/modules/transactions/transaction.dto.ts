import dayjs from "dayjs";
import { TransactionType } from "src/shared/constants";
import { z } from "zod";

const zCursorTimestamp = z
  .string()
  .trim()
  .min(1)
  .refine((value) => dayjs(value).isValid(), {
    message: "cursorTS must be a valid timestamp",
  })
  .optional();

export const ZGetTransactionsDetailsReq = z
  .object({
    userAddress: z
      .string()
      .describe(
        "The address of the user whose transactions details are being requested",
      ),
    cursorTS: zCursorTimestamp.describe(
      "Opaque cursor timestamp returned by previous API response",
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
  })
  .superRefine((data, ctx) => {
    if (
      (data.cursorTS && !data.cursorID) ||
      (!data.cursorTS && data.cursorID)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cursorID"],
        message: "cursorTS and cursorID must be provided together",
      });
    }
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
