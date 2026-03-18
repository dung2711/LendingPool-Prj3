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
import Typography from "@mui/material/Typography";
import { type ReactElement, useState } from "react";
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
}

export default function Admin(): ReactElement {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
  const [showPendingDialog, setShowPendingDialog] = useState(false);

  const handleProposePause = async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const result = await safeMultisigService.proposePause();
      setSuccess(`Pause transaction proposed! Hash: ${result.safeTxHash}`);

      // Fetch pending transactions
      await handleFetchPendingTransactions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to propose pause: ${message}`);
      console.error("Error proposing pause:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProposeUnpause = async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const result = await safeMultisigService.proposeUnpause();
      setSuccess(`Unpause transaction proposed! Hash: ${result.safeTxHash}`);

      // Fetch pending transactions
      await handleFetchPendingTransactions();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to propose unpause: ${message}`);
      console.error("Error proposing unpause:", err);
    } finally {
      setLoading(false);
    }
  };

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

  const handleClosePendingDialog = (): void => {
    setShowPendingDialog(false);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 2, md: 3 }, py: 4 }}>
      <Typography variant="h3" fontWeight="bold" mb={4}>
        Admin Panel - Governance
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

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
        }}
      >
        {/* Pause/Unpause Card */}
        <Box>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h5" fontWeight="bold" mb={2}>
                Protocol Control
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Propose pause or unpause the lending pool contract via Safe
                multisig.
              </Typography>

              <Box sx={{ display: "flex", gap: 2, flexDirection: "column" }}>
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleProposePause}
                  disabled={loading}
                  fullWidth
                >
                  {loading ? <CircularProgress size={24} /> : "Propose Pause"}
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleProposeUnpause}
                  disabled={loading}
                  fullWidth
                >
                  {loading ? <CircularProgress size={24} /> : "Propose Unpause"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Pending Transactions Card */}
        <Box>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h5" fontWeight="bold" mb={2}>
                Pending Transactions
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                View pending Safe multisig transactions awaiting execution.
              </Typography>

              <Button
                variant="outlined"
                onClick={handleFetchPendingTransactions}
                disabled={loading}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : "View Pending"}
              </Button>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Pending Transactions Dialog */}
      <Dialog
        open={showPendingDialog}
        onClose={handleClosePendingDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Pending Safe Transactions</DialogTitle>
        <DialogContent sx={{ maxHeight: 400, overflow: "auto" }}>
          {pendingTxs.length === 0 ? (
            <Typography color="text.secondary">
              No pending transactions
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {pendingTxs.map((tx) => (
                <Card key={tx.safeTxHash} variant="outlined">
                  <CardContent>
                    <Typography variant="body2" fontWeight="bold">
                      Tx Hash: {tx.safeTxHash.slice(0, 10)}...
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Nonce: {tx.nonce}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Confirmed: {tx.confirmed ? "Yes" : "No"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Submitted: {new Date(tx.submissionDate).toLocaleString()}
                    </Typography>
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
