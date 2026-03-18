"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import { web3Service } from "@/lib/web3";

interface Asset {
  address: string;
  symbol: string;
  userDeposit: bigint;
  decimals: number;
  [key: string]: any;
}

interface PreviewData {
  currentTotal: bigint;
  newTotal: bigint;
  decrease: bigint;
  totalBorrowed: bigint;
  healthFactor: bigint;
}

interface WithdrawDialogProps {
  handleCloseDialog: () => void;
  selectedAsset: Asset | null;
  setSuccess: (message: string) => void;
  fetchData: () => void;
  formatAmount: (amount: bigint | number, decimals?: number) => string;
  formatRate: (rate: bigint) => string;
}

const MAX_UINT256 = ethers.MaxUint256;

export default function WithdrawDialog({
  handleCloseDialog,
  selectedAsset,
  setSuccess,
  fetchData,
  formatAmount,
}: WithdrawDialogProps): ReactElement {
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [maxWithdrawChosen, setMaxWithdrawChosen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [transactionLoading, setTransactionLoading] = useState<boolean>(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchPreview = async (): Promise<void> => {
      if (
        !withdrawAmount ||
        !selectedAsset ||
        parseFloat(withdrawAmount) <= 0
      ) {
        setPreview(null);
        return;
      }

      try {
        setPreviewLoading(true);
        const lendingPool = await web3Service.getLendingPoolContract();
        const tokenContract = await web3Service.getToken(selectedAsset.address);
        const decimals = await tokenContract.decimals();
        const amountInWei = ethers.parseUnits(withdrawAmount, decimals);

        if (typeof window !== "undefined" && window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const userAddress = await signer.getAddress();

          const [
            totalDepositedUSD,
            totalBorrowedUSD,
            newDepositedUSD,
            newHealthFactor,
          ] = (await lendingPool.preViewWithdraw(
            userAddress,
            selectedAsset.address,
            amountInWei,
          )) as [bigint, bigint, bigint, bigint];

          setPreview({
            currentTotal: totalDepositedUSD,
            newTotal: newDepositedUSD,
            decrease: totalDepositedUSD - newDepositedUSD,
            totalBorrowed: totalBorrowedUSD,
            healthFactor: newHealthFactor,
          });
        }
      } catch (err) {
        console.error("Error fetching preview:", err);
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(debounceTimer);
  }, [withdrawAmount, selectedAsset]);

  const handleWithdraw = async (): Promise<void> => {
    if (!withdrawAmount || !selectedAsset) return;

    try {
      setTransactionLoading(true);
      setError("");

      const lendingPool = await web3Service.getLendingPoolContract();
      const tokenContract = await web3Service.getToken(selectedAsset.address);
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.parseUnits(withdrawAmount, decimals);

      let actualWithdrawSent = amountInWei;

      if (maxWithdrawChosen) {
        console.log("Max withdraw chosen, setting to MAX_UINT256");
        actualWithdrawSent = MAX_UINT256;
      }

      const withdrawTx = await lendingPool.withdraw(
        selectedAsset.address,
        actualWithdrawSent,
      );
      await withdrawTx.wait();

      const WETH_ADDRESS = process.env.NEXT_PUBLIC_WETH_ADDRESS?.toLowerCase();
      const isWETH = selectedAsset.address.toLowerCase() === WETH_ADDRESS;

      if (isWETH) {
        // Optionally unwrap WETH to ETH
        // User can manually unwrap if they want ETH instead of WETH
        // const unwrapTx = await tokenContract.withdraw(amountInWei);
        // await unwrapTx.wait();
      }

      setSuccess(
        `Successfully withdrew ${withdrawAmount} ${selectedAsset.symbol}`,
      );
      setWithdrawAmount("");

      setTimeout(() => {
        fetchData();
        handleCloseDialog();
      }, 2000);
    } catch (err) {
      console.error("Error during withdrawal:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An error occurred during withdrawal.";
      setError(errorMessage);
    } finally {
      setTransactionLoading(false);
    }
  };

  const viewMaxWithdrawAmount = async (): Promise<void> => {
    try {
      setPreviewLoading(true);
      const lendingPool = await web3Service.getLendingPoolContract();

      if (typeof window === "undefined" || !window.ethereum) {
        setError("Wallet not connected");
        setPreviewLoading(false);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      if (!selectedAsset) {
        setPreviewLoading(false);
        return;
      }

      const maxWithdrawAmount = (await lendingPool.getMaxWithdrawAmount(
        userAddress,
        selectedAsset.address,
      )) as bigint;
      const decimals = selectedAsset.decimals;
      const formattedAmount = ethers.formatUnits(maxWithdrawAmount, decimals);

      const ceiledAmount = Math.ceil(parseFloat(formattedAmount) * 1e6) / 1e6;

      setWithdrawAmount(ceiledAmount.toString());
      setMaxWithdrawChosen(true);
    } catch (err) {
      console.error("Error fetching preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" fontWeight="bold">
          Withdraw {selectedAsset?.symbol}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Current Deposit */}
        <Box sx={{ mb: 3, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Your Deposited Balance
          </Typography>
          <Typography variant="h6" fontWeight="medium">
            {selectedAsset &&
              formatAmount(
                selectedAsset.userDeposit,
                selectedAsset.decimals,
              )}{" "}
            {selectedAsset?.symbol}
          </Typography>
        </Box>

        {/* Amount Input */}
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
          <TextField
            fullWidth
            label="Amount to Withdraw"
            type="number"
            value={withdrawAmount}
            onChange={(e) => {
              setWithdrawAmount(e.target.value);
              setMaxWithdrawChosen(false);
            }}
            inputProps={{ step: "0.000001", min: "0" }}
          />
          <Button
            variant="outlined"
            onClick={viewMaxWithdrawAmount}
            disabled={previewLoading || transactionLoading}
            sx={{ minWidth: "70px", height: "56px" }}
          >
            MAX
          </Button>
        </Box>

        {/* Preview Section */}
        {previewLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {preview && !previewLoading && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Transaction Overview
              </Typography>
            </Divider>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Box sx={{ textAlign: "center", flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Current Deposits
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  ${formatAmount(preview.currentTotal)}
                </Typography>
              </Box>

              <ArrowForwardIcon sx={{ mx: 2, color: "warning.main" }} />

              <Box sx={{ textAlign: "center", flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  New Deposits
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  color="warning.main"
                >
                  ${formatAmount(preview.newTotal)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                mt: 2,
                p: 1.5,
                bgcolor: "warning.50",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Decrease
              </Typography>
              <Typography
                variant="body2"
                color="warning.main"
                fontWeight="bold"
              >
                -${formatAmount(preview.decrease)}
              </Typography>
            </Box>

            {/* Health Factor Warning */}
            {preview.totalBorrowed > 0n && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  bgcolor:
                    preview.healthFactor < 1.5 * 10 ** 18
                      ? "error.50"
                      : "info.50",
                  borderRadius: 1,
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  {preview.healthFactor < 1.5 * 10 ** 18 && (
                    <WarningAmberIcon color="error" fontSize="small" />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Health Factor After Withdrawal
                  </Typography>
                </Box>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  color={
                    preview.healthFactor < 1.5 * 10 ** 18
                      ? "error.main"
                      : "info.main"
                  }
                >
                  {preview.healthFactor ===
                  BigInt(
                    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                  )
                    ? "∞"
                    : formatAmount(preview.healthFactor)}
                </Typography>
                {preview.healthFactor < 1.5 * 10 ** 18 &&
                  preview.healthFactor !==
                    BigInt(
                      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                    ) && (
                    <Typography
                      variant="caption"
                      color="error.main"
                      sx={{ mt: 1, display: "block" }}
                    >
                      ⚠️ Low health factor! Risk of liquidation
                    </Typography>
                  )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCloseDialog} disabled={transactionLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleWithdraw}
          variant="contained"
          disabled={transactionLoading || !withdrawAmount}
          startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
        >
          {transactionLoading ? "Processing..." : "Withdraw"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
