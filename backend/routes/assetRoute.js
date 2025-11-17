import express from 'express';
import { getAllAssets, getAssetByAddress, createAsset, updateAssetBalances, deleteAsset } from "../controllers/assetController.js";

const route = express.Router();

route.get("/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const asset = await getAssetByAddress(address);
        res.status(200).json(asset);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.get("/", async (req, res) => {
    try {
        const assets = await getAllAssets();
        res.status(200).json(assets);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.post("/", async (req, res) => {
    try {
        const assetData = req.body;
        const asset = await createAsset(assetData);
        res.status(201).json(asset);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.put("/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const { totalSupply, totalBorrow, depositIndex, borrowIndex, lastUpdateTimestamp, depositRate, borrowRate } = req.body;
        const asset = await updateAssetBalances(address, totalSupply, totalBorrow, depositIndex, 
                                                borrowIndex, lastUpdateTimestamp, depositRate, borrowRate);
        res.status(200).json(asset);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.delete("/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const deleted = await deleteAsset(address);
        if (deleted) {
            res.status(200).json({ message: 'Asset deleted successfully' });
        } else {
            res.status(404).json({ error: 'Asset not found' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

export default route;