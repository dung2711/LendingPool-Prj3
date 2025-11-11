"use client";

import { useState, useEffect } from 'react';
import { useLendingPool, usePriceRouter } from '@/hooks/useContracts';
import { ethers } from 'ethers';

export default function Borrow() {
    const { contract: lendingPool, loading: poolLoading } = useLendingPool();
    const { contract: priceRouter, loading: priceLoading } = usePriceRouter();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [borrowLimit, setBorrowLimit] = useState('0');

    useEffect(() => {
        const fetchBorrowLimit = async () => {
            if (!lendingPool || !priceRouter) return;

            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const userAddress = accounts[0];
                }
            } catch (error) {
                console.error("Error fetching borrow limit:", error);
            }
        };

        fetchBorrowLimit();
    }, [lendingPool, priceRouter]);

    const handleBorrow = async (e) => {
        e.preventDefault();
        if (!amount || !lendingPool) return;

        setLoading(true);
        try {
            const amountInWei = ethers.parseEther(amount);
            const borrowTx = await lendingPool.borrow(amountInWei);
            await borrowTx.wait();

            alert('Borrow successful!');
            setAmount('');
        } catch (error) {
            console.error('Error borrowing tokens:', error);
            alert('Error borrowing tokens. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    if (poolLoading || priceLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Borrow Assets</h1>
            
            <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
                <div className="mb-4">
                    <h2 className="text-xl font-semibold">Your Borrow Limit</h2>
                    <p className="text-2xl">{borrowLimit} ETH</p>
                </div>

                <form onSubmit={handleBorrow}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Amount to Borrow
                        </label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                step="0.000001"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                placeholder="0.0"
                                max={borrowLimit}
                            />
                            <span className="ml-2">ETH</span>
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        disabled={loading || Number(amount) > Number(borrowLimit)}
                        className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:bg-gray-400"
                    >
                        {loading ? 'Processing...' : 'Borrow'}
                    </button>
                </form>
            </div>
        </div>
    );
}