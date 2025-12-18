"use client";

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { getLendingPoolContract, getPriceRouterContract, getLiquidationContract, getInterestRateModelContract, getToken, getMyOracleContract } from '@/lib/web3';
import * as SafeMultisigService from '@/services/SafeMultisigService';

export default function AdminPage() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState(null);

  // Protocol params
  const [collateralFactor, setCollateralFactor] = useState('');
  const [liquidationThreshold, setLiquidationThreshold] = useState('');
  const [closeFactor, setCloseFactor] = useState('');
  const [liquidationIncentive, setLiquidationIncentive] = useState('');

  // Market management
  const [newMarketAsset, setNewMarketAsset] = useState('');
  const [newMarketIRM, setNewMarketIRM] = useState('');
  const [markets, setMarkets] = useState([]);

  // Price management
  const [priceAsset, setPriceAsset] = useState('');
  const [priceFeed, setPriceFeed] = useState('');
  const [priceSource, setPriceSource] = useState('chainlink');
  const [oraclePrice, setOraclePrice] = useState('');

  // Admin management
  const [adminAddress, setAdminAddress] = useState('');
  const [adminStatus, setAdminStatus] = useState(true);

  // InterestRateModel read-only states
  const [baseRate, setBaseRate] = useState('');
  const [rateSlope1, setRateSlope1] = useState('');
  const [rateSlope2, setRateSlope2] = useState('');
  const [optimalUtilization, setOptimalUtilization] = useState('');
  const [reserveFactor, setReserveFactor] = useState('');

  // Safe Multisig states
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [safeInfo, setSafeInfo] = useState(null);
  const [isSafeOwner, setIsSafeOwner] = useState(false);
  const [safeLoading, setSafeLoading] = useState(false);

  useEffect(() => {
    checkWalletAndFetch();

    if (window.ethereum) {
      const handleAccountsChanged = async (account) => {
        try {
          setPageLoading(true);
          setAccount(account[0] || null);
          if (account.length > 0) {
            await checkAdminStatus();
          }
        } catch (error) {
          console.error('Error on account change:', error);
        } finally {
          setPageLoading(false);
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
    if (pageLoading) setPageLoading(false);
  }, []);

  const checkWalletAndFetch = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setPageLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          await checkAdminStatus();
        }
      } catch (err) {
        console.error('Error checking wallet:', err);
      } finally {
        setPageLoading(false);
      }
    }
  };

  const checkAdminStatus = async () => {
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        if (accounts.length > 0) {
          const lendingPool = await getLendingPoolContract();
          setAccount(accounts[0]);
          const adminStatus = await lendingPool.isAdmin(accounts[0]);
          setIsAdmin(adminStatus);
          if (adminStatus) {
            await loadCurrentValues();
          }
        }
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
    }

  };

  const loadCurrentValues = async () => {
    try {
      const lendingPool = await getLendingPoolContract();
      const liquidation = await getLiquidationContract();
      const interestRateModel = await getInterestRateModelContract();

      // Load LendingPool values
      const cf = await lendingPool.collateralFactor();
      setCollateralFactor(ethers.formatUnits(cf, 18));

      const allMarkets = await lendingPool.getAllMarkets();
      // Filter supported markets - need to await each markets() call
      const marketChecks = await Promise.all(
        allMarkets.map(async (market) => {
          const marketData = await lendingPool.markets(market);
          return marketData.isSupported ? market : null;
        })
      );
      const supportedMarkets = marketChecks.filter(market => market !== null);
      setMarkets(supportedMarkets);

      // Load Liquidation values
      const lt = await liquidation.liquidationThreshold();
      setLiquidationThreshold(ethers.formatUnits(lt, 18));

      const cf2 = await liquidation.closeFactor();
      setCloseFactor(ethers.formatUnits(cf2, 18));

      const li = await liquidation.liquidationIncentive();
      setLiquidationIncentive(ethers.formatUnits(li, 18));

      // Load InterestRateModel values
      const br = await interestRateModel.baseRate();
      setBaseRate(ethers.formatUnits(br, 18));

      const rs1 = await interestRateModel.rateSlope1();
      setRateSlope1(ethers.formatUnits(rs1, 18));

      const rs2 = await interestRateModel.rateSlope2();
      setRateSlope2(ethers.formatUnits(rs2, 18));

      const ou = await interestRateModel.optimalUtilization();
      setOptimalUtilization(ethers.formatUnits(ou, 18));

      const rf = await interestRateModel.reserveFactor();
      setReserveFactor(ethers.formatUnits(rf, 18));

    } catch (err) {
      console.error('Error loading current values:', err);
    }
  };

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 5000);
  };

  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  // LendingPool functions

  const handleSetProtocolParams = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const value = ethers.parseUnits(collateralFactor, 18);
      const firsttx = await lendingPool.setCollateralParams(value);
      await firsttx.wait();
      const liquidation = await getLiquidationContract();
      const lt = ethers.parseUnits(liquidationThreshold, 18);
      const cf = ethers.parseUnits(closeFactor, 18);
      const li = ethers.parseUnits(liquidationIncentive, 18);
      const secondtx = await liquidation.setLiquidateParams(lt, cf, li);
      await secondtx.wait();
      showSuccess('Protocol params updated successfully!');
      loadCurrentValues();
    } catch (err) {
      showError(`Error: ${err.message}`);
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMarket = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const tx = await lendingPool.supportMarket(newMarketAsset, newMarketIRM);
      await tx.wait();
      showSuccess('Market added successfully! Remember to set price for the new market.');
      setNewMarketAsset('');
      setNewMarketIRM('');
      loadCurrentValues();
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsupportMarket = async (asset) => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const tx = await lendingPool.unsupportMarket(asset);
      await tx.wait();
      showSuccess('Market unsupported successfully!');
      loadCurrentValues();
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrice = async () => {
    try {
      setLoading(true);
      const priceRouter = await getPriceRouterContract();

      if (priceSource === 'chainlink') {
        const tx = await priceRouter.setChainlinkFeed(priceAsset, priceFeed);
        await tx.wait();
        showSuccess('Chainlink price feed set successfully!');
      } else {
        const myOracle = await getMyOracleContract();
        const price = ethers.parseEther(oraclePrice);

        const tx1 = await priceRouter.setMyOracleFeed(priceAsset);
        await tx1.wait();

        const tx2 = await myOracle.setPrice(priceAsset, price);
        await tx2.wait();

        showSuccess('MyOracle price set successfully!');
      }

      setPriceAsset('');
      setPriceFeed('');
      setOraclePrice('');
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetAdmin = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const liquidation = await getLiquidationContract();
      const priceRouter = await getPriceRouterContract();
      const myOracle = await getMyOracleContract();
      const tx = await lendingPool.setAdmin(adminAddress, adminStatus);
      await tx.wait();
      const tx2 = await liquidation.setAdmin(adminAddress, adminStatus);
      await tx2.wait();
      const tx3 = await priceRouter.setAdmin(adminAddress, adminStatus);
      await tx3.wait();
      const tx4 = await myOracle.setAdmin(adminAddress, adminStatus);
      await tx4.wait();
      showSuccess(`Admin ${adminStatus ? 'added' : 'removed'} successfully!`);
      setAdminAddress('');
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Safe Multisig functions
  const loadSafeInfo = async () => {
    try {
      setSafeLoading(true);
      const info = await SafeMultisigService.getSafeInfo();
      setSafeInfo(info);
      const isOwner = await SafeMultisigService.isOwner();
      setIsSafeOwner(isOwner);
      await loadPendingTransactions();
    } catch (err) {
      console.error('Error loading Safe info:', err);
      showError(`Error loading Safe info: ${err.message}`);
    } finally {
      setSafeLoading(false);
    }
  };

  const loadPendingTransactions = async () => {
    try {
      const txs = await SafeMultisigService.getPendingTransactions();
      setPendingTransactions(txs);
    } catch (err) {
      console.error('Error loading pending transactions:', err);
    }
  };

  const handleProposePause = async () => {
    try {
      setLoading(true);
      const { safeTxHash } = await SafeMultisigService.proposePause();
      showSuccess(`Pause proposal created! Transaction hash: ${safeTxHash.substring(0, 10)}...`);
      await loadPendingTransactions();
    } catch (err) {
      showError(`Error proposing pause: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProposeUnpause = async () => {
    try {
      setLoading(true);
      const { safeTxHash } = await SafeMultisigService.proposeUnpause();
      showSuccess(`Unpause proposal created! Transaction hash: ${safeTxHash.substring(0, 10)}...`);
      await loadPendingTransactions();
    } catch (err) {
      showError(`Error proposing unpause: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignTransaction = async (safeTxHash) => {
    try {
      setLoading(true);
      await SafeMultisigService.signTransaction(safeTxHash);
      showSuccess('Transaction signed successfully!');
      await loadPendingTransactions();
    } catch (err) {
      showError(`Error signing transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTransaction = async (safeTxHash) => {
    try {
      setLoading(true);
      const receipt = await SafeMultisigService.executeTransaction(safeTxHash);
      showSuccess('Transaction executed successfully!');
      await loadPendingTransactions();
    } catch (err) {
      showError(`Error executing transaction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tabValue === 5 && isAdmin) {
      loadSafeInfo();
    }
  }, [tabValue, isAdmin]);



  return (
    <>
      {pageLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (!isAdmin || !account) ? (
        <Box sx={{ p: 3 }}>
          <Alert severity="error">
            <Typography variant="h6">Access Denied</Typography>
            <Typography>You are not authorized to access the admin panel.</Typography>
          </Alert>
        </Box>
      ) : (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
            <AdminPanelSettingsIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h4" fontWeight="bold">
                Admin Panel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configure protocol parameters
              </Typography>
            </Box>
          </Box>

          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Paper sx={{ mb: 3 }}>
            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} variant="scrollable" scrollButtons="auto">
              <Tab label="Protocol Parameters" />
              <Tab label="Market Management" />
              <Tab label="Price Management" />
              <Tab label="Admin Management" />
              <Tab label="Interest Rate Model" />
              <Tab label="Safe Multisig" />
            </Tabs>
          </Paper>

          {/* Protocol Parameters Tab */}
          {tabValue === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Protocol Parameters" />
                  <Divider />
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                      Configure collateral factor and liquidation parameters for the entire protocol
                    </Typography>

                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          fullWidth
                          label="Collateral Factor (0-1)"
                          value={collateralFactor}
                          onChange={(e) => setCollateralFactor(e.target.value)}
                          type="number"
                          inputProps={{ step: "0.01" }}
                          helperText="Max borrowing power from collateral"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          fullWidth
                          label="Liquidation Threshold (0-1)"
                          value={liquidationThreshold}
                          onChange={(e) => setLiquidationThreshold(e.target.value)}
                          type="number"
                          inputProps={{ step: "0.01" }}
                          helperText="Health factor threshold for liquidation"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          fullWidth
                          label="Close Factor (0-1)"
                          value={closeFactor}
                          onChange={(e) => setCloseFactor(e.target.value)}
                          type="number"
                          inputProps={{ step: "0.01" }}
                          helperText="Max % of debt that can be repaid"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          fullWidth
                          label="Liquidation Incentive (0-1)"
                          value={liquidationIncentive}
                          onChange={(e) => setLiquidationIncentive(e.target.value)}
                          type="number"
                          inputProps={{ step: "0.01" }}
                          helperText="Bonus reward for liquidators"
                        />
                      </Grid>
                    </Grid>

                    <Alert severity="info" sx={{ mt: 3, mb: 2 }}>
                      This will update both collateral parameters in LendingPool and liquidation parameters in Liquidation contract
                    </Alert>

                    <Button
                      variant="contained"
                      onClick={handleSetProtocolParams}
                      disabled={loading}
                      startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                      fullWidth
                      size="large"
                    >
                      Update All Protocol Parameters
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Market Management Tab */}
          {tabValue === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardHeader
                    title="Add New Market"
                  />
                  <Divider />
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={5}>
                        <TextField
                          fullWidth
                          label="Asset Address"
                          value={newMarketAsset}
                          onChange={(e) => setNewMarketAsset(e.target.value)}
                          placeholder="0x..."
                        />
                      </Grid>
                      <Grid item xs={12} md={5}>
                        <TextField
                          fullWidth
                          label="Interest Rate Model Address"
                          value={newMarketIRM}
                          onChange={(e) => setNewMarketIRM(e.target.value)}
                          placeholder="0x..."
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <Button
                          variant="contained"
                          onClick={handleAddMarket}
                          disabled={loading || !newMarketAsset || !newMarketIRM}
                          startIcon={loading ? null : <AddIcon />}
                          fullWidth
                          sx={{ height: '56px' }}
                        >
                          {loading ? <CircularProgress size={20} /> : "Add Market"}
                        </Button>
                      </Grid>
                    </Grid>
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      After adding a market, remember to set its price in the Price Management tab
                    </Alert>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Card>
                  <CardHeader
                    title="Supported Markets"
                    action={
                      <Chip label={`${markets.length} Markets`} color="primary" />
                    }
                  />
                  <Divider />
                  <CardContent>
                    {markets.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          No markets supported yet. Add your first market above.
                        </Typography>
                      </Box>
                    ) : (
                      <List>
                        {markets.map((market, index) => (
                          <ListItem
                            key={index}
                            secondaryAction={
                              <IconButton
                                edge="end"
                                onClick={() => handleUnsupportMarket(market)}
                                color="error"
                                disabled={loading}
                              >
                                <DeleteIcon />
                              </IconButton>
                            }
                            sx={{
                              bgcolor: 'background.paper',
                              mb: 1,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider'
                            }}
                          >
                            <ListItemText
                              primary={market}
                              primaryTypographyProps={{
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                fontWeight: 'medium'
                              }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Price Management Tab */}
          {tabValue === 2 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Set Asset Price" />
                  <Divider />
                  <CardContent>
                    <TextField
                      fullWidth
                      label="Asset Address"
                      value={priceAsset}
                      onChange={(e) => setPriceAsset(e.target.value)}
                      placeholder="0x..."
                      sx={{ mb: 3 }}
                    />

                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Price Source
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button
                          variant={priceSource === 'chainlink' ? "contained" : "outlined"}
                          onClick={() => {
                            setPriceSource('chainlink');
                            setOraclePrice('');
                          }}
                          fullWidth
                        >
                          Chainlink Feed
                        </Button>
                        <Button
                          variant={priceSource === 'myoracle' ? "contained" : "outlined"}
                          onClick={() => {
                            setPriceSource('myoracle');
                            setPriceFeed('');
                          }}
                          fullWidth
                        >
                          Manual Price (MyOracle)
                        </Button>
                      </Box>
                    </Box>

                    {priceSource === 'chainlink' ? (
                      <>
                        <TextField
                          fullWidth
                          label="Chainlink Price Feed Address"
                          value={priceFeed}
                          onChange={(e) => setPriceFeed(e.target.value)}
                          placeholder="0x..."
                          sx={{ mb: 2 }}
                          helperText="Address of Chainlink price feed contract (e.g., ETH/USD feed)"
                        />
                        <Button
                          variant="contained"
                          onClick={handleSetPrice}
                          disabled={loading || !priceAsset || !priceFeed}
                          startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                          fullWidth
                          size="large"
                        >
                          Set Chainlink Feed
                        </Button>
                      </>
                    ) : (
                      <>
                        <TextField
                          fullWidth
                          label="Price (in USD)"
                          value={oraclePrice}
                          onChange={(e) => setOraclePrice(e.target.value)}
                          type="number"
                          inputProps={{ step: "0.000001" }}
                          placeholder="e.g., 2000.50"
                          sx={{ mb: 2 }}
                          helperText="Price in USD (will be stored with 18 decimals)"
                        />
                        <Button
                          variant="contained"
                          onClick={handleSetPrice}
                          disabled={loading || !priceAsset || !oraclePrice}
                          startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                          fullWidth
                          size="large"
                        >
                          Set Manual Price
                        </Button>
                      </>
                    )}

                    <Alert severity="info" sx={{ mt: 3 }}>
                      {priceSource === 'chainlink'
                        ? 'Chainlink feeds provide decentralized, real-time price updates automatically'
                        : 'Manual prices require admin to update them manually. Use for testing or assets without Chainlink feeds.'}
                    </Alert>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Admin Management Tab */}
          {tabValue === 3 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Admin Management" />
                  <Divider />
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                      Add or remove admin privileges for addresses
                    </Typography>

                    <TextField
                      fullWidth
                      label="Admin Address"
                      value={adminAddress}
                      onChange={(e) => setAdminAddress(e.target.value)}
                      placeholder="0x..."
                      sx={{ mb: 3 }}
                    />

                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Action
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button
                          variant={adminStatus ? "contained" : "outlined"}
                          onClick={() => setAdminStatus(true)}
                          fullWidth
                          color="success"
                        >
                          Grant Admin Access
                        </Button>
                        <Button
                          variant={!adminStatus ? "contained" : "outlined"}
                          onClick={() => setAdminStatus(false)}
                          fullWidth
                          color="error"
                        >
                          Revoke Admin Access
                        </Button>
                      </Box>
                    </Box>

                    <Button
                      variant="contained"
                      onClick={handleSetAdmin}
                      disabled={loading || !adminAddress}
                      startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                      fullWidth
                      size="large"
                    >
                      {adminStatus ? 'Add Admin' : 'Remove Admin'}
                    </Button>

                    <Alert severity="warning" sx={{ mt: 3 }}>
                      Be careful when managing admin privileges. Only trusted addresses should have admin access.
                    </Alert>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Interest Rate Model Tab */}
          {tabValue === 4 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Interest Rate Model Parameters" />
                  <Divider />
                  <CardContent>
                    <Alert severity="info" sx={{ mb: 3 }}>
                      These parameters are read-only. The Interest Rate Model contract doesn't support updates after deployment.
                    </Alert>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextField
                          fullWidth
                          label="Base Rate"
                          value={baseRate}
                          disabled
                          helperText="Base interest rate per year"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextField
                          fullWidth
                          label="Rate Slope 1"
                          value={rateSlope1}
                          disabled
                          helperText="Rate increase before optimal utilization"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextField
                          fullWidth
                          label="Rate Slope 2"
                          value={rateSlope2}
                          disabled
                          helperText="Rate increase after optimal utilization"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Optimal Utilization"
                          value={optimalUtilization}
                          disabled
                          helperText="Target utilization rate (e.g., 0.8 = 80%)"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Reserve Factor"
                          value={reserveFactor}
                          disabled
                          helperText="Portion of interest reserved for protocol"
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Safe Multisig Tab */}
          {tabValue === 5 && (
            <Grid container spacing={3}>
              {/* Safe Info Card */}
              <Grid item xs={12}>
                <Card>
                  <CardHeader
                    title="Safe Multisig Information"
                    action={
                      <Button
                        size="small"
                        onClick={loadSafeInfo}
                        disabled={safeLoading}
                      >
                        {safeLoading ? <CircularProgress size={20} /> : 'Refresh'}
                      </Button>
                    }
                  />
                  <Divider />
                  <CardContent>
                    {safeInfo ? (
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">
                            Safe Address
                          </Typography>
                          <Typography variant="body1" fontFamily="monospace" sx={{ mb: 2 }}>
                            {safeInfo.address}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            Threshold
                          </Typography>
                          <Typography variant="h6">
                            {safeInfo.threshold} of {safeInfo.owners.length}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            Your Status
                          </Typography>
                          <Chip
                            label={isSafeOwner ? "Owner" : "Not Owner"}
                            color={isSafeOwner ? "success" : "default"}
                            size="small"
                            sx={{ mt: 0.5 }}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Owners
                          </Typography>
                          {safeInfo.owners.map((owner, index) => (
                            <Chip
                              key={index}
                              label={owner}
                              size="small"
                              sx={{ mr: 1, mb: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}
                            />
                          ))}
                        </Grid>
                      </Grid>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CircularProgress />
                      </Box>
                    )}
                    {!isSafeOwner && safeInfo && (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        You are not a Safe owner. You can view transactions but cannot propose, sign, or execute them.
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Propose Actions Card */}
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Propose New Action" />
                  <Divider />
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                      Propose a pause or unpause action. This will create a new transaction that requires {safeInfo?.threshold || '2'} signatures.
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Button
                          variant="contained"
                          color="error"
                          onClick={handleProposePause}
                          disabled={loading || !isSafeOwner}
                          startIcon={loading ? <CircularProgress size={20} /> : <PauseCircleIcon />}
                          fullWidth
                          size="large"
                        >
                          Propose Pause
                        </Button>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Button
                          variant="contained"
                          color="success"
                          onClick={handleProposeUnpause}
                          disabled={loading || !isSafeOwner}
                          startIcon={loading ? <CircularProgress size={20} /> : <PlayCircleIcon />}
                          fullWidth
                          size="large"
                        >
                          Propose Unpause
                        </Button>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Pending Transactions Card */}
              <Grid item xs={12}>
                <Card>
                  <CardHeader
                    title="Pending Transactions"
                    action={
                      <Chip
                        label={`${pendingTransactions.length} Pending`}
                        color={pendingTransactions.length > 0 ? "warning" : "default"}
                      />
                    }
                  />
                  <Divider />
                  <CardContent>
                    {pendingTransactions.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          No pending transactions. Propose an action above to get started.
                        </Typography>
                      </Box>
                    ) : (
                      <List>
                        {pendingTransactions.map((tx, index) => {
                          const requiredSigs = safeInfo?.threshold || 2;
                          const currentSigs = tx.confirmations?.length || 0;
                          const canExecute = currentSigs >= requiredSigs;
                          const hasUserSigned = tx.confirmations?.some(
                            conf => conf.owner.toLowerCase() === account?.toLowerCase()
                          );

                          // Decode function name from data
                          let actionName = 'Unknown';
                          try {
                            const iface = new ethers.Interface([
                              'function pause()',
                              'function unpause()',
                            ]);
                            const decoded = iface.parseTransaction({ data: tx.data });
                            actionName = decoded.name;
                          } catch (e) {
                            // Unable to decode
                          }

                          return (
                            <Paper
                              key={index}
                              elevation={2}
                              sx={{
                                p: 2,
                                mb: 2,
                                border: canExecute ? '2px solid' : '1px solid',
                                borderColor: canExecute ? 'success.main' : 'divider'
                              }}
                            >
                              <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} md={6}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    {actionName === 'pause' ? (
                                      <PauseCircleIcon color="error" />
                                    ) : (
                                      <PlayCircleIcon color="success" />
                                    )}
                                    <Typography variant="h6">
                                      {actionName.charAt(0).toUpperCase() + actionName.slice(1)}
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" color="text.secondary" fontFamily="monospace" sx={{ mb: 1 }}>
                                    {tx.safeTxHash.substring(0, 20)}...
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip
                                      icon={hasUserSigned ? <CheckCircleIcon /> : <HourglassEmptyIcon />}
                                      label={hasUserSigned ? "You Signed" : "Not Signed"}
                                      color={hasUserSigned ? "success" : "default"}
                                      size="small"
                                    />
                                    <Chip
                                      label={`${currentSigs}/${requiredSigs} Signatures`}
                                      color={canExecute ? "success" : "warning"}
                                      size="small"
                                    />
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                                    <Button
                                      variant="outlined"
                                      onClick={() => handleSignTransaction(tx.safeTxHash)}
                                      disabled={loading || !isSafeOwner || hasUserSigned}
                                      startIcon={<CheckCircleIcon />}
                                      fullWidth
                                    >
                                      {hasUserSigned ? 'Signed' : 'Sign'}
                                    </Button>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      onClick={() => handleExecuteTransaction(tx.safeTxHash)}
                                      disabled={loading || !isSafeOwner || !canExecute}
                                      startIcon={<PlayCircleIcon />}
                                      fullWidth
                                    >
                                      Execute
                                    </Button>
                                  </Box>
                                </Grid>
                              </Grid>
                            </Paper>
                          );
                        })}
                      </List>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </Box>
      )}
    </>
  );
}
