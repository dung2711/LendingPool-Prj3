"use client";

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { web3Service } from "@/lib/web3";
import { assetService } from "@/services/assetService";
import { userAssetService } from "@/services/userAssetService";

interface LiquidatableUser {
  address: string;
  totalCollateralUSD: bigint;
  totalBorrowsUSD: bigint;
  healthFactor: bigint;
}

interface SelectedAsset {
  assetAddress: string;
  deposited: bigint;
  borrowed: bigint;
  symbol: string;
}

interface LiquidatableUsersSocketPayload {
  users?: Array<{ address?: string } | string>;
  timestamp?: number | string | Date;
  blockNumber?: number;
}

const LIQUIDATABLE_USERS_WS_EVENT = "ws:liquidatable:users:updated";

const parseEventTimestamp = (
  value: number | string | Date | undefined,
): Date | null => {
  if (value === undefined || value === null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    // Block timestamps are usually in seconds while JS Date expects milliseconds.
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeWsUserAddresses = (
  users: Array<{ address?: string } | string> | undefined,
): string[] => {
  if (!users || users.length === 0) return [];

  return users
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.address || "";
    })
    .map((address) => address.trim())
    .filter((address): address is string => Boolean(address));
};

export default function Liquidation(): ReactElement {
  const [account, setAccount] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [liquidatableUsers, setLiquidatableUsers] = useState<
    LiquidatableUser[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<LiquidatableUser | null>(
    null,
  );
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [repayAsset, setRepayAsset] = useState("");
  const [collateralAsset, setCollateralAsset] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [liquidationThreshold, setLiquidationThreshold] = useState(0n);
  const [liquidationIncentive, setLiquidationIncentive] = useState(0n);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    checkWalletAndFetch();

    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]): void => {
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchData();
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

  // WebSocket connection for real-time updates
  useEffect(() => {
    const socket: Socket = io(
      (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace("/api", ""),
    );

    const handleUsersUpdated = (
      payload: LiquidatableUsersSocketPayload,
    ): void => {
      console.log("📡 Received liquidatable users update:", payload);

      const eventTime = parseEventTimestamp(payload?.timestamp) || new Date();
      setLastUpdate(eventTime);

      const addresses = normalizeWsUserAddresses(payload?.users);
      fetchLiquidatableUsersDetails(addresses);
    };

    socket.on("connect", () => {
      console.log("✅ WebSocket connected");
      setWsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ WebSocket disconnected");
      setWsConnected(false);
    });

    // Keep both event names for backward compatibility while backend emits WS enum names.
    socket.on(LIQUIDATABLE_USERS_WS_EVENT, handleUsersUpdated);
    socket.on("liquidatableUsersUpdated", handleUsersUpdated);

    return () => {
      socket.off(LIQUIDATABLE_USERS_WS_EVENT, handleUsersUpdated);
      socket.off("liquidatableUsersUpdated", handleUsersUpdated);
      socket.disconnect();
    };
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

  const fetchLiquidatableUsersDetails = async (
    userAddresses: string[],
  ): Promise<void> => {
    try {
      if (!userAddresses || userAddresses.length === 0) {
        setLiquidatableUsers([]);
        return;
      }

      const lendingPool = await web3Service.getLendingPoolContract();
      const liquidation = await web3Service.getLiquidationContract();
      const liquidationThreshold = await liquidation.liquidationThreshold();

      const usersWithDetails = await Promise.all(
        userAddresses.map(async (userAddress: string) => {
          try {
            const [totalCollateralUSD, totalBorrowsUSD] =
              await lendingPool.getAccountLiquidity(userAddress);

            // Health Factor = (totalCollateral * liquidationThreshold) / totalBorrows
            const healthFactor =
              totalBorrowsUSD > 0n
                ? (totalCollateralUSD * liquidationThreshold) / totalBorrowsUSD
                : BigInt(
                    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                  );

            return {
              address: userAddress,
              totalCollateralUSD,
              totalBorrowsUSD,
              healthFactor,
            };
          } catch (err) {
            console.error(`Error fetching details for ${userAddress}:`, err);
            return null;
          }
        }),
      );

      setLiquidatableUsers(
        usersWithDetails.filter((u) => u !== null) as LiquidatableUser[],
      );
    } catch (err) {
      console.error("Error fetching liquidatable users details:", err);
    }
  };

  const refreshCurrentList = async (): Promise<void> => {
    try {
      setLoading(true);
      const addresses = liquidatableUsers.map((user) => user.address);
      await fetchLiquidatableUsersDetails(addresses);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (): Promise<void> => {
    try {
      setLoading(true);
      const liquidation = await web3Service.getLiquidationContract();

      // Get liquidation parameters
      const [threshold, incentive] = await Promise.all([
        liquidation.liquidationThreshold(),
        liquidation.liquidationIncentive(),
      ]);
      setLiquidationThreshold(threshold);
      setLiquidationIncentive(incentive);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const checkUserLiquidatable = async (
    userAddress: string,
  ): Promise<LiquidatableUser | null> => {
    try {
      const lendingPool = await web3Service.getLendingPoolContract();
      const liquidation = await web3Service.getLiquidationContract();

      const [totalDeposited, totalBorrowed] =
        await lendingPool.getAccountLiquidity(userAddress);

      const threshold = await liquidation.liquidationThreshold();
      const healthFactor: bigint =
        totalBorrowed > 0n
          ? (BigInt(totalDeposited) * BigInt(threshold)) / BigInt(totalBorrowed)
          : BigInt(
              "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            );

      // User is liquidatable if health factor < liquidation threshold (which is 1.0 in most cases)
      const isLiquidatable =
        healthFactor <
        BigInt(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        );

      if (isLiquidatable && totalBorrowed > 0n) {
        return {
          address: userAddress,
          totalCollateralUSD: totalDeposited,
          totalBorrowsUSD: totalBorrowed,
          healthFactor,
        };
      }

      return null;
    } catch (err) {
      console.error("Error checking user:", err);
      return null;
    }
  };

  const handleOpenDialog = async (user: LiquidatableUser): Promise<void> => {
    setSelectedUser(user);
    const dashboardData = await userAssetService.getAssetsByUser(user.address);
    const selectedAssetList = await Promise.all(
      dashboardData.assets.map(async (asset) => {
        try {
          const assetDetails = await assetService.getAssetByAddress(
            asset.assetAddress,
          );
          console.log("Asset Details:", assetDetails);
          console.log("User Asset:", asset);
          return {
            assetAddress: asset.assetAddress,
            deposited:
              BigInt(asset.depositedAmount) *
              10n ** BigInt(18 - assetDetails.decimals), //normalize to 18 decimals
            borrowed:
              BigInt(asset.borrowedAmount) *
              10n ** BigInt(18 - assetDetails.decimals), //normalize to 18 decimals
            symbol: assetDetails.symbol,
          };
        } catch (_error) {
          return null;
        }
      }),
    );
    const filteredAssets = selectedAssetList.filter(
      (a) => a !== null,
    ) as SelectedAsset[];
    setSelectedAsset(filteredAssets);
    console.log("Selected Asset:", selectedAssetList);
    setOpenDialog(true);
    setError("");
    setSuccess("");
  };

  const handleCloseDialog = (): void => {
    setOpenDialog(false);
    setSelectedUser(null);
    setRepayAsset("");
    setCollateralAsset("");
    setRepayAmount("");
  };

  const handleLiquidate = async (): Promise<void> => {
    if (!selectedUser || !repayAsset || !collateralAsset || !repayAmount) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setTransactionLoading(true);
      setError("");

      const normalizedRepayAsset = repayAsset.trim();
      const normalizedCollateralAsset = collateralAsset.trim();

      if (
        !ethers.isAddress(normalizedRepayAsset) ||
        !ethers.isAddress(normalizedCollateralAsset)
      ) {
        setError("Please enter valid repay and collateral asset addresses");
        return;
      }

      const liquidation = await web3Service.getLiquidationContract();
      const repayToken = await web3Service.getToken(normalizedRepayAsset);
      const decimals = await repayToken.decimals();
      const amountInWei = ethers.parseUnits(repayAmount, decimals);

      // Approve liquidation contract to spend repay tokens
      const approveTx = await repayToken.approve(
        await liquidation.getAddress(),
        amountInWei,
      );
      await approveTx.wait();

      // Execute liquidation
      const liquidateTx = await liquidation.liquidate(
        selectedUser.address,
        account,
        normalizedRepayAsset,
        normalizedCollateralAsset,
        amountInWei,
      );
      await liquidateTx.wait();

      setSuccess(`Successfully liquidated position!`);

      setTimeout(() => {
        fetchData();
        handleCloseDialog();
      }, 2000);
    } catch (err) {
      console.error("Error liquidating:", err);
      setError(err instanceof Error ? err.message : "Liquidation failed");
    } finally {
      setTransactionLoading(false);
    }
  };

  const formatAmount = (amount: bigint): string =>
    parseFloat(ethers.formatUnits(amount, 18)).toFixed(4);

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
    threshold: bigint,
  ): "success" | "warning" | "error" => {
    if (hf >= threshold) return "success";
    if (hf >= (threshold * 90n) / 100n) return "warning";
    return "error";
  };

  // Manual user check function
  const [checkAddress, setCheckAddress] = useState("");
  const [checkingUser, setCheckingUser] = useState(false);
  const borrowedAssets = selectedAsset.filter((asset) => asset.borrowed > 0n);
  const depositedAssets = selectedAsset.filter((asset) => asset.deposited > 0n);

  const handleCheckUser = async (): Promise<void> => {
    if (!checkAddress || !ethers.isAddress(checkAddress)) {
      setError("Please enter a valid address");
      return;
    }

    try {
      setCheckingUser(true);
      setError("");
      const userInfo = await checkUserLiquidatable(checkAddress);

      if (userInfo) {
        setLiquidatableUsers((prev) => {
          const existing = prev.find((u) => u.address === userInfo.address);
          if (existing) return prev;
          return [...prev, userInfo];
        });
        setSuccess("User is liquidatable and added to the list!");
      } else {
        setError("User is not liquidatable or has no positions");
      }
      setCheckAddress("");
    } catch (err) {
      setError(
        "Error checking user: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setCheckingUser(false);
    }
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
              Please connect MetaMask to access liquidation features.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" fontWeight="bold" mb={1}>
        Liquidation
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Liquidate undercollateralized positions to protect the protocol
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Liquidation Info */}
      <Box sx={{ display: "flex", gap: 2, mb: 4, flexWrap: "wrap" }}>
        <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Liquidation Threshold
            </Typography>
            <Typography variant="h5" fontWeight="bold" color="error.main">
              {formatAmount(liquidationThreshold)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Health factor below this can be liquidated
            </Typography>
          </CardContent>
        </Card>
        <Card elevation={2} sx={{ flex: 1, minWidth: 200 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Liquidation Bonus
            </Typography>
            <Typography variant="h5" fontWeight="bold" color="success.main">
              {formatAmount(liquidationIncentive)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Extra incentive for liquidators
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Check User Address */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            Check User Position
          </Typography>
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            <TextField
              fullWidth
              label="User Address"
              placeholder="0x..."
              value={checkAddress}
              onChange={(e) => setCheckAddress(e.target.value)}
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleCheckUser}
              disabled={checkingUser}
              sx={{ minWidth: 120 }}
            >
              {checkingUser ? <CircularProgress size={24} /> : "Check"}
            </Button>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: "block" }}
          >
            Enter a user's address to check if their position can be liquidated
          </Typography>
        </CardContent>
      </Card>

      {/* Liquidatable Users */}
      <Card elevation={2}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h5" fontWeight="bold">
                  Liquidatable Positions
                </Typography>
                {wsConnected && (
                  <Chip
                    label="Live"
                    color="success"
                    size="small"
                    sx={{ fontSize: "0.7rem" }}
                  />
                )}
              </Box>
              {lastUpdate && (
                <Typography variant="caption" color="text.secondary">
                  Last updated: {new Date(lastUpdate).toLocaleTimeString()}
                </Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              onClick={refreshCurrentList}
              disabled={loading}
              size="small"
            >
              {loading ? <CircularProgress size={20} /> : "Refresh"}
            </Button>
          </Box>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : liquidatableUsers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <WarningAmberIcon
                sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
              />
              <Typography color="text.secondary">
                No liquidatable positions found
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Use the check feature above to find undercollateralized users
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      User Address
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Total Collateral
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Total Borrowed
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Health Factor
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: "bold" }}
                    ></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {liquidatableUsers.map((user) => (
                    <TableRow
                      key={user.address}
                      sx={{ "&:hover": { bgcolor: "action.hover" } }}
                    >
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "monospace" }}
                        >
                          {user.address.slice(0, 10)}...{user.address.slice(-8)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="medium">
                          ${formatAmount(user.totalCollateralUSD)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="medium">
                          ${formatAmount(user.totalBorrowsUSD)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={formatHealthFactor(user.healthFactor)}
                          color={getHealthFactorColor(
                            user.healthFactor,
                            liquidationThreshold,
                          )}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleOpenDialog(user)}
                        >
                          Liquidate
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

      {/* Liquidation Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Liquidate Position</DialogTitle>
        <Divider />
        <DialogContent sx={{ py: 3 }}>
          {selectedUser && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  User Address
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {selectedUser.address}
                </Typography>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Repay Asset
                </Typography>
                <TextField
                  fullWidth
                  value={repayAsset}
                  onChange={(e) => setRepayAsset(e.target.value)}
                  placeholder="Paste repay asset address"
                  size="small"
                />
                <Box sx={{ mt: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    Available borrowed asset addresses
                  </Typography>
                  {borrowedAssets.length > 0 ? (
                    borrowedAssets.map((asset) => (
                      <Typography
                        key={asset.assetAddress}
                        variant="body2"
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {asset.symbol}: {asset.assetAddress} (Borrowed:{" "}
                        {formatAmount(asset.borrowed)})
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No borrowed assets found for this user.
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Collateral Asset
                </Typography>
                <TextField
                  fullWidth
                  value={collateralAsset}
                  onChange={(e) => setCollateralAsset(e.target.value)}
                  placeholder="Paste collateral asset address"
                  size="small"
                />
                <Box sx={{ mt: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    Available collateral asset addresses
                  </Typography>
                  {depositedAssets.length > 0 ? (
                    depositedAssets.map((asset) => (
                      <Typography
                        key={asset.assetAddress}
                        variant="body2"
                        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                      >
                        {asset.symbol}: {asset.assetAddress} (Deposited:{" "}
                        {formatAmount(asset.deposited)})
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No deposited assets found for this user.
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Repay Amount
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="0.0"
                  size="small"
                  inputProps={{ step: "0.01" }}
                />
              </Box>

              {error && <Alert severity="error">{error}</Alert>}
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleLiquidate}
            disabled={
              transactionLoading ||
              !repayAsset ||
              !collateralAsset ||
              !repayAmount
            }
          >
            {transactionLoading ? <CircularProgress size={24} /> : "Liquidate"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
