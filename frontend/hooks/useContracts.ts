"use client";

import type { Contract } from "ethers";
import { useEffect, useState } from "react";
import { web3Service } from "@/lib/web3";

interface ContractHookState {
  contract: Contract | null;
  loading: boolean;
  error: string | null;
}

interface AllContractsState {
  lendingPool: Contract | null;
  priceRouter: Contract | null;
  liquidation: Contract | null;
  interestRateModel: Contract | null;
  loading: boolean;
  error: string | null;
}

interface ContractWithAccountState extends ContractHookState {
  account: string | null;
}

/**
 * Hook to get the LendingPool contract instance
 */
export function useLendingPool(): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await web3Service.getLendingPoolContract();
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing LendingPool contract:", err);
        setError(message);
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
export function usePriceRouter(): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await web3Service.getPriceRouterContract();
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing PriceRouter contract:", err);
        setError(message);
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
export function useMyOracle(): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await web3Service.getMyOracleContract();
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing MyOracle contract:", err);
        setError(message);
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
export function useLiquidation(): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await web3Service.getLiquidationContract();
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing Liquidation contract:", err);
        setError(message);
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
export function useInterestRateModel(): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance =
          await web3Service.getInterestRateModelContract();
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing InterestRateModel contract:", err);
        setError(message);
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
 */
export function useToken(tokenAddress?: string): ContractHookState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setLoading(false);
      return;
    }

    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await web3Service.getToken(tokenAddress);
        setContract(contractInstance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing Token contract:", err);
        setError(message);
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
export function useAllContracts(): AllContractsState {
  const lendingPool = useLendingPool();
  const priceRouter = usePriceRouter();
  const liquidation = useLiquidation();
  const interestRateModel = useInterestRateModel();

  const loading =
    lendingPool.loading ||
    priceRouter.loading ||
    liquidation.loading ||
    interestRateModel.loading;
  const error =
    lendingPool.error ||
    priceRouter.error ||
    liquidation.error ||
    interestRateModel.error;

  return {
    lendingPool: lendingPool.contract,
    priceRouter: priceRouter.contract,
    liquidation: liquidation.contract,
    interestRateModel: interestRateModel.contract,
    loading,
    error,
  };
}

/**
 * Hook to get contract with account change listener
 */
export function useContractWithAccount(
  getContractFn: () => Promise<Contract>,
): ContractWithAccountState {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    const initContract = async () => {
      try {
        setLoading(true);
        const contractInstance = await getContractFn();
        setContract(contractInstance);
        setError(null);

        // Get current account
        if (typeof window !== "undefined" && window.ethereum) {
          const accounts = (await window.ethereum.request({
            method: "eth_accounts",
          })) as string[];
          setAccount(accounts[0] || null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error initializing contract:", err);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    initContract();

    // Listen for account changes
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        setAccount(accounts[0] || null);
        initContract(); // Reinitialize contract with new account
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum?.removeListener(
          "accountsChanged",
          handleAccountsChanged,
        );
      };
    }
  }, [getContractFn]);

  return { contract, loading, error, account };
}

/**
 * Hook to watch for contract events
 */
export function useContractEvent(
  contract: Contract | null,
  eventName: string,
  callback: (...args: unknown[]) => void,
): void {
  useEffect(() => {
    if (!contract || !eventName || !callback) return;

    const filter =
      contract.filters[eventName as keyof typeof contract.filters]?.();

    if (filter) {
      contract.on(filter, callback);

      return () => {
        contract.off(filter, callback);
      };
    }
  }, [contract, eventName, callback]);
}
