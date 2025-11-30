import { getAllLiquidatableUsers } from "../controllers/liquidatableUsersController.js";
import express from 'express';
import eventListener from '../services/blockchain/eventListener.js';
import { calculateLiquidatableUsers } from "../services/blockchain/eventHandlers.js";

const route = express.Router();

route.get("/", async (req, res) => {
    try {
        const liquidatableUsers = await getAllLiquidatableUsers();
        res.status(200).json(liquidatableUsers);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.get("/metadata", async (req, res) => {
    try {
        await calculateLiquidatableUsers();
        const liquidatableUsers = await getAllLiquidatableUsers();
        const lastUpdate = eventListener.getLastLiquidatableUpdate();
        res.status(200).json({
            count: liquidatableUsers.length,
            lastUpdate: lastUpdate,
            users: liquidatableUsers.map(u => u.userAddress)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.post("/force-check", async (req, res) => {
    try {
        const liquidatableUsers = await eventListener.forceLiquidatableCheck();
        res.status(200).json({
            success: true,
            count: liquidatableUsers.length,
            users: liquidatableUsers
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default route;