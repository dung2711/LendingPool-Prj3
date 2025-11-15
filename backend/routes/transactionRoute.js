import express from 'express';
import { getAllTransactions, getTransactionsByUser, createTransaction } from "../controllers/transactionController.js";

const route = express.Router();

route.get("/transactions/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const { limit, offset, type } = req.query;
        const transactions = await getTransactionsByUserAddress(address, {
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
            type: type || null
        });
        res.status(200).json(transactions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.post("/transactions", async (req, res) => {
    try {
        const { hash, userAddress, assetAddress, type, amount, timestamp } = req.body;
        const transaction = await createTransaction({hash, userAddress, assetAddress, type, amount, timestamp});
        res.status(201).json(transaction);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}); 

export default route;