import { createAssetService } from "src/modules/assets";
import {
  createEmailRegistrationService,
  createOTPService,
  createTokenCacheService,
} from "src/modules/email/services";
import { createLogQueryService } from "src/modules/logs-chart";
import { createNotiPublisherService } from "src/modules/noti-worker/services";
import { createProposalService } from "src/modules/proposals/services/proposal.service";
import { createSnapshotQueryService } from "src/modules/snapshots";
import { createTransactionService } from "src/modules/transactions";
import { createUserService } from "src/modules/users";
import type { InfrastructureServices } from "src/shared/bootstrap/common-setup";
import { createRabbitMQHelperService, IdUtils } from "src/shared/utils";

export function setupHttpServerDependencies(deps: {
  infrastructure: InfrastructureServices;
}) {
  const { dbClient, logger, redisClient, rabbitChannel } = deps.infrastructure;

  const assetService = createAssetService({ dbClient, logger });
  const transactionService = createTransactionService({ dbClient, logger });
  const userService = createUserService({ dbClient, logger });
  const idUtil = new IdUtils();
  const rabbitMQHelper = createRabbitMQHelperService({ rabbitChannel, logger });
  const notiPublisher = createNotiPublisherService({ rabbitMQHelper, logger });
  const tokenCache = createTokenCacheService({
    redis: redisClient,
    idUtil,
    logger,
  });
  const otpService = createOTPService({
    notiPublisher,
    logger,
    redis: redisClient,
    tokenCache,
  });
  const emailRegistrationService = createEmailRegistrationService({
    tokenCache,
    dbClient,
    logger,
  });

  const snapshotQueryService = createSnapshotQueryService({ dbClient });
  const logQueryService = createLogQueryService({ dbClient });

  const proposalService = createProposalService({ dbClient });

  return {
    assetService,
    transactionService,
    userService,
    otpService,
    emailRegistrationService,
    snapshotQueryService,
    logQueryService,
    proposalService,
  };
}

export type HttpServerDependencies = ReturnType<
  typeof setupHttpServerDependencies
>;
