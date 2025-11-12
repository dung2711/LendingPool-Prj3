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
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { getLendingPoolContract, getToken, getPriceRouterContract } from '@/lib/web3';
import BorrowDialog from '@/components/BorrowDialog';
import RepayDialog from '@/components/RepayDialog';

export default function Borrow() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [markets, setMarkets] = useState([]);
    const [userBorrows, setUserBorrows] = useState([]);
    const [totalBorrowedUSD, setTotalBorrowedUSD] = useState(0);
    const [totalCollateralUSD, setTotalCollateralUSD] = useState(0);
    const [maxBorrowUSD, setMaxBorrowUSD] = useState(0);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [openBorrowDialog, setOpenBorrowDialog] = useState(false);
    const [openRepayDialog, setOpenRepayDialog] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showZeroLiquidity, setShowZeroLiquidity] = useState(false);

    useEffect(() => {
        checkWalletAndFetch();
        
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchData();
                } else {
                    setMarkets([]);
                    setUserBorrows([]);
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

            // Get all markets
            const allMarkets = await lendingPool.getAllMarkets();

            // Fetch market and user data
            const marketData = await Promise.all(
                allMarkets.map(async (marketAddress) => {
                    try {
                        const tokenContract = await getToken(marketAddress);
                        const [symbol, decimals, balance, marketInfo, userBorrow] = await Promise.all([
                            tokenContract.symbol(),
                            tokenContract.decimals(),
                            tokenContract.balanceOf(userAddress),
                            lendingPool.getMarketInfo(marketAddress),
                            lendingPool.getUserCurrentBorrow(userAddress, marketAddress)
                        ]);
                        const assetPrice = await priceRouter.getPrice(marketAddress);
                        
                        // Calculate available liquidity for borrowing (normalize to 18 decimals)
                        const liquidity = (marketInfo.totalDeposits - marketInfo.totalBorrows);
                        const userBorrowInUSD = assetPrice * userBorrow / (10n ** BigInt(decimals));
                        
                        return {
                            address: marketAddress,
                            symbol,
                            decimals,
                            balance: balance * (10n ** (18n - BigInt(decimals))), // normalize to 18 decimals
                            borrowRate: marketInfo.borrowRate,
                            liquidity: liquidity * (10n ** (18n - BigInt(decimals))), // normalize to 18 decimals
                            userBorrow: userBorrow * (10n ** (18n - BigInt(decimals))), // normalize to 18 decimals
                            userBorrowInUSD,
                            price: assetPrice
                        };
                    } catch (err) {
                        console.error(`Error fetching data for ${marketAddress}:`, err);
                        return null;
                    }
                })
            );

            const validMarkets = marketData.filter(m => (m !== null));
            setMarkets(validMarkets);

            // Filter user borrows (only assets with borrows > 0)
            const borrows = validMarkets.filter(m => m.userBorrow > 0n);
            setUserBorrows(borrows);

            // Get account liquidity and calculate max borrow
            const [totalDepositedUSD, totalBorrowedUSD] = await lendingPool.getAccountLiquidity(userAddress);
            const collateralFactor = await lendingPool.collateralFactor();
            
            setTotalCollateralUSD(totalDepositedUSD);
            setTotalBorrowedUSD(totalBorrowedUSD);
            
            // Max borrow = (collateral * collateralFactor) - totalBorrowed
            const maxBorrow = (totalDepositedUSD * collateralFactor / (10n ** 18n)) - totalBorrowedUSD;
            setMaxBorrowUSD(maxBorrow > 0n ? maxBorrow : 0n);

            // Calculate available to borrow for each market
            const marketsWithBorrowable = validMarkets.map(market => {
                // Convert max borrow USD to token amount
                const maxBorrowInToken = maxBorrow > 0n && market.price > 0n
                    ? (maxBorrow * (10n ** 18n)) / market.price
                    : 0n;
                
                // The actual available to borrow is the minimum of:
                // 1. Max borrowable based on collateral
                // 2. Available liquidity in the pool
                const availableToBorrow = maxBorrowInToken < market.liquidity 
                    ? maxBorrowInToken 
                    : market.liquidity;

                return {
                    ...market,
                    availableToBorrow
                };
            });

            setMarkets(marketsWithBorrowable);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBorrowDialog = (asset) => {
        setSelectedAsset(asset);
        setOpenBorrowDialog(true);
        setSuccess('');
    };

    const handleOpenRepayDialog = (asset) => {
        setSelectedAsset(asset);
        setOpenRepayDialog(true);
        setSuccess('');
    };

    const handleCloseBorrowDialog = () => {
        setOpenBorrowDialog(false);
        setSelectedAsset(null);
    };

    const handleCloseRepayDialog = () => {
        setOpenRepayDialog(false);
        setSelectedAsset(null);
    };

    const formatRate = (rate) => {
        const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
        return `${rateNum.toFixed(2)}%`;
    };

    const formatAmount = (amount) => {
        const formated = ethers.formatEther(amount);
        return parseFloat(formated).toFixed(4);
    };

    // Filter markets based on showZeroLiquidity checkbox
    const filteredMarkets = showZeroLiquidity 
        ? markets 
        : markets.filter(m => m.liquidity > 0n);

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
                            Please connect MetaMask or another Web3 wallet to borrow assets.
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" fontWeight="bold" mb={4}>
                Borrow Assets
            </Typography>

            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            {/* Borrow Stats */}
            <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
                <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
                    <CardContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Total Collateral
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="primary.main">
                            ${formatAmount(totalCollateralUSD)}
                        </Typography>
                    </CardContent>
                </Card>
                <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
                    <CardContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Total Borrowed
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="error.main">
                            ${formatAmount(totalBorrowedUSD)}
                        </Typography>
                    </CardContent>
                </Card>
                <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
                    <CardContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Max Borrow Available
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="success.main">
                            ${formatAmount(maxBorrowUSD)}
                        </Typography>
                    </CardContent>
                </Card>
            </Box>

            {/* Your Borrows Table */}
            <Box mb={4}>
                <Card elevation={2}>
                    <CardContent>
                        <Typography variant="h5" fontWeight="bold" mb={3}>
                            Your Borrows
                        </Typography>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : userBorrows.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography color="text.secondary">
                                    You haven't borrowed any assets yet
                                </Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Borrowed</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>APY</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {userBorrows.map((borrow) => (
                                            <TableRow key={borrow.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {borrow.symbol}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {formatAmount(borrow.userBorrow)}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.65rem' }}>
                                                        ${formatAmount(borrow.userBorrowInUSD)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="error.main" fontWeight="medium">
                                                        {formatRate(borrow.borrowRate)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="contained"
                                                        onClick={() => handleOpenRepayDialog(borrow)}
                                                    >
                                                        Repay
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
            </Box>

            {/* Assets to Borrow Table */}
            <Box>
                <Card elevation={2}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                            <Typography variant="h5" fontWeight="bold">
                                Assets to Borrow
                            </Typography>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={showZeroLiquidity}
                                        onChange={(e) => setShowZeroLiquidity(e.target.checked)}
                                    />
                                }
                                label="Show assets with 0 liquidity"
                            />
                        </Box>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : filteredMarkets.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography color="text.secondary">
                                    {showZeroLiquidity ? 'No markets available' : 'No assets with liquidity available'}
                                </Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Available to Borrow</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Pool Liquidity</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>APY</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredMarkets.map((market) => (
                                            <TableRow key={market.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {market.symbol}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip
                                                        title={
                                                            maxBorrowUSD === 0n 
                                                                ? "No collateral available" 
                                                                : "Limited by your collateral and pool liquidity"
                                                        }
                                                        arrow
                                                        placement="top"
                                                    >
                                                        <Typography 
                                                            variant="body2" 
                                                            fontWeight="bold"
                                                            color={market.availableToBorrow > 0n ? "success.main" : "text.disabled"}
                                                            sx={{ display: 'inline-block' }}
                                                        >
                                                            {formatAmount(market.availableToBorrow)}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography 
                                                        variant="body2" 
                                                        color="text.secondary"
                                                    >
                                                        {formatAmount(market.liquidity)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="error.main" fontWeight="medium">
                                                        {formatRate(market.borrowRate)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="contained"
                                                        disabled={market.liquidity === 0n || maxBorrowUSD === 0n}
                                                        onClick={() => handleOpenBorrowDialog(market)}
                                                    >
                                                        Borrow
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
            </Box>

            {/* Borrow Dialog */}
            {openBorrowDialog && <BorrowDialog
                handleCloseDialog={handleCloseBorrowDialog}
                selectedAsset={selectedAsset}
                fetchData={fetchData}
                setSuccess={setSuccess}
                formatAmount={formatAmount}
                formatRate={formatRate}
            />}

            {/* Repay Dialog */}
            {openRepayDialog && <RepayDialog
                handleCloseDialog={handleCloseRepayDialog}
                selectedAsset={selectedAsset}
                fetchData={fetchData}
                setSuccess={setSuccess}
                formatAmount={formatAmount}
                formatRate={formatRate}
            />}
        </Box>
    );
}