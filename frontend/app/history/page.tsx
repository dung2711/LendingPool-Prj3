"use client";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import GavelIcon from "@mui/icons-material/Gavel";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import { assetService } from "@/services/assetService";
import { authService } from "@/services/authService";
import { transactionService } from "@/services/transactionService";

interface TransactionData {
  type: string;
  symbol: string;
  amount: bigint;
  decimals: number;
  amountFormatted: number;
  amountUSD: bigint | null;
  amountUSDFormatted: number | null;
  hash: string;
  blockNumber: number;
}

export default function History(): ReactElement {
  const [account, setAccount] = useState<string | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [cursorTS, setCursorTS] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

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
            fetchTransactions(null, null, "all");
          } else {
            setTransactions([]);
            setCursorTS(null);
            setCursorId(null);
            setHasNextPage(false);
          }
        } else {
          setHasAccessToken(false);
          setTransactions([]);
          setCursorTS(null);
          setCursorId(null);
          setHasNextPage(false);
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

  useEffect(() => {
    if (account && hasAccessToken) {
      // Reset pagination and fetch with new filter
      fetchTransactions(null, null, filterType);
    }
  }, [filterType]);

  const checkWalletAndFetch = async (): Promise<void> => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setPageLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const accounts = await provider.send("eth_accounts", []);
        const nextAccount = accounts[0] || null;
        setAccount(nextAccount);
        if (nextAccount) {
          const sessionActive = await authService.ensureSession(nextAccount);
          setHasAccessToken(sessionActive);
          if (sessionActive) {
            fetchTransactions(null, null, "all");
          } else {
            setTransactions([]);
            setCursorTS(null);
            setCursorId(null);
            setHasNextPage(false);
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

  const handleVerifyAddress = async (): Promise<void> => {
    if (!account) return;
    try {
      setAuthError("");
      setAuthInProgress(true);
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const network = await provider.getNetwork();
      const chainId = authService.normalizeChainId(network.chainId.toString());
      await authService.ensureAuthenticated(account, chainId);
      // Mark authenticated even if cookie is HttpOnly and not visible to JS.
      setHasAccessToken(true);
      // load transactions after auth
      fetchTransactions(null, null, "all");
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError(
        typeof err === "object" && err && "message" in err
          ? (err as Error).message
          : "Authentication failed",
      );
    } finally {
      setAuthInProgress(false);
    }
  };

  const fetchTransactions = async (
    cursorTimestamp: string | null = null,
    cursorTransactionId: string | null = null,
    type: string = "all",
  ): Promise<void> => {
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = authService.normalizeChainId(network.chainId.toString());

      // Fetch transactions from backend API
      const filterTypeParam = type === "all" ? undefined : type;
      const [txData, assetsData] = await Promise.all([
        transactionService.getTransactionsByUserAddress({
          userAddress,
          chainId,
          cursorTS: cursorTimestamp ?? undefined,
          cursorId: cursorTransactionId ?? undefined,
          type: filterTypeParam,
        }),
        assetService.getAllAssets().catch(() => []),
      ]);

      setHasAccessToken(true);

      setHasNextPage(txData.hasMore);
      setCursorTS(txData.nextCursorTS || null);
      setCursorId(txData.nextCursorID || null);

      // Create asset lookup map for quick access
      const assetMap: Record<string, any> = {};
      assetsData.forEach((asset) => {
        assetMap[asset.assetAddress.toLowerCase()] = {
          symbol: asset.symbol,
          decimals: asset.decimals,
        };
      });

      // Process transactions
      const allTxs: TransactionData[] = [];

      for (const tx of txData?.transactions || []) {
        const asset = assetMap[tx.assetAddress.toLowerCase()];
        const decimals = asset?.decimals ?? 18;
        const symbol = asset?.symbol ?? `${tx.assetAddress.slice(0, 6)}...`;

        const amountFormatted = parseFloat(
          ethers.formatUnits(tx.amount, decimals),
        );
        const amountUSDRaw =
          typeof tx.amountUSD === "string" && tx.amountUSD.trim()
            ? tx.amountUSD
            : null;
        const amountUSD = amountUSDRaw ? BigInt(amountUSDRaw) : null;
        const amountUSDFormatted = amountUSD
          ? parseFloat(ethers.formatUnits(amountUSD, 18))
          : null;

        allTxs.push({
          type: tx.type,
          symbol,
          amount: BigInt(tx.amount),
          decimals,
          amountFormatted,
          amountUSD,
          amountUSDFormatted,
          hash: tx.transactionHash,
          blockNumber: tx.blockNumber,
        });
      }

      // If this is initial load or filter change, replace transactions
      // Otherwise append for pagination
      if (cursorTimestamp === null && cursorTransactionId === null) {
        setTransactions(allTxs);
      } else {
        setTransactions((prev) => [...prev, ...allTxs]);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadingMore = async (): Promise<void> => {
    if (!hasNextPage || loading) return;
    await fetchTransactions(cursorTS, cursorId, filterType);
  };

  const getTypeIcon = (type: string): ReactElement | undefined => {
    switch (type) {
      case "deposit":
        return <TrendingUpIcon fontSize="small" />;
      case "withdraw":
        return <TrendingDownIcon fontSize="small" />;
      case "borrow":
        return <AccountBalanceIcon fontSize="small" />;
      case "repay":
        return <CreditCardIcon fontSize="small" />;
      case "liquidated":
        return <GavelIcon fontSize="small" />;
      default:
        return;
    }
  };

  const getTypeColor = (
    type: string,
  ): "success" | "warning" | "info" | "primary" | "error" | "default" => {
    switch (type) {
      case "deposit":
        return "success";
      case "withdraw":
        return "warning";
      case "borrow":
        return "info";
      case "repay":
        return "primary";
      case "liquidated":
        return "error";
      default:
        return "default";
    }
  };

  const getTypeLabel = (type: unknown): string => {
    if (typeof type !== "string") return "Unknown";
    const trimmed = type.trim();
    if (!trimmed) return "Unknown";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const openInExplorer = (hash: string): void => {
    // Update this with your network's block explorer
    window.open(`https://sepolia.etherscan.io/tx/${hash}`, "_blank");
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
              Please connect MetaMask to view your transaction history.
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
              To view your transaction history, please verify your wallet
              address.
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
        Transaction History
      </Typography>

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
            {transactions.length} transaction
            {transactions.length !== 1 ? "s" : ""}
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
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : transactions.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography color="text.secondary">
                No transactions found
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Asset</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Value (USD)
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Block</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Transaction
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((tx, index) => (
                    <TableRow
                      key={`${tx.hash}-${index}`}
                      sx={{ "&:hover": { bgcolor: "action.hover" } }}
                    >
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
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            color="primary.main"
                          >
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
                          #{tx.blockNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                            }}
                          >
                            {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => openInExplorer(tx.hash)}
                          >
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

          {/* Load More Button */}
          {hasNextPage && transactions.length > 0 && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Button
                variant="outlined"
                onClick={loadingMore}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : null}
              >
                {loading ? "Loading..." : "Load More"}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
