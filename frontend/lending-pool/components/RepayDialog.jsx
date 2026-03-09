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
import { React, useEffect, useState } from "react";
import { getLendingPoolContract, getToken } from "@/lib/web3";

export default function RepayDialog({
	handleCloseDialog,
	selectedAsset,
	setSuccess,
	fetchData,
	formatAmount,
	formatRate,
}) {
	const [repayAmount, setRepayAmount] = useState("");
	const [maxRepayChosen, setMaxRepayChosen] = useState(false);
	const [error, setError] = useState("");
	const [transactionLoading, setTransactionLoading] = useState(false);
	const [preview, setPreview] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);

	const MAX_UINT256 = ethers.MaxUint256;

	useEffect(() => {
		const fetchPreview = async () => {
			if (!repayAmount || !selectedAsset || parseFloat(repayAmount) <= 0) {
				setPreview(null);
				return;
			}

			try {
				setPreviewLoading(true);
				const lendingPool = await getLendingPoolContract();
				const tokenContract = await getToken(selectedAsset.address);
				const decimals = await tokenContract.decimals();
				const amountInWei = ethers.parseUnits(repayAmount, decimals);

				const provider = new ethers.BrowserProvider(window.ethereum);
				const signer = await provider.getSigner();
				const userAddress = await signer.getAddress();

				const [totalBorrowedUSD, newBorrowedUSD] =
					await lendingPool.preViewRepay(
						userAddress,
						selectedAsset.address,
						amountInWei,
					);

				setPreview({
					currentTotal: totalBorrowedUSD,
					newTotal: newBorrowedUSD,
					decrease: totalBorrowedUSD - newBorrowedUSD,
				});
			} catch (err) {
				console.error("Error fetching preview:", err);
				setPreview(null);
			} finally {
				setPreviewLoading(false);
			}
		};

		const debounceTimer = setTimeout(fetchPreview, 500);
		return () => clearTimeout(debounceTimer);
	}, [repayAmount, selectedAsset]);

	const handleRepay = async () => {
		if (!repayAmount || !selectedAsset) return;

		try {
			setTransactionLoading(true);
			setError("");

			const lendingPool = await getLendingPoolContract();
			const tokenContract = await getToken(selectedAsset.address);
			const decimals = await tokenContract.decimals();
			const amountInWei = ethers.parseUnits(repayAmount, decimals);
			const userBorrow = selectedAsset.userBorrow;

			// Check balance
			const provider = new ethers.BrowserProvider(window.ethereum);
			const signer = await provider.getSigner();
			const userAddress = await signer.getAddress();
			const balance = await tokenContract.balanceOf(userAddress);

			// Handle WETH: wrap ETH if needed
			const WETH_ADDRESS = process.env.NEXT_PUBLIC_WETH_ADDRESS?.toLowerCase();
			const isWETH = selectedAsset.address.toLowerCase() === WETH_ADDRESS;

			if (isWETH) {
				const wethBalance = balance;
				const ethBalance = await provider.getBalance(userAddress);

				// If insufficient WETH, try to wrap ETH
				if (wethBalance < amountInWei) {
					const amountToWrap = amountInWei - wethBalance;

					if (ethBalance < amountToWrap) {
						setError("Insufficient ETH and WETH balance");
						setTransactionLoading(false);
						return;
					}

					// Wrap ETH to WETH
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

			let actualSentRepay = amountInWei;

			if (maxRepayChosen) {
				console.log("Max repay chosen, setting to MAX_UINT256");
				actualSentRepay = MAX_UINT256;
			}

			// Approve
			const approveTx = await tokenContract.approve(
				await lendingPool.getAddress(),
				actualSentRepay,
			);
			await approveTx.wait();

			// Repay
			const repayTx = await lendingPool.repay(
				selectedAsset.address,
				actualSentRepay,
			);
			await repayTx.wait();

			setSuccess(`Successfully repaid ${repayAmount} ${selectedAsset.symbol}`);
			setRepayAmount("");

			// Refresh data
			setTimeout(() => {
				fetchData();
				handleCloseDialog();
			}, 2000);
		} catch (err) {
			console.error("Error repaying:", err);
			setError(err.message || "Transaction failed");
		} finally {
			setTransactionLoading(false);
		}
	};

	const viewMaxRepayAmount = async () => {
		try {
			setPreviewLoading(true);
			const lendingPool = await getLendingPoolContract();
			const provider = new ethers.BrowserProvider(window.ethereum);
			const signer = await provider.getSigner();
			const userAddress = await signer.getAddress();

			const maxRepayAmount = await lendingPool.getMaxRepayAmount(
				userAddress,
				selectedAsset.address,
			);
			const decimals = selectedAsset.decimals;
			const formattedAmount = ethers.formatUnits(maxRepayAmount, decimals);

			const ceiledAmount = Math.ceil(parseFloat(formattedAmount) * 1e6) / 1e6; // ceil to 6 decimal places

			setRepayAmount(ceiledAmount.toString());
			setMaxRepayChosen(true);
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
					Repay {selectedAsset?.symbol}
				</Typography>
			</DialogTitle>
			<DialogContent>
				{error && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}

				{/* Borrowed Amount */}
				<Box sx={{ mb: 3, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
					<Typography variant="caption" color="text.secondary">
						Your Borrowed Balance
					</Typography>
					<Typography variant="h6" fontWeight="medium">
						{selectedAsset &&
							formatAmount(
								selectedAsset.userBorrow,
								selectedAsset.decimals,
							)}{" "}
						{selectedAsset?.symbol}
					</Typography>
				</Box>

				{/* Amount Input */}
				<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
					<TextField
						fullWidth
						label="Amount to Repay"
						type="number"
						value={repayAmount}
						onChange={(e) => {
							setRepayAmount(e.target.value);
							setMaxRepayChosen(false);
						}}
						inputProps={{ step: "0.000001", min: "0" }}
					/>
					<Button
						variant="outlined"
						onClick={viewMaxRepayAmount}
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
									Current Borrows
								</Typography>
								<Typography variant="body1" fontWeight="medium">
									${formatAmount(preview.currentTotal)}
								</Typography>
							</Box>

							<ArrowForwardIcon sx={{ mx: 2, color: "success.main" }} />

							<Box sx={{ textAlign: "center", flex: 1 }}>
								<Typography variant="caption" color="text.secondary">
									New Borrows
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
								Decrease
							</Typography>
							<Typography
								variant="body2"
								color="success.main"
								fontWeight="bold"
							>
								-${formatAmount(preview.decrease)}
							</Typography>
						</Box>

						{preview.newTotal === 0n && (
							<Alert severity="success" sx={{ mt: 2 }}>
								🎉 You will fully repay this debt!
							</Alert>
						)}
					</Box>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={handleCloseDialog} disabled={transactionLoading}>
					Cancel
				</Button>
				<Button
					onClick={handleRepay}
					variant="contained"
					disabled={transactionLoading || !repayAmount}
					startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
				>
					{transactionLoading ? "Processing..." : "Repay"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
