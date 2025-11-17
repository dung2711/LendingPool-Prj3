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
import DepositDialog from '@/components/DepositDialog';
import WithdrawDialog from '@/components/WithdrawDialog';

export default function Supply() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [markets, setMarkets] = useState([]);
    const [userDeposits, setUserDeposits] = useState([]);
    const [totalDepositedUSD, setTotalDepositedUSD] = useState(0);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [openDepositDialog, setOpenDepositDialog] = useState(false);
    const [openWithdrawDialog, setOpenWithdrawDialog] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showZeroBalance, setShowZeroBalance] = useState(false);

    useEffect(() => {
        checkWalletAndFetch();
        
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchData();
                } else {
                    setMarkets([]);
                    setUserDeposits([]);
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
                        const [symbol, decimals, balance, marketInfo, userDeposit] = await Promise.all([
                            tokenContract.symbol(),
                            tokenContract.decimals(),
                            tokenContract.balanceOf(userAddress),
                            lendingPool.getMarketInfo(marketAddress),
                            lendingPool.getUserCurrentDeposit(userAddress, marketAddress)
                        ]);
                        const assetPrice = await priceRouter.getPrice(marketAddress); // 18 decimals
                        console.log(assetPrice);
                        const userDepositInUSD = assetPrice * userDeposit / (10n ** BigInt(decimals));
                        const balanceInUSD = assetPrice * balance / (10n ** BigInt(decimals));
                        return {
                            address: marketAddress,
                            symbol,
                            decimals,
                            balance: balance * (10n ** (18n - BigInt(decimals))), // normalize to 18 decimals
                            balanceInUSD,
                            depositRate: marketInfo.depositRate,
                            userDeposit: userDeposit * (10n ** (18n - BigInt(decimals))), // normalize to 18 decimals
                            userDepositInUSD
                        };
                    } catch (err) {
                        console.error(`Error fetching data for ${marketAddress}:`, err);
                        return null;
                    }
                })
            );

            const validMarkets = marketData.filter(m => (m !== null));
            setMarkets(validMarkets);

            // Filter user deposits (only assets with deposits > 0)
            const deposits = validMarkets.filter(m => m.userDeposit > 0n);
            setUserDeposits(deposits);

            const [totalUSD, ] = await lendingPool.getAccountLiquidity(userAddress);
            setTotalDepositedUSD(totalUSD);

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDepositDialog = (asset) => {
        setSelectedAsset(asset);
        setOpenDepositDialog(true);
        setSuccess('');
    };

    const handleOpenWithdrawDialog = (asset) => {
        setSelectedAsset(asset);
        setOpenWithdrawDialog(true);
        setSuccess('');
    }

    const handleCloseDepositDialog = () => {
        setOpenDepositDialog(false);
        setSelectedAsset(null);
    };

    const handleCloseWithdrawDialog = () => {
        setOpenWithdrawDialog(false);
        setSelectedAsset(null);
    }

    const formatRate = (rate) => {
        const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
        return `${rateNum.toFixed(2)}%`;
    };

    const formatAmount = (amount) => {
        const formated = ethers.formatEther(amount);
        return parseFloat(formated).toFixed(4);
    };

    // Filter markets based on showZeroBalance checkbox
    const filteredMarkets = showZeroBalance 
        ? markets 
        : markets.filter(m => m.balance > 0n);

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
                            Please connect MetaMask or another Web3 wallet to supply assets.
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" fontWeight="bold" mb={4}>
                Supply Assets
            </Typography>

            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            {/* Your Deposits Table */}
            <Box mb={4}>
                <Card elevation={2}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                            <Typography variant="h5" fontWeight="bold">
                                Your Deposits
                            </Typography>
                            {!loading && userDeposits.length > 0 && (
                                <Box sx={{ 
                                    px: 2,
                                    borderRadius: 2,
                                    border: '1px solid',
                                }}>
                                    <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                        Balance: ${formatAmount(totalDepositedUSD)}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : userDeposits.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography color="text.secondary">
                                    You haven't deposited any assets yet
                                </Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Balance</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>APY</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {userDeposits.map((deposit) => (
                                            <TableRow key={deposit.address} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {deposit.symbol}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {formatAmount(deposit.userDeposit)}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.65rem' }}>
                                                        ${formatAmount(deposit.userDepositInUSD)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="success.main" fontWeight="medium">
                                                        {formatRate(deposit.depositRate)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="contained"
                                                        onClick={() => handleOpenWithdrawDialog(deposit)}
                                                    >
                                                        Withdraw
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

            {/* Assets to Deposit Table */}
            <Box>
                <Card elevation={2}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                            <Typography variant="h5" fontWeight="bold">
                                Assets to Deposit
                            </Typography>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={showZeroBalance}
                                        onChange={(e) => setShowZeroBalance(e.target.checked)}
                                    />
                                }
                                label="Show assets with 0 balance"
                            />
                        </Box>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : filteredMarkets.length === 0 ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography color="text.secondary">
                                    {showZeroBalance ? 'No markets available' : 'No assets with balance available'}
                                </Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Wallet Balance</TableCell>
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
                                                            <Box sx={{ textAlign: 'center' }}>
                                                                <Typography variant="body2">
                                                                    {formatAmount(market.balance)} {market.symbol}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                                                    ≈ ${formatAmount(market.balanceInUSD)} USD
                                                                </Typography>
                                                            </Box>
                                                        }
                                                        arrow
                                                        placement="top"
                                                        
                                                    >
                                                        <Typography 
                                                            variant="body2" 
                                                            fontWeight="medium" 
                                                            sx={{ display: 'inline-block' }}
                                                        >
                                                            {formatAmount(market.balance)}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="success.main" fontWeight="medium">
                                                        {formatRate(market.depositRate)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="contained"
                                                        disabled={market.balance === 0n}
                                                        onClick={() => handleOpenDepositDialog(market)}
                                                    >
                                                        Deposit
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

            {/* Deposit Dialog */}
            {openDepositDialog && <DepositDialog
                handleCloseDialog={handleCloseDepositDialog}
                selectedAsset={selectedAsset}
                fetchData={fetchData}
                setSuccess={setSuccess}
                formatAmount={formatAmount}
                formatRate={formatRate}
            />
            }
            {/* Withdraw Dialog */}
            {openWithdrawDialog && <WithdrawDialog
                handleCloseDialog={handleCloseWithdrawDialog}
                selectedAsset={selectedAsset}
                fetchData={fetchData}
                setSuccess={setSuccess}
                formatAmount={formatAmount}
            />
            }
            
        </Box>
    );
}