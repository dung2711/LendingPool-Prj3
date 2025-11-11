"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { getLendingPoolContract, getToken } from '@/lib/web3';

export default function Home() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [account, setAccount] = useState(null);

  useEffect(() => {
    checkWalletAndFetch();

    // Listen for account changes
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchMarkets();
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, []);

  const checkWalletAndFetch = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        setAccount(accounts[0] || null);
        if(accounts.length > 0) {
          fetchMarkets();
        }
      } catch (err) {
        console.error('Error checking wallet:', err);
      }
    } 
  };

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      
      // Get all supported markets
      const allMarkets = await lendingPool.getAllMarkets();
      
      // Fetch market info for each market
      const marketData = await Promise.all(
        allMarkets.map(async (marketAddress) => {
          try {
            const info = await lendingPool.getMarketInfo(marketAddress);
            const tokenContract = await getToken(marketAddress);
            const symbol = await tokenContract.symbol();
            return {
              symbol: symbol,
              address: marketAddress,
              totalDeposits: info.totalDeposits,
              totalBorrows: info.totalBorrows,
              depositRate: info.depositRate,
              borrowRate: info.borrowRate,
              utilizationRate: info.utilizationRate,
            };
          } catch (err) {
            console.error(`Error fetching market info for ${marketAddress}:`, err);
            return null;
          }
        })
      );

      // Filter out null values (failed fetches)
      setMarkets(marketData.filter(m => m !== null));
      setError(null);
    } catch (err) {
      console.error('Error fetching markets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatRate = (rate) => {
    // Convert from 18 decimals to percentage
    const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
    return `${rateNum.toFixed(2)}%`;
  };

  const formatAmount = (amount) => {
    return parseFloat(ethers.formatEther(amount)).toFixed(4);
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatUtilization = (utilization) => {
    const utilizationNum = parseFloat(ethers.formatUnits(utilization, 18)) * 100;
    return `${utilizationNum.toFixed(2)}%`;
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 1, sm: 2, md: 3 }, py: { xs: 2, sm: 3, md: 4 } }}>
      {/* Header Section */}
      <Box textAlign="center" mb={{ xs: 4, md: 6 }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' } }}>
          Welcome to Lending Pool DApp
        </Typography>
        <Typography variant="h6" color="text.secondary" mb={4} sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          Supply assets to earn interest or borrow against your collateral
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button 
            component={Link} 
            href="/supply" 
            variant="contained" 
            color="primary"
            size="large"
            startIcon={<AccountBalanceIcon />}
            sx={{ minWidth: { xs: '140px', sm: '160px' } }}
          >
            Supply Assets
          </Button>
          <Button 
            component={Link} 
            href="/borrow" 
            variant="outlined" 
            color="primary"
            size="large"
            startIcon={<TrendingUpIcon />}
            sx={{ minWidth: { xs: '140px', sm: '160px' } }}
          >
            Borrow Assets
          </Button>
        </Box>
      </Box>

      {/* Markets Table Section */}
      <Box>
        <Typography variant="h4" fontWeight="bold" mb={3} sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}>
          Supported Markets
        </Typography>

        {!account ? (
          <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                Account Not Detected
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Please connect MetaMask or another Web3 wallet to view markets and interact with the protocol.
              </Typography>
            </CardContent>
          </Card>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
            <CardContent>
              <Typography variant="h6">Error loading markets</Typography>
              <Typography variant="body2">{error}</Typography>
              <Button 
                variant="contained" 
                onClick={fetchMarkets} 
                sx={{ mt: 2 }}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent>
              <Typography variant="h6" color="text.secondary" textAlign="center">
                No markets available yet
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper} elevation={2} sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: { xs: 300, sm: 650 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'primary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Asset</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Total Deposits</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', display: { xs: 'none', sm: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Total Borrows</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Utilization</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Deposit APY</TableCell>
                  <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', display: { xs: 'none', md: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Borrow APY</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {markets.map((market) => (
                  <TableRow 
                    key={market.address}
                    sx={{ 
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:last-child td, &:last-child th': { border: 0 }
                    }}
                  >
                    <TableCell component="th" scope="row">
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontFamily="monospace" fontWeight="medium" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                          {market.symbol}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.65rem' }}>
                          {market.address}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2" fontWeight="medium" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                        {formatAmount(market.totalDeposits)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Typography variant="body2" fontWeight="medium" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                        {formatAmount(market.totalBorrows)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={formatUtilization(market.utilizationRate)}
                        size="small"
                        sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                        color={
                          parseFloat(ethers.formatUnits(market.utilizationRate, 18)) > 0.8 
                            ? 'error' 
                            : parseFloat(ethers.formatUnits(market.utilizationRate, 18)) > 0.5 
                            ? 'warning' 
                            : 'success'
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="success.main" fontWeight="medium" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                        {formatRate(market.depositRate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="body2" color="error.main" fontWeight="medium" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                        {formatRate(market.borrowRate)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Summary Cards */}
      {!loading && !error && markets.length > 0 && account && (
        <Grid container spacing={3} sx={{ mt: 4 }}>
          <Grid item xs={12} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Total Markets
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {markets.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Total Value Locked
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {formatAmount(
                    markets.reduce((sum, m) => sum + BigInt(m.totalDeposits.toString()), BigInt(0)).toString()
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Total Borrowed
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {formatAmount(
                    markets.reduce((sum, m) => sum + BigInt(m.totalBorrows.toString()), BigInt(0)).toString()
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
