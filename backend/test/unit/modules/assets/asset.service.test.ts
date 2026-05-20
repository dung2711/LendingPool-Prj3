import { createAssetService } from "src/modules/assets/asset.service";
import { ErrCode } from "src/shared/constants";
import { createMockDbClient, createMockLogger } from "test/shared/mocks";
import { describe, expect, it, type vi } from "vitest";
import { createAssetRow } from "../../test-helpers/domain";
import { expectAppErr } from "../../test-helpers/error";

function createTestContext() {
  const dbClient = createMockDbClient();
  const logger = createMockLogger();

  const service = createAssetService({
    dbClient: dbClient as never,
    logger: logger as never,
  });

  return { service, dbClient, logger };
}

describe("AssetService", () => {
  describe("getAssetsList", () => {
    it("should return formatted asset list", async () => {
      const { service, dbClient } = createTestContext();
      const assets = [
        createAssetRow({ id: 1n, symbol: "USDC" }),
        createAssetRow({ id: 2n, symbol: "WETH", assetAddress: "0xWETH" }),
      ];
      (dbClient.asset.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(
        assets,
      );

      const result = await service.getAssetsList({ take: 10, skip: 0 });

      expect(result).toHaveLength(2);
      expect(result[0]!.symbol).toBe("USDC");
      expect(result[0]!.id).toBe("1");
      expect(result[1]!.symbol).toBe("WETH");
    });

    it("should wrap DB errors in AppErr(InternalError)", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.asset.findAll as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DB error"),
      );

      await expectAppErr(
        service.getAssetsList({ take: 10, skip: 0 }),
        ErrCode.InternalError,
      );
    });
  });

  describe("getAssetDetails", () => {
    it("should return asset details by address", async () => {
      const { service, dbClient } = createTestContext();
      const asset = createAssetRow();
      (dbClient.asset.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        asset,
      );

      const result = await service.getAssetDetails({
        assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      });

      expect(result.symbol).toBe("USDC");
      expect(result.id).toBe("1");
    });

    it("should throw AssetNotFound when asset does not exist", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.asset.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.getAssetDetails({
          assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        }),
        ErrCode.AssetNotFound,
      );
    });

    it("should reject invalid Ethereum address", async () => {
      const { service } = createTestContext();

      await expectAppErr(
        service.getAssetDetails({ assetAddress: "0xinvalid" }),
        ErrCode.BadRequest,
      );
    });
  });

  describe("getAssetConfig", () => {
    it("should return config for existing asset", async () => {
      const { service, dbClient } = createTestContext();
      const asset = createAssetRow();
      (dbClient.asset.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        asset,
      );

      const config = {
        baseRate: "20000",
        slope1: "50000",
        slope2: "1000000",
        optimalUtilization: "800000",
        reserveFactor: "100000",
        collateralFactor: "750000",
        closeFactor: "500000",
        liquidationIncentive: "1080000",
        liquidationThreshold: "800000",
      };
      (
        dbClient.assetConfig.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue(config);

      const result = await service.getAssetConfig({
        assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      });

      expect(result.baseRate).toBe("20000");
      expect(result.collateralFactor).toBe("750000");
    });

    it("should throw AssetNotFound when asset missing", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.asset.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.getAssetConfig({
          assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        }),
        ErrCode.AssetNotFound,
      );
    });

    it("should throw AssetNotFound when config missing", async () => {
      const { service, dbClient } = createTestContext();
      const asset = createAssetRow();
      (dbClient.asset.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        asset,
      );
      (
        dbClient.assetConfig.findOne as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expectAppErr(
        service.getAssetConfig({
          assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        }),
        ErrCode.AssetNotFound,
      );
    });
  });
});
