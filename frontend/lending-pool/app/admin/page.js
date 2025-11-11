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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { getLendingPoolContract, getPriceRouterContract, getLiquidationContract, getInterestRateModelContract, getToken } from '@/lib/web3';

export default function AdminPage() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [account, setAccount] = useState(null);

  // LendingPool states
  const [collateralFactor, setCollateralFactor] = useState('');
  const [newMarketAsset, setNewMarketAsset] = useState('');
  const [newMarketIRM, setNewMarketIRM] = useState('');
  const [markets, setMarkets] = useState([]);
  const [adminAddress, setAdminAddress] = useState('');
  const [adminStatus, setAdminStatus] = useState(true);

  // PriceRouter states
  const [priceAsset, setPriceAsset] = useState('');
  const [priceFeed, setPriceFeed] = useState('');
  const [priceSource, setPriceSource] = useState('chainlink'); // 'chainlink' or 'myoracle'
  const [oracleAsset, setOracleAsset] = useState('');
  const [oraclePrice, setOraclePrice] = useState('');

  // Liquidation states
  const [liquidationThreshold, setLiquidationThreshold] = useState('');
  const [closeFactor, setCloseFactor] = useState('');
  const [liquidationIncentive, setLiquidationIncentive] = useState('');

  // InterestRateModel states
  const [baseRate, setBaseRate] = useState('');
  const [rateSlope1, setRateSlope1] = useState('');
  const [rateSlope2, setRateSlope2] = useState('');
  const [optimalUtilization, setOptimalUtilization] = useState('');
  const [reserveFactor, setReserveFactor] = useState('');

  useEffect(() => {
    checkAdminStatus();
    loadCurrentValues();
  }, []);

  const checkAdminStatus = async () => {
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        const lendingPool = await getLendingPoolContract();
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          const adminStatus = await lendingPool.isAdmin(accounts[0]);
          console.log(adminStatus);
          setIsAdmin(adminStatus);
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
      setMarkets(allMarkets);

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
  const handleSetCollateralFactor = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const value = ethers.parseUnits(collateralFactor, 18);
      const tx = await lendingPool.setCollateralParams(value);
      await tx.wait();
      showSuccess('Collateral factor updated successfully!');
      loadCurrentValues();
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSupportMarket = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const tx = await lendingPool.supportMarket(newMarketAsset, newMarketIRM);
      await tx.wait();
      showSuccess('Market supported successfully!');
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

  const handleSetAdmin = async () => {
    try {
      setLoading(true);
      const lendingPool = await getLendingPoolContract();
      const tx = await lendingPool.setAdmin(adminAddress, adminStatus);
      await tx.wait();
      showSuccess(`Admin ${adminStatus ? 'added' : 'removed'} successfully!`);
      setAdminAddress('');
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // PriceRouter functions
  const handleSetPriceFeed = async () => {
    try {
      setLoading(true);
      const priceRouter = await getPriceRouterContract();
      let tx;
      if (priceSource === 'chainlink') {
        tx = await priceRouter.setChainlinkFeed(priceAsset, priceFeed);
      } else {
        tx = await priceRouter.setMyOracleFeed(priceAsset);
      }
      await tx.wait();
      showSuccess('Price feed set successfully!');
      setPriceAsset('');
      setPriceFeed('');
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetOraclePrice = async () => {
    try {
      setLoading(true);
      const priceRouter = await getPriceRouterContract();
      const myOracleAddress = await priceRouter.myOracle();
      
      // Get MyOracle contract
      const myOracleABI = [
        "function setPrice(address asset, uint price) external"
      ];
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const myOracle = new ethers.Contract(myOracleAddress, myOracleABI, signer);
      
      const price = ethers.parseUnits(oraclePrice, 18);
      const tx = await myOracle.setPrice(oracleAsset, price);
      await tx.wait();
      showSuccess('Oracle price set successfully!');
      setOracleAsset('');
      setOraclePrice('');
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Liquidation functions
  const handleSetLiquidationParams = async () => {
    try {
      setLoading(true);
      const liquidation = await getLiquidationContract();
      const lt = ethers.parseUnits(liquidationThreshold, 18);
      const cf = ethers.parseUnits(closeFactor, 18);
      const li = ethers.parseUnits(liquidationIncentive, 18);
      const tx = await liquidation.setLiquidateParams(lt, cf, li);
      await tx.wait();
      showSuccess('Liquidation parameters updated successfully!');
      loadCurrentValues();
    } catch (err) {
      showError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin && account) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <Typography variant="h6">Access Denied</Typography>
          <Typography>You are not authorized to access the admin panel.</Typography>
        </Alert>
      </Box>
    );
  }

  return (
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
          <Tab label="Lending Pool" />
          <Tab label="Price Router" />
          <Tab label="Liquidation" />
          <Tab label="Interest Rate Model" />
        </Tabs>
      </Paper>

      {/* Lending Pool Tab */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Collateral Factor" />
              <Divider />
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Current: {collateralFactor || 'Loading...'}
                </Typography>
                <TextField
                  fullWidth
                  label="Collateral Factor (0-1)"
                  value={collateralFactor}
                  onChange={(e) => setCollateralFactor(e.target.value)}
                  type="number"
                  inputProps={{ step: "0.01" }}
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="contained"
                  onClick={handleSetCollateralFactor}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  fullWidth
                >
                  Update
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Admin Management" />
              <Divider />
              <CardContent>
                <TextField
                  fullWidth
                  label="Admin Address"
                  value={adminAddress}
                  onChange={(e) => setAdminAddress(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant={adminStatus ? "contained" : "outlined"}
                    onClick={() => setAdminStatus(true)}
                    sx={{ mr: 1 }}
                  >
                    Add Admin
                  </Button>
                  <Button
                    variant={!adminStatus ? "contained" : "outlined"}
                    onClick={() => setAdminStatus(false)}
                  >
                    Remove Admin
                  </Button>
                </Box>
                <Button
                  variant="contained"
                  onClick={handleSetAdmin}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  fullWidth
                >
                  Update
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardHeader 
                title="Market Management" 
                action={
                  <Chip label={`${markets.length} Markets`} color="primary" />
                }
              />
              <Divider />
              <CardContent>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={5}>
                    <TextField
                      fullWidth
                      label="Asset Address"
                      value={newMarketAsset}
                      onChange={(e) => setNewMarketAsset(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    <TextField
                      fullWidth
                      label="Interest Rate Model Address"
                      value={newMarketIRM}
                      onChange={(e) => setNewMarketIRM(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2}>
                    <Button
                      variant="contained"
                      onClick={handleSupportMarket}
                      disabled={loading}
                      startIcon={<AddIcon />}
                      fullWidth
                      sx={{ height: '56px' }}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>

                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Supported Markets
                </Typography>
                <List>
                  {markets.map((market, index) => (
                    <ListItem
                      key={index}
                      secondaryAction={
                        <IconButton edge="end" onClick={() => handleUnsupportMarket(market)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      }
                      sx={{ bgcolor: 'background.paper', mb: 1, borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={market}
                        primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                      />
                    </ListItem>
                  ))}
                  {markets.length === 0 && (
                    <Typography color="text.secondary" textAlign="center">No markets supported yet</Typography>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Price Router Tab */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Set Price Feed" />
              <Divider />
              <CardContent>
                <TextField
                  fullWidth
                  label="Asset Address"
                  value={priceAsset}
                  onChange={(e) => setPriceAsset(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant={priceSource === 'chainlink' ? "contained" : "outlined"}
                    onClick={() => setPriceSource('chainlink')}
                    sx={{ mr: 1 }}
                  >
                    Chainlink
                  </Button>
                  <Button
                    variant={priceSource === 'myoracle' ? "contained" : "outlined"}
                    onClick={() => setPriceSource('myoracle')}
                  >
                    My Oracle
                  </Button>
                </Box>
                {priceSource === 'chainlink' && (
                  <TextField
                    fullWidth
                    label="Chainlink Feed Address"
                    value={priceFeed}
                    onChange={(e) => setPriceFeed(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                )}
                <Button
                  variant="contained"
                  onClick={handleSetPriceFeed}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  fullWidth
                >
                  Set Feed
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Set Oracle Price" />
              <Divider />
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Manually set price for assets using MyOracle
                </Typography>
                <TextField
                  fullWidth
                  label="Asset Address"
                  value={oracleAsset}
                  onChange={(e) => setOracleAsset(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label="Price (in USD, 18 decimals)"
                  value={oraclePrice}
                  onChange={(e) => setOraclePrice(e.target.value)}
                  type="number"
                  inputProps={{ step: "0.000001" }}
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="contained"
                  onClick={handleSetOraclePrice}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  fullWidth
                >
                  Set Price
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Liquidation Tab */}
      {tabValue === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardHeader title="Liquidation Parameters" />
              <Divider />
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Liquidation Threshold (0-1)"
                      value={liquidationThreshold}
                      onChange={(e) => setLiquidationThreshold(e.target.value)}
                      type="number"
                      inputProps={{ step: "0.01" }}
                      helperText="Threshold at which accounts become liquidatable"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Close Factor (0-1)"
                      value={closeFactor}
                      onChange={(e) => setCloseFactor(e.target.value)}
                      type="number"
                      inputProps={{ step: "0.01" }}
                      helperText="Maximum portion of borrow that can be repaid"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Liquidation Incentive (0-1)"
                      value={liquidationIncentive}
                      onChange={(e) => setLiquidationIncentive(e.target.value)}
                      type="number"
                      inputProps={{ step: "0.01" }}
                      helperText="Bonus for liquidators"
                    />
                  </Grid>
                </Grid>
                <Button
                  variant="contained"
                  onClick={handleSetLiquidationParams}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  fullWidth
                  sx={{ mt: 3 }}
                >
                  Update All Parameters
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Interest Rate Model Tab */}
      {tabValue === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardHeader title="Interest Rate Model Parameters" />
              <Divider />
              <CardContent>
                <Alert severity="info" sx={{ mb: 3 }}>
                  These parameters are read-only. The Interest Rate Model contract doesn't support updates after deployment.
                </Alert>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Base Rate"
                      value={baseRate}
                      disabled
                      helperText="Base interest rate"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Rate Slope 1"
                      value={rateSlope1}
                      disabled
                      helperText="Rate increase before optimal"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      label="Rate Slope 2"
                      value={rateSlope2}
                      disabled
                      helperText="Rate increase after optimal"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Optimal Utilization"
                      value={optimalUtilization}
                      disabled
                      helperText="Target utilization rate"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Reserve Factor"
                      value={reserveFactor}
                      disabled
                      helperText="Portion reserved for protocol"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
