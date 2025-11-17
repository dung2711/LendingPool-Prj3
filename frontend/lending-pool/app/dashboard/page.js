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
import { getLendingPoolContract, getPriceRouterContract } from '@/lib/web3';
import { getAssetByAddress, getAllAssets } from '@/services/assetService';
import { getAssetsByUser } from '@/services/userAssetService';

export default function Dashboard() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [userInfo, setUserInfo] = useState(null);
    const [markets, setMarkets] = useState([]);
    const [totalSuppliedUSD, setTotalSuppliedUSD] = useState(0n);
    const [totalBorrowedUSD, setTotalBorrowedUSD] = useState(0n);
    const [healthFactor, setHealthFactor] = useState(0n);
    const [netAPY, setNetAPY] = useState(0);
    const [collateralFactor, setCollateralFactor] = useState(0n);

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

            // Fetch user balances and asset metadata from backend
            const [userAssets, allAssets] = await Promise.all([
                getAssetsByUser(userAddress),
                getAllAssets()
            ]);

            // Create asset lookup map
            const assetMap = {};
            allAssets.forEach(asset => {
                assetMap[asset.address.toLowerCase()] = {
                    symbol: asset.symbol,
                    decimals: asset.decimals,
                    address: asset.address
                };
            });

            // Get collateral factor from blockchain
            const collateralFactorValue = await lendingPool.collateralFactor();
            setCollateralFactor(collateralFactorValue);

            // Fetch prices and rates from blockchain for user's assets
            const marketData = userAssets.length === 0 ? [] : await Promise.all(
                userAssets.map(async (userAsset) => {
                    try {
                        const asset = assetMap[userAsset.assetAddress.toLowerCase()];
                        if (!asset) return null;

                        const [assetPrice, marketInfo] = await Promise.all([
                            priceRouter.getPrice(userAsset.assetAddress),
                            lendingPool.getMarketInfo(userAsset.assetAddress)
                        ]);

                        // Convert backend string amounts to BigInt
                        const depositedAmount = BigInt(userAsset.deposited); // Already in token decimals
                        const borrowedAmount = BigInt(userAsset.borrowed);   // Already in token decimals
                        
                        // assetPrice is 18 decimals, amounts are in token decimals
                        // Normalize to 18 decimal USD
                        const depositedUSD = assetPrice * depositedAmount / (10n ** BigInt(asset.decimals));
                        const borrowedUSD = assetPrice * borrowedAmount / (10n ** BigInt(asset.decimals));

                        return {
                            address: userAsset.assetAddress,
                            symbol: asset.symbol,
                            decimals: asset.decimals,
                            deposited: depositedAmount * (10n ** (18n - BigInt(asset.decimals))), // normalize to 18 decimals for display
                            borrowed: borrowedAmount * (10n ** (18n - BigInt(asset.decimals))), // normalize to 18 decimals for display
                            depositedUSD,
                            borrowedUSD,
                            depositRate: marketInfo.depositRate,
                            borrowRate: marketInfo.borrowRate
                        };
                    } catch (err) {
                        console.error(`Error fetching data for ${userAsset.assetAddress}:`, err);
                        return null;
                    }
                })
            );

            const validMarkets = marketData.filter(m => m !== null);
            setMarkets(validMarkets);

            // Calculate totals
            let totalSupplied = 0n;
            let totalBorrowed = 0n;
            
            validMarkets.forEach(market => {
                totalSupplied += market.depositedUSD;
                totalBorrowed += market.borrowedUSD;
            });

            setTotalSuppliedUSD(totalSupplied);
            setTotalBorrowedUSD(totalBorrowed);

            // Calculate health factor
            if (totalBorrowed === 0n) {
                setHealthFactor(BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'));
            } else {
                const hf = (totalSupplied * collateralFactorValue) / totalBorrowed;
                setHealthFactor(hf);
            }

            // Calculate net APY
            if (totalSupplied > 0n) {
                let totalSupplyInterestUSD = 0n;
                let totalBorrowInterestUSD = 0n;

                validMarkets.forEach(market => {
                    if (market.depositedUSD > 0n) {
                        totalSupplyInterestUSD += (market.depositedUSD * market.depositRate) / (10n ** 18n);
                    }
                    if (market.borrowedUSD > 0n) {
                        totalBorrowInterestUSD += (market.borrowedUSD * market.borrowRate) / (10n ** 18n);
                    }
                });

                const netInterestUSD = totalSupplyInterestUSD - totalBorrowInterestUSD;
                const netAPYValue = Number(netInterestUSD * 100n / totalSupplied);
                setNetAPY(netAPYValue);
            } else {
                setNetAPY(0);
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

    const formatAmount = (amount) => {
        const formated = ethers.formatEther(amount);
        return parseFloat(formated).toFixed(4);
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
        if (totalSuppliedUSD === 0n || collateralFactor === 0n) return 0;
        // Calculate max borrowable amount: totalSupplied * collateralFactor / 1e18
        const maxBorrowableUSD = (totalSuppliedUSD * collateralFactor) / (10n ** 18n);
        // Calculate percentage of borrow limit used
        return Number((totalBorrowedUSD * 100n) / maxBorrowableUSD);
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
                                    Borrowed ${formatAmount(totalBorrowedUSD)} of ${formatAmount((totalSuppliedUSD * collateralFactor) / (10n ** 18n))} max borrowable
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
                                                            {formatAmount(market.deposited)}
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
                                                            {formatAmount(market.borrowed)}
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