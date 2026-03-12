import { createAssetService } from "src/modules/assets";
import { createTransactionService } from "src/modules/transactions";
import { createUserService } from "src/modules/users";
import type { InfrastructureServices } from "src/shared/bootstrap/common-setup";

export function setupHttpServerDependencies(deps: {
  infrastructure: InfrastructureServices;
}) {
  const { dbClient, logger } = deps.infrastructure;

  const assetService = createAssetService({ dbClient, logger });
  const transactionService = createTransactionService({ dbClient, logger });
  const userService = createUserService({ dbClient, logger });

  return {
    assetService,
    transactionService,
    userService,
  };
}

export type HttpServerDependencies = ReturnType<
  typeof setupHttpServerDependencies
>;
