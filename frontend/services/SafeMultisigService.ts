import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS || "";
const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || "";
const PROTOCOL_CONTROLLER_ADDRESS =
  process.env.NEXT_PUBLIC_PROTOCOL_CONTROLLER_ADDRESS || "";
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
  confirmations: Array<{
    signer?: { value: string } | string;
    owner?: string;
  }>;
  confirmationsRequired: number;
}

interface SafeInfo {
  owners: string[];
  threshold: number;
  nonce: number;
}

interface TransactionDetails {
  safeTxHash: string;
  safe: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  gasToken: string;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  refundReceiver: string;
  signatures: string;
  submissionDate: string;
  confirmations: { signer: { value: string } }[];
  confirmationsRequired: number;
  isExecuted: boolean;
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

const encodeLendingPoolFunction = (
  functionName: string,
  params: unknown[] = [],
): string => {
  const lendingPoolABI = [
    "function pause()",
    "function unpause()",
    "function supportMarket(address asset, address irm)",
    "function unsupportMarket(address asset)",
    "function setCollateralParams(uint256 _collateralFactor)",
    "function setInterestRateModelBatch(address[] calldata assets, address interestRateModel)",
  ];

  const iface = new ethers.Interface(lendingPoolABI);
  return iface.encodeFunctionData(functionName, params);
};

const encodeProtocolControllerFunction = (
  functionName: string,
  params: unknown[] = [],
): string => {
  const protocolControllerABI = [
    "function pauseLendingPool()",
    "function unpauseLendingPool()",
    "function supportMarket(address asset, address irm)",
    "function unsupportMarket(address asset)",
    "function setCollateralParams(uint256 _collateralFactor)",
    "function setInterestRateModelBatch(address[] calldata assets, address interestRateModel)",
    "function setLiquidateParams(uint256 _liquidationThreshold, uint256 _closeFactor, uint256 _liquidationIncentive)",
    "function setChainlinkFeed(address asset, address feed)",
    "function setMyOracleFeed(address asset)",
    "function removeFeed(address asset)",
    "function setPrice(address asset, uint256 price)",
  ];

  const iface = new ethers.Interface(protocolControllerABI);
  return iface.encodeFunctionData(functionName, params);
};

const proposeTransaction = async (
  to: string,
  data: string,
): Promise<ProposalResult> => {
  try {
    const protocolKit = await getProtocolKit();
    const apiKit = getSafeApiKit();

    const safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to: to,
          value: "0",
          data: data,
        },
      ],
    });

    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const signature = await protocolKit.signHash(safeTxHash);
    const signerAddress =
      (await protocolKit.getSafeProvider().getSignerAddress()) || "";

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
    console.error("Error proposing transaction:", error);
    throw error;
  }
};

export const safeMultisigService = {
  // Pause/Unpause functions (direct on LendingPool)
  proposePause(): Promise<ProposalResult> {
    const data = encodeLendingPoolFunction("pause");
    return proposeTransaction(LENDING_POOL_ADDRESS, data);
  },

  proposeUnpause(): Promise<ProposalResult> {
    const data = encodeLendingPoolFunction("unpause");
    return proposeTransaction(LENDING_POOL_ADDRESS, data);
  },

  // ProtocolController functions
  proposePauseLendingPool(): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("pauseLendingPool");
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeUnpauseLendingPool(): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("unpauseLendingPool");
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSupportMarket(asset: string, irm: string): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("supportMarket", [
      asset,
      irm,
    ]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeUnsupportMarket(asset: string): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("unsupportMarket", [asset]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetCollateralParams(
    collateralFactor: string,
  ): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setCollateralParams", [
      collateralFactor,
    ]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetInterestRateModelBatch(
    assets: string[],
    interestRateModel: string,
  ): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setInterestRateModelBatch", [
      assets,
      interestRateModel,
    ]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetLiquidateParams(
    liquidationThreshold: string,
    closeFactor: string,
    liquidationIncentive: string,
  ): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setLiquidateParams", [
      liquidationThreshold,
      closeFactor,
      liquidationIncentive,
    ]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetChainlinkFeed(
    asset: string,
    feed: string,
  ): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setChainlinkFeed", [
      asset,
      feed,
    ]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetMyOracleFeed(asset: string): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setMyOracleFeed", [asset]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeRemoveFeed(asset: string): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("removeFeed", [asset]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  proposeSetPrice(asset: string, price: string): Promise<ProposalResult> {
    const data = encodeProtocolControllerFunction("setPrice", [asset, price]);
    return proposeTransaction(PROTOCOL_CONTROLLER_ADDRESS, data);
  },

  // Transaction management functions
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

  async getTransaction(safeTxHash: string): Promise<TransactionDetails> {
    try {
      const apiKit = getSafeApiKit();
      const tx = await apiKit.getTransaction(safeTxHash);
      return tx as any as TransactionDetails;
    } catch (error) {
      console.error("Error fetching transaction:", error);
      throw error;
    }
  },

  async signTransaction(safeTxHash: string): Promise<TransactionDetails> {
    try {
      const protocolKit = await getProtocolKit();
      const apiKit = getSafeApiKit();

      const signature = await protocolKit.signHash(safeTxHash);
      await apiKit.confirmTransaction(safeTxHash, signature.data);

      const tx = await apiKit.getTransaction(safeTxHash);
      return tx as any as TransactionDetails;
    } catch (error) {
      console.error("Error signing transaction:", error);
      throw error;
    }
  },

  async executeTransaction(
    safeTxHash: string,
  ): Promise<ethers.TransactionResponse | null> {
    try {
      const protocolKit = await getProtocolKit();
      const apiKit = getSafeApiKit();

      const safeTransaction = await apiKit.getTransaction(safeTxHash);
      const safeTransactionData = safeTransaction as any;

      if (
        safeTransactionData.confirmations.length <
        safeTransactionData.confirmationsRequired
      ) {
        throw new Error(
          `Insufficient signatures. Required: ${safeTransactionData.confirmationsRequired}, Got: ${safeTransactionData.confirmations.length}`,
        );
      }

      const executeTxResponse =
        await protocolKit.executeTransaction(safeTransactionData);
      return (executeTxResponse as any).transactionResponse || null;
    } catch (error) {
      console.error("Error executing transaction:", error);
      throw error;
    }
  },

  async isOwner(): Promise<boolean> {
    try {
      const protocolKit = await getProtocolKit();
      const owners = await protocolKit.getOwners();
      const signerAddress =
        (await protocolKit.getSafeProvider().getSignerAddress()) || "";
      return owners
        .map((o) => o.toLowerCase())
        .includes(signerAddress.toLowerCase());
    } catch (error) {
      console.error("Error checking owner status:", error);
      return false;
    }
  },

  async getCurrentSignerAddress(): Promise<string> {
    try {
      const protocolKit = await getProtocolKit();
      const signerAddress =
        (await protocolKit.getSafeProvider().getSignerAddress()) || "";
      return signerAddress.toLowerCase();
    } catch (error) {
      console.error("Error getting signer address:", error);
      return "";
    }
  },

  async getSafeInfo(): Promise<SafeInfo> {
    try {
      const protocolKit = await getProtocolKit();
      const owners = await protocolKit.getOwners();
      const threshold = await protocolKit.getThreshold();
      const nonce = await protocolKit.getNonce();

      return {
        owners,
        threshold,
        nonce,
      };
    } catch (error) {
      console.error("Error fetching Safe info:", error);
      throw error;
    }
  },
};
