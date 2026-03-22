"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ReactElement, useEffect, useState } from "react";
import { safeMultisigService } from "@/services/SafeMultisigService";

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

export default function Admin(): ReactElement {
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

  // Form states for ProtocolController functions
  const [formData, setFormData] = useState({
    asset: "",
    irm: "",
    collateralFactor: "",
    liquidationThreshold: "",
    closeFactor: "",
    liquidationIncentive: "",
    feed: "",
    price: "",
    assets: "",
    interestRateModel: "",
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to ${actionName}: ${message}`);
      console.error(`Error ${actionName}:`, err);
    } finally {
      setLoading(false);
    }
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

  // Market support functions
  const handleProposeSupportMarket = async (): Promise<void> => {
    if (!formData.asset || !formData.irm) {
      setError("Please fill in asset and interest rate model addresses");
      return;
    }
    await proposeAndFetch(
      () =>
        safeMultisigService.proposeSupportMarket(formData.asset, formData.irm),
      "Support market proposal",
    );
    setFormData({ ...formData, asset: "", irm: "" });
  };

  const handleProposeUnsupportMarket = async (): Promise<void> => {
    if (!formData.asset) {
      setError("Please fill in asset address");
      return;
    }
    await proposeAndFetch(
      () => safeMultisigService.proposeUnsupportMarket(formData.asset),
      "Unsupport market proposal",
    );
    setFormData({ ...formData, asset: "" });
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
    await proposeAndFetch(
      () => safeMultisigService.proposeSetPrice(formData.asset, formData.price),
      "Set price proposal",
    );
    setFormData({ ...formData, asset: "", price: "" });
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

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: { xs: 2, md: 3 }, py: 4 }}>
      <Typography variant="h3" fontWeight="bold" mb={1}>
        Admin Panel - Protocol Governance
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Propose and manage Safe multisig transactions for protocol
        administration
      </Typography>

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
          but cannot propose new ones.
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

      {/* Market Support Section */}
      <Card sx={{ mb: 4, elevation: 2, opacity: isOwner ? 1 : 0.6 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Market Management
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
              label="Interest Rate Model (for support)"
              size="small"
              value={formData.irm}
              onChange={(e) =>
                setFormData({ ...formData, irm: e.target.value })
              }
              placeholder="0x..."
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
              onClick={handleProposeSupportMarket}
              disabled={loading || !isOwner}
              fullWidth
            >
              Support Market
            </Button>
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
              label="Price (in 1e8 format)"
              size="small"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              placeholder="e.g., 100000000"
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
