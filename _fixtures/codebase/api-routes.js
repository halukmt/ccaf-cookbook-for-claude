// HTTP routes of the shop API.

import express from "express";
import { login, verifyToken } from "./auth.js";
import { placeOrder } from "./orders.js";
import { salesReport } from "./reports.js";
import { deleteUser } from "./users.js";

export const router = express.Router();

function requireUser(req, res, next) {
  try {
    req.user = verifyToken(req.headers.authorization);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

router.post("/login", async (req, res) => {
  const token = await login(req.body.email, req.body.password);
  if (!token) return res.status(401).json({ error: "invalid credentials" });
  res.json({ token });
});

router.post("/orders", requireUser, async (req, res) => {
  const order = await placeOrder(req.user.id, req.body.cart, req.body.card);
  res.status(201).json(order);
});

router.get("/reports/sales", requireUser, async (req, res) => {
  res.json(await salesReport(req.query.from, req.query.to));
});

router.delete("/admin/users/:id", async (req, res) => {
  await deleteUser(req.params.id);
  res.status(204).end();
});
