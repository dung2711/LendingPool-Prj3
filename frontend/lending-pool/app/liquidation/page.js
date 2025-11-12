"use client";

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Chip from '@mui/material/Chip';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import { getLendingPoolContract, getToken, getPriceRouterContract, getLiquidationContract } from '@/lib/web3';

export default function Liquidation() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [liquidatableUsers, setLiquidatableUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [repayAsset, setRepayAsset] = useState('');
    const [collateralAsset, setCollateralAsset] = useState('');
    const [repayAmount, setRepayAmount] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [transactionLoading, setTransactionLoading] = useState(false);
    const [liquidationThreshold, setLiquidationThreshold] = useState(0n);
    const [liquidationIncentive, setLiquidationIncentive] = useState(0n);

    useEffect(() => {
        checkWalletAndFetch();
        
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchData();
                }
            };
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            };
        }
    }, []);

    const checkWalletAndFetch = async () => {
        if (typeof window !== "undefined" && window.ethereum) {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_accounts", []);
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchData();
                }
            } catch (err) {
                console.error('Error checking wallet:', err);
            }
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const lendingPool = await getLendingPoolContract();
            const liquidation = await getLiquidationContract();
            const priceRouter = await getPriceRouterContract();

            // Get liquidation parameters
            const [threshold, incentive] = await Promise.all([
                liquidation.liquidationThreshold(),
                liquidation.liquidationIncentive()
            ]);
            setLiquidationThreshold(threshold);
            setLiquidationIncentive(incentive);

            // For demo purposes, we'll scan recent events or known addresses
            // In production, you'd want a backend service to index and track positions
            // Here we'll just show how to check if a specific user is liquidatable
            
            // This is a placeholder - in reality you'd need an indexer
            const testUsers = []; // You would populate this from events or a backend service
            
            setLiquidatableUsers(testUsers);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const checkUserLiquidatable = async (userAddress) => {
        try {
            const lendingPool = await getLendingPoolContract();
            const liquidation = await getLiquidationContract();
            const priceRouter = await getPriceRouterContract();

            const [assets, deposited, borrowed, totalDeposited, totalBorrowed, healthFactor] = 
                await lendingPool.getUserInfo(userAddress);

            const threshold = await liquidation.liquidationThreshold();
            
            // User is liquidatable if health factor < liquidation threshold
            const isLiquidatable = totalBorrowed > 0n && healthFactor < threshold;

            if (isLiquidatable) {
                // Fetch asset details
                const userAssets = await Promise.all(
                    assets.map(async (assetAddress, index) => {
                        const tokenContract = await getToken(assetAddress);
                        const symbol = await tokenContract.symbol();
                        const decimals = await tokenContract.decimals();
                        const price = await priceRouter.getPrice(assetAddress);

                        return {
                            address: assetAddress,
                            symbol,
                            decimals,
                            deposited: deposited[index],
                            borrowed: borrowed[index],
                            price
                        };
                    })
                );

                return {
                    address: userAddress,
                    healthFactor,
                    totalDeposited,
                    totalBorrowed,
                    assets: userAssets.filter(a => a.deposited > 0n || a.borrowed > 0n)
                };
            }

            return null;
        } catch (err) {
            console.error('Error checking user:', err);
            return null;
        }
    };

    const handleOpenDialog = (user) => {
        setSelectedUser(user);
        setOpenDialog(true);
        setError('');
        setSuccess('');
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedUser(null);
        setRepayAsset('');
        setCollateralAsset('');
        setRepayAmount('');
    };

    const handleLiquidate = async () => {
        if (!selectedUser || !repayAsset || !collateralAsset || !repayAmount) {
            setError('Please fill in all fields');
            return;
        }

        try {
            setTransactionLoading(true);
            setError('');

            const liquidation = await getLiquidationContract();
            const repayToken = await getToken(repayAsset);
            const decimals = await repayToken.decimals();
            const amountInWei = ethers.parseUnits(repayAmount, decimals);

            // Approve liquidation contract to spend repay tokens
            const approveTx = await repayToken.approve(await liquidation.getAddress(), amountInWei);
            await approveTx.wait();

            // Execute liquidation
            const liquidateTx = await liquidation.liquidate(
                selectedUser.address,
                repayAsset,
                amountInWei,
                collateralAsset
            );
            await liquidateTx.wait();

            setSuccess(`Successfully liquidated position!`);
            
            setTimeout(() => {
                fetchData();
                handleCloseDialog();
            }, 2000);

        } catch (err) {
            console.error('Error liquidating:', err);
            setError(err.message || 'Liquidation failed');
        } finally {
            setTransactionLoading(false);
        }
    };

    const formatAmount = (amount, decimals = 18) => {
        return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(decimals <= 6 ? decimals : 4);
    };

    const formatHealthFactor = (hf) => {
        if (hf === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) {
            return '∞';
        }
        return formatAmount(hf);
    };

    const getHealthFactorColor = (hf, threshold) => {
        if (hf >= threshold) return 'success';
        if (hf >= threshold * 90n / 100n) return 'warning';
        return 'error';
    };

    // Manual user check function
    const [checkAddress, setCheckAddress] = useState('');
    const [checkingUser, setCheckingUser] = useState(false);

    const handleCheckUser = async () => {
        if (!checkAddress || !ethers.isAddress(checkAddress)) {
            setError('Please enter a valid address');
            return;
        }

        try {
            setCheckingUser(true);
            setError('');
            const userInfo = await checkUserLiquidatable(checkAddress);
            
            if (userInfo) {
                setLiquidatableUsers(prev => {
                    const existing = prev.find(u => u.address === userInfo.address);
                    if (existing) return prev;
                    return [...prev, userInfo];
                });
                setSuccess('User is liquidatable and added to the list!');
            } else {
                setError('User is not liquidatable or has no positions');
            }
            setCheckAddress('');
        } catch (err) {
            setError('Error checking user: ' + err.message);
        } finally {
            setCheckingUser(false);
        }
    };

    if (!account) {
        return (
            <Box sx={{ p: 3 }}>
                <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                        <AccountBalanceWalletIcon sx={{ fontSize: 60, mb: 2 }} />
                        <Typography variant="h5" fontWeight="bold" gutterBottom>
                            Account Not Detected
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            Please connect MetaMask to access liquidation features.
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" fontWeight="bold" mb={1}>
                Liquidation
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={4}>
                Liquidate undercollateralized positions to protect the protocol
            </Typography>

            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Liquidation Info */}
            <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
                <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
                    <CardContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Liquidation Threshold
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="error.main">
                            {formatAmount(liquidationThreshold)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Health factor below this can be liquidated
                        </Typography>
                    </CardContent>
                </Card>
                <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
                    <CardContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Liquidation Bonus
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="success.main">
                            {formatAmount(liquidationIncentive)}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Extra incentive for liquidators
                        </Typography>
                    </CardContent>
                </Card>
            </Box>

            {/* Check User Address */}
            <Card elevation={2} sx={{ mb: 4 }}>
                <CardContent>
                    <Typography variant="h6" fontWeight="bold" mb={2}>
                        Check User Position
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                        <TextField
                            fullWidth
                            label="User Address"
                            placeholder="0x..."
                            value={checkAddress}
                            onChange={(e) => setCheckAddress(e.target.value)}
                            size="small"
                        />
                        <Button
                            variant="contained"
                            onClick={handleCheckUser}
                            disabled={checkingUser}
                            sx={{ minWidth: 120 }}
                        >
                            {checkingUser ? <CircularProgress size={24} /> : 'Check'}
                        </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Enter a user's address to check if their position can be liquidated
                    </Typography>
                </CardContent>
            </Card>

            {/* Liquidatable Users */}
            <Card elevation={2}>
                <CardContent>
                    <Typography variant="h5" fontWeight="bold" mb={3}>
                        Liquidatable Positions
                    </Typography>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : liquidatableUsers.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <WarningAmberIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography color="text.secondary">
                                No liquidatable positions found
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Use the check feature above to find undercollateralized users
                            </Typography>
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>User Address</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Collateral</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Borrowed</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Health Factor</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {liquidatableUsers.map((user) => (
                                        <TableRow key={user.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium" sx={{ fontFamily: 'monospace' }}>
                                                    {user.address.slice(0, 6)}...{user.address.slice(-4)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight="medium">
                                                    ${formatAmount(user.totalDeposited)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2" fontWeight="medium">
                                                    ${formatAmount(user.totalBorrowed)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Chip
                                                    label={formatHealthFactor(user.healthFactor)}
                                                    color={getHealthFactorColor(user.healthFactor, liquidationThreshold)}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    variant="contained"
                                                    color="error"
                                                    onClick={() => handleOpenDialog(user)}
                                                >
                                                    Liquidate
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            {/* Liquidation Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Typography variant="h6" fontWeight="bold">
                        Liquidate Position
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
                    
                    {selectedUser && (
                        <>
                            <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    User Address
                                </Typography>
                                <Typography variant="body2" fontWeight="medium" sx={{ fontFamily: 'monospace' }}>
                                    {selectedUser.address}
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color="text.secondary">
                                    Health Factor: <Chip label={formatHealthFactor(selectedUser.healthFactor)} size="small" color="error" />
                                </Typography>
                            </Box>

                            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                                User's Assets
                            </Typography>
                            <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                                {selectedUser.assets.map(asset => (
                                    <Box key={asset.address} sx={{ mb: 1 }}>
                                        <Typography variant="body2" fontWeight="medium">
                                            {asset.symbol}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Deposited: {formatAmount(asset.deposited, asset.decimals)} | 
                                            Borrowed: {formatAmount(asset.borrowed, asset.decimals)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>

                            <TextField
                                fullWidth
                                label="Repay Asset Address"
                                placeholder="Token address to repay..."
                                value={repayAsset}
                                onChange={(e) => setRepayAsset(e.target.value)}
                                sx={{ mb: 2 }}
                                size="small"
                            />

                            <TextField
                                fullWidth
                                label="Collateral Asset Address"
                                placeholder="Token address to seize as collateral..."
                                value={collateralAsset}
                                onChange={(e) => setCollateralAsset(e.target.value)}
                                sx={{ mb: 2 }}
                                size="small"
                            />

                            <TextField
                                fullWidth
                                label="Repay Amount"
                                type="number"
                                placeholder="Amount to repay..."
                                value={repayAmount}
                                onChange={(e) => setRepayAmount(e.target.value)}
                                inputProps={{ step: "0.000001", min: "0" }}
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleCloseDialog} disabled={transactionLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleLiquidate}
                        variant="contained"
                        color="error"
                        disabled={transactionLoading}
                        startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
                    >
                        {transactionLoading ? 'Processing...' : 'Liquidate'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
