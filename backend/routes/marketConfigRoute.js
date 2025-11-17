import express from "express";
import { getMarketConfigByAddress } from "../controllers/marketConfigController.js";

const router = express.Router();

// GET /market-config/:marketAddress - Get market config by address
router.get("/:marketAddress", async (req, res) => {
    const { marketAddress } = req.params;
    try {
        const config = await getMarketConfigByAddress(marketAddress);
        if (config) {
            res.status(200).json(config);
        } else {
            res.status(404).json({ message: "Market config not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;