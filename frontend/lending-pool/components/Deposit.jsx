import {React} from "react";
import { useState, useEffect } from "react";
import { getLendingPoolContract, getToken } from "@/lib/web3";
import { ethers } from "ethers";

export default function Deposit({ openDialog, handleCloseDialog, selectedAsset, setSuccess, fetchData, formatAmount, formatRate }) {
    const [depositAmount, setDepositAmount] = useState('');
    const [error, setError] = useState('');
    const [transactionLoading, setTransactionLoading] = useState(false);

    const handleDeposit = async () => {
            if (!depositAmount || !selectedAsset) return;
    
            try {
                setTransactionLoading(true);
                setError('');
    
                const lendingPool = await getLendingPoolContract();
                const tokenContract = await getToken(selectedAsset.address);
                const amountInWei = ethers.parseEther(depositAmount);
    
                // Check balance
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();
                const balance = await tokenContract.balanceOf(userAddress);
    
                if (balance < amountInWei) {
                    setError('Insufficient balance');
                    setTransactionLoading(false);
                    return;
                }
    
                // Approve
                const approveTx = await tokenContract.approve(await lendingPool.getAddress(), amountInWei);
                await approveTx.wait();
    
                // Deposit
                const depositTx = await lendingPool.deposit(selectedAsset.address, amountInWei);
                await depositTx.wait();
    
                setSuccess(`Successfully deposited ${depositAmount} ${selectedAsset.symbol}`);
                setDepositAmount('');
                
                // Refresh data
                setTimeout(() => {
                    fetchData();
                    handleCloseDialog();
                }, 2000);
    
            } catch (err) {
                console.error('Error depositing:', err);
                setError(err.message || 'Transaction failed');
            } finally {
                setTransactionLoading(false);
            }
        };


    return (
        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                        <DialogTitle>
                            Deposit {selectedAsset?.symbol}
                        </DialogTitle>
                        <DialogContent>
                            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                            
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Available: {selectedAsset && formatAmount(selectedAsset.balance)} {selectedAsset?.symbol}
                            </Typography>
                            
                            <TextField
                                fullWidth
                                label="Amount"
                                type="number"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                inputProps={{ step: "0.000001", min: "0" }}
                                sx={{ mb: 2 }}
                            />
                            
                            <Typography variant="body2" color="text.secondary">
                                Current APY: {selectedAsset && formatRate(selectedAsset.depositRate)}
                            </Typography>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={handleCloseDialog} disabled={transactionLoading}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeposit}
                                variant="contained"
                                disabled={transactionLoading || !depositAmount}
                                startIcon={transactionLoading ? <CircularProgress size={20} /> : null}
                            >
                                {transactionLoading ? 'Processing...' : 'Deposit'}
                            </Button>
                        </DialogActions>
                    </Dialog>
    );
}