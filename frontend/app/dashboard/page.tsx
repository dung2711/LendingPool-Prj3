"use client";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import { web3Service } from "@/lib/web3";
import { assetService } from "@/services/assetService";
import { userAssetService } from "@/services/userAssetService";

interface MarketData {
  address: string;
  symbol: string;
  decimals: number;
  deposited: bigint;
  borrowed: bigint;
  depositedUSD: bigint;
  borrowedUSD: bigint;
  depositRate: bigint;
  borrowRate: bigint;
}

export default function Dashboard(): ReactElement {
  const [account, setAccount] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [_userInfo, setUserInfo] = useState<any>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [totalSuppliedUSD, setTotalSuppliedUSD] = useState(0n);
  const [totalBorrowedUSD, setTotalBorrowedUSD] = useState(0n);
  const [healthFactor, setHealthFactor] = useState(0n);
  const [netAPY, setNetAPY] = useState(0);
  const [collateralFactor, setCollateralFactor] = useState(0n);

  useEffect(() => {
    checkWalletAndFetch();

    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]): void => {
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchData();
        } else {
          setUserInfo(null);
          setMarkets([]);
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
          fetchData();
        }
      } catch (err) {
        console.error("Error checking wallet:", err);
      } finally {
        setPageLoading(false);
      }
    }
  };

  const fetchData = async (): Promise<void> => {
    try {
      setLoading(true);
      const lendingPool = await web3Service.getLendingPoolContract();
      const priceRouter = await web3Service.getPriceRouterContract();
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // Fetch user balances and asset metadata from backend
      const [userData, allAssets] = await Promise.all([
        userAssetService.getAssetsByUser(userAddress),
        assetService.getAllAssets(),
      ]);

      // Create asset lookup map
      const assetMap: Record<string, any> = {};
      allAssets.forEach((asset) => {
        assetMap[asset.assetAddress.toLowerCase()] = {
          symbol: asset.symbol,
          decimals: asset.decimals,
          assetAddress: asset.assetAddress,
        };
      });

      // Get collateral factor from blockchain
      const collateralFactorValue = await lendingPool.collateralFactor();
      setCollateralFactor(collateralFactorValue);

      // Fetch prices and rates from blockchain for user's assets
      const marketData =
        !userData?.assets || userData.assets.length === 0
          ? []
          : await Promise.all(
              userData.assets.map(async (userAsset) => {
                try {
                  const asset = assetMap[userAsset.assetAddress.toLowerCase()];
                  if (!asset) return null;

                  const [assetPrice, marketInfo] = await Promise.all([
                    priceRouter.getPrice(userAsset.assetAddress),
                    lendingPool.getMarketInfo(userAsset.assetAddress),
                  ]);

                  // Convert backend string amounts to BigInt
                  const depositedAmount = BigInt(userAsset.depositedAmount); // Already in token decimals
                  const borrowedAmount = BigInt(userAsset.borrowedAmount); // Already in token decimals

                  // assetPrice is 18 decimals, amounts are in token decimals
                  // Normalize to 18 decimal USD
                  const depositedUSD =
                    (assetPrice * depositedAmount) /
                    10n ** BigInt(asset.decimals);
                  const borrowedUSD =
                    (assetPrice * borrowedAmount) /
                    10n ** BigInt(asset.decimals);

                  return {
                    address: userAsset.assetAddress,
                    symbol: asset.symbol,
                    decimals: asset.decimals,
                    deposited:
                      depositedAmount * 10n ** (18n - BigInt(asset.decimals)), // normalize to 18 decimals for display
                    borrowed:
                      borrowedAmount * 10n ** (18n - BigInt(asset.decimals)), // normalize to 18 decimals for display
                    depositedUSD,
                    borrowedUSD,
                    depositRate: marketInfo.depositRate,
                    borrowRate: marketInfo.borrowRate,
                  };
                } catch (err) {
                  console.error(
                    `Error fetching data for ${userAsset.assetAddress}:`,
                    err,
                  );
                  return null;
                }
              }),
            );

      const validMarkets = marketData.filter((m) => m !== null) as MarketData[];
      setMarkets(validMarkets);

      // Calculate totals
      let totalSupplied = 0n;
      let totalBorrowed = 0n;

      validMarkets.forEach((market) => {
        totalSupplied += market.depositedUSD;
        totalBorrowed += market.borrowedUSD;
      });

      setTotalSuppliedUSD(totalSupplied);
      setTotalBorrowedUSD(totalBorrowed);

      // Calculate health factor
      if (totalBorrowed === 0n) {
        setHealthFactor(
          BigInt(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          ),
        );
      } else {
        const hf = (totalSupplied * collateralFactorValue) / totalBorrowed;
        setHealthFactor(hf);
      }

      // Calculate net APY
      if (totalSupplied > 0n) {
        let totalSupplyInterestUSD = 0n;
        let totalBorrowInterestUSD = 0n;

        validMarkets.forEach((market) => {
          if (market.depositedUSD > 0n) {
            totalSupplyInterestUSD +=
              (market.depositedUSD * market.depositRate) / 10n ** 18n;
          }
          if (market.borrowedUSD > 0n) {
            totalBorrowInterestUSD +=
              (market.borrowedUSD * market.borrowRate) / 10n ** 18n;
          }
        });

        const netInterestUSD = totalSupplyInterestUSD - totalBorrowInterestUSD;
        const netAPYValue = Number((netInterestUSD * 100n) / totalSupplied);
        setNetAPY(netAPYValue);
      } else {
        setNetAPY(0);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatRate = (rate: bigint): string => {
    const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
    return `${rateNum.toFixed(2)}%`;
  };

  const formatAmount = (amount: bigint): string => {
    const formated = ethers.formatEther(amount);
    return parseFloat(formated).toFixed(4);
  };

  const formatHealthFactor = (hf: bigint): string => {
    if (
      hf ===
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )
    ) {
      return "∞";
    }
    return formatAmount(hf);
  };

  const getHealthFactorColor = (
    hf: bigint,
  ): "success" | "error" | "warning" => {
    if (
      hf ===
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )
    ) {
      return "success";
    }
    const hfNum = Number(hf) / 1e18;
    if (hfNum < 1.2) return "error";
    if (hfNum < 1.5) return "warning";
    return "success";
  };

  const getHealthFactorStatus = (hf: bigint): string => {
    if (
      hf ===
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )
    ) {
      return "Excellent";
    }
    const hfNum = Number(hf) / 1e18;
    if (hfNum < 1.2) return "Critical";
    if (hfNum < 1.5) return "Risky";
    if (hfNum < 2) return "Moderate";
    return "Healthy";
  };

  const calculateBorrowLimit = (): number => {
    if (totalSuppliedUSD === 0n || collateralFactor === 0n) return 0;
    // Calculate max borrowable amount: totalSupplied * collateralFactor / 1e18
    const maxBorrowableUSD = (totalSuppliedUSD * collateralFactor) / 10n ** 18n;
    // Calculate percentage of borrow limit used
    return Number((totalBorrowedUSD * 100n) / maxBorrowableUSD);
  };

  if (pageLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={60} />
      </Box>
    );
  } else if (!account) {
    return (
      <Box sx={{ p: 3 }}>
        <Card sx={{ bgcolor: "warning.light", color: "warning.contrastText" }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Account Not Detected
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Please connect MetaMask or another Web3 wallet to view your
              dashboard.
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
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress size={60} />
        </Box>
      ) : (
        <>
          {/* Overview Cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "repeat(4, 1fr)",
              },
              gap: 3,
              mb: 4,
            }}
          >
            {/* Total Supplied */}
            <Box>
              <Card
                elevation={3}
                sx={{
                  height: "100%",
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                    <TrendingUpIcon sx={{ color: "white", mr: 1 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: "rgba(255,255,255,0.9)" }}
                    >
                      Total Supplied
                    </Typography>
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: "white" }}
                  >
                    ${formatAmount(totalSuppliedUSD)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Total Borrowed */}
            <Box>
              <Card
                elevation={3}
                sx={{
                  height: "100%",
                  background:
                    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                    <TrendingDownIcon sx={{ color: "white", mr: 1 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: "rgba(255,255,255,0.9)" }}
                    >
                      Total Borrowed
                    </Typography>
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: "white" }}
                  >
                    ${formatAmount(totalBorrowedUSD)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Net APY */}
            <Box>
              <Card
                elevation={3}
                sx={{
                  height: "100%",
                  background:
                    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                    <AccountBalanceIcon sx={{ color: "white", mr: 1 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: "rgba(255,255,255,0.9)" }}
                    >
                      Net APY
                    </Typography>
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: "white" }}
                  >
                    {netAPY.toFixed(2)}%
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Health Factor */}
            <Box>
              <Card
                elevation={3}
                sx={{
                  height: "100%",
                  background: `linear-gradient(135deg, ${
                    getHealthFactorColor(healthFactor) === "success"
                      ? "#84fab0 0%, #8fd3f4"
                      : getHealthFactorColor(healthFactor) === "warning"
                        ? "#fa709a 0%, #fee140"
                        : "#ff6b6b 0%, #ee5a6f"
                  } 100%)`,
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: "rgba(255,255,255,0.9)" }}
                    >
                      Health Factor
                    </Typography>
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: "white" }}
                  >
                    {formatHealthFactor(healthFactor)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {getHealthFactorStatus(healthFactor)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Borrow Limit Progress */}
          {totalSuppliedUSD > 0n && (
            <Card elevation={3} sx={{ mb: 4 }}>
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Borrow Limit Used
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ${formatAmount(totalBorrowedUSD)} / $
                    {formatAmount(
                      (totalSuppliedUSD * collateralFactor) / 10n ** 18n,
                    )}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(calculateBorrowLimit(), 100)}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </CardContent>
            </Card>
          )}

          {/* Markets Table */}
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" mb={3}>
                Your Assets
              </Typography>
              {markets.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  No assets yet. Start by supplying or borrowing assets.
                </Typography>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "grey.100" }}>
                        <TableCell sx={{ fontWeight: "bold" }}>Asset</TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Supplied
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Borrowed
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Supply APY
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Borrow APY
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {markets.map((market) => (
                        <TableRow key={market.address}>
                          <TableCell sx={{ fontWeight: "bold" }}>
                            {market.symbol}
                          </TableCell>
                          <TableCell align="right">
                            <Box>
                              <Typography variant="body2" fontWeight="medium">
                                {formatAmount(market.deposited)}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                ${formatAmount(market.depositedUSD)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Box>
                              <Typography variant="body2" fontWeight="medium">
                                {formatAmount(market.borrowed)}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                ${formatAmount(market.borrowedUSD)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={formatRate(market.depositRate)}
                              color="success"
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={formatRate(market.borrowRate)}
                              color="error"
                              size="small"
                            />
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
