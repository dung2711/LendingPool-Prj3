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
import CircularProgress from '@mui/material/CircularProgress';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { getLendingPoolContract, getToken, getPriceRouterContract } from '@/lib/web3';

export default function Dashboard() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [userInfo, setUserInfo] = useState(null);
    const [markets, setMarkets] = useState([]);
    const [totalSuppliedUSD, setTotalSuppliedUSD] = useState(0n);
    const [totalBorrowedUSD, setTotalBorrowedUSD] = useState(0n);
    const [healthFactor, setHealthFactor] = useState(0n);
    const [netAPY, setNetAPY] = useState(0);

    useEffect(() => {
        checkWalletAndFetch();
        
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchData();
                } else {
                    setUserInfo(null);
                    setMarkets([]);
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
            const priceRouter = await getPriceRouterContract();
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();

            // Get user info
            const [assets, deposited, borrowed, totalDeposited, totalBorrowed, healthFactor] = 
                await lendingPool.getUserInfo(userAddress);

            setTotalSuppliedUSD(totalDeposited);
            setTotalBorrowedUSD(totalBorrowed);
            setHealthFactor(healthFactor);

            // Fetch detailed market data for user's positions
            const marketData = await Promise.all(
                assets.map(async (assetAddress, index) => {
                    try {
                        const tokenContract = await getToken(assetAddress);
                        const [symbol, decimals, marketInfo] = await Promise.all([
                            tokenContract.symbol(),
                            tokenContract.decimals(),
                            lendingPool.getMarketInfo(assetAddress)
                        ]);
                        const assetPrice = await priceRouter.getPrice(assetAddress);
                        
                        const depositedAmount = deposited[index];
                        const borrowedAmount = borrowed[index];
                        
                        const depositedUSD = assetPrice * depositedAmount / (10n ** 18n);
                        const borrowedUSD = assetPrice * borrowedAmount / (10n ** 18n);

                        return {
                            address: assetAddress,
                            symbol,
                            decimals,
                            deposited: depositedAmount,
                            borrowed: borrowedAmount,
                            depositedUSD,
                            borrowedUSD,
                            depositRate: marketInfo.depositRate,
                            borrowRate: marketInfo.borrowRate
                        };
                    } catch (err) {
                        console.error(`Error fetching data for ${assetAddress}:`, err);
                        return null;
                    }
                })
            );

            const validMarkets = marketData.filter(m => m !== null);
            setMarkets(validMarkets);

            // Calculate net APY
            if (totalDeposited > 0n) {
                let totalSupplyInterest = 0n;
                let totalBorrowInterest = 0n;

                validMarkets.forEach(market => {
                    if (market.deposited > 0n) {
                        totalSupplyInterest += (market.depositedUSD * market.depositRate) / (10n ** 18n);
                    }
                    if (market.borrowed > 0n) {
                        totalBorrowInterest += (market.borrowedUSD * market.borrowRate) / (10n ** 18n);
                    }
                });

                const netInterest = totalSupplyInterest - totalBorrowInterest;
                const netAPYValue = Number(netInterest * 100n / totalDeposited) / 1e18;
                setNetAPY(netAPYValue);
            }

        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatRate = (rate) => {
        const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
        return `${rateNum.toFixed(2)}%`;
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

    const getHealthFactorColor = (hf) => {
        if (hf === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) {
            return 'success';
        }
        const hfNum = Number(hf) / 1e18;
        if (hfNum < 1.2) return 'error';
        if (hfNum < 1.5) return 'warning';
        return 'success';
    };

    const getHealthFactorStatus = (hf) => {
        if (hf === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) {
            return 'Excellent';
        }
        const hfNum = Number(hf) / 1e18;
        if (hfNum < 1.2) return 'Critical';
        if (hfNum < 1.5) return 'Risky';
        if (hfNum < 2) return 'Moderate';
        return 'Healthy';
    };

    const calculateBorrowLimit = () => {
        if (totalSuppliedUSD === 0n) return 0;
        return Number((totalBorrowedUSD * 100n) / totalSuppliedUSD) / 1e18;
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
                            Please connect MetaMask or another Web3 wallet to view your dashboard.
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" fontWeight="bold" mb={4}>
                Dashboard
            </Typography>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={60} />
                </Box>
            ) : (
                <>
                    {/* Overview Cards */}
                    <Grid container spacing={3} mb={4}>
                        {/* Total Supplied */}
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={3} sx={{ height: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <TrendingUpIcon sx={{ color: 'white', mr: 1 }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                                            Total Supplied
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" fontWeight="bold" sx={{ color: 'white' }}>
                                        ${formatAmount(totalSuppliedUSD)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Total Borrowed */}
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={3} sx={{ height: '100%', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <TrendingDownIcon sx={{ color: 'white', mr: 1 }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                                            Total Borrowed
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" fontWeight="bold" sx={{ color: 'white' }}>
                                        ${formatAmount(totalBorrowedUSD)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Net APY */}
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={3} sx={{ height: '100%', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <AccountBalanceIcon sx={{ color: 'white', mr: 1 }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                                            Net APY
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" fontWeight="bold" sx={{ color: 'white' }}>
                                        {netAPY.toFixed(2)}%
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Health Factor */}
                        <Grid item xs={12} sm={6} md={3}>
                            <Card elevation={3} sx={{ height: '100%' }}>
                                <CardContent>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Health Factor
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" color={`${getHealthFactorColor(healthFactor)}.main`}>
                                        {formatHealthFactor(healthFactor)}
                                    </Typography>
                                    <Chip 
                                        label={getHealthFactorStatus(healthFactor)}
                                        color={getHealthFactorColor(healthFactor)}
                                        size="small"
                                        sx={{ mt: 1 }}
                                    />
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Borrow Limit */}
                    {totalSuppliedUSD > 0n && (
                        <Card elevation={2} sx={{ mb: 4 }}>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Borrow Limit Usage
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                    <Box sx={{ flex: 1 }}>
                                        <LinearProgress 
                                            variant="determinate" 
                                            value={Math.min(calculateBorrowLimit(), 100)}
                                            sx={{ 
                                                height: 10, 
                                                borderRadius: 5,
                                                backgroundColor: 'grey.200',
                                                '& .MuiLinearProgress-bar': {
                                                    backgroundColor: calculateBorrowLimit() > 80 ? 'error.main' : calculateBorrowLimit() > 60 ? 'warning.main' : 'success.main'
                                                }
                                            }}
                                        />
                                    </Box>
                                    <Typography variant="h6" fontWeight="bold" sx={{ minWidth: 60 }}>
                                        {calculateBorrowLimit().toFixed(2)}%
                                    </Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                    Using ${formatAmount(totalBorrowedUSD)} of ${formatAmount(totalSuppliedUSD)} collateral
                                </Typography>
                            </CardContent>
                        </Card>
                    )}

                    {/* Supply Positions */}
                    <Card elevation={2} sx={{ mb: 4 }}>
                        <CardContent>
                            <Typography variant="h5" fontWeight="bold" mb={3}>
                                Supply Positions
                            </Typography>
                            {markets.filter(m => m.deposited > 0n).length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography color="text.secondary">
                                        No supply positions
                                    </Typography>
                                </Box>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Value (USD)</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>APY</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {markets.filter(m => m.deposited > 0n).map((market) => (
                                                <TableRow key={market.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="medium">
                                                            {market.symbol}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2">
                                                            {formatAmount(market.deposited, market.decimals)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" fontWeight="medium">
                                                            ${formatAmount(market.depositedUSD)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" color="success.main" fontWeight="medium">
                                                            {formatRate(market.depositRate)}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Borrow Positions */}
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="h5" fontWeight="bold" mb={3}>
                                Borrow Positions
                            </Typography>
                            {markets.filter(m => m.borrowed > 0n).length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <Typography color="text.secondary">
                                        No borrow positions
                                    </Typography>
                                </Box>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Value (USD)</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>APY</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {markets.filter(m => m.borrowed > 0n).map((market) => (
                                                <TableRow key={market.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="medium">
                                                            {market.symbol}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2">
                                                            {formatAmount(market.borrowed, market.decimals)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" fontWeight="medium">
                                                            ${formatAmount(market.borrowedUSD)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" color="error.main" fontWeight="medium">
                                                            {formatRate(market.borrowRate)}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </Box>
    );
}