"use client";

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { ethers } from "ethers";
import { type ReactElement, useEffect, useState } from "react";
import DepositDialog from "@/components/DepositDialog";
import WithdrawDialog from "@/components/WithdrawDialog";
import { web3Service } from "@/lib/web3";

interface SupplyMarketData {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  balanceInUSD: bigint;
  depositRate: bigint;
  userDeposit: bigint;
  userDepositInUSD: bigint;
}

export default function Supply(): ReactElement {
  const [account, setAccount] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [markets, setMarkets] = useState<SupplyMarketData[]>([]);
  const [userDeposits, setUserDeposits] = useState<SupplyMarketData[]>([]);
  const [totalDepositedUSD, setTotalDepositedUSD] = useState(0n);
  const [selectedAsset, setSelectedAsset] = useState<SupplyMarketData | null>(
    null,
  );
  const [openDepositDialog, setOpenDepositDialog] = useState(false);
  const [openWithdrawDialog, setOpenWithdrawDialog] = useState(false);
  const [_error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showZeroBalance, setShowZeroBalance] = useState(false);

  useEffect(() => {
    checkWalletAndFetch();

    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]): void => {
        setAccount(accounts[0] || null);
        if (accounts.length > 0) {
          fetchData();
        } else {
          setMarkets([]);
          setUserDeposits([]);
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

      // Get all markets
      const allMarkets = await lendingPool.getAllMarkets();

      // Fetch market and user data
      const marketData = await Promise.all(
        allMarkets.map(async (marketAddress: string) => {
          try {
            const tokenContract = await web3Service.getToken(marketAddress);
            const [symbol, decimals, balance, marketInfo, userDeposit] =
              await Promise.all([
                tokenContract.symbol(),
                tokenContract.decimals(),
                tokenContract.balanceOf(userAddress),
                lendingPool.getMarketInfo(marketAddress),
                lendingPool.getUserCurrentDeposit(userAddress, marketAddress),
              ]);
            const assetPrice = await priceRouter.getPrice(marketAddress); // 18 decimals
            console.log(assetPrice);
            const userDepositInUSD =
              (BigInt(assetPrice) * BigInt(userDeposit)) /
              10n ** BigInt(decimals);
            const balanceInUSD =
              (BigInt(assetPrice) * BigInt(balance)) / 10n ** BigInt(decimals);
            return {
              address: marketAddress,
              symbol,
              decimals: Number(decimals),
              balance: balance * 10n ** (18n - BigInt(decimals)), // normalize to 18 decimals
              balanceInUSD,
              depositRate: marketInfo.depositRate,
              userDeposit: userDeposit * 10n ** (18n - BigInt(decimals)), // normalize to 18 decimals
              userDepositInUSD,
            };
          } catch (err) {
            console.error(`Error fetching data for ${marketAddress}:`, err);
            return null;
          }
        }),
      );

      const validMarkets = marketData.filter(
        (m) => m !== null,
      ) as SupplyMarketData[];
      setMarkets(validMarkets);

      // Filter user deposits (only assets with deposits > 0)
      const deposits = validMarkets.filter((m) => m.userDeposit > 0n);
      setUserDeposits(deposits);

      const [totalUSD] = await lendingPool.getAccountLiquidity(userAddress);
      setTotalDepositedUSD(totalUSD);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDepositDialog = (asset: SupplyMarketData): void => {
    setSelectedAsset(asset);
    setOpenDepositDialog(true);
    setSuccess("");
  };

  const handleOpenWithdrawDialog = (asset: SupplyMarketData): void => {
    setSelectedAsset(asset);
    setOpenWithdrawDialog(true);
    setSuccess("");
  };

  const handleCloseDepositDialog = (): void => {
    setOpenDepositDialog(false);
    setSelectedAsset(null);
  };

  const handleCloseWithdrawDialog = (): void => {
    setOpenWithdrawDialog(false);
    setSelectedAsset(null);
  };

  const formatRate = (rate: bigint): string => {
    const rateNum = parseFloat(ethers.formatUnits(rate, 18)) * 100;
    return `${rateNum.toFixed(2)}%`;
  };

  const formatAmount = (
    amount: bigint | number,
    decimals: number = 18,
  ): string => {
    const formated = ethers.formatUnits(BigInt(amount), decimals);
    return parseFloat(formated).toFixed(4);
  };

  // Filter markets based on showZeroBalance checkbox
  const filteredMarkets = showZeroBalance
    ? markets
    : markets.filter((m) => m.balance > 0n);

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

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Your Deposits Table */}
      <Box mb={4}>
        <Card elevation={2}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                mb: 3,
                flexWrap: "wrap",
                gap: 2,
              }}
            >
              <Typography variant="h5" fontWeight="bold">
                Your Deposits
              </Typography>
              {!loading && userDeposits.length > 0 && (
                <Box
                  sx={{
                    px: 2,
                    borderRadius: 2,
                    border: "1px solid",
                  }}
                >
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    Balance: ${formatAmount(totalDepositedUSD)}
                  </Typography>
                </Box>
              )}
            </Box>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : userDeposits.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography color="text.secondary">
                  You haven't deposited any assets yet
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "grey.100" }}>
                      <TableCell sx={{ fontWeight: "bold" }}>Asset</TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        Balance
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        APY
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: "bold" }}
                      ></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {userDeposits.map((deposit) => (
                      <TableRow
                        key={deposit.address}
                        sx={{ "&:hover": { bgcolor: "action.hover" } }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {deposit.symbol}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium">
                            {formatAmount(deposit.userDeposit)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: { xs: "none", sm: "block" },
                              fontSize: "0.65rem",
                            }}
                          >
                            ${formatAmount(deposit.userDepositInUSD)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color="success.main"
                            fontWeight="medium"
                          >
                            {formatRate(deposit.depositRate)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            variant="contained"
                            onClick={() => handleOpenWithdrawDialog(deposit)}
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
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
                flexWrap: "wrap",
                gap: 2,
              }}
            >
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
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : filteredMarkets.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography color="text.secondary">
                  {showZeroBalance
                    ? "No markets available"
                    : "No assets with balance available"}
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "grey.100" }}>
                      <TableCell sx={{ fontWeight: "bold" }}>Asset</TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        Wallet Balance
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        APY
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: "bold" }}
                      ></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMarkets.map((market) => (
                      <TableRow
                        key={market.address}
                        sx={{ "&:hover": { bgcolor: "action.hover" } }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {market.symbol}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={
                              <Box sx={{ textAlign: "center" }}>
                                <Typography variant="body2">
                                  {formatAmount(market.balance)} {market.symbol}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ opacity: 0.8 }}
                                >
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
                              sx={{ display: "inline-block" }}
                            >
                              {formatAmount(market.balance)}
                            </Typography>
                          </Tooltip>
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
                        <TableCell align="right">
                          <Button
                            variant="contained"
                            disabled={market.balance === 0n}
                            onClick={() => handleOpenDepositDialog(market)}
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
      {openDepositDialog && selectedAsset && (
        <DepositDialog
          handleCloseDialog={handleCloseDepositDialog}
          selectedAsset={selectedAsset}
          fetchData={fetchData}
          setSuccess={setSuccess}
          formatAmount={formatAmount}
          formatRate={formatRate}
        />
      )}
      {/* Withdraw Dialog */}
      {openWithdrawDialog && selectedAsset && (
        <WithdrawDialog
          handleCloseDialog={handleCloseWithdrawDialog}
          selectedAsset={selectedAsset}
          fetchData={fetchData}
          setSuccess={setSuccess}
          formatAmount={formatAmount}
          formatRate={formatRate}
        />
      )}
    </Box>
  );
}
