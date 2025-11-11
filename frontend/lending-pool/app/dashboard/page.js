"use client";

import { useState, useEffect } from 'react';
import { useLendingPool, useToken } from '@/hooks/useContracts';
import { ethers } from 'ethers';

export default function Dashboard() {
    const { contract: lendingPool, loading: poolLoading } = useLendingPool();
    const { contract: token, loading: tokenLoading } = useToken();
    const [userMetrics, setUserMetrics] = useState({
        supplied: "0",
        borrowed: "0",
        healthFactor: "0"
    });

    useEffect(() => {
        const fetchUserMetrics = async () => {
            if (!lendingPool || !token || poolLoading || tokenLoading) return;

            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const userAddress = accounts[0];
                    const [supplied, borrowed, healthFactor] = await Promise.all([
                        lendingPool.getUserSupplied(userAddress),
                        lendingPool.getUserBorrowed(userAddress),
                        lendingPool.calculateHealthFactor(userAddress)
                    ]);

                    setUserMetrics({
                        supplied: ethers.formatEther(supplied),
                        borrowed: ethers.formatEther(borrowed),
                        healthFactor: ethers.formatEther(healthFactor)
                    });
                }
            } catch (error) {
                console.error("Error fetching user metrics:", error);
            }
        };

        fetchUserMetrics();
    }, [lendingPool, token, poolLoading, tokenLoading]);

    if (poolLoading || tokenLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Your Dashboard</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Supplied</h2>
                    <p className="text-2xl">{userMetrics.supplied} ETH</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Borrowed</h2>
                    <p className="text-2xl">{userMetrics.borrowed} ETH</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Health Factor</h2>
                    <p className="text-2xl">{userMetrics.healthFactor}</p>
                </div>
            </div>
        </div>
    );
}