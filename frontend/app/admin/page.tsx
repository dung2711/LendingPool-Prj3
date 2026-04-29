"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { assetService } from "@/services/assetService";
import { logService } from "@/services/logService";
import { proposalService } from "@/services/proposalService";
import { safeMultisigService } from "@/services/SafeMultisigService";
import {
  getProposalStatusColor,
  type ProposalHistoryItem,
  ProposalStatus,
  proposalStatusLabel,
} from "@/types/governance";

interface PendingTransaction {
  safeTxHash: string;
  safe: string;
  nonce: number;
  data: string;
  value: string;
  to: string;
  confirmed: boolean;
  submissionDate: string;
  confirmations: Array<{
    signer?: { value: string } | string;
    owner?: string;
  }>;
  confirmationsRequired: number;
}

interface TimelockOperationUiState {
  operationId: string;
  timestamp: number;
  isPending: boolean;
  isReady: boolean;
  isDone: boolean;
}

interface AdminChartPoint {
  timestamp: string;
  values: Record<string, number>;
}

export default function Admin(): ReactElement {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";

  // State
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [safeInfo, setSafeInfo] = useState<{
    owners: string[];
    threshold: number;
    nonce: number;
  } | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [checkedOwnership, setCheckedOwnership] = useState(false);
  const [currentSignerAddress, setCurrentSignerAddress] = useState<string>("");
  const [timelockInfo, setTimelockInfo] = useState<{
    timelockAddress: string;
    minDelay: number;
    minDelayHours: number;
    isExecutorOpen: boolean;
  } | null>(null);
  const [loadingTimelockInfo, setLoadingTimelockInfo] = useState(false);
  const [recentProposals, setRecentProposals] = useState<ProposalHistoryItem[]>(
    [],
  );
  const [loadingRecentProposals, setLoadingRecentProposals] = useState(false);
  const [scheduledOperations, setScheduledOperations] = useState<
    ProposalHistoryItem[]
  >([]);
  const [loadingScheduledOperations, setLoadingScheduledOperations] =
    useState(false);
  const [operationStates, setOperationStates] = useState<
    Record<string, TimelockOperationUiState>
  >({});
  const [executingOperationId, setExecutingOperationId] = useState("");
  const [adminAccruePoints, setAdminAccruePoints] = useState<AdminChartPoint[]>(
    [],
  );
  const [adminTreasuryPoints, setAdminTreasuryPoints] = useState<
    AdminChartPoint[]
  >([]);
  const [adminChartLabel, setAdminChartLabel] = useState("Admin log charts");
  const [adminChartLoading, setAdminChartLoading] = useState(false);

  // Form states for ProtocolController functions
  const [formData, setFormData] = useState({
    asset: "",
    irm: "",
    supportAsset: "",
    supportIrm: "",
    supportFeed: "",
    supportPrice: "",
    unsupportAsset: "",
    collateralFactor: "",
    liquidationThreshold: "",
    closeFactor: "",
    liquidationIncentive: "",
    feed: "",
    price: "",
    assets: "",
    interestRateModel: "",
    treasuryAsset: "",
    treasuryTo: "",
    treasuryAmount: "",
    rescueToken: "",
    rescueTo: "",
    rescueAmount: "",
    newLendingPool: "",
    newPriceRouter: "",
    newLiquidation: "",
    newMyOracle: "",
    newController: "",
    upgradePriceRouterImpl: "",
    upgradeLendingPoolImpl: "",
  });

  // Check ownership on mount
  useEffect(() => {
    const checkOwnership = async (): Promise<void> => {
      try {
        const [owner, signerAddress] = await Promise.all([
          safeMultisigService.isOwner(),
          safeMultisigService.getCurrentSignerAddress(),
        ]);
        setIsOwner(owner);
        setCurrentSignerAddress(signerAddress);
      } catch (err) {
        console.error("Error checking ownership:", err);
        setIsOwner(false);
      } finally {
        setCheckedOwnership(true);
      }
    };

    checkOwnership();
  }, []);

  useEffect(() => {
    handleFetchTimelockInfo();
    handleFetchRecentProposals();
    handleFetchScheduledOperations();

    const intervalId = window.setInterval(() => {
      handleFetchScheduledOperations();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const loadAdminCharts = async (): Promise<void> => {
      try {
        setAdminChartLoading(true);

        const assets = await assetService.getAllAssets();

        const selectedAsset = assets[0];
        if (!selectedAsset) {
          setAdminAccruePoints([]);
          setAdminTreasuryPoints([]);
          setAdminChartLabel("Admin log charts");
          return;
        }

        setAdminChartLabel(`${selectedAsset.symbol} admin logs`);

        const toDate = new Date().toISOString().slice(0, 10);
        const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const [accrueLogs, treasuryLogs] = await Promise.all([
          logService.getAccrueLogs({
            assetId: selectedAsset.id,
            fromDate,
            toDate,
            interval: "1d",
            limit: 120,
          }),
          logService.getTreasuryLogs({
            assetId: selectedAsset.id,
            fromDate,
            toDate,
            interval: "1d",
            limit: 120,
          }),
        ]);

        setAdminAccruePoints(
          accrueLogs.map((log) => ({
            timestamp: log.createdAt,
            values: {
              interestAccrued: Number(
                ethers.formatUnits(log.interestAccrued, selectedAsset.decimals),
              ),
              toDeposit: Number(
                ethers.formatUnits(log.toDeposit, selectedAsset.decimals),
              ),
              toTreasury: Number(
                ethers.formatUnits(log.toTreasury, selectedAsset.decimals),
              ),
            },
          })),
        );

        setAdminTreasuryPoints(
          treasuryLogs.map((log) => ({
            timestamp: log.createdAt,
            values: {
              amount: Number(
                ethers.formatUnits(log.amount, selectedAsset.decimals),
              ),
              balanceAfter: Number(
                ethers.formatUnits(log.balanceAfter, selectedAsset.decimals),
              ),
            },
          })),
        );
      } catch (error) {
        console.error("Error loading admin charts:", error);
        setAdminAccruePoints([]);
        setAdminTreasuryPoints([]);
      } finally {
        setAdminChartLoading(false);
      }
    };

    loadAdminCharts();
  }, []);

  const handleFetchTimelockInfo = async (): Promise<void> => {
    try {
      setLoadingTimelockInfo(true);
      const info = await safeMultisigService.getTimelockInfo();
      setTimelockInfo(info);
    } catch (err) {
      console.error("Error fetching timelock info:", err);
    } finally {
      setLoadingTimelockInfo(false);
    }
  };

  const handleFetchRecentProposals = async (): Promise<void> => {
    try {
      setLoadingRecentProposals(true);
      const proposals = await proposalService.getLatestProposals(6, chainId);
      setRecentProposals(proposals);
    } catch (err) {
      console.error("Error fetching proposal history:", err);
    } finally {
      setLoadingRecentProposals(false);
    }
  };

  const handleFetchScheduledOperations = async (): Promise<void> => {
    try {
      setLoadingScheduledOperations(true);

      const scheduled = await proposalService.getProposalHistory({
        take: 30,
        skip: 0,
        chainId,
        status: ProposalStatus.Scheduled,
      });
      setScheduledOperations(scheduled);

      if (typeof window === "undefined" || !window.ethereum) {
        setOperationStates({});
        return;
      }

      const stateEntries = await Promise.all(
        scheduled
          .filter((proposal) => Boolean(proposal.operationId))
          .map(async (proposal) => {
            try {
              const operationId = proposal.operationId as string;
              const state =
                await safeMultisigService.getOperationState(operationId);

              return [
                operationId,
                {
                  operationId,
                  timestamp: Number(state.timestamp),
                  isPending: state.isPending,
                  isReady: state.isReady,
                  isDone: state.isDone,
                },
              ] as const;
            } catch {
              return null;
            }
          }),
      );

      const nextStates: Record<string, TimelockOperationUiState> = {};
      for (const entry of stateEntries) {
        if (!entry) continue;
        nextStates[entry[0]] = entry[1];
      }

      setOperationStates(nextStates);
    } catch (err) {
      console.error("Error fetching scheduled operations:", err);
    } finally {
      setLoadingScheduledOperations(false);
    }
  };

  const handleExecuteScheduledOperation = async (
    proposal: ProposalHistoryItem,
  ): Promise<void> => {
    try {
      if (!isOwner) {
        setError("Only admin owners can execute timelock operations");
        return;
      }

      if (!proposal.target || !proposal.calldata) {
        setError("Missing operation payload for timelock execution");
        return;
      }

      setError("");
      setSuccess("");
      setExecutingOperationId(proposal.operationId || "unknown");

      const tx = await safeMultisigService.executeTimelockOperation({
        target: proposal.target,
        data: proposal.calldata,
        value: proposal.value || "0",
        predecessor: proposal.predecessors || undefined,
        salt: proposal.salt || undefined,
        operationId: proposal.operationId || undefined,
      });

      setSuccess(`Timelock execute submitted: ${tx.hash}`);

      setTimeout(() => handleFetchScheduledOperations(), 2000);
      setTimeout(() => handleFetchRecentProposals(), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to execute timelock operation: ${message}`);
      console.error("Error executing timelock operation:", err);
    } finally {
      setExecutingOperationId("");
    }
  };

  // Helper function for proposals
  const proposeAndFetch = async (
    proposeFn: () => Promise<any>,
    actionName: string,
  ): Promise<void> => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const result = await proposeFn();
      setSuccess(`${actionName} proposed! Hash: ${result.safeTxHash}`);

      // Fetch pending transactions
      setTimeout(() => handleFetchPendingTransactions(), 1000);
      setTimeout(() => handleFetchRecentProposals(), 1200);
      setTimeout(() => handleFetchScheduledOperations(), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to ${actionName}: ${message}`);
      console.error(`Error ${actionName}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const formatUsdTo1e18 = (input: string): string => {
    const normalized = input.trim().replace(/,/g, "");
    if (!normalized) {
      throw new Error("Price is required");
    }

    return ethers.parseUnits(normalized, 18).toString();
  };

  // Pause/Unpause functions
  const handleProposePause = async (): Promise<void> => {
    await proposeAndFetch(
      () => safeMultisigService.proposePauseLendingPool(),
      "Pause proposal",
    );
  };

  const handleProposeUnpause = async (): Promise<void> => {
    await proposeAndFetch(
      () => safeMultisigService.proposeUnpauseLendingPool(),
      "Unpause proposal",
    );
  };

  // Market onboarding/delisting functions
  const handleProposeSupportWithChainlink = async (): Promise<void> => {
    if (
      !formData.supportAsset ||
      !formData.supportIrm ||
      !formData.supportFeed
    ) {
      setError("Please fill in asset, IRM, and Chainlink feed");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSupportMarketWithChainlinkFeed(
          formData.supportAsset,
          formData.supportIrm,
          formData.supportFeed,
        ),
      "Support market with Chainlink proposal",
    );
    setFormData({
      ...formData,
      supportAsset: "",
      supportIrm: "",
      supportFeed: "",
    });
  };

  const handleProposeSupportWithMyOracle = async (): Promise<void> => {
    if (
      !formData.supportAsset ||
      !formData.supportIrm ||
      !formData.supportPrice
    ) {
      setError("Please fill in asset, IRM, and MyOracle initial price");
      return;
    }

    let formattedPrice: string;
    try {
      formattedPrice = formatUsdTo1e18(formData.supportPrice);
    } catch {
      setError("Invalid MyOracle initial price. Example: 1 or 1.25");
      return;
    }

    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSupportMarketWithMyOracleFeed(
          formData.supportAsset,
          formData.supportIrm,
          formattedPrice,
        ),
      "Support market with MyOracle proposal",
    );
    setFormData({
      ...formData,
      supportAsset: "",
      supportIrm: "",
      supportPrice: "",
    });
  };

  const handleProposeUnsupportMarket = async (): Promise<void> => {
    if (!formData.unsupportAsset) {
      setError("Please fill in asset address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeUnsupportMarket(formData.unsupportAsset),
      "Unsupport market proposal",
    );
    setFormData({ ...formData, unsupportAsset: "" });
  };

  // Collateral functions
  const handleProposeSetCollateralParams = async (): Promise<void> => {
    if (!formData.collateralFactor) {
      setError("Please fill in collateral factor");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSetCollateralParams(
          formData.collateralFactor,
        ),
      "Set collateral params proposal",
    );
    setFormData({ ...formData, collateralFactor: "" });
  };

  // Interest rate model batch
  const handleProposeSetInterestRateModelBatch = async (): Promise<void> => {
    if (!formData.assets || !formData.interestRateModel) {
      setError("Please fill in assets (comma-separated) and IRM address");
      return;
    }
    const assetArray = formData.assets
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a);
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSetInterestRateModelBatch(
          assetArray,
          formData.interestRateModel,
        ),
      "Set interest rate model batch proposal",
    );
    setFormData({ ...formData, assets: "", interestRateModel: "" });
  };

  // Liquidation parameters
  const handleProposeSetLiquidateParams = async (): Promise<void> => {
    if (
      !formData.liquidationThreshold ||
      !formData.closeFactor ||
      !formData.liquidationIncentive
    ) {
      setError("Please fill in all liquidation parameters");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSetLiquidateParams(
          formData.liquidationThreshold,
          formData.closeFactor,
          formData.liquidationIncentive,
        ),
      "Set liquidate params proposal",
    );
    setFormData({
      ...formData,
      liquidationThreshold: "",
      closeFactor: "",
      liquidationIncentive: "",
    });
  };

  // Price feed functions
  const handleProposeSetChainlinkFeed = async (): Promise<void> => {
    if (!formData.asset || !formData.feed) {
      setError("Please fill in asset and feed addresses");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSetChainlinkFeed(
          formData.asset,
          formData.feed,
        ),
      "Set Chainlink feed proposal",
    );
    setFormData({ ...formData, asset: "", feed: "" });
  };

  const handleProposeSetMyOracleFeed = async (): Promise<void> => {
    if (!formData.asset) {
      setError("Please fill in asset address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeSetMyOracleFeed(formData.asset),
      "Set MyOracle feed proposal",
    );
    setFormData({ ...formData, asset: "" });
  };

  const handleProposeRemoveFeed = async (): Promise<void> => {
    if (!formData.asset) {
      setError("Please fill in asset address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeRemoveFeed(formData.asset),
      "Remove feed proposal",
    );
    setFormData({ ...formData, asset: "" });
  };

  const handleProposeSetPrice = async (): Promise<void> => {
    if (!formData.asset || !formData.price) {
      setError("Please fill in asset address and price");
      return;
    }

    let formattedPrice: string;
    try {
      formattedPrice = formatUsdTo1e18(formData.price);
    } catch {
      setError("Invalid price. Example: 1 or 1.25");
      return;
    }

    await proposeAndFetch(
      () => safeMultisigService.proposeSetPrice(formData.asset, formattedPrice),
      "Set price proposal",
    );
    setFormData({ ...formData, asset: "", price: "" });
  };

  // Treasury operations
  const handleProposeWithdrawTreasury = async (): Promise<void> => {
    if (
      !formData.treasuryAsset ||
      !formData.treasuryTo ||
      !formData.treasuryAmount
    ) {
      setError("Please fill in treasury asset, recipient and amount");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeWithdrawTreasury(
          formData.treasuryAsset,
          formData.treasuryTo,
          formData.treasuryAmount,
        ),
      "Withdraw treasury proposal",
    );
    setFormData({
      ...formData,
      treasuryAsset: "",
      treasuryTo: "",
      treasuryAmount: "",
    });
  };

  const handleProposeRescueToken = async (): Promise<void> => {
    if (!formData.rescueToken || !formData.rescueTo || !formData.rescueAmount) {
      setError("Please fill in token, recipient and amount for rescue");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeRescueToken(
          formData.rescueToken,
          formData.rescueTo,
          formData.rescueAmount,
        ),
      "Rescue token proposal",
    );
    setFormData({
      ...formData,
      rescueToken: "",
      rescueTo: "",
      rescueAmount: "",
    });
  };

  const handleProposeDonate = async (): Promise<void> => {
    if (!formData.treasuryAsset || !formData.treasuryAmount) {
      setError("Please fill in treasury asset and amount for donate");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeDonate(
          formData.treasuryAsset,
          formData.treasuryAmount,
        ),
      "Donate proposal",
    );
    setFormData({
      ...formData,
      treasuryAsset: "",
      treasuryAmount: "",
    });
  };

  // Address management
  const handleProposeSetLendingPool = async (): Promise<void> => {
    if (!formData.newLendingPool) {
      setError("Please fill in new lending pool address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeSetLendingPool(formData.newLendingPool),
      "Set lending pool proposal",
    );
    setFormData({ ...formData, newLendingPool: "" });
  };

  const handleProposeSetPriceRouter = async (): Promise<void> => {
    if (!formData.newPriceRouter) {
      setError("Please fill in new price router address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeSetPriceRouter(formData.newPriceRouter),
      "Set price router proposal",
    );
    setFormData({ ...formData, newPriceRouter: "" });
  };

  const handleProposeSetLiquidation = async (): Promise<void> => {
    if (!formData.newLiquidation) {
      setError("Please fill in new liquidation address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeSetLiquidation(formData.newLiquidation),
      "Set liquidation proposal",
    );
    setFormData({ ...formData, newLiquidation: "" });
  };

  const handleProposeSetMyOracle = async (): Promise<void> => {
    if (!formData.newMyOracle) {
      setError("Please fill in new MyOracle address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeSetMyOracle(formData.newMyOracle),
      "Set MyOracle proposal",
    );
    setFormData({ ...formData, newMyOracle: "" });
  };

  const handleProposeMigrateController = async (): Promise<void> => {
    if (!formData.newController) {
      setError("Please fill in new controller address");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeMigrateController(formData.newController),
      "Migrate controller proposal",
    );
    setFormData({ ...formData, newController: "" });
  };

  // Proxy upgrade
  const handleProposeUpgradePriceRouter = async (): Promise<void> => {
    if (!formData.upgradePriceRouterImpl) {
      setError("Please fill in new PriceRouter implementation");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeUpgradePriceRouter(
          formData.upgradePriceRouterImpl,
        ),
      "Upgrade price router proposal",
    );
    setFormData({ ...formData, upgradePriceRouterImpl: "" });
  };

  const handleProposeUpgradeLendingPool = async (): Promise<void> => {
    if (!formData.upgradeLendingPoolImpl) {
      setError("Please fill in new LendingPool implementation");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeUpgradeLendingPool(
          formData.upgradeLendingPoolImpl,
        ),
      "Upgrade lending pool proposal",
    );
    setFormData({ ...formData, upgradeLendingPoolImpl: "" });
  };

  // Transaction management
  const handleFetchPendingTransactions = async (): Promise<void> => {
    try {
      setLoading(true);
      const txs = await safeMultisigService.getPendingTransactions();
      setPendingTxs(txs);
      setShowPendingDialog(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch pending transactions: ${message}`);
      console.error("Error fetching pending transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignTransaction = async (safeTxHash: string): Promise<void> => {
    try {
      setLoading(true);
      await safeMultisigService.signTransaction(safeTxHash);
      setSuccess(`Transaction signed successfully!`);
      await handleFetchPendingTransactions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to sign transaction: ${message}`);
      console.error("Error signing transaction:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTransaction = async (
    safeTxHash: string,
  ): Promise<void> => {
    try {
      setLoading(true);
      await safeMultisigService.executeTransaction(safeTxHash);
      setSuccess(`Transaction executed successfully!`);
      await handleFetchPendingTransactions();
      await handleFetchRecentProposals();
      await handleFetchScheduledOperations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to execute transaction: ${message}`);
      console.error("Error executing transaction:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchSafeInfo = async (): Promise<void> => {
    try {
      setLoading(true);
      const info = await safeMultisigService.getSafeInfo();
      setSafeInfo(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to fetch Safe info: ${message}`);
      console.error("Error fetching Safe info:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePendingDialog = (): void => {
    setShowPendingDialog(false);
  };

  const truncateAddress = (address: string): string =>
    `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

  const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const getOperationState = (
    operationId: string | null | undefined,
  ): TimelockOperationUiState | null => {
    if (!operationId) return null;
    return operationStates[operationId] || null;
  };

  const getOperationStatusLabel = (
    operation: TimelockOperationUiState | null,
  ): string => {
    if (!operation) return "Unknown";
    if (operation.isDone) return "Done";
    if (operation.isReady) return "Ready";
    if (operation.isPending) return "Pending";
    return "Unknown";
  };

  const getOperationStatusColor = (
    operation: TimelockOperationUiState | null,
  ): "default" | "warning" | "info" | "success" => {
    if (!operation) return "default";
    if (operation.isDone) return "success";
    if (operation.isReady) return "info";
    if (operation.isPending) return "warning";
    return "default";
  };

  const formatRemainingTime = (
    operation: TimelockOperationUiState | null,
  ): string => {
    if (!operation) return "-";
    if (operation.isDone) return "Executed";
    if (operation.isReady) return "Ready now";
    if (!operation.timestamp || operation.timestamp <= 1) return "Pending";

    const remainingSeconds = Math.max(
      Math.floor(operation.timestamp - Date.now() / 1000),
      0,
    );

    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 3 }, py: 4 }}>
      <Typography variant="h3" fontWeight="bold" mb={1}>
        Admin Panel - Protocol Governance
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Propose and manage Safe multisig transactions for protocol
        administration
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        All admin actions are routed through ProtocolTimelock to execute
        ProtocolController changes after delay.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {checkedOwnership && !isOwner && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You are not a Safe multisig owner. You can view pending transactions,
          but cannot propose or execute governance actions.
        </Alert>
      )}

      {/* Safe Info Section */}
      <Card sx={{ mb: 4, elevation: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Safe Multisig Info
          </Typography>
          <Button
            variant="outlined"
            onClick={handleFetchSafeInfo}
            disabled={loading}
            sx={{ mb: 2 }}
          >
            {loading ? <CircularProgress size={20} /> : "Fetch Safe Info"}
          </Button>
          {safeInfo && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Owners ({safeInfo.owners.length}):</strong>
              </Typography>
              <Box sx={{ ml: 2, mb: 1 }}>
                {safeInfo.owners.map((owner, idx) => (
                  <Typography key={idx} variant="caption" display="block">
                    {idx + 1}. {truncateAddress(owner)}
                  </Typography>
                ))}
              </Box>
              <Typography variant="body2">
                <strong>Threshold:</strong> {safeInfo.threshold}/
                {safeInfo.owners.length}
              </Typography>
              <Typography variant="body2">
                <strong>Nonce:</strong> {safeInfo.nonce}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Timelock Info Section */}
      <Card sx={{ mb: 4, elevation: 2 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight="bold">
              Timelock Governance Info
            </Typography>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleFetchTimelockInfo}
                disabled={loadingTimelockInfo}
              >
                {loadingTimelockInfo ? (
                  <CircularProgress size={18} />
                ) : (
                  "Refresh Timelock"
                )}
              </Button>
              <Button
                variant="contained"
                size="small"
                component={Link}
                href="/proposals"
              >
                Open Proposal History
              </Button>
            </Box>
          </Box>

          {!timelockInfo ? (
            <Typography variant="body2" color="text.secondary">
              Timelock info is not loaded yet.
            </Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 0.75 }}>
              <Typography variant="body2">
                <strong>Timelock:</strong>{" "}
                {truncateAddress(timelockInfo.timelockAddress)}
              </Typography>
              <Typography variant="body2">
                <strong>Min delay:</strong> {timelockInfo.minDelay}s (~
                {timelockInfo.minDelayHours.toFixed(2)}h)
              </Typography>
              <Typography variant="body2">
                <strong>Executor mode:</strong>{" "}
                {timelockInfo.isExecutorOpen
                  ? "Open (address zero)"
                  : "Restricted"}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 3,
          mb: 4,
        }}
      >
        <TimeSeriesChart
          title="Accrue log history"
          subtitle={adminChartLabel}
          points={adminAccruePoints}
          series={[
            {
              key: "interestAccrued",
              label: "Interest accrued",
              color: "#2563eb",
            },
            { key: "toDeposit", label: "To deposit", color: "#16a34a" },
            { key: "toTreasury", label: "To treasury", color: "#f97316" },
          ]}
          emptyLabel={
            adminChartLoading
              ? "Loading admin log charts..."
              : "No accrue logs available for the selected asset."
          }
        />

        <TimeSeriesChart
          title="Treasury log history"
          subtitle={adminChartLabel}
          points={adminTreasuryPoints}
          series={[
            { key: "amount", label: "Amount", color: "#7c3aed" },
            { key: "balanceAfter", label: "Balance after", color: "#0f766e" },
          ]}
          emptyLabel={
            adminChartLoading
              ? "Loading admin log charts..."
              : "No treasury logs available for the selected asset."
          }
        />
      </Box>

      {/* Protocol Control Section */}
      <Card sx={{ mb: 4, elevation: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Protocol Control
            {checkedOwnership && !isOwner && (
              <Typography
                component="span"
                variant="caption"
                sx={{ ml: 1, color: "warning.main" }}
              >
                (Owner access required)
              </Typography>
            )}
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            <Button
              variant="contained"
              color="error"
              onClick={handleProposePause}
              disabled={loading || !isOwner}
              fullWidth
            >
              {loading ? <CircularProgress size={20} /> : "Propose Pause"}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={handleProposeUnpause}
              disabled={loading || !isOwner}
              fullWidth
            >
              {loading ? <CircularProgress size={20} /> : "Propose Unpause"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Market Onboarding Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Market Onboarding & Delisting
          </Typography>

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Support Market With Chainlink Feed
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2,
              mb: 1.5,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.supportAsset}
              onChange={(e) =>
                setFormData({ ...formData, supportAsset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Interest Rate Model"
              size="small"
              value={formData.supportIrm}
              onChange={(e) =>
                setFormData({ ...formData, supportIrm: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Chainlink Feed"
              size="small"
              value={formData.supportFeed}
              onChange={(e) =>
                setFormData({ ...formData, supportFeed: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeSupportWithChainlink}
            disabled={loading || !isOwner}
            fullWidth
            sx={{ mb: 2.5 }}
          >
            Support With Chainlink
          </Button>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Support Market With MyOracle Feed
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2,
              mb: 1.5,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.supportAsset}
              onChange={(e) =>
                setFormData({ ...formData, supportAsset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Interest Rate Model"
              size="small"
              value={formData.supportIrm}
              onChange={(e) =>
                setFormData({ ...formData, supportIrm: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Initial MyOracle Price (USD)"
              size="small"
              value={formData.supportPrice}
              onChange={(e) =>
                setFormData({ ...formData, supportPrice: e.target.value })
              }
              placeholder="e.g., 1 or 1.25"
              helperText="1 USD = 1000000000000000000"
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeSupportWithMyOracle}
            disabled={loading || !isOwner}
            fullWidth
            sx={{ mb: 2.5 }}
          >
            Support With MyOracle
          </Button>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Delist Market
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.unsupportAsset}
              onChange={(e) =>
                setFormData({ ...formData, unsupportAsset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="outlined"
              onClick={handleProposeUnsupportMarket}
              disabled={loading || !isOwner}
              fullWidth
            >
              Unsupport Market
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Collateral Parameters Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Collateral Parameters
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Collateral Factor (in 1e18 format)"
              size="small"
              value={formData.collateralFactor}
              onChange={(e) =>
                setFormData({ ...formData, collateralFactor: e.target.value })
              }
              placeholder="e.g., 500000000000000000"
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeSetCollateralParams}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set Collateral
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Interest Rate Model Batch */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Interest Rate Model Batch
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1.5fr 1.5fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Assets (comma-separated)"
              size="small"
              value={formData.assets}
              onChange={(e) =>
                setFormData({ ...formData, assets: e.target.value })
              }
              placeholder="0x..., 0x..., 0x..."
              multiline
              rows={2}
              disabled={!isOwner}
            />
            <TextField
              label="Interest Rate Model Address"
              size="small"
              value={formData.interestRateModel}
              onChange={(e) =>
                setFormData({ ...formData, interestRateModel: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeSetInterestRateModelBatch}
            disabled={loading || !isOwner}
            fullWidth
          >
            Set IRM Batch
          </Button>
        </CardContent>
      </Card>
      {/* Liquidation Parameters Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Liquidation Parameters
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Liquidation Threshold"
              size="small"
              value={formData.liquidationThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  liquidationThreshold: e.target.value,
                })
              }
              placeholder="e.g., 900000000000000000"
              disabled={!isOwner}
            />
            <TextField
              label="Close Factor"
              size="small"
              value={formData.closeFactor}
              onChange={(e) =>
                setFormData({ ...formData, closeFactor: e.target.value })
              }
              placeholder="e.g., 500000000000000000"
              disabled={!isOwner}
            />
            <TextField
              label="Liquidation Incentive"
              size="small"
              value={formData.liquidationIncentive}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  liquidationIncentive: e.target.value,
                })
              }
              placeholder="e.g., 110000000000000000"
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeSetLiquidateParams}
            disabled={loading || !isOwner}
            fullWidth
          >
            Set Liquidation Params
          </Button>
        </CardContent>
      </Card>

      {/* Price Feed Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Price Feeds
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Chainlink Feed
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
              mb: 3,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.asset}
              onChange={(e) =>
                setFormData({ ...formData, asset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Feed Address"
              size="small"
              value={formData.feed}
              onChange={(e) =>
                setFormData({ ...formData, feed: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeSetChainlinkFeed}
            disabled={loading || !isOwner}
            fullWidth
            sx={{ mb: 3 }}
          >
            Set Chainlink Feed
          </Button>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            MyOracle Feed & Manual Price
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.asset}
              onChange={(e) =>
                setFormData({ ...formData, asset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Price (USD)"
              size="small"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              placeholder="e.g., 1 or 1.25"
              helperText="1 USD = 1000000000000000000"
              disabled={!isOwner}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            <Button
              variant="contained"
              onClick={handleProposeSetMyOracleFeed}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set MyOracle Feed
            </Button>
            <Button
              variant="contained"
              onClick={handleProposeSetPrice}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set Price
            </Button>
            <Button
              variant="outlined"
              onClick={handleProposeRemoveFeed}
              disabled={loading || !isOwner}
              fullWidth
            >
              Remove Feed
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Treasury Operations Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Treasury Operations
          </Typography>

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Withdraw Treasury
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2,
              mb: 1.5,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.treasuryAsset}
              onChange={(e) =>
                setFormData({ ...formData, treasuryAsset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Recipient Address"
              size="small"
              value={formData.treasuryTo}
              onChange={(e) =>
                setFormData({ ...formData, treasuryTo: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Amount"
              size="small"
              value={formData.treasuryAmount}
              onChange={(e) =>
                setFormData({ ...formData, treasuryAmount: e.target.value })
              }
              placeholder="wei"
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="contained"
            onClick={handleProposeWithdrawTreasury}
            disabled={loading || !isOwner}
            fullWidth
            sx={{ mb: 2.5 }}
          >
            Propose Withdraw Treasury
          </Button>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Rescue Surplus Token
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2,
              mb: 1.5,
            }}
          >
            <TextField
              label="Token Address"
              size="small"
              value={formData.rescueToken}
              onChange={(e) =>
                setFormData({ ...formData, rescueToken: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Recipient Address"
              size="small"
              value={formData.rescueTo}
              onChange={(e) =>
                setFormData({ ...formData, rescueTo: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Amount"
              size="small"
              value={formData.rescueAmount}
              onChange={(e) =>
                setFormData({ ...formData, rescueAmount: e.target.value })
              }
              placeholder="wei"
              disabled={!isOwner}
            />
          </Box>
          <Button
            variant="outlined"
            onClick={handleProposeRescueToken}
            disabled={loading || !isOwner}
            fullWidth
            sx={{ mb: 2.5 }}
          >
            Propose Rescue Token
          </Button>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Donate To Treasury (via Timelock)
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            This calls LendingPool.donate from ProtocolTimelock as msg.sender.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              label="Asset Address"
              size="small"
              value={formData.treasuryAsset}
              onChange={(e) =>
                setFormData({ ...formData, treasuryAsset: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <TextField
              label="Amount"
              size="small"
              value={formData.treasuryAmount}
              onChange={(e) =>
                setFormData({ ...formData, treasuryAmount: e.target.value })
              }
              placeholder="wei"
              disabled={!isOwner}
            />
            <Button
              variant="outlined"
              onClick={handleProposeDonate}
              disabled={loading || !isOwner}
              fullWidth
            >
              Propose Donate
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Address Management Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Contract Address Management
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="New LendingPool Address"
              size="small"
              value={formData.newLendingPool}
              onChange={(e) =>
                setFormData({ ...formData, newLendingPool: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeSetLendingPool}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set LendingPool
            </Button>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="New PriceRouter Address"
              size="small"
              value={formData.newPriceRouter}
              onChange={(e) =>
                setFormData({ ...formData, newPriceRouter: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeSetPriceRouter}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set PriceRouter
            </Button>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="New Liquidation Address"
              size="small"
              value={formData.newLiquidation}
              onChange={(e) =>
                setFormData({ ...formData, newLiquidation: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeSetLiquidation}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set Liquidation
            </Button>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="New MyOracle Address"
              size="small"
              value={formData.newMyOracle}
              onChange={(e) =>
                setFormData({ ...formData, newMyOracle: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeSetMyOracle}
              disabled={loading || !isOwner}
              fullWidth
            >
              Set MyOracle
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              label="New Controller Address"
              size="small"
              value={formData.newController}
              onChange={(e) =>
                setFormData({ ...formData, newController: e.target.value })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="outlined"
              onClick={handleProposeMigrateController}
              disabled={loading || !isOwner}
              fullWidth
            >
              Migrate Controller
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Proxy Upgrade Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Proxy Upgrade Operations
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
              mb: 2,
            }}
          >
            <TextField
              label="New PriceRouter Implementation"
              size="small"
              value={formData.upgradePriceRouterImpl}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  upgradePriceRouterImpl: e.target.value,
                })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeUpgradePriceRouter}
              disabled={loading || !isOwner}
              fullWidth
            >
              Upgrade PriceRouter
            </Button>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              label="New LendingPool Implementation"
              size="small"
              value={formData.upgradeLendingPoolImpl}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  upgradeLendingPoolImpl: e.target.value,
                })
              }
              placeholder="0x..."
              disabled={!isOwner}
            />
            <Button
              variant="contained"
              onClick={handleProposeUpgradeLendingPool}
              disabled={loading || !isOwner}
              fullWidth
            >
              Upgrade LendingPool
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Pending Transactions Section */}
      <Card sx={{ elevation: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Pending Transactions
          </Typography>
          <Button
            variant="outlined"
            onClick={handleFetchPendingTransactions}
            disabled={loading}
            fullWidth
          >
            {loading ? (
              <CircularProgress size={20} />
            ) : (
              "View Pending Transactions"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Timelock Queue Section */}
      <Card sx={{ mt: 4, elevation: 2, opacity: isOwner ? 1 : 0.75 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h6" fontWeight="bold">
              Timelock Scheduled Operations
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleFetchScheduledOperations}
              disabled={loadingScheduledOperations}
            >
              {loadingScheduledOperations ? (
                <CircularProgress size={18} />
              ) : (
                "Refresh Queue"
              )}
            </Button>
          </Box>

          {!isOwner && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ mb: 2 }}
            >
              Only Safe owners can execute ready timelock operations from this
              UI.
            </Typography>
          )}

          {loadingScheduledOperations ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : scheduledOperations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No scheduled timelock operation found.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {scheduledOperations.map((proposal) => {
                const state = getOperationState(proposal.operationId);
                const canExecute =
                  isOwner &&
                  Boolean(proposal.target) &&
                  Boolean(proposal.calldata) &&
                  Boolean(proposal.operationId) &&
                  Boolean(state?.isReady) &&
                  !state?.isDone;
                const isExecuting =
                  proposal.operationId !== null &&
                  proposal.operationId !== undefined &&
                  executingOperationId === proposal.operationId;

                return (
                  <Card
                    key={`${proposal.id}-${proposal.operationId || proposal.updatedAt}`}
                    variant="outlined"
                  >
                    <CardContent sx={{ py: "12px !important" }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 1,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          <Chip
                            size="small"
                            color={getProposalStatusColor(proposal.status)}
                            label={proposalStatusLabel[proposal.status]}
                          />
                          <Chip
                            size="small"
                            color={getOperationStatusColor(state)}
                            label={getOperationStatusLabel(state)}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          ETA: {formatDateTime(proposal.eta)}
                        </Typography>
                      </Box>

                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Operation:{" "}
                        {proposal.operationId
                          ? truncateAddress(proposal.operationId)
                          : "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Safe Tx:{" "}
                        {proposal.safeTxHash
                          ? truncateAddress(proposal.safeTxHash)
                          : "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Remaining: {formatRemainingTime(state)}
                      </Typography>

                      {canExecute && (
                        <Box sx={{ mt: 1.5 }}>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            onClick={() =>
                              handleExecuteScheduledOperation(proposal)
                            }
                            disabled={isExecuting}
                          >
                            {isExecuting ? (
                              <CircularProgress size={16} />
                            ) : (
                              "Execute Timelock"
                            )}
                          </Button>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Recent Proposal History Section */}
      <Card sx={{ mt: 4, elevation: 2 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h6" fontWeight="bold">
              Recent Proposal History
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleFetchRecentProposals}
              disabled={loadingRecentProposals}
            >
              {loadingRecentProposals ? (
                <CircularProgress size={18} />
              ) : (
                "Refresh"
              )}
            </Button>
          </Box>

          {loadingRecentProposals ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : recentProposals.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No proposal history found yet.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {recentProposals.map((proposal) => (
                <Card
                  key={`${proposal.id}-${proposal.updatedAt}`}
                  variant="outlined"
                >
                  <CardContent sx={{ py: "12px !important" }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 1,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <Chip
                        size="small"
                        color={getProposalStatusColor(proposal.status)}
                        label={proposalStatusLabel[proposal.status]}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(proposal.createdAt)}
                      </Typography>
                    </Box>

                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Operation:{" "}
                      {proposal.operationId
                        ? truncateAddress(proposal.operationId)
                        : "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Safe Tx:{" "}
                      {proposal.safeTxHash
                        ? truncateAddress(proposal.safeTxHash)
                        : "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ETA: {formatDateTime(proposal.eta)}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Pending Transactions Dialog */}
      <Dialog
        open={showPendingDialog}
        onClose={handleClosePendingDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Pending Safe Transactions</DialogTitle>
        <DialogContent sx={{ maxHeight: 600, overflow: "auto" }}>
          {pendingTxs.length === 0 ? (
            <Typography color="text.secondary">
              No pending transactions
            </Typography>
          ) : (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
            >
              {pendingTxs.map((tx) => (
                <Card key={tx.safeTxHash} variant="outlined">
                  <CardContent>
                    <Typography
                      variant="body2"
                      fontWeight="bold"
                      sx={{ wordBreak: "break-all" }}
                    >
                      Hash: {tx.safeTxHash}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Nonce: {tx.nonce}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      To: {truncateAddress(tx.to)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Confirmations: {tx.confirmations.length}/
                      {tx.confirmationsRequired}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Confirmed: {tx.confirmed ? "✓ Yes" : "✗ No"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 1 }}
                    >
                      Submitted: {new Date(tx.submissionDate).toLocaleString()}
                    </Typography>

                    {/* Signers */}
                    <Typography
                      variant="caption"
                      fontWeight="bold"
                      sx={{ mt: 1, display: "block" }}
                    >
                      Signers:
                    </Typography>
                    {tx.confirmations.map((conf, idx) => {
                      const signerAddress =
                        typeof conf.signer === "string"
                          ? conf.signer
                          : conf.signer?.value ||
                            (conf as any).owner ||
                            "Unknown";
                      return (
                        <Typography
                          key={idx}
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          sx={{ ml: 1 }}
                        >
                          {idx + 1}. {truncateAddress(signerAddress)}
                        </Typography>
                      );
                    })}

                    {/* Action Buttons */}
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        mt: 2,
                        flexDirection: { xs: "column", sm: "row" },
                      }}
                    >
                      {/* Sign Button - Only show if not confirmed and user hasn't signed */}
                      {!tx.confirmed &&
                        (() => {
                          const hasUserSigned = tx.confirmations.some(
                            (conf) => {
                              const confAddr =
                                typeof conf.signer === "string"
                                  ? conf.signer
                                  : conf.signer?.value ||
                                    (conf as any).owner ||
                                    "";
                              return (
                                confAddr.toLowerCase() === currentSignerAddress
                              );
                            },
                          );
                          return !hasUserSigned ? (
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              onClick={() =>
                                handleSignTransaction(tx.safeTxHash)
                              }
                              disabled={loading}
                              fullWidth
                            >
                              Sign
                            </Button>
                          ) : (
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              disabled
                              fullWidth
                            >
                              ✓ Signed
                            </Button>
                          );
                        })()}
                      {/* Execute Button - Show when enough confirmations */}
                      {tx.confirmations.length >= tx.confirmationsRequired && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() =>
                            handleExecuteTransaction(tx.safeTxHash)
                          }
                          disabled={loading}
                          fullWidth
                        >
                          Execute
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePendingDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export const dynamic = "force-dynamic";
