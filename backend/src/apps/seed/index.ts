import dotenv from "dotenv";
import { createSeedService } from "../../modules/seed/index.js";
import { setupInfrastructure } from "../../shared/bootstrap/common-setup.js";
import { baseEnvSchema, validateEnv } from "../../shared/config/index.js";
import { IdUtils } from "../../shared/utils/index.js";

dotenv.config();

async function runSeed() {
  const env = validateEnv(baseEnvSchema);
  const infrastructure = await setupInfrastructure(env, "seed");
  const { logger, cleanup } = infrastructure;

  try {
    const { dbClient } = infrastructure;
    const idUtil = new IdUtils();
    const seedService = createSeedService({ dbClient, logger, idUtil });

    logger.info("Starting snapshot seed...");
    const result = await seedService.seedSnapshots();

    logger.info("Seed completed successfully", {
      chainId: result.chainId,
      days: result.days,
      assetSnapshots: result.createdAssetSnapshots,
      userSnapshots: result.createdUserSnapshots,
    });

    process.exit(0);
  } catch (error) {
    logger.error("Seed failed: {error}", { error });
    console.error(error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runSeed();
