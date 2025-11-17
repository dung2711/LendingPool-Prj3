import { Market_config } from "../models/index.js";
import { ethers } from "ethers";

export const getMarketConfigByAddress = async (marketAddress) => {
    return await Market_config.findByPk(marketAddress);
}

export const createMarketConfig = async (marketAddress) => {
    if (!marketAddress) {
        throw new Error("marketAddress is a required field.");
    }
    if (!ethers.isAddress(marketAddress) || marketAddress === ethers.ZeroAddress) {
        throw new Error("Invalid marketAddress format.");
    }
    return await Market_config.create({
        marketAddress,
        baseRate: ethers.parseEther("0.02"),
        slope1: ethers.parseEther("0.08"),
        slope2: ethers.parseEther("1"),
        optimalUtilization: ethers.parseEther("0.8"),
        reserveFactor: ethers.parseEther("0.1"),
        collateralFactor: ethers.parseEther("0.8"),
        closeFactor: ethers.parseEther("0.5"),
        liquidationIncentive: ethers.parseEther("0.05"),
        liquidationThreshold: ethers.parseEther("0.9")
    });
}

export const updateMarketConfig = async ({ collateralFactor, closeFactor, liquidationIncentive, liquidationThreshold}) => {
    const updates = {};
    if(closeFactor) updates.closeFactor = closeFactor;
    if(collateralFactor) updates.collateralFactor = collateralFactor;
    if(liquidationIncentive) updates.liquidationIncentive = liquidationIncentive;
    if(liquidationThreshold) updates.liquidationThreshold = liquidationThreshold;
    await Market_config.update(updates, {
        where: {}
    });
    return null;
}