const express = require("express");
const cors = require("cors");
const { initPool, closePool, query } = require("./db");
const { authenticate } = require("./middleware/auth");

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

const port = process.env.port || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db-test", authenticate, async (req, res) => {
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
    await initPool();
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
