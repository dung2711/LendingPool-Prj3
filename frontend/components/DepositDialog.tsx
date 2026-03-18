"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
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
  balance: bigint;
  depositRate: bigint;
  decimals: number;
  [key: string]: any;
}

interface PreviewData {
  currentTotal: bigint;
  newTotal: bigint;
  increase: bigint;
}

interface DepositDialogProps {
  handleCloseDialog: () => void;
  selectedAsset: Asset | null;
  setSuccess: (message: string) => void;
  fetchData: () => void;
  formatAmount: (amount: bigint | number, decimals?: number) => string;
  formatRate: (rate: bigint) => string;
}

export default function DepositDialog({
  handleCloseDialog,
  selectedAsset,
  setSuccess,
  fetchData,
  formatAmount,
  formatRate,
}: DepositDialogProps): ReactElement {
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [transactionLoading, setTransactionLoading] = useState<boolean>(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchPreview = async (): Promise<void> => {
      if (!depositAmount || !selectedAsset || parseFloat(depositAmount) <= 0) {
        setPreview(null);
        return;
      }

      try {
        setPreviewLoading(true);
        const lendingPool = await web3Service.getLendingPoolContract();
        const tokenContract = await web3Service.getToken(selectedAsset.address);
        const decimals = await tokenContract.decimals();
        const amountInWei = ethers.parseUnits(depositAmount, decimals);

        if (typeof window !== "undefined" && window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const userAddress = await signer.getAddress();

          const [totalDepositedUSD, newDepositedUSD] =
            (await lendingPool.preViewDeposit(
              userAddress,
              selectedAsset.address,
              amountInWei,
            )) as [bigint, bigint];

          setPreview({
            currentTotal: totalDepositedUSD,
            newTotal: newDepositedUSD,
            increase: newDepositedUSD - totalDepositedUSD,
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
  }, [depositAmount, selectedAsset]);

  const handleDeposit = async (): Promise<void> => {
    if (!depositAmount || !selectedAsset) return;

    try {
      setTransactionLoading(true);
      setError("");

      const lendingPool = await web3Service.getLendingPoolContract();
      const tokenContract = await web3Service.getToken(selectedAsset.address);
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.parseUnits(depositAmount, decimals);

      if (typeof window === "undefined" || !window.ethereum) {
        setError("Wallet not connected");
        setTransactionLoading(false);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const balance = await tokenContract.balanceOf(userAddress);

      const WETH_ADDRESS = process.env.NEXT_PUBLIC_WETH_ADDRESS?.toLowerCase();
      const isWETH = selectedAsset.address.toLowerCase() === WETH_ADDRESS;

      if (isWETH) {
        const wethBalance = balance;
        const ethBalance = await provider.getBalance(userAddress);

        if (wethBalance < amountInWei) {
          const amountToWrap = amountInWei - wethBalance;

          if (ethBalance < amountToWrap) {
            setError("Insufficient ETH and WETH balance");
            setTransactionLoading(false);
            return;
          }

          const wrapTx = await tokenContract.deposit({ value: amountToWrap });
          await wrapTx.wait();
        }
      } else {
        if (balance < amountInWei) {
          setError("Insufficient balance");
          setTransactionLoading(false);
          return;
        }
      }

      const approveTx = await tokenContract.approve(
        await lendingPool.getAddress(),
        amountInWei,
      );
      await approveTx.wait();

      const depositTx = await lendingPool.deposit(
        selectedAsset.address,
        amountInWei,
      );
      await depositTx.wait();

      setSuccess(
        `Successfully deposited ${depositAmount} ${selectedAsset.symbol}`,
      );
      setDepositAmount("");

      setTimeout(() => {
        fetchData();
        handleCloseDialog();
      }, 2000);
    } catch (err) {
      console.error("Error depositing:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Transaction failed";
      setError(errorMessage);
    } finally {
      setTransactionLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" fontWeight="bold">
          Deposit {selectedAsset?.symbol}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Wallet Balance */}
        <Box sx={{ mb: 3, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Wallet Balance
          </Typography>
          <Typography variant="h6" fontWeight="medium">
            {selectedAsset && formatAmount(selectedAsset.balance)}{" "}
            {selectedAsset?.symbol}
          </Typography>
        </Box>

        {/* Amount Input */}
        <TextField
          fullWidth
          label="Amount to Deposit"
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          inputProps={{ step: "0.000001", min: "0" }}
          sx={{ mb: 2 }}
        />

        {/* APY Display */}
        <Box sx={{ mb: 2, p: 2, bgcolor: "success.50", borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Supply APY
          </Typography>
          <Typography variant="h6" color="success.main" fontWeight="bold">
            {selectedAsset && formatRate(selectedAsset.depositRate)}
          </Typography>
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
                mb: 1,
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

              <ArrowForwardIcon sx={{ mx: 2, color: "success.main" }} />

              <Box sx={{ textAlign: "center", flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  New Deposits
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  color="success.main"
                >
                  ${formatAmount(preview.newTotal)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                mt: 2,
                p: 1.5,
                bgcolor: "success.50",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Increase
              </Typography>
              <Typography
                variant="body2"
                color="success.main"
                fontWeight="bold"
              >
                +${formatAmount(preview.increase)}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCloseDialog} disabled={transactionLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleDeposit}
          variant="contained"
          disabled={transactionLoading || !depositAmount}
          startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
        >
          {transactionLoading ? "Processing..." : "Deposit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
