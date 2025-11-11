"use client";

import { ethers } from "ethers";
import { useState, useEffect } from "react";
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LogoutIcon from '@mui/icons-material/Logout';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { CircularProgress, Alert } from "@mui/material";

export default function WalletConnect() {
    const [account, setAccount] = useState(null);
    const [balance, setBalance] = useState(null);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const [loading, setLoading] = useState(false);
    const [msgError, setMsgError] = useState("");

    const handleOpen = () => setOpen(true);
    const handleClose = () => {
        setOpen(false);
        setMsgError("");
    };

    useEffect(() => {
        // Check if already connected
        const checkConnection = async () => {
            if (window.ethereum) {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_accounts", []);
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    updateBalance(accounts[0]);
                }
            }
        };
        checkConnection();

        // Listen for account changes
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    updateBalance(accounts[0]);
                } else {
                    setAccount(null);
                    setBalance(null);
                }
            };
            
            const handleChainChanged = () => {
                window.location.reload();
            };

            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", handleChainChanged);

            return () => {
                window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
                window.ethereum.removeListener("chainChanged", handleChainChanged);
            };
        }
    }, []);

    const updateBalance = async (address) => {
        if (window.ethereum) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const balance = await provider.getBalance(address);
            setBalance(ethers.formatEther(balance));
        }
    };

    const connectMetaMask = async () => {
        if (typeof window !== "undefined" && window.ethereum) {
            try {
                setLoading(true);
                setMsgError("");
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_requestAccounts", []);
                setAccount(accounts[0]);
                updateBalance(accounts[0]);
                handleClose();
            } catch (error) {
                console.error("Error connecting to MetaMask:", error);
                setMsgError("Failed to connect to MetaMask");
            } finally {
                setLoading(false);
            }
        } else {
            setMsgError("Please install MetaMask browser extension");
        }
    };

    const disconnect = () => {
        setAccount(null);
        setBalance(null);
        handleClose();
    };

    const copyAddress = () => {
        navigator.clipboard.writeText(account);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Box>
            {account ? (
                <Button
                    onClick={handleOpen}
                    color="secondary"
                    variant="outlined"
                >
                    {account.slice(0, 6)}...{account.slice(-4)}
                </Button>
            ) : (
                <Button 
                    variant="contained" 
                    color="secondary" 
                    onClick={handleOpen}
                    startIcon={<AccountBalanceWalletIcon />}
                    sx={{ fontWeight: 'bold' }}
                >
                    Connect Wallet
                </Button>
            )}

            <Dialog 
                open={open} 
                onClose={handleClose}
                maxWidth="xs"
                fullWidth
                sx={{
                    textAlign: 'center'
                }}
            >
                {!account ? (
                    <>
                        <DialogTitle sx={{ pb: 1 }}>
                            <Typography variant="h6" fontWeight="bold">
                                Connect Wallet
                            </Typography>
                        </DialogTitle>
                        <DialogContent>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Choose a wallet to connect to the Lending Pool
                            </Typography>
                            <List sx={{ pt: 0 }}>
                                <ListItem disablePadding>
                                    <ListItemButton 
                                        onClick={connectMetaMask}
                                        sx={{ 
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1,
                                            '&:hover': {
                                                borderColor: 'primary.main',
                                                bgcolor: 'action.hover'
                                            }
                                        }}
                                    >
                                        <ListItemIcon>
                                            <AccountBalanceWalletIcon color="primary" fontSize="large" />
                                        </ListItemIcon>
                                        <ListItemText 
                                            primary="MetaMask" 
                                            secondary="Connect using MetaMask"
                                            primaryTypographyProps={{ fontWeight: 'medium' }}
                                        />
                                        {loading && <ListItemIcon>
                                            <CircularProgress />
                                        </ListItemIcon>}
                                    </ListItemButton>
                                </ListItem>
                            </List>
                            {msgError && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {msgError}
                                </Alert>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={handleClose}>Cancel</Button>
                        </DialogActions>
                    </>
                ) : (
                    <>
                        <DialogTitle sx={{ pb: 1 }}>
                            <Typography variant="h6" fontWeight="bold">
                                Wallet Connected
                            </Typography>
                        </DialogTitle>
                        <DialogContent>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Address
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent:'center', gap: 1 }}>
                                        <Typography variant="body1" fontFamily="monospace">
                                            {account.slice(0, 10)}...{account.slice(-8)}
                                        </Typography>
                                        <Tooltip title={copied ? "Copied!" : "Copy address"}>
                                            <IconButton size="small" onClick={copyAddress}>
                                                <ContentCopyIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                                
                                {balance && (
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                            Balance
                                        </Typography>
                                        <Typography variant="h6" fontWeight="medium">
                                            {parseFloat(balance).toFixed(4)} ETH
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </DialogContent>
                        <DialogActions sx={{justifyContent:'center'}}>
                            <Button 
                                onClick={disconnect} 
                                color="error"
                                startIcon={<LogoutIcon />}
                            >
                                Disconnect
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
}