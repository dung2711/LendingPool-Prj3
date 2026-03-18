"use client";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import Link from "next/link";
import { type ReactElement, useEffect, useState } from "react";
import { web3Service } from "@/lib/web3";
import { assetService } from "@/services/assetService";
import { marketConfigService } from "@/services/marketConfigService";

interface MarketData {
  symbol: string;
  assetAddress: string;
  totalDeposits: bigint;
  totalBorrows: bigint;
  depositsUSD: bigint;
  borrowsUSD: bigint;
  price: bigint;
  depositRate: bigint;
  borrowRate: bigint;
  utilizationRate: bigint;
}

export default function Home(): ReactElement {
  const SCALE = 10n ** 18n;

  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    checkWalletAndFetch();

    // Listen for account changes
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]): void => {
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchMarkets();
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum?.removeListener(
          "accountsChanged",
          handleAccountsChanged,
        );
      };
    }
    if (pageLoading) setPageLoading(false);
  }, []);

  const checkWalletAndFetch = async (): Promise<void> => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setPageLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const accounts = await provider.send("eth_accounts", []);
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchMarkets();
        }
      } catch (err) {
        console.error("Error checking wallet:", err);
      } finally {
        setPageLoading(false);
      }
    }
  };

  const fetchMarkets = async (): Promise<void> => {
    try {
      setLoading(true);

      // Get all supported markets
      const allMarkets = await assetService.getAllAssets();
      const priceRouter = await web3Service.getPriceRouterContract();

      // Fetch market info for each market
      const marketData = await Promise.all(
        allMarkets.map(async (market) => {
          try {
            if (!market.isSupported) {
              return null;
            }
            const marketConfig = await marketConfigService.getMarketConfig(
              market.assetAddress,
            );
            const deposits = BigInt(
              ethers.parseUnits(market.totalDeposited, 18 - market.decimals),
            );
            const borrows = BigInt(
              ethers.parseUnits(market.totalBorrowed, 18 - market.decimals),
            );

            // Get asset price from PriceRouter (18 decimals)
            let price = 0n;
            let depositsUSD = 0n;
            let borrowsUSD = 0n;
            try {
              price = await priceRouter.getPrice(market.assetAddress);
              // Calculate USD values: (amount * price) / 10^decimals
              // Both are in 18 decimals, so result is in 18 decimals
              depositsUSD = (deposits * price) / SCALE;
              borrowsUSD = (borrows * price) / SCALE;
            } catch (err) {
              console.warn(
                `Could not fetch price for ${market.symbol}:`,
                err instanceof Error ? err.message : String(err),
              );
            }

            let utilizationRate: bigint;
            if (deposits === 0n) {
              utilizationRate = 0n;
            } else {
              utilizationRate = (borrows * SCALE) / deposits;
            }
            const borrowRate = getBorrowRate(utilizationRate, marketConfig);
            const depositRate = getDepositRate(utilizationRate, marketConfig);

            return {
              symbol: market.symbol,
              assetAddress: market.assetAddress,
              totalDeposits: deposits,
              totalBorrows: borrows,
              depositsUSD,
              borrowsUSD,
              price,
              depositRate: depositRate,
              borrowRate: borrowRate,
              utilizationRate: utilizationRate,
            };
          } catch (err) {
            console.error(
              `Error fetching market info for ${market.assetAddress}:`,
              err,
            );
            return null;
          }
        }),
      );

      // Filter out null values (failed fetches)
      setMarkets(marketData.filter((m) => m !== null) as MarketData[]);
      setError(null);
    } catch (err) {
      console.error("Error fetching markets:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const getBorrowRate = (
    utilizationRate: bigint,
    marketConfig: any,
  ): bigint => {
    const { baseRate, slope1, slope2, optimalUtilization } = marketConfig;

    // Convert all values to BigInt
    const baseRateBN = BigInt(baseRate);
    const slope1BN = BigInt(slope1);
    const slope2BN = BigInt(slope2);
    const optimalUtilizationBN = BigInt(optimalUtilization);
    const utilizationRateBN = BigInt(utilizationRate);

    if (utilizationRateBN <= optimalUtilizationBN) {
      return baseRateBN + (utilizationRateBN * slope1BN) / SCALE;
    } else {
      const normalRate = baseRateBN + (slope1BN * optimalUtilizationBN) / SCALE;
      const excessRate =
        ((utilizationRateBN - optimalUtilizationBN) * slope2BN) / SCALE;
      return normalRate + excessRate;
    }
  };

  const getDepositRate = (
    utilizationRate: bigint,
    marketConfig: any,
  ): bigint => {
    const borrowRate = getBorrowRate(utilizationRate, marketConfig);
    const { reserveFactor } = marketConfig;

    // Convert all values to BigInt
    const reserveFactorBN = BigInt(reserveFactor);
    const utilizationRateBN = BigInt(utilizationRate);

    return (
      (borrowRate * utilizationRateBN * (SCALE - reserveFactorBN)) /
      (SCALE * SCALE)
    );
  };

  const formatRate = (rate: bigint): string => {
    // Convert from 18 decimals to percentage
    const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
    return `${rateNum.toFixed(2)}%`;
  };

  const formatAmount = (amount: bigint): string =>
    parseFloat(ethers.formatEther(amount)).toFixed(4);

  const formatUtilization = (utilization: bigint): string => {
    const utilizationNum =
      parseFloat(ethers.formatUnits(utilization, 18)) * 100;
    return `${utilizationNum.toFixed(2)}%`;
  };

  return (
    <Box
      sx={{
        maxWidth: 1400,
        mx: "auto",
        px: { xs: 1, sm: 2, md: 3 },
        py: { xs: 2, sm: 3, md: 4 },
      }}
    >
      {/* Header Section */}
      <Box textAlign="center" mb={{ xs: 4, md: 6 }}>
        <Typography
          variant="h3"
          fontWeight="bold"
          gutterBottom
          sx={{ fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" } }}
        >
          Welcome to Lending Pool DApp
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          mb={4}
          sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
        >
          Supply assets to earn interest or borrow against your collateral
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Button
            component={Link}
            href="/supply"
            variant="contained"
            color="primary"
            size="large"
            startIcon={<AccountBalanceIcon />}
            sx={{ minWidth: { xs: "140px", sm: "160px" } }}
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
            sx={{ minWidth: { xs: "140px", sm: "160px" } }}
          >
            Borrow Assets
          </Button>
        </Box>
      </Box>

      {/* Markets Table Section */}
      <Box>
        <Typography
          variant="h4"
          fontWeight="bold"
          mb={3}
          sx={{ fontSize: { xs: "1.5rem", sm: "2rem", md: "2.125rem" } }}
        >
          Supported Markets
        </Typography>

        {pageLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : !account ? (
          <Card
            sx={{ bgcolor: "warning.light", color: "warning.contrastText" }}
          >
            <CardContent sx={{ textAlign: "center", py: 4 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                Account Not Detected
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Please connect MetaMask or another Web3 wallet to view markets
                and interact with the protocol.
              </Typography>
            </CardContent>
          </Card>
        ) : loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Card sx={{ bgcolor: "error.light", color: "error.contrastText" }}>
            <CardContent>
              <Typography variant="h6">Error loading markets</Typography>
              <Typography variant="body2">{error}</Typography>
              <Button variant="contained" onClick={fetchMarkets} sx={{ mt: 2 }}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent>
              <Typography
                variant="h6"
                color="text.secondary"
                textAlign="center"
              >
                No markets available yet
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer
            component={Paper}
            elevation={2}
            sx={{ overflowX: "auto" }}
          >
            <Table sx={{ minWidth: { xs: 300, sm: 650 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "primary.main" }}>
                  <TableCell
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Asset
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      display: { xs: "none", sm: "table-cell" },
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Total Deposits
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      display: { xs: "none", sm: "table-cell" },
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Total Borrows
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Utilization
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Deposit APY
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color: "white",
                      fontWeight: "bold",
                      display: { xs: "none", md: "table-cell" },
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    }}
                  >
                    Borrow APY
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {markets.map((market) => (
                  <TableRow
                    key={market.assetAddress}
                    sx={{ "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <TableCell sx={{ fontWeight: "bold" }}>
                      {market.symbol}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ display: { xs: "none", sm: "table-cell" } }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {formatAmount(market.totalDeposits)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ${formatAmount(market.depositsUSD)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ display: { xs: "none", sm: "table-cell" } }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {formatAmount(market.totalBorrows)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ${formatAmount(market.borrowsUSD)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={formatUtilization(market.utilizationRate)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        color="success.main"
                        fontWeight="medium"
                      >
                        {formatRate(market.depositRate)}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ display: { xs: "none", md: "table-cell" } }}
                    >
                      <Typography
                        variant="body2"
                        color="error.main"
                        fontWeight="medium"
                      >
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
    </Box>
  );
}
