"use client";

import { useState, useEffect } from 'react';
import {
    getLendingPoolContract,
    getMyOracleContract,
    getLiquidationContract,
    getPriceRouterContract,
    getInterestRateModelContract,
    getToken
} from '../lib/web3';

/**
 * Hook to get the LendingPool contract instance
 */
export function useLendingPool() {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getLendingPoolContract();
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing LendingPool contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, []);

    return { contract, loading, error };
}

/**
 * Hook to get the PriceRouter contract instance
 */
export function usePriceRouter() {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getPriceRouterContract();
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing PriceRouter contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, []);

    return { contract, loading, error };
}

/**
 * Hook to get the MyOracle contract instance
 */
export function useMyOracle() {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getMyOracleContract();
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing MyOracle contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, []);

    return { contract, loading, error };
}

/**
 * Hook to get the Liquidation contract instance
 */
export function useLiquidation() {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getLiquidationContract();
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing Liquidation contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, []);

    return { contract, loading, error };
}

/**
 * Hook to get the InterestRateModel contract instance
 */
export function useInterestRateModel() {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getInterestRateModelContract();
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing InterestRateModel contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, []);

    return { contract, loading, error };
}

/**
 * Hook to get an ERC20 token contract instance
 * @param {string} tokenAddress - The address of the token
 */
export function useToken(tokenAddress) {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!tokenAddress) {
            setLoading(false);
            return;
        }

        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getToken(tokenAddress);
                setContract(contractInstance);
                setError(null);
            } catch (err) {
                console.error('Error initializing Token contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();
    }, [tokenAddress]);

    return { contract, loading, error };
}

/**
 * Hook to get all main protocol contracts at once
 */
export function useAllContracts() {
    const lendingPool = useLendingPool();
    const priceRouter = usePriceRouter();
    const liquidation = useLiquidation();
    const interestRateModel = useInterestRateModel();

    const loading = lendingPool.loading || priceRouter.loading || liquidation.loading || interestRateModel.loading;
    const error = lendingPool.error || priceRouter.error || liquidation.error || interestRateModel.error;

    return {
        lendingPool: lendingPool.contract,
        priceRouter: priceRouter.contract,
        liquidation: liquidation.contract,
        interestRateModel: interestRateModel.contract,
        loading,
        error
    };
}

/**
 * Hook to get contract with account change listener
 * Reloads contract when user changes MetaMask account
 */
export function useContractWithAccount(getContractFn) {
    const [contract, setContract] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [account, setAccount] = useState(null);

    useEffect(() => {
        const initContract = async () => {
            try {
                setLoading(true);
                const contractInstance = await getContractFn();
                setContract(contractInstance);
                setError(null);

                // Get current account
                if (window.ethereum) {
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    setAccount(accounts[0] || null);
                }
            } catch (err) {
                console.error('Error initializing contract:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initContract();

        // Listen for account changes
        if (window.ethereum) {
            const handleAccountsChanged = (accounts) => {
                setAccount(accounts[0] || null);
                initContract(); // Reinitialize contract with new account
            };

            window.ethereum.on('accountsChanged', handleAccountsChanged);

            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            };
        }
    }, []);

    return { contract, loading, error, account };
}

/**
 * Hook to watch for contract events
 * @param {object} contract - The contract instance
 * @param {string} eventName - The name of the event to watch
 * @param {function} callback - Callback function when event is emitted
 */
export function useContractEvent(contract, eventName, callback) {
    useEffect(() => {
        if (!contract || !eventName || !callback) return;

        const filter = contract.filters[eventName]();
        
        contract.on(filter, callback);

        return () => {
            contract.off(filter, callback);
        };
    }, [contract, eventName, callback]);
}
