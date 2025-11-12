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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function BorrowDialog({ handleCloseDialog, selectedAsset, setSuccess, fetchData, formatAmount, formatRate }) {
    const [borrowAmount, setBorrowAmount] = useState('');
    const [error, setError] = useState('');
    const [transactionLoading, setTransactionLoading] = useState(false);
    const [maxBorrowable, setMaxBorrowable] = useState(0n);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        const fetchMaxBorrowable = async () => {
            if (!selectedAsset) return;
            
            try {
                const lendingPool = await getLendingPoolContract();
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();
                
                const [totalDepositedUSD, totalBorrowedUSD] = await lendingPool.getAccountLiquidity(userAddress);
                const collateralFactor = await lendingPool.collateralFactor();
                
                // Calculate max borrowable in USD
                const maxBorrowUSD = (totalDepositedUSD * collateralFactor / (10n ** 18n)) - totalBorrowedUSD;
                
                // Convert to asset amount
                const assetPrice = selectedAsset.price || 0n;
                if (assetPrice > 0n) {
                    const maxBorrowAsset = (maxBorrowUSD * (10n ** 18n)) / assetPrice;
                    setMaxBorrowable(maxBorrowAsset);
                }
            } catch (err) {
                console.error('Error fetching max borrowable:', err);
            }
        };
        
        fetchMaxBorrowable();
    }, [selectedAsset]);

    useEffect(() => {
        const fetchPreview = async () => {
            if (!borrowAmount || !selectedAsset || parseFloat(borrowAmount) <= 0) {
                setPreview(null);
                return;
            }

            try {
                setPreviewLoading(true);
                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const decimals = await tokenContract.decimals();
                const amountInWei = ethers.parseUnits(borrowAmount, decimals);
                
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();

                const [totalDepositedUSD, totalBorrowedUSD, newBorrowUSD, newHealthFactor] = 
                    await lendingPool.preViewBorrow(
                        userAddress,
                        selectedAsset.address,
                        amountInWei
                    );

                setPreview({
                    currentTotal: totalBorrowedUSD,
                    newTotal: newBorrowUSD,
                    increase: newBorrowUSD - totalBorrowedUSD,
                    totalDeposited: totalDepositedUSD,
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
    }, [borrowAmount, selectedAsset]);

    const handleBorrow = async () => {
        if (!borrowAmount || !selectedAsset) return;

        try {
            setTransactionLoading(true);
            setError('');

            const lendingPool = await getLendingPoolContract();
            const tokenContract = await getToken(selectedAsset.address);
            const decimals = await tokenContract.decimals();
            const amountInWei = ethers.parseUnits(borrowAmount, decimals);

            // Check max borrowable
            if (amountInWei > maxBorrowable) {
                setError('Amount exceeds max borrowable');
                setTransactionLoading(false);
                return;
            }

            // Borrow
            const borrowTx = await lendingPool.borrow(selectedAsset.address, amountInWei);
            await borrowTx.wait();

            // Handle WETH: unwrap to ETH if user wants
            const WETH_ADDRESS = process.env.NEXT_PUBLIC_WETH_ADDRESS?.toLowerCase();
            const isWETH = selectedAsset.address.toLowerCase() === WETH_ADDRESS;
            
            if (isWETH) {
                // Optionally unwrap WETH to ETH after borrowing
                // User receives WETH and can manually unwrap if they want ETH
                // const unwrapTx = await tokenContract.withdraw(amountInWei);
                // await unwrapTx.wait();
            }

            setSuccess(`Successfully borrowed ${borrowAmount} ${selectedAsset.symbol}`);
            setBorrowAmount('');
            
            // Refresh data
            setTimeout(() => {
                fetchData();
                handleCloseDialog();
            }, 2000);

        } catch (err) {
            console.error('Error borrowing:', err);
            setError(err.message || 'Transaction failed');
        } finally {
            setTransactionLoading(false);
        }
    };

    return (
        <Dialog open={true} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h6" fontWeight="bold">
                    Borrow {selectedAsset?.symbol}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                {/* Max Borrowable & Liquidity Info */}
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1, mb: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                            Max Borrowable
                        </Typography>
                        <Typography variant="h6" fontWeight="medium" color="primary.main">
                            {selectedAsset && formatAmount(maxBorrowable, selectedAsset.decimals)} {selectedAsset?.symbol}
                        </Typography>
                    </Box>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            Available Liquidity
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                            {selectedAsset && formatAmount(selectedAsset.liquidity, selectedAsset.decimals)} {selectedAsset?.symbol}
                        </Typography>
                    </Box>
                </Box>
                
                {/* Amount Input */}
                <TextField
                    fullWidth
                    label="Amount to Borrow"
                    type="number"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    inputProps={{ step: "0.000001", min: "0" }}
                    sx={{ mb: 2 }}
                />
                
                {/* APY Display */}
                <Box sx={{ mb: 2, p: 2, bgcolor: 'error.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Borrow APY
                    </Typography>
                    <Typography variant="h6" color="error.main" fontWeight="bold">
                        {selectedAsset && formatRate(selectedAsset.borrowRate)}
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
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Current Borrows
                                </Typography>
                                <Typography variant="body1" fontWeight="medium">
                                    ${formatAmount(preview.currentTotal)}
                                </Typography>
                            </Box>
                            
                            <ArrowForwardIcon sx={{ mx: 2, color: 'error.main' }} />
                            
                            <Box sx={{ textAlign: 'center', flex: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    New Borrows
                                </Typography>
                                <Typography variant="body1" fontWeight="bold" color="error.main">
                                    ${formatAmount(preview.newTotal)}
                                </Typography>
                            </Box>
                        </Box>
                        
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'error.50', borderRadius: 1, textAlign: 'center' }}>
                            <Typography variant="caption" color="text.secondary">
                                Increase
                            </Typography>
                            <Typography variant="body2" color="error.main" fontWeight="bold">
                                +${formatAmount(preview.increase)}
                            </Typography>
                        </Box>

                        {/* Health Factor */}
                        <Box sx={{ mt: 2, p: 2, bgcolor: preview.healthFactor < (1.5 * 10**18) ? 'error.50' : 'info.50', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                {preview.healthFactor < (1.5 * 10**18) && <WarningAmberIcon color="error" fontSize="small" />}
                                <Typography variant="caption" color="text.secondary">
                                    Health Factor After Borrow
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
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={handleCloseDialog} disabled={transactionLoading}>
                    Cancel
                </Button>
                <Button
                    onClick={handleBorrow}
                    variant="contained"
                    disabled={transactionLoading || !borrowAmount}
                    startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
                >
                    {transactionLoading ? 'Processing...' : 'Borrow'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
