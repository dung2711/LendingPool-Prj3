import express from 'express';
import { getAssetsByUser, createUserAsset, updateUserAsset } from "../controllers/userAssetController.js";

const route = express.Router();

route.get("/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const userAssets = await getAssetsByUser(address);
        res.status(200).json(userAssets);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.post("/", async (req, res) => {
    try {
        const { userAddress, assetAddress, deposited,
            borrowed,
            depositIndexSnapShot,
            borrowIndexSnapShot } = req.body;
        const userAsset = await createUserAsset({ userAddress, assetAddress, deposited,
            borrowed,
            depositIndexSnapShot,
            borrowIndexSnapShot });
        res.status(201).json(userAsset);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.put("/", async (req, res) => {
    try {
        const { userAddress, assetAddress, deposited,
            borrowed,
            depositIndexSnapShot,
            borrowIndexSnapShot } = req.body;
        const userAsset = await updateUserAsset(userAddress, assetAddress, { deposited,
            borrowed,
            depositIndexSnapShot,
            borrowIndexSnapShot });
        res.status(200).json(userAsset);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

export default route;