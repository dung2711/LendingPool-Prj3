"use client";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import axios from "axios";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import axiosClient from "@/lib/axios";
import { web3Service } from "@/lib/web3";
import { authService } from "@/services/authService";
import { snapshotService } from "@/services/snapshotService";
import { userAssetService } from "@/services/userAssetService";
import { userService } from "@/services/userService";

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

interface SnapshotChartPoint {
  timestamp: string;
  values: Record<string, number>;
}

const OTP_PURPOSE = "admin-noti-subscription";

const DEFAULT_CHAIN_ID = authService.normalizeChainId(
  process.env.NEXT_PUBLIC_CHAIN_ID || "11155111",
);

type ApiErrorResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  errors?: string | { errors?: string };
};

export default function Dashboard(): ReactElement {
  const [account, setAccount] = useState<string | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [_userInfo, setUserInfo] = useState<any>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [totalSuppliedUSD, setTotalSuppliedUSD] = useState(0n);
  const [totalBorrowedUSD, setTotalBorrowedUSD] = useState(0n);
  const [healthFactor, setHealthFactor] = useState(0n);
  const [netAPY, setNetAPY] = useState(0);
  const [collateralFactor, setCollateralFactor] = useState(0n);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [emailLookupFound, setEmailLookupFound] = useState<boolean | null>(
    null,
  );
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [registeringEmail, setRegisteringEmail] = useState(false);
  const [activeChainId, setActiveChainId] = useState(DEFAULT_CHAIN_ID);
  const [userSnapshotPoints, setUserSnapshotPoints] = useState<
    SnapshotChartPoint[]
  >([]);
  const [assetSnapshotPoints, setAssetSnapshotPoints] = useState<
    SnapshotChartPoint[]
  >([]);
  const [selectedAssetSnapshotLabel, setSelectedAssetSnapshotLabel] =
    useState("Asset snapshot");
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const resolveCurrentChainId = async (): Promise<string> => {
    if (typeof window === "undefined" || !window.ethereum) {
      return DEFAULT_CHAIN_ID;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const walletChainId = authService.normalizeChainId(
        network.chainId.toString(),
      );
      return walletChainId || DEFAULT_CHAIN_ID;
    } catch (error) {
      console.error("Error resolving wallet chainId:", error);
      return DEFAULT_CHAIN_ID;
    }
  };

  // Extract the human-readable message from a BE error response.
  // BE always sends 4xx with { success: false, code, errors: string }.
  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data as ApiErrorResponse | undefined;
      if (typeof payload?.errors === "string" && payload.errors.trim())
        return payload.errors;
      if (
        payload?.errors &&
        typeof payload.errors === "object" &&
        typeof payload.errors.errors === "string" &&
        payload.errors.errors.trim()
      )
        return payload.errors.errors;
      if (typeof payload?.message === "string" && payload.message.trim())
        return payload.message;
      if (typeof payload?.code === "string" && payload.code.trim())
        return payload.code;
      return error.message || fallback;
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  };

  const formatDateInput = (date: Date): string =>
    date.toISOString().slice(0, 10);

  const toSnapshotNumber = (value: string, decimals: number): number => {
    try {
      return Number(ethers.formatUnits(value, decimals));
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    checkWalletAndFetch();

    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = async (
        accounts: string[],
      ): Promise<void> => {
        const nextAccount = accounts[0] || null;
        setAccount(nextAccount);
        if (nextAccount) {
          const sessionActive = await authService.ensureSession(nextAccount);
          setHasAccessToken(sessionActive);
          if (sessionActive) {
            void fetchData(undefined, true);
          } else {
            // clear data while user hasn't verified
            setUserInfo(null);
            setMarkets([]);
          }
        } else {
          setHasAccessToken(false);
          setUserInfo(null);
          setMarkets([]);
        }
      };

      const handleChainChanged = async (): Promise<void> => {
        if (typeof window === "undefined" || !window.ethereum) return;
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.send("eth_accounts", []);
          const nextAccount = accounts[0] || null;
          setAccount(nextAccount);
          if (!nextAccount) {
            setHasAccessToken(false);
            setUserInfo(null);
            setMarkets([]);
            return;
          }
          const sessionActive = await authService.ensureSession(nextAccount);
          setHasAccessToken(sessionActive);
          if (sessionActive) {
            void fetchData(undefined, true);
          } else {
            setUserInfo(null);
            setMarkets([]);
          }
        } catch (error) {
          console.error("Error handling chain change:", error);
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
      return () => {
        window.ethereum?.removeListener(
          "accountsChanged",
          handleAccountsChanged,
        );
        window.ethereum?.removeListener("chainChanged", handleChainChanged);
      };
    }
    if (pageLoading) setPageLoading(false);
  }, []);

  const checkWalletAndFetch = async (): Promise<void> => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setPageLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const resolvedChainId = await resolveCurrentChainId();
        setActiveChainId(resolvedChainId);
        const accounts = await provider.send("eth_accounts", []);
        const nextAccount = accounts[0] || null;
        setAccount(nextAccount);
        if (nextAccount) {
          const sessionActive = await authService.ensureSession(nextAccount);
          setHasAccessToken(sessionActive);
          if (sessionActive) {
            await fetchData(resolvedChainId, true);
          } else {
            setUserInfo(null);
            setMarkets([]);
          }
        } else {
          setHasAccessToken(false);
        }
      } catch (err) {
        console.error("Error checking wallet:", err);
      } finally {
        setPageLoading(false);
      }
    }
  };

  const fetchData = async (
    chainIdOverride?: string,
    skipAuth: boolean = false,
  ): Promise<void> => {
    try {
      setLoading(true);
      const lendingPool = await web3Service.getLendingPoolContract();
      const priceRouter = await web3Service.getPriceRouterContract();
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const resolvedChainId =
        chainIdOverride || (await resolveCurrentChainId()) || DEFAULT_CHAIN_ID;
      setActiveChainId(resolvedChainId);
      if (!skipAuth) {
        await authService.ensureAuthenticated(userAddress, resolvedChainId);
      }

      void loadEmailStatus(userAddress, resolvedChainId);

      // Fetch user balances and asset metadata from backend
      const userData = await userAssetService.getAssetsByUser(
        userAddress,
        resolvedChainId,
      );
      setHasAccessToken(true);

      // Create asset lookup map from dashboard payload
      const assetMap: Record<
        string,
        { id: string; symbol: string; decimals: number; assetAddress: string }
      > = {};
      (userData.assets || []).forEach((asset) => {
        const assetId =
          "assetId" in asset && typeof asset.assetId === "string"
            ? asset.assetId
            : "id" in asset && typeof asset.id === "string"
              ? asset.id
              : "";
        assetMap[asset.assetAddress.toLowerCase()] = {
          id: assetId,
          symbol: asset.symbol,
          decimals: asset.decimals,
          assetAddress: asset.assetAddress,
        };
      });

      // Get collateral factor from blockchain
      const collateralFactorValue = await lendingPool.collateralFactor();
      setCollateralFactor(collateralFactorValue);

      const normalizeTo18 = (amount: bigint, decimals: number): bigint => {
        if (decimals === 18) return amount;
        if (decimals < 18) return amount * 10n ** BigInt(18 - decimals);
        return amount / 10n ** BigInt(decimals - 18);
      };

      // Fetch prices and rates from blockchain for user's assets
      const marketData =
        !userData?.assets || userData.assets.length === 0
          ? []
          : await Promise.all(
              userData.assets.map(async (userAsset) => {
                const asset = assetMap[
                  userAsset.assetAddress.toLowerCase()
                ] ?? {
                  id: "",
                  symbol: userAsset.symbol,
                  decimals: userAsset.decimals,
                  assetAddress: userAsset.assetAddress,
                };
                const decimals = Number.isFinite(asset.decimals)
                  ? Math.trunc(asset.decimals)
                  : 18;

                // Convert backend string amounts to BigInt
                const depositedAmount = BigInt(userAsset.depositedAmount); // Already in token decimals
                const borrowedAmount = BigInt(userAsset.borrowedAmount); // Already in token decimals

                const deposited = normalizeTo18(depositedAmount, decimals);
                const borrowed = normalizeTo18(borrowedAmount, decimals);

                try {
                  const [assetPrice, marketInfo] = await Promise.all([
                    priceRouter.getPrice(userAsset.assetAddress),
                    lendingPool.getMarketInfo(userAsset.assetAddress),
                  ]);

                  // assetPrice is 18 decimals, amounts are in token decimals
                  // Normalize to 18 decimal USD
                  const depositedUSD =
                    (assetPrice * depositedAmount) / 10n ** BigInt(decimals);
                  const borrowedUSD =
                    (assetPrice * borrowedAmount) / 10n ** BigInt(decimals);

                  return {
                    address: userAsset.assetAddress,
                    symbol: asset.symbol,
                    decimals,
                    deposited,
                    borrowed,
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
                  return {
                    address: userAsset.assetAddress,
                    symbol: asset.symbol,
                    decimals,
                    deposited,
                    borrowed,
                    depositedUSD: 0n,
                    borrowedUSD: 0n,
                    depositRate: 0n,
                    borrowRate: 0n,
                  };
                }
              }),
            );

      const validMarkets = marketData.filter(
        (m): m is MarketData => m !== null,
      );
      setMarkets(validMarkets);

      const portfolioAsset = validMarkets[0]
        ? assetMap[validMarkets[0].address.toLowerCase()]
        : null;

      if (portfolioAsset) {
        setSelectedAssetSnapshotLabel(`${portfolioAsset.symbol} snapshot`);
      } else {
        setSelectedAssetSnapshotLabel("Asset snapshot");
      }

      const snapshotFromDate = formatDateInput(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      );
      const snapshotToDate = formatDateInput(new Date());

      setSnapshotLoading(true);
      try {
        const [userSnapshots, assetSnapshots] = await Promise.all([
          snapshotService.getUserSnapshots({
            address: userAddress,
            chainId: resolvedChainId,
            fromDate: snapshotFromDate,
            toDate: snapshotToDate,
            interval: "1d",
          }),
          portfolioAsset
            ? snapshotService.getAssetSnapshots({
                assetId: String(portfolioAsset.id),
                fromDate: snapshotFromDate,
                toDate: snapshotToDate,
                interval: "1d",
              })
            : Promise.resolve([]),
        ]);

        setUserSnapshotPoints(
          userSnapshots.map((item) => ({
            timestamp: item.createdAt,
            values: {
              deposited: toSnapshotNumber(item.totalDepositedUSD, 18),
              borrowed: toSnapshotNumber(item.totalBorrowedUSD, 18),
              netWorth: toSnapshotNumber(item.netWorthUSD, 18),
            },
          })),
        );

        setAssetSnapshotPoints(
          assetSnapshots.map((item) => ({
            timestamp: item.createdAt,
            values: {
              deposited: toSnapshotNumber(
                item.totalDeposited,
                portfolioAsset?.decimals ?? 18,
              ),
              borrowed: toSnapshotNumber(
                item.totalBorrowed,
                portfolioAsset?.decimals ?? 18,
              ),
              treasury: toSnapshotNumber(
                item.treasuryBalance,
                portfolioAsset?.decimals ?? 18,
              ),
            },
          })),
        );
      } catch (snapshotError) {
        console.error("Error loading snapshot charts:", snapshotError);
        setUserSnapshotPoints([]);
        setAssetSnapshotPoints([]);
      } finally {
        setSnapshotLoading(false);
      }

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

  const loadEmailStatus = async (
    userAddress: string,
    chainId: string,
  ): Promise<void> => {
    try {
      setEmailLookupLoading(true);
      const result = await userService.getEmailByAddress(userAddress, chainId);
      setRegisteredEmail(result.email);
      setEmailLookupFound(result.found);
    } catch (err) {
      console.error("Error fetching email status:", err);
      setRegisteredEmail(null);
      setEmailLookupFound(null);
    } finally {
      setEmailLookupLoading(false);
    }
  };

  const handleSendOtp = async (): Promise<void> => {
    if (!email) {
      setEmailError("Please enter your email address");
      return;
    }
    try {
      setEmailError("");
      setEmailSuccess("");
      setSendingOtp(true);
      await axiosClient.post("/api/email/send-otp", {
        email,
        purpose: OTP_PURPOSE,
      });
      setOtp("");
      setOtpDialogOpen(true);
    } catch (err) {
      setEmailError(getErrorMessage(err, "Failed to send OTP"));
    } finally {
      setSendingOtp(false);
    }
  };

  // Called from dialog — verifies OTP then immediately registers the email.
  const handleVerifyAndRegister = async (): Promise<void> => {
    if (!otp) {
      setEmailError("Please enter the OTP code");
      return;
    }
    try {
      setEmailError("");
      setVerifyingOtp(true);

      // Step 1: verify OTP → get register token
      const verifyRes = await axiosClient.post("/api/email/verify-otp", {
        email,
        otp,
        purpose: OTP_PURPOSE,
      });
      const token: string = verifyRes.data?.token ?? "";
      if (!token)
        throw new Error("Verification succeeded but no token returned");

      // Step 2: immediately register with the token
      setRegisteringEmail(true);
      if (!account) throw new Error("Wallet not connected");
      const resolvedChainId = await resolveCurrentChainId();
      setActiveChainId(resolvedChainId);
      await authService.ensureAuthenticated(account, resolvedChainId);
      await axiosClient.post("/api/email/register", { registerToken: token });

      setOtpDialogOpen(false);
      setOtp("");
      setEmailSuccess("Email registered successfully for admin notifications.");
      void loadEmailStatus(account, resolvedChainId);
    } catch (err) {
      setEmailError(getErrorMessage(err, "Failed to verify or register email"));
    } finally {
      setVerifyingOtp(false);
      setRegisteringEmail(false);
    }
  };

  const handleVerifyAddress = async (): Promise<void> => {
    if (!account) return;
    try {
      setAuthError("");
      setAuthInProgress(true);
      const resolvedChainId = await resolveCurrentChainId();
      setActiveChainId(resolvedChainId);
      await authService.ensureAuthenticated(account, resolvedChainId);
      // Mark authenticated even if cookie is HttpOnly and not visible to JS.
      setHasAccessToken(true);
      // load data skipping extra auth call
      void fetchData(resolvedChainId, true);
    } catch (err) {
      console.error("Error during auth:", err);
      setAuthError(getErrorMessage(err, "Authentication failed"));
    } finally {
      setAuthInProgress(false);
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

  // If wallet connected but no access token cookie, prompt user to verify address
  if (account && !hasAccessToken) {
    return (
      <Box sx={{ p: 3 }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Verify Your Address
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              To view your dashboard, please verify your wallet address.
            </Typography>
            {authError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {authError}
              </Alert>
            )}
            <Button
              variant="contained"
              onClick={handleVerifyAddress}
              disabled={authInProgress}
            >
              {authInProgress ? <CircularProgress size={20} /> : "Verify"}
            </Button>
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

          <Card elevation={3} sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" mb={1}>
                Email Status
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Lookup by connected wallet and chain ID {activeChainId}.
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip
                  color={
                    emailLookupFound === null
                      ? "default"
                      : registeredEmail
                        ? "success"
                        : "warning"
                  }
                  label={
                    emailLookupLoading
                      ? "Checking..."
                      : emailLookupFound === null
                        ? "Not checked"
                        : registeredEmail
                          ? `Registered: ${registeredEmail}`
                          : emailLookupFound
                            ? "No email registered"
                            : "User record not found"
                  }
                />
                {emailLookupLoading ? (
                  <LinearProgress sx={{ flex: 1 }} />
                ) : null}
              </Box>
            </CardContent>
          </Card>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
              gap: 3,
              mb: 4,
            }}
          >
            <TimeSeriesChart
              title="Portfolio snapshots"
              subtitle="UserSnapshot history for the connected wallet"
              points={userSnapshotPoints}
              series={[
                { key: "deposited", label: "Deposited USD", color: "#2563eb" },
                { key: "borrowed", label: "Borrowed USD", color: "#ef4444" },
                { key: "netWorth", label: "Net worth USD", color: "#16a34a" },
              ]}
              emptyLabel={
                snapshotLoading
                  ? "Loading snapshot data..."
                  : "No portfolio snapshot data yet."
              }
            />

            <TimeSeriesChart
              title={selectedAssetSnapshotLabel}
              subtitle="AssetSnapshot history for a representative asset"
              points={assetSnapshotPoints}
              series={[
                {
                  key: "deposited",
                  label: "Total deposited",
                  color: "#7c3aed",
                },
                { key: "borrowed", label: "Total borrowed", color: "#f97316" },
                {
                  key: "treasury",
                  label: "Treasury balance",
                  color: "#0f766e",
                },
              ]}
              emptyLabel={
                snapshotLoading
                  ? "Loading snapshot data..."
                  : "No asset snapshot data yet."
              }
            />
          </Box>

          {/* Admin Email Registration */}
          <Card elevation={3} sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" mb={1}>
                Admin Email Registration
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Enter your email and click Send OTP. A verification code will be
                sent to your inbox — confirm it to complete registration.
              </Typography>

              {emailSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {emailSuccess}
                </Alert>
              )}
              {emailError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {emailError}
                </Alert>
              )}

              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <TextField
                  label="Email"
                  size="small"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSendOtp()}
                  placeholder="you@example.com"
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <Button
                  variant="contained"
                  onClick={handleSendOtp}
                  disabled={sendingOtp}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {sendingOtp ? <CircularProgress size={20} /> : "Send OTP"}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* OTP Verification Dialog */}
          <Dialog
            open={otpDialogOpen}
            onClose={() => {
              if (!verifyingOtp && !registeringEmail) {
                setOtpDialogOpen(false);
                setOtp("");
                setEmailError("");
              }
            }}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>Verify your email</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" mb={2}>
                A 6-digit code was sent to <strong>{email}</strong>. Enter it
                below to complete registration.
              </Typography>
              {emailError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {emailError}
                </Alert>
              )}
              <TextField
                autoFocus
                label="OTP code"
                size="small"
                fullWidth
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && void handleVerifyAndRegister()
                }
                placeholder="000000"
                inputProps={{ maxLength: 6 }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              <Button
                onClick={() => {
                  setOtpDialogOpen(false);
                  setOtp("");
                  setEmailError("");
                }}
                disabled={verifyingOtp || registeringEmail}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleVerifyAndRegister}
                disabled={verifyingOtp || registeringEmail || !otp}
              >
                {verifyingOtp || registeringEmail ? (
                  <CircularProgress size={20} />
                ) : (
                  "Confirm & Register"
                )}
              </Button>
            </DialogActions>
          </Dialog>

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
