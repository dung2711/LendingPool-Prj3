import type { Logger } from "@logtape/logtape";
import {
  AdminEventType,
  AppErr,
  ErrCode,
  ProposalStatus,
  RabbitMQBindingKey,
  RabbitMQEx,
  RabbitMQQueue,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra/postgre/models";
import type { ProposalDetails, ProposalEvent } from "src/shared/types/proposal";
import type { RabbitMQHelperService } from "src/shared/utils";

export function createProposalConsumerService(deps: {
  rabbitMQHelper: RabbitMQHelperService;
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { rabbitMQHelper, dbClient, logger } = deps;

  async function start() {
    await rabbitMQHelper.setupQueue<ProposalEvent>({
      mainEx: RabbitMQEx.ADMIN_EVENTS,
      queueName: RabbitMQQueue.ADMIN_PROPOSAL_DB,
      bindingKey: RabbitMQBindingKey.ADMIN_BINDING_KEY,
      action: (payload) => handleProposalEvent(payload),
    });
  }

  async function upsertSafeProposal(params: {
    proposal: ProposalDetails[AdminEventType.SAFE_PROPOSED];
    status: ProposalStatus;
  }) {
    const { proposal, status } = params;
    const safeTxHash = proposal.safeTxHash;

    const existingProposal = await dbClient.proposal.findOne({
      where: {
        safeTxHash,
        chainId: proposal.chainId,
      },
    });

    const payload = {
      chainId: proposal.chainId,
      operationId: proposal.operationId,
      target: proposal.target,
      value: proposal.value,
      calldata: proposal.calldata,
      predecessors: proposal.predecessors,
      salt: proposal.salt,
      delay: proposal.delay,
      eta: proposal.eta,
      safeTxHash,
      proposer: proposal.proposer,
      currentSigners: proposal.currentSigners,
      multisigThreshold: proposal.multisigThreshold,
      decodedAction: proposal.decodedAction,
      status,
    };

    if (existingProposal) {
      await existingProposal.update(payload);
      return;
    }

    await dbClient.proposal.create(payload);
  }

  async function updateSafeConfirmation(
    proposal: ProposalDetails[AdminEventType.SAFE_CONFIRMED],
  ) {
    const existingProposal = await dbClient.proposal.findOne({
      where: {
        safeTxHash: proposal.safeTxHash,
        chainId: proposal.chainId,
      },
    });

    if (!existingProposal) {
      logger.warn(
        `Skip SAFE_CONFIRMED because proposal not found: ${proposal.safeTxHash} on chainId: ${proposal.chainId}`,
      );
      return;
    }

    await existingProposal.update({
      currentSigners: proposal.currentSigners,
      multisigThreshold: proposal.multisigThreshold,
    });
  }

  async function upsertTimelockScheduled(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_SCHEDULED],
  ) {
    const existingProposal = await dbClient.proposal.findOne({
      where: {
        operationId: proposal.operationId,
        chainId: proposal.chainId,
      },
    });

    const payload = {
      chainId: proposal.chainId,
      operationId: proposal.operationId,
      target: proposal.target,
      value: proposal.value,
      calldata: proposal.calldata,
      predecessors: proposal.predecessors,
      salt: proposal.salt,
      delay: proposal.delay,
      eta: proposal.eta,
      status: ProposalStatus.Scheduled,
    };

    if (existingProposal) {
      await existingProposal.update(payload);
      return;
    }

    await dbClient.proposal.create({
      ...payload,
      proposer: "timelock",
      currentSigners: 0,
      multisigThreshold: 0,
    });
  }

  async function markTimelockExecuted(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_EXECUTED],
  ) {
    const existingProposal = await dbClient.proposal.findOne({
      where: {
        operationId: proposal.operationId,
        chainId: proposal.chainId,
      },
    });

    if (existingProposal) {
      await existingProposal.update({
        status: ProposalStatus.Executed,
        timelockExecutedTxHash: proposal.timelockExecutedTxHash,
      });
      return;
    }

    await dbClient.proposal.create({
      chainId: proposal.chainId,
      operationId: proposal.operationId,
      timelockExecutedTxHash: proposal.timelockExecutedTxHash,
      status: ProposalStatus.Executed,
      proposer: "timelock",
      currentSigners: 0,
      multisigThreshold: 0,
    });
  }

  async function markTimelockCancelled(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_CANCELLED],
  ) {
    const existingProposal = await dbClient.proposal.findOne({
      where: {
        operationId: proposal.operationId,
        chainId: proposal.chainId,
      },
    });

    if (existingProposal) {
      await existingProposal.update({
        status: ProposalStatus.Cancelled,
      });
      return;
    }

    await dbClient.proposal.create({
      chainId: proposal.chainId,
      operationId: proposal.operationId,
      status: ProposalStatus.Cancelled,
      proposer: "timelock",
      currentSigners: 0,
      multisigThreshold: 0,
    });
  }

  async function handleProposalEvent(proposal: ProposalEvent) {
    logger.info(
      `Received proposal event on chainId: ${proposal.payload.chainId}`,
    );
    try {
      switch (proposal.type) {
        case AdminEventType.SAFE_PROPOSED:
          await handleSafeProposed(proposal.payload);
          return;
        case AdminEventType.SAFE_CONFIRMED:
          await handleSafeConfirmed(proposal.payload);
          return;
        case AdminEventType.TIMELOCK_SCHEDULED:
          await handleTimelockScheduled(proposal.payload);
          return;
        case AdminEventType.TIMELOCK_EXECUTED:
          await handleTimelockExecuted(proposal.payload);
          return;
        case AdminEventType.TIMELOCK_CANCELLED:
          await handleTimelockCancelled(proposal.payload);
          return;
        default:
          ((_: never) => {
            logger.warn("Unsupported admin proposal event type");
          })(proposal);
          return;
      }
    } catch (error) {
      logger.error(
        `Error processing proposal event for chainId: ${proposal.payload.chainId}`,
        error,
      );
      throw new AppErr(ErrCode.InternalError, {
        errors: error,
      });
    }
  }

  async function handleSafeProposed(
    proposal: ProposalDetails[AdminEventType.SAFE_PROPOSED],
  ) {
    await upsertSafeProposal({
      proposal,
      status: ProposalStatus.Proposed,
    });
  }

  async function handleSafeConfirmed(
    proposal: ProposalDetails[AdminEventType.SAFE_CONFIRMED],
  ) {
    await updateSafeConfirmation(proposal);
  }

  async function handleTimelockScheduled(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_SCHEDULED],
  ) {
    await upsertTimelockScheduled(proposal);
  }

  async function handleTimelockExecuted(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_EXECUTED],
  ) {
    await markTimelockExecuted(proposal);
  }

  async function handleTimelockCancelled(
    proposal: ProposalDetails[AdminEventType.TIMELOCK_CANCELLED],
  ) {
    await markTimelockCancelled(proposal);
  }

  return {
    start,
  };
}

export type ProposalConsumerService = ReturnType<
  typeof createProposalConsumerService
>;
