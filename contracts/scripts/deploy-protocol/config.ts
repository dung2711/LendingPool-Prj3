export type SupportedNetwork = "sepolia";

export type IRMType = "stable" | "volatile";

export type IRMConfig = {
  baseRate: number;
  rateSlope1: number;
  rateSlope2: number;
  optimalUtilization: number;
  reserveFactor: number;
};

export type ProtocolConfig = {
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationIncentive: number;
  closeFactor: number;
  irm: Record<IRMType, IRMConfig>;
};

export const protocolConfig: Record<SupportedNetwork, ProtocolConfig> = {
  sepolia: {
    collateralFactor: 0.8,
    liquidationThreshold: 0.9,
    liquidationIncentive: 0.05,
    closeFactor: 0.5,
    irm: {
      stable: {
        baseRate: 0.02,
        rateSlope1: 0.08,
        rateSlope2: 1,
        optimalUtilization: 0.8,
        reserveFactor: 0.1,
      },
      volatile: {
        baseRate: 0.03,
        rateSlope1: 0.1,
        rateSlope2: 0.2,
        optimalUtilization: 0.9,
        reserveFactor: 0.1,
      },
    },
  },
};
