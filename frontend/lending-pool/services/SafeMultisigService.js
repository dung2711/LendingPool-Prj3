import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS;
const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111"; // Sepolia by default
const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY;

// Initialize Safe API Kit (for transaction service)
const getSafeApiKit = () =>
  new SafeApiKit({
    chainId: BigInt(CHAIN_ID),
    apiKey: SAFE_API_KEY,
  });

// Initialize Protocol Kit (for creating and signing transactions)
const getProtocolKit = async () => {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not available");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return await Safe.init({
    provider: window.ethereum,
    signer: await signer.getAddress(),
    safeAddress: SAFE_ADDRESS,
  });
};

// Encode function call data
const encodeFunctionData = (functionName, params = []) => {
  const lendingPoolABI = [
    "function pause()",
    "function unpause()",
    "function setCollateralParams(uint256 _collateralFactor)",
    // Add other functions as needed
  ];

  const iface = new ethers.Interface(lendingPoolABI);
  return iface.encodeFunctionData(functionName, params);
};

/**
 * Propose a pause transaction
 * @returns {Object} { safeTxHash, safeTransaction }
 */
export const proposePause = async () => {
  try {
    const protocolKit = await getProtocolKit();
    const apiKit = getSafeApiKit();

    // Create transaction data
    const data = encodeFunctionData("pause");

    // Create Safe transaction
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to: LENDING_POOL_ADDRESS,
          value: "0",
          data: data,
        },
      ],
    });

    // Sign transaction with proposer's signature
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);

    // Propose transaction to Safe service
    await apiKit.proposeTransaction({
      safeAddress: SAFE_ADDRESS,
      safeTransactionData: safeTransaction.data,
      safeTxHash: safeTxHash,
      senderAddress: await protocolKit.getSafeProvider().getSignerAddress(),
      senderSignature: signature.data,
    });

    return {
      safeTxHash,
      safeTransaction,
    };
  } catch (error) {
    console.error("Error proposing pause:", error);
    throw error;
  }
};

/**
 * Propose an unpause transaction
 * @returns {Object} { safeTxHash, safeTransaction }
 */
export const proposeUnpause = async () => {
  try {
    const protocolKit = await getProtocolKit();
    const apiKit = getSafeApiKit();

    const data = encodeFunctionData("unpause");

    const safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to: LENDING_POOL_ADDRESS,
          value: "0",
          data: data,
        },
      ],
    });

    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);

    await apiKit.proposeTransaction({
      safeAddress: SAFE_ADDRESS,
      safeTransactionData: safeTransaction.data,
      safeTxHash: safeTxHash,
      senderAddress: await (await getProtocolKit())
        .getSafeProvider()
        .getSignerAddress(),
      senderSignature: signature.data,
    });

    return {
      safeTxHash,
      safeTransaction,
    };
  } catch (error) {
    console.error("Error proposing unpause:", error);
    throw error;
  }
};

/**
 * Get all pending transactions for the Safe
 * @returns {Array} List of pending transactions
 */
export const getPendingTransactions = async () => {
  try {
    const apiKit = getSafeApiKit();
    const pendingTxs = await apiKit.getPendingTransactions(SAFE_ADDRESS);
    return pendingTxs.results;
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    throw error;
  }
};

/**
 * Sign a pending transaction
 * @param {string} safeTxHash - The Safe transaction hash
 * @returns {Object} Updated transaction with new signature
 */
export const signTransaction = async (safeTxHash) => {
  try {
    const protocolKit = await getProtocolKit();
    const apiKit = getSafeApiKit();

    // Sign the transaction hash
    const signature = await protocolKit.signHash(safeTxHash);

    // Confirm the transaction with the new signature
    await apiKit.confirmTransaction(safeTxHash, signature.data);

    // Get updated transaction
    const transaction = await apiKit.getTransaction(safeTxHash);

    return transaction;
  } catch (error) {
    console.error("Error signing transaction:", error);
    throw error;
  }
};

/**
 * Execute a transaction once threshold is met
 * @param {string} safeTxHash - The Safe transaction hash
 * @returns {Object} Transaction receipt
 */
export const executeTransaction = async (safeTxHash) => {
  try {
    const protocolKit = await getProtocolKit();
    const apiKit = getSafeApiKit();

    // Get the transaction details
    const safeTransaction = await apiKit.getTransaction(safeTxHash);

    // Check if threshold is met
    if (
      safeTransaction.confirmations.length <
      safeTransaction.confirmationsRequired
    ) {
      throw new Error(
        `Insufficient signatures. Required: ${safeTransaction.confirmationsRequired}, Got: ${safeTransaction.confirmations.length}`,
      );
    }

    // Execute the transaction
    const executeTxResponse =
      await protocolKit.executeTransaction(safeTransaction);
    const receipt = await executeTxResponse.transactionResponse?.wait();

    return receipt;
  } catch (error) {
    console.error("Error executing transaction:", error);
    throw error;
  }
};

/**
 * Get transaction details
 * @param {string} safeTxHash - The Safe transaction hash
 * @returns {Object} Transaction details
 */
export const getTransaction = async (safeTxHash) => {
  try {
    const apiKit = getSafeApiKit();
    return await apiKit.getTransaction(safeTxHash);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    throw error;
  }
};

/**
 * Check if current user is a Safe owner
 * @returns {boolean}
 */
export const isOwner = async () => {
  try {
    const protocolKit = await getProtocolKit();
    const owners = await protocolKit.getOwners();
    const signerAddress = await protocolKit
      .getSafeProvider()
      .getSignerAddress();
    return owners
      .map((o) => o.toLowerCase())
      .includes(signerAddress.toLowerCase());
  } catch (error) {
    console.error("Error checking ownership:", error);
    return false;
  }
};

/**
 * Get Safe info
 * @returns {Object} Safe information (owners, threshold, nonce)
 */
export const getSafeInfo = async () => {
  try {
    const protocolKit = await getProtocolKit();
    const owners = await protocolKit.getOwners();
    const threshold = await protocolKit.getThreshold();
    const nonce = await protocolKit.getNonce();

    return {
      address: SAFE_ADDRESS,
      owners,
      threshold,
      nonce,
    };
  } catch (error) {
    console.error("Error fetching Safe info:", error);
    throw error;
  }
};
