const express = require("express");
const cors = require("cors");
const { initPool, closePool, query } = require("./db");
const { authenticate } = require("./middleware/auth");
const { useLocalData, localData } = require("./localData");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const salesRoutes = require("./routes/sales");
const companyRoutes = require("./routes/companies");
const warehouseRoutes = require("./routes/warehouses");
const inventoryRoutes = require("./routes/inventory");
const supplierRoutes = require("./routes/suppliers");
const transferRoutes = require("./routes/transfers");
const returnRoutes = require("./routes/returns");
const reportRoutes = require("./routes/reports");
const receiptRoutes = require("./routes/receipts");

const app = express();

if (process.env.tns_admin) {
  process.env.TNS_ADMIN = process.env.tns_admin;
}

const port = process.env.PORT || process.env.port || 3001;
const useLocalAuth =
  (process.env.local_auth || process.env.LOCAL_AUTH) === "1";

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db-test", authenticate, async (req, res) => {
  if (useLocalData) {
    return res.json({ user: "local-demo" });
  }
  try {
    const result = await query("select user from dual");
    const row = result.rows[0];
    const user = row?.USER ?? row?.[0] ?? null;
    res.json({ user });
  } catch (err) {
    console.error("DB test failed:", err);
    res.status(500).json({
      error: err.message,
      code: err.code,
      errorNum: err.errorNum,
      offset: err.offset,
    });
  }
});

app.get("/items", (req, res) => {
  if (useLocalData) {
    const warehouseId = req.query.warehouse_id
      ? Number(req.query.warehouse_id)
      : null;
    if (Number.isFinite(warehouseId)) {
      return res.json({ items: localData.listInventory(warehouseId) });
    }
    return res.json({ items: localData.listProducts() });
  }
  res.status(501).json({ error: "items route is only available in local demo" });
});

app.get("/items/:id", (req, res) => {
  if (useLocalData) {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ error: "invalid item id" });
    }
    const product = localData.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "item not found" });
    }
    return res.json({ item: product });
  }
  res.status(501).json({ error: "items route is only available in local demo" });
});

app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/products", authenticate, productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/sales", authenticate, salesRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/receipts", receiptRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    if (!useLocalAuth && !useLocalData) {
      await initPool();
    }
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  try {
    await closePool();
  } finally {
    process.exit(0);
  }
});

start();
