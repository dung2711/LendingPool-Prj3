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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import { getLendingPoolContract, getToken, getPriceRouterContract } from '@/lib/web3';

export default function Supply() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [markets, setMarkets] = useState([]);
    const [userDeposits, setUserDeposits] = useState([]);
    const [totalDepositedUSD, setTotalDepositedUSD] = useState(0);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [transactionLoading, setTransactionLoading] = useState(false);
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
                        const [symbol, balance, marketInfo, userDeposit] = await Promise.all([
                            tokenContract.symbol(),
                            tokenContract.balanceOf(userAddress),
                            lendingPool.getMarketInfo(marketAddress),
                            lendingPool.getUserCurrentDeposit(userAddress, marketAddress)
                        ]);
                        const assetPrice = await priceRouter.getPrice(marketAddress);
                        const userDepositInUSD = assetPrice * userDeposit / (10n ** 18n);
                        const balanceInUSD = assetPrice * balance / (10n ** 18n);
                        return {
                            address: marketAddress,
                            symbol,
                            balance,
                            balanceInUSD,
                            depositRate: marketInfo.depositRate,
                            userDeposit,
                            userDepositInUSD
                        };
                    } catch (err) {
                        console.error(`Error fetching data for ${marketAddress}:`, err);
                        return null;
                    }
                })
            );

            const validMarkets = marketData.filter(m => m !== null);
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

    const handleOpenDialog = (asset) => {
        setSelectedAsset(asset);
        setDepositAmount('');
        setOpenDialog(true);
        setError('');
        setSuccess('');
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedAsset(null);
        setDepositAmount('');
        setError('');
    };

    const handleDeposit = async () => {
        if (!depositAmount || !selectedAsset) return;

        try {
            setTransactionLoading(true);
            setError('');

            const lendingPool = await getLendingPoolContract();
            const tokenContract = await getToken(selectedAsset.address);
            const amountInWei = ethers.parseEther(depositAmount);

            // Check balance
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            const balance = await tokenContract.balanceOf(userAddress);

            if (balance < amountInWei) {
                setError('Insufficient balance');
                setTransactionLoading(false);
                return;
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

    const formatRate = (rate) => {
        const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
        return `${rateNum.toFixed(2)}%`;
    };

    const formatAmount = (amount) => {
        return parseFloat(ethers.formatEther(amount)).toFixed(4);
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
                                                        onClick={() => handleOpenDialog(market)}
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
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Deposit {selectedAsset?.symbol}
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Available: {selectedAsset && formatAmount(selectedAsset.balance)} {selectedAsset?.symbol}
                    </Typography>
                    
                    <TextField
                        fullWidth
                        label="Amount"
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        inputProps={{ step: "0.000001", min: "0" }}
                        sx={{ mb: 2 }}
                    />
                    
                    <Typography variant="body2" color="text.secondary">
                        Current APY: {selectedAsset && formatRate(selectedAsset.depositRate)}
                    </Typography>
                </DialogContent>
                <DialogActions>
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
        </Box>
    );
}