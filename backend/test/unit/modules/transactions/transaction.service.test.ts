import { createTransactionService } from "src/modules/transactions/transaction.service";
import { ErrCode } from "src/shared/constants";
import { createMockDbClient, createMockLogger } from "test/shared/mocks";
import { describe, expect, it, type vi } from "vitest";
import {
  createReqUser,
  createTransactionRow,
  createUserRow,
} from "../../test-helpers/domain";
import { expectAppErr } from "../../test-helpers/error";

function createTestContext() {
  const dbClient = createMockDbClient();
  const logger = createMockLogger();

  const service = createTransactionService({
    dbClient: dbClient as never,
    logger: logger as never,
  });

  return { service, dbClient, logger };
}

describe("TransactionService", () => {
  describe("getTransactionsDetails", () => {
    it("should return paginated transactions", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      // Return limit+1 rows to trigger hasNextPage=true
      const rows = [
        createTransactionRow({ id: 3n, createdAt: new Date("2026-04-17") }),
        createTransactionRow({ id: 2n, createdAt: new Date("2026-04-16") }),
        createTransactionRow({ id: 1n, createdAt: new Date("2026-04-15") }),
      ];
      (
        dbClient.transaction.findAll as ReturnType<typeof vi.fn>
      ).mockResolvedValue(rows);

      const result = await service.getTransactionsDetails(createReqUser(), {
        limit: 2,
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor!.cursorID).toBe("2");
    });

    it("should return hasNextPage=false when fewer results", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      const rows = [
        createTransactionRow({ id: 1n, createdAt: new Date("2026-04-15") }),
      ];
      (
        dbClient.transaction.findAll as ReturnType<typeof vi.fn>
      ).mockResolvedValue(rows);

      const result = await service.getTransactionsDetails(createReqUser(), {
        limit: 10,
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should throw UserNotFound when user does not exist", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.getTransactionsDetails(createReqUser(), { limit: 10 }),
        ErrCode.UserNotFound,
      );
    });

    it("should wrap unknown DB errors in InternalError", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection reset"),
      );

      await expectAppErr(
        service.getTransactionsDetails(createReqUser(), { limit: 10 }),
        ErrCode.InternalError,
      );
    });

    it("should apply type filter when provided", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );
      (
        dbClient.transaction.findAll as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await service.getTransactionsDetails(createReqUser(), {
        limit: 10,
        type: "DEPOSIT",
      });

      const findAllCall = (
        dbClient.transaction.findAll as ReturnType<typeof vi.fn>
      ).mock.calls[0]![0] as Record<string, unknown>;
      const where = findAllCall.where as Record<string, unknown>;
      expect(where.type).toBe("DEPOSIT");
    });
  });
});
