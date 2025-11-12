import {React} from "react";
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

export default function DepositDialog({  handleCloseDialog, selectedAsset, setSuccess, fetchData, formatAmount, formatRate }) {
    const [depositAmount, setDepositAmount] = useState('');
    const [error, setError] = useState('');
    const [transactionLoading, setTransactionLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        const fetchPreview = async () => {
            if (!depositAmount || !selectedAsset || parseFloat(depositAmount) <= 0) {
                setPreview(null);
                return;
            }

            try {
                setPreviewLoading(true);
                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const decimals = await tokenContract.decimals();
                const amountInWei = ethers.parseUnits(depositAmount, decimals);
                
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();

                const [totalDepositedUSD, newDepositedUSD] = await lendingPool.preViewDeposit(
                    userAddress,
                    selectedAsset.address,
                    amountInWei
                );

                setPreview({
                    currentTotal: totalDepositedUSD,
                    newTotal: newDepositedUSD,
                    increase: newDepositedUSD - totalDepositedUSD
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
    }, [depositAmount, selectedAsset]);

    const handleDeposit = async () => {
            if (!depositAmount || !selectedAsset) return;
    
            try {
                setTransactionLoading(true);
                setError('');
    
                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const decimals = await tokenContract.decimals();
                const amountInWei = ethers.parseUnits(depositAmount, decimals);
    
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
                            setError('Insufficient ETH and WETH balance');
                            setTransactionLoading(false);
                            return;
                        }
                        
                        // Wrap ETH to WETH
                        const wrapTx = await tokenContract.deposit({ value: amountToWrap });
                        await wrapTx.wait();
                    }
                } else {
                    if (balance < amountInWei) {
                        setError('Insufficient balance');
                        setTransactionLoading(false);
                        return;
                    }
                }
    
                // Approve
                const approveTx = await tokenContract.approve(await lendingPool.getAddress(), amountInWei);
                await approveTx.wait();
    
                // Deposit
                const depositTx = await lendingPool.deposit(selectedAsset.address, amountInWei);
                await depositTx.wait();
    
                setSuccess(`Successfully deposited ${depositAmount} ${selectedAsset.symbol}`);
                setDepositAmount('');
                
                // Refresh data
                setTimeout(() => {
                    fetchData();
                    handleCloseDialog();
                }, 2000);
    
            } catch (err) {
                console.error('Error depositing:', err);
                setError(err.message || 'Transaction failed');
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
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                {/* Wallet Balance */}
                <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Wallet Balance
                    </Typography>
                    <Typography variant="h6" fontWeight="medium">
                        {selectedAsset && formatAmount(selectedAsset.balance)} {selectedAsset?.symbol}
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
                <Box sx={{ mb: 2, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Supply APY
                    </Typography>
                    <Typography variant="h6" color="success.main" fontWeight="bold">
                        {selectedAsset && formatRate(selectedAsset.depositRate)}
                    </Typography>
                </Box>

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
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Current Deposits
                                </Typography>
                                <Typography variant="body1" fontWeight="medium">
                                    ${formatAmount(preview.currentTotal)}
                                </Typography>
                            </Box>
                            
                            <ArrowForwardIcon sx={{ mx: 2, color: 'success.main' }} />
                            
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    New Deposits
                                </Typography>
                                <Typography variant="body1" fontWeight="bold" color="success.main">
                                    ${formatAmount(preview.newTotal)}
                                </Typography>
                            </Box>
                        </Box>
                        
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'success.50', borderRadius: 1, textAlign: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                Increase
                            </Typography>
                            <Typography variant="body2" color="success.main" fontWeight="bold">
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
                    {transactionLoading ? 'Processing...' : 'Deposit'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}