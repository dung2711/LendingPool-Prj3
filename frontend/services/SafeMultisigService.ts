import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS || "";
const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || "";
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";
const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY || "";

interface SafeTransaction {
  to: string;
  value: string;
  data: string;
}

interface ProposalResult {
  safeTxHash: string;
  safeTransaction: SafeTransaction;
}

interface PendingTransaction {
  safeTxHash: string;
  safe: string;
  nonce: number;
  data: string;
  value: string;
  to: string;
  confirmed: boolean;
  submissionDate: string;
}

const getSafeApiKit = (): SafeApiKit =>
  new SafeApiKit({
    chainId: BigInt(CHAIN_ID),
    apiKey: SAFE_API_KEY,
  });

const getProtocolKit = async (): Promise<Safe> => {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not available");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return await Safe.init({
    provider: window.ethereum as any,
    signer: await signer.getAddress(),
    safeAddress: SAFE_ADDRESS,
  });
};

const encodeFunctionData = (
  functionName: string,
  params: unknown[] = [],
): string => {
  const lendingPoolABI = [
    "function pause()",
    "function unpause()",
    "function setCollateralParams(uint256 _collateralFactor)",
  ];

  const iface = new ethers.Interface(lendingPoolABI);
  return iface.encodeFunctionData(functionName, params);
};

export const safeMultisigService = {
  async proposePause(): Promise<ProposalResult> {
    try {
      const protocolKit = await getProtocolKit();
      const apiKit = getSafeApiKit();

      const data = encodeFunctionData("pause");

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
      const signerAddress = (await protocolKit
        .getSafeProvider()
        .getSignerAddress()) || "";

      await apiKit.proposeTransaction({
        safeAddress: SAFE_ADDRESS,
        safeTransactionData: safeTransaction.data,
        safeTxHash: safeTxHash,
        senderAddress: signerAddress,
        senderSignature: signature.data,
      });

      return {
        safeTxHash,
        safeTransaction: safeTransaction.data as SafeTransaction,
      };
    } catch (error) {
      console.error("Error proposing pause:", error);
      throw error;
    }
  },

  async proposeUnpause(): Promise<ProposalResult> {
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
      const signerAddress = (await protocolKit
        .getSafeProvider()
        .getSignerAddress()) || "";

      await apiKit.proposeTransaction({
        safeAddress: SAFE_ADDRESS,
        safeTransactionData: safeTransaction.data,
        safeTxHash: safeTxHash,
        senderAddress: signerAddress,
        senderSignature: signature.data,
      });

      return {
        safeTxHash,
        safeTransaction: safeTransaction.data as SafeTransaction,
      };
    } catch (error) {
      console.error("Error proposing unpause:", error);
      throw error;
    }
  },

  async getPendingTransactions(): Promise<PendingTransaction[]> {
    try {
      const apiKit = getSafeApiKit();
      const pendingTxs = await apiKit.getPendingTransactions(SAFE_ADDRESS);
      return pendingTxs.results as any as PendingTransaction[];
    } catch (error) {
      console.error("Error fetching pending transactions:", error);
      throw error;
    }
  },
};
