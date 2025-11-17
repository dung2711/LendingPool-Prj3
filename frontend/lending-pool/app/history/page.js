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
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import GavelIcon from '@mui/icons-material/Gavel';
import { getAllAssets } from '@/services/assetService';
import { getTransactionsByUserAddress } from '@/services/transactionService';

export default function History() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [filteredTransactions, setFilteredTransactions] = useState([]);
    const [filterType, setFilterType] = useState('all');
    const [summary, setSummary] = useState({
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalBorrows: 0,
        totalRepays: 0,
        totalDepositsUSD: 0,
        totalWithdrawalsUSD: 0,
        totalBorrowsUSD: 0,
        totalRepaysUSD: 0
    });

    useEffect(() => {
        checkWalletAndFetch();
        
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchTransactions();
                } else {
                    setTransactions([]);
                    setFilteredTransactions([]);
                }
            };
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            };
        }
    }, []);

    useEffect(() => {
        applyFilter();
    }, [transactions, filterType]);

    const checkWalletAndFetch = async () => {
        if (typeof window !== "undefined" && window.ethereum) {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_accounts", []);
                setAccount(accounts[0] || null);
                if (accounts.length > 0) {
                    fetchTransactions();
                }
            } catch (err) {
                console.error('Error checking wallet:', err);
            }
        }
    };

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();

            // Fetch transactions from backend API
            const [txData, assetsData] = await Promise.all([
                getTransactionsByUserAddress(userAddress),
                getAllAssets()
            ]);

            // Create asset lookup map for quick access
            const assetMap = {};
            assetsData.forEach(asset => {
                assetMap[asset.address.toLowerCase()] = {
                    symbol: asset.symbol,
                    decimals: asset.decimals
                };
            });

            // Process transactions
            const allTxs = [];
            let totalDeposits = 0;
            let totalWithdrawals = 0;
            let totalBorrows = 0;
            let totalRepays = 0;
            let totalDepositsUSD = 0;
            let totalWithdrawalsUSD = 0;
            let totalBorrowsUSD = 0;
            let totalRepaysUSD = 0;

            for (const tx of txData) {
                const asset = assetMap[tx.assetAddress.toLowerCase()];
                if (!asset) continue; // Skip if asset not found

                const amountFormatted = parseFloat(ethers.formatUnits(tx.amount, asset.decimals));
                const amountUSDFormatted = tx.amountUSD ? parseFloat(ethers.formatUnits(tx.amountUSD, 18)) : null;

                // Update summary based on transaction type
                switch (tx.type) {
                    case 'deposit':
                        totalDeposits += amountFormatted;
                        if (amountUSDFormatted) totalDepositsUSD += amountUSDFormatted;
                        break;
                    case 'withdraw':
                        totalWithdrawals += amountFormatted;
                        if (amountUSDFormatted) totalWithdrawalsUSD += amountUSDFormatted;
                        break;
                    case 'borrow':
                        totalBorrows += amountFormatted;
                        if (amountUSDFormatted) totalBorrowsUSD += amountUSDFormatted;
                        break;
                    case 'repay':
                        totalRepays += amountFormatted;
                        if (amountUSDFormatted) totalRepaysUSD += amountUSDFormatted;
                        break;
                }

                allTxs.push({
                    type: tx.type,
                    symbol: asset.symbol,
                    amount: tx.amount,
                    decimals: asset.decimals,
                    amountFormatted,
                    amountUSD: tx.amountUSD,
                    amountUSDFormatted,
                    hash: tx.hash,
                    timestamp: new Date(tx.timestamp).getTime() / 1000, // Convert to Unix timestamp
                    blockNumber: tx.blockNumber
                });
            }

            // Sort by timestamp (newest first)
            allTxs.sort((a, b) => b.timestamp - a.timestamp);

            setTransactions(allTxs);
            setSummary({
                totalDeposits,
                totalWithdrawals,
                totalBorrows,
                totalRepays,
                totalDepositsUSD,
                totalWithdrawalsUSD,
                totalBorrowsUSD,
                totalRepaysUSD
            });

        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    const applyFilter = () => {
        if (filterType === 'all') {
            setFilteredTransactions(transactions);
        } else {
            setFilteredTransactions(transactions.filter(tx => tx.type === filterType));
        }
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'deposit': return <TrendingUpIcon fontSize="small" />;
            case 'withdraw': return <TrendingDownIcon fontSize="small" />;
            case 'borrow': return <AccountBalanceIcon fontSize="small" />;
            case 'repay': return <CreditCardIcon fontSize="small" />;
            case 'liquidated': return <GavelIcon fontSize="small" />;
            default: return null;
        }
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'deposit': return 'success';
            case 'withdraw': return 'warning';
            case 'borrow': return 'info';
            case 'repay': return 'primary';
            case 'liquidated': return 'error';
            default: return 'default';
        }
    };

    const getTypeLabel = (type) => {
        return type.charAt(0).toUpperCase() + type.slice(1);
    };

    const openInExplorer = (hash) => {
        // Update this with your network's block explorer
        window.open(`https://sepolia.etherscan.io/tx/${hash}`, '_blank');
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
                            Please connect MetaMask to view your transaction history.
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" fontWeight="bold" mb={4}>
                Transaction History
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={2} mb={4}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                Total Deposited
                            </Typography>
                            <Typography variant="h6" fontWeight="bold" color="success.main">
                                ${summary.totalDepositsUSD.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary.totalDeposits.toFixed(2)} tokens
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                Total Withdrawn
                            </Typography>
                            <Typography variant="h6" fontWeight="bold" color="warning.main">
                                ${summary.totalWithdrawalsUSD.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary.totalWithdrawals.toFixed(2)} tokens
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                Total Borrowed
                            </Typography>
                            <Typography variant="h6" fontWeight="bold" color="info.main">
                                ${summary.totalBorrowsUSD.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary.totalBorrows.toFixed(2)} tokens
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={2}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                Total Repaid
                            </Typography>
                            <Typography variant="h6" fontWeight="bold" color="primary.main">
                                ${summary.totalRepaysUSD.toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary.totalRepays.toFixed(2)} tokens
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filter */}
            <Card elevation={2} sx={{ mb: 3 }}>
                <CardContent>
                    <FormControl sx={{ minWidth: 200 }} size="small">
                        <InputLabel>Filter by Type</InputLabel>
                        <Select
                            value={filterType}
                            label="Filter by Type"
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <MenuItem value="all">All Transactions</MenuItem>
                            <MenuItem value="deposit">Deposits</MenuItem>
                            <MenuItem value="withdraw">Withdrawals</MenuItem>
                            <MenuItem value="borrow">Borrows</MenuItem>
                            <MenuItem value="repay">Repays</MenuItem>
                            <MenuItem value="liquidated">Liquidations</MenuItem>
                        </Select>
                    </FormControl>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                        {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                    </Typography>
                </CardContent>
            </Card>

            {/* Transactions Table */}
            <Card elevation={2}>
                <CardContent>
                    <Typography variant="h5" fontWeight="bold" mb={3}>
                        Transactions
                    </Typography>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : filteredTransactions.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography color="text.secondary">
                                No transactions found
                            </Typography>
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Value (USD)</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Transaction</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredTransactions.map((tx, index) => (
                                        <TableRow key={`${tx.hash}-${index}`} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                            <TableCell>
                                                <Chip
                                                    icon={getTypeIcon(tx.type)}
                                                    label={getTypeLabel(tx.type)}
                                                    color={getTypeColor(tx.type)}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {tx.symbol}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {tx.amountFormatted.toFixed(4)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {tx.amountUSDFormatted !== null ? (
                                                    <Typography variant="body2" fontWeight="medium" color="primary.main">
                                                        ${tx.amountUSDFormatted.toFixed(2)}
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">
                                                        N/A
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDate(tx.timestamp)}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Block #{tx.blockNumber}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                                                    </Typography>
                                                    <IconButton size="small" onClick={() => openInExplorer(tx.hash)}>
                                                        <OpenInNewIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
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
    );
}
