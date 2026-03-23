import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import { col, Op } from "sequelize";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra/";
import { validateAddress } from "src/shared/utils";
import type {
  IGetTransactionsDetailsReq,
  IGetTransactionsListRes,
} from "./transaction.dto";

export function createTransactionService(deps: {
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { dbClient, logger } = deps;

  async function getTransactionsDetails(
    data: IGetTransactionsDetailsReq,
  ): Promise<IGetTransactionsListRes> {
    const { userAddress, cursorID, cursorTS, type, limit } = data;

    validateAddress(userAddress);
    try {
      const user = await dbClient.user.findOne({
        where: { userAddress },
      });
      if (!user) {
        throw new AppErr(ErrCode.UserNotFound, {
          errors: "User not found",
        });
      }
      const where: Record<string | symbol, unknown> = {
        userId: user.id,
        ...(type ? { type } : {}),
      };
      if (cursorTS && cursorID) {
        where[Op.or] = [
          {
            createdAt: { [Op.lt]: dayjs(cursorTS).toDate() },
          },
          {
            createdAt: dayjs(cursorTS).toDate(),
            id: { [Op.lt]: cursorID },
          },
        ];
      }
      const rows = await dbClient.transaction.findAll({
        where,
        attributes: [
          "id",
          "transactionHash",
          "userId",
          "type",
          "amount",
          "amountUSD",
          "blockNumber",
          "createdAt",
          // "Asset" must match the Sequelize JOIN alias (model class name, PascalCase)
          [col("Asset.assetAddress"), "assetAddress"],
        ],
        include: [
          {
            model: dbClient.asset,
            attributes: [],
            required: true,
          },
        ],
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: limit + 1,
      });
      const hasNextPage = rows.length > limit;
      const items = hasNextPage ? rows.slice(0, limit) : rows;
      const transactions = items.map((row) => ({
        id: row.id.toString(),
        transactionHash: row.transactionHash,
        assetAddress: (row.dataValues as Record<string, unknown>)[
          "assetAddress"
        ] as string,
        type: row.type,
        amount: row.amount,
        amountUSD: row.amountUSD,
        blockNumber: row.blockNumber.toString(),
      }));
      let nextCursor: { cursorTS: string; cursorID: string } | null = null;
      if (hasNextPage) {
        const last = items[items.length - 1];
        nextCursor = {
          cursorTS: last.createdAt.toDateString(),
          cursorID: last.id.toString(),
        };
      }
      return {
        transactions,
        nextCursor,
        hasNextPage,
      };
    } catch (error) {
      logger.error("Failed to fetch transactions: {message}", {
        message: (error as Error).message,
      });
      if (error instanceof AppErr) {
        throw error;
      }
      throw new AppErr(ErrCode.InternalError, {
        errors: "Failed to fetch transactions",
      });
    }
  }

  return {
    getTransactionsDetails,
  };
}

export type ITransactionService = ReturnType<typeof createTransactionService>;
