import express from 'express';
import bodyParser from 'body-parser';
import { getAllUsers, getUserByAddress, createUser } from "../controllers/userController.js";

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const route = express.Router();

route.get("/users/:address", async (req, res) => {
    try {
        const address = req.params.address;
        const user = await getUserByAddress(address);
        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

route.post("/users", async (req, res) => {
    try {
        const { address } = req.body;
        const user = await createUser(address);
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

export default route;