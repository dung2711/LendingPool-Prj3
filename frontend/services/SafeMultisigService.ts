import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS || "";
const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || "";
const PROTOCOL_CONTROLLER_ADDRESS =
  process.env.NEXT_PUBLIC_PROTOCOL_CONTROLLER_ADDRESS || "";
const PROTOCOL_TIMELOCK_ADDRESS =
  process.env.NEXT_PUBLIC_PROTOCOL_TIMELOCK_ADDRESS || "";
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";
const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY || "";

const ZERO_VALUE = 0n;

const TIMELOCK_ABI = [
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)",
  "function hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function getMinDelay() view returns (uint256)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "function isOperationPending(bytes32 id) view returns (bool)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
  "function EXECUTOR_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
];

const timelockInterface = new ethers.Interface(TIMELOCK_ABI);

interface SafeTransaction {
  to: string;
  value: string;
  data: string;
}

interface ProposalResult {
  safeTxHash: string;
  safeTransaction: SafeTransaction;
  type?: "schedule";
  operationId?: string;
  predecessor?: string;
  salt?: string;
  delaySeconds?: string;
  eta?: string;
}

interface TimelockScheduleParams {
  target: string;
  data: string;
  value?: bigint;
  predecessor?: string;
  salt?: string;
}

interface ExecuteTimelockOperationParams {
  target: string;
  data: string;
  predecessor?: string;
  salt?: string;
  value?: string;
  operationId?: string;
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

interface TimelockInfo {
  timelockAddress: string;
  minDelay: number;
  minDelayHours: number;
  isExecutorOpen: boolean;
}

interface TimelockOperationState {
  operationId: string;
  timestamp: string;
  isPending: boolean;
  isReady: boolean;
  isDone: boolean;
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

const getBrowserProvider = (): ethers.BrowserProvider => {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not available");
  }

  return new ethers.BrowserProvider(window.ethereum);
};

const validateConfig = (): void => {
  if (!SAFE_ADDRESS || !ethers.isAddress(SAFE_ADDRESS)) {
    throw new Error("Invalid NEXT_PUBLIC_SAFE_ADDRESS");
  }
  if (
    !PROTOCOL_CONTROLLER_ADDRESS ||
    !ethers.isAddress(PROTOCOL_CONTROLLER_ADDRESS)
  ) {
    throw new Error("Invalid NEXT_PUBLIC_PROTOCOL_CONTROLLER_ADDRESS");
  }
  if (
    !PROTOCOL_TIMELOCK_ADDRESS ||
    !ethers.isAddress(PROTOCOL_TIMELOCK_ADDRESS)
  ) {
    throw new Error("Invalid NEXT_PUBLIC_PROTOCOL_TIMELOCK_ADDRESS");
  }
};

const getProtocolKit = async (): Promise<Safe> => {
  validateConfig();
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();

  return await Safe.init({
    provider: window.ethereum as any,
    signer: await signer.getAddress(),
    safeAddress: SAFE_ADDRESS,
  });
};

const getTimelockContract = async (): Promise<ethers.Contract> => {
  validateConfig();
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();

  return new ethers.Contract(PROTOCOL_TIMELOCK_ADDRESS, TIMELOCK_ABI, signer);
};

const encodeProtocolControllerFunction = (
  functionName: string,
  params: unknown[] = [],
): string => {
  const protocolControllerABI = [
    "function migrateController(address newController)",
    "function setLendingPool(address _lendingPool)",
    "function setPriceRouter(address _priceRouter)",
    "function setLiquidation(address _liquidation)",
    "function setMyOracle(address _myOracle)",
    "function pauseLendingPool()",
    "function unpauseLendingPool()",
    "function supportMarket(address asset, address irm)",
    "function supportMarketWithChainlinkFeed(address asset, address irm, address feed)",
    "function supportMarketWithMyOracleFeed(address asset, address irm, uint256 price)",
    "function unsupportMarket(address asset)",
    "function setCollateralParams(uint256 _collateralFactor)",
    "function setInterestRateModelBatch(address[] calldata assets, address interestRateModel)",
    "function setLiquidateParams(uint256 _liquidationThreshold, uint256 _closeFactor, uint256 _liquidationIncentive)",
    "function setChainlinkFeed(address asset, address feed)",
    "function setMyOracleFeed(address asset)",
    "function removeFeed(address asset)",
    "function setPrice(address asset, uint256 price)",
    "function withdrawTreasury(address asset, address to, uint256 amount)",
    "function rescueToken(address token, address to, uint256 amount)",
    "function upgradePriceRouter(address newImplementation)",
    "function upgradeLendingPool(address newImplementation)",
  ];

  const iface = new ethers.Interface(protocolControllerABI);
  return iface.encodeFunctionData(functionName, params);
};

const encodeLendingPoolFunction = (
  functionName: string,
  params: unknown[] = [],
): string => {
  const lendingPoolABI = ["function donate(address asset, uint256 amount)"];
  const iface = new ethers.Interface(lendingPoolABI);
  return iface.encodeFunctionData(functionName, params);
};

const proposeTransaction = async (
  to: string,
  data: string,
): Promise<ProposalResult> => {
  try {
    validateConfig();
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

const proposeTimelockSchedule = async (
  params: TimelockScheduleParams,
): Promise<ProposalResult> => {
  const {
    target,
    data: targetData,
    value = ZERO_VALUE,
    predecessor = ethers.ZeroHash,
    salt = ethers.hexlify(ethers.randomBytes(32)),
  } = params;

  if (!ethers.isAddress(target)) {
    throw new Error("Invalid timelock target address");
  }

  const timelock = await getTimelockContract();
  const delay = (await timelock.getMinDelay()) as bigint;
  const operationId = (await timelock.hashOperation(
    target,
    value,
    targetData,
    predecessor,
    salt,
  )) as string;

  const scheduleData = timelockInterface.encodeFunctionData("schedule", [
    target,
    value,
    targetData,
    predecessor,
    salt,
    delay,
  ]);

  const proposal = await proposeTransaction(
    PROTOCOL_TIMELOCK_ADDRESS,
    scheduleData,
  );

  return {
    ...proposal,
    type: "schedule",
    operationId,
    predecessor,
    salt,
    delaySeconds: delay.toString(),
    eta: new Date(Date.now() + Number(delay) * 1000).toISOString(),
  };
};

export const safeMultisigService = {
  // Keep backward compatible names; all proposals now flow through timelock.
  proposePause(): Promise<ProposalResult> {
    return this.proposePauseLendingPool();
  },

  proposeUnpause(): Promise<ProposalResult> {
    return this.proposeUnpauseLendingPool();
  },

  // Timelock primitive helpers
  proposeTimelockSchedule(
    controllerData: string,
    predecessor: string = ethers.ZeroHash,
    salt: string = ethers.hexlify(ethers.randomBytes(32)),
  ): Promise<ProposalResult> {
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
      value: ZERO_VALUE,
      predecessor,
      salt,
    });
  },

  proposeTimelockScheduleRaw(
    target: string,
    data: string,
    value: bigint = ZERO_VALUE,
    predecessor: string = ethers.ZeroHash,
    salt: string = ethers.hexlify(ethers.randomBytes(32)),
  ): Promise<ProposalResult> {
    return proposeTimelockSchedule({
      target,
      data,
      value,
      predecessor,
      salt,
    });
  },

  proposeMigrateController(newController: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "migrateController",
      [newController],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetLendingPool(addressValue: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setLendingPool", [
      addressValue,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetPriceRouter(addressValue: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setPriceRouter", [
      addressValue,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetLiquidation(addressValue: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setLiquidation", [
      addressValue,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetMyOracle(addressValue: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setMyOracle", [
      addressValue,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  // ProtocolController actions proposed via Timelock.schedule(...)
  proposePauseLendingPool(): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("pauseLendingPool");
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeUnpauseLendingPool(): Promise<ProposalResult> {
    const controllerData =
      encodeProtocolControllerFunction("unpauseLendingPool");
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSupportMarket(asset: string, irm: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("supportMarket", [
      asset,
      irm,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSupportMarketWithChainlinkFeed(
    asset: string,
    irm: string,
    feed: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "supportMarketWithChainlinkFeed",
      [asset, irm, feed],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSupportMarketWithMyOracleFeed(
    asset: string,
    irm: string,
    price: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "supportMarketWithMyOracleFeed",
      [asset, irm, price],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeUnsupportMarket(asset: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("unsupportMarket", [
      asset,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetCollateralParams(
    collateralFactor: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "setCollateralParams",
      [collateralFactor],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetInterestRateModelBatch(
    assets: string[],
    interestRateModel: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "setInterestRateModelBatch",
      [assets, interestRateModel],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetLiquidateParams(
    liquidationThreshold: string,
    closeFactor: string,
    liquidationIncentive: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "setLiquidateParams",
      [liquidationThreshold, closeFactor, liquidationIncentive],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetChainlinkFeed(
    asset: string,
    feed: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "setChainlinkFeed",
      [asset, feed],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetMyOracleFeed(asset: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setMyOracleFeed", [
      asset,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeRemoveFeed(asset: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("removeFeed", [
      asset,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeSetPrice(asset: string, price: string): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("setPrice", [
      asset,
      price,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeWithdrawTreasury(
    asset: string,
    to: string,
    amount: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "withdrawTreasury",
      [asset, to, amount],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeRescueToken(
    token: string,
    to: string,
    amount: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction("rescueToken", [
      token,
      to,
      amount,
    ]);
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeDonate(asset: string, amount: string): Promise<ProposalResult> {
    if (!LENDING_POOL_ADDRESS || !ethers.isAddress(LENDING_POOL_ADDRESS)) {
      throw new Error("Invalid NEXT_PUBLIC_LENDING_POOL_ADDRESS");
    }

    const donateData = encodeLendingPoolFunction("donate", [asset, amount]);
    return proposeTimelockSchedule({
      target: LENDING_POOL_ADDRESS,
      data: donateData,
    });
  },

  proposeUpgradePriceRouter(
    newImplementation: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "upgradePriceRouter",
      [newImplementation],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  proposeUpgradeLendingPool(
    newImplementation: string,
  ): Promise<ProposalResult> {
    const controllerData = encodeProtocolControllerFunction(
      "upgradeLendingPool",
      [newImplementation],
    );
    return proposeTimelockSchedule({
      target: PROTOCOL_CONTROLLER_ADDRESS,
      data: controllerData,
    });
  },

  async getTimelockInfo(): Promise<TimelockInfo> {
    const timelock = await getTimelockContract();
    const minDelayRaw = (await timelock.getMinDelay()) as bigint;
    const executorRole = (await timelock.EXECUTOR_ROLE()) as string;
    const isExecutorOpen = (await timelock.hasRole(
      executorRole,
      ethers.ZeroAddress,
    )) as boolean;

    const minDelay = Number(minDelayRaw);

    return {
      timelockAddress: PROTOCOL_TIMELOCK_ADDRESS,
      minDelay,
      minDelayHours: minDelay / 3600,
      isExecutorOpen,
    };
  },

  async getOperationState(
    operationId: string,
  ): Promise<TimelockOperationState> {
    const timelock = await getTimelockContract();

    const [timestamp, isPending, isReady, isDone] = await Promise.all([
      timelock.getTimestamp(operationId) as Promise<bigint>,
      timelock.isOperationPending(operationId) as Promise<boolean>,
      timelock.isOperationReady(operationId) as Promise<boolean>,
      timelock.isOperationDone(operationId) as Promise<boolean>,
    ]);

    return {
      operationId,
      timestamp: timestamp.toString(),
      isPending,
      isReady,
      isDone,
    };
  },

  async getTimelockMinDelay(): Promise<number> {
    const timelock = await getTimelockContract();
    const minDelay = (await timelock.getMinDelay()) as bigint;
    return Number(minDelay);
  },

  async executeTimelockOperation(
    params: ExecuteTimelockOperationParams,
  ): Promise<ethers.TransactionResponse> {
    const {
      target,
      data,
      value = "0",
      predecessor = ethers.ZeroHash,
      salt = ethers.ZeroHash,
      operationId,
    } = params;

    if (!ethers.isAddress(target)) {
      throw new Error("Invalid timelock target address");
    }

    const timelock = await getTimelockContract();
    const valueBigInt = BigInt(value);

    const operationHash =
      operationId ||
      ((await timelock.hashOperation(
        target,
        valueBigInt,
        data,
        predecessor,
        salt,
      )) as string);

    const [isDone, isReady] = await Promise.all([
      timelock.isOperationDone(operationHash) as Promise<boolean>,
      timelock.isOperationReady(operationHash) as Promise<boolean>,
    ]);

    if (isDone) {
      throw new Error("Timelock operation is already executed");
    }

    if (!isReady) {
      throw new Error("Timelock operation is not ready yet");
    }

    const tx = (await timelock.execute(
      target,
      valueBigInt,
      data,
      predecessor,
      salt,
    )) as ethers.TransactionResponse;

    return tx;
  },

  // Transaction management functions
  async getPendingTransactions(): Promise<PendingTransaction[]> {
    try {
      validateConfig();
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
      validateConfig();
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
