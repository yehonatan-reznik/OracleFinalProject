const express = require("express");
const cors = require("cors");
const { initPool, closePool, query } = require("./db");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const salesRoutes = require("./routes/sales");

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

app.get("/api/db-test", async (req, res) => {
  try {
    const result = await query("select user from dual");
    const user = result.rows[0]?.USER || null;
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
app.use("/products", productRoutes);
app.use("/sales", salesRoutes);

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
