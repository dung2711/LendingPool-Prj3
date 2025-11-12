import {React} from 'react';
import { useState, useEffect } from "react";
import { getLendingPoolContract, getToken } from "@/lib/web3";
import { ethers } from "ethers";
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function WithDrawDialog({  handleCloseDialog, selectedAsset, setSuccess, fetchData, formatAmount, formatRate }) {
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [error, setError] = useState('');
    const [transactionLoading, setTransactionLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        const fetchPreview = async () => {
            if (!withdrawAmount || !selectedAsset || parseFloat(withdrawAmount) <= 0) {
                setPreview(null);
                return;
            }

            try {
                setPreviewLoading(true);
                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const decimals = await tokenContract.decimals();
                const amountInWei = ethers.parseUnits(withdrawAmount, decimals);
                
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();

                const [totalDepositedUSD, totalBorrowedUSD, newDepositedUSD, newHealthFactor] = 
                    await lendingPool.preViewWithdraw(
                        userAddress,
                        selectedAsset.address,
                        amountInWei
                    );

                setPreview({
                    currentTotal: totalDepositedUSD,
                    newTotal: newDepositedUSD,
                    decrease: totalDepositedUSD - newDepositedUSD,
                    totalBorrowed: totalBorrowedUSD,
                    healthFactor: newHealthFactor
                });
            } catch (err) {
                console.error('Error fetching preview:', err);
                setPreview(null);
            } finally {
                setPreviewLoading(false);
            }
        };

        const debounceTimer = setTimeout(fetchPreview, 500);
        return () => clearTimeout(debounceTimer);
    }, [withdrawAmount, selectedAsset]);

    const handleWithdraw = async () => {
            if (!withdrawAmount || !selectedAsset) return;

            try {
                setTransactionLoading(true);
                setError('');

                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const decimals = await tokenContract.decimals();
                const amountInWei = ethers.parseUnits(withdrawAmount, decimals);
                const userDeposit = selectedAsset.userDeposit;

                // Check deposit
                if (userDeposit < amountInWei) {
                    setError('Insufficient deposited amount');
                    setTransactionLoading(false);
                    return;
                }

                // Withdraw
                const withdrawTx = await lendingPool.withdraw(selectedAsset.address, amountInWei);
                await withdrawTx.wait();

                // Handle WETH: unwrap to ETH if needed
                const WETH_ADDRESS = process.env.NEXT_PUBLIC_WETH_ADDRESS?.toLowerCase();
                const isWETH = selectedAsset.address.toLowerCase() === WETH_ADDRESS;
                
                if (isWETH) {
                    // Optionally unwrap WETH to ETH
                    // User can manually unwrap if they want ETH instead of WETH
                    // const unwrapTx = await tokenContract.withdraw(amountInWei);
                    // await unwrapTx.wait();
                }

                setSuccess(`Successfully withdrew ${withdrawAmount} ${selectedAsset.symbol}`);
                setWithdrawAmount('');
                
                // Refresh data
                setTimeout(() => {
                    fetchData();
                    handleCloseDialog();
                }, 2000);
            } catch (err) {
                console.error('Error during withdrawal:', err);
                setError(err.message || 'An error occurred during withdrawal.');
            } finally {
                setTransactionLoading(false);
        }
    }

    return (
        <Dialog open={true} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h6" fontWeight="bold">
                    Withdraw {selectedAsset?.symbol}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                {/* Current Deposit */}
                <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Your Deposited Balance
                    </Typography>
                    <Typography variant="h6" fontWeight="medium">
                        {selectedAsset && formatAmount(selectedAsset.userDeposit, selectedAsset.decimals)} {selectedAsset?.symbol}
                    </Typography>
                </Box>
                
                {/* Amount Input */}
                <TextField
                    fullWidth
                    label="Amount to Withdraw"
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    inputProps={{ step: "0.000001", min: "0" }}
                    sx={{ mb: 2 }}
                />

                {/* Preview Section */}
                {previewLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
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
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Current Deposits
                                </Typography>
                                <Typography variant="body1" fontWeight="medium">
                                    ${formatAmount(preview.currentTotal)}
                                </Typography>
                            </Box>
                            
                            <ArrowForwardIcon sx={{ mx: 2, color: 'warning.main' }} />
                            
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    New Deposits
                                </Typography>
                                <Typography variant="body1" fontWeight="bold" color="warning.main">
                                    ${formatAmount(preview.newTotal)}
                                </Typography>
                            </Box>
                        </Box>
                        
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'warning.50', borderRadius: 1, textAlign: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                Decrease
                            </Typography>
                            <Typography variant="body2" color="warning.main" fontWeight="bold">
                                -${formatAmount(preview.decrease)}
                            </Typography>
                        </Box>

                        {/* Health Factor Warning */}
                        {preview.totalBorrowed > 0n && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: preview.healthFactor < (1.5 * 10**18) ? 'error.50' : 'info.50', borderRadius: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    {preview.healthFactor < (1.5 * 10**18) && <WarningAmberIcon color="error" fontSize="small" />}
                                    <Typography variant="caption" color="text.secondary">
                                        Health Factor After Withdrawal
                                    </Typography>
                                </Box>
                                <Typography 
                                    variant="h6" 
                                    fontWeight="bold"
                                    color={preview.healthFactor < (1.5 * 10**18) ? 'error.main' : 'info.main'}
                                >
                                    {preview.healthFactor === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') 
                                        ? '∞' 
                                        : formatAmount(preview.healthFactor)}
                                </Typography>
                                {preview.healthFactor < (1.5 * 10**18) && preview.healthFactor !== BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') && (
                                    <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
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
                    {transactionLoading ? 'Processing...' : 'Withdraw'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}