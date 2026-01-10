const oracledb = require("oracledb");
const path = require("path");

require("dotenv").config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;

async function initPool() {
  if (pool) {
    return pool;
  }

  const walletDir = path.join(__dirname, "wallet");

  pool = await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_SERVICE,
    walletLocation: walletDir,
    walletPassword: process.env.WALLET_PASSWORD,
    configDir: walletDir,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
  });

  return pool;
}

async function getConnection() {
  if (!pool) {
    await initPool();
  }
  return pool.getConnection();
}

async function closePool() {
  if (pool) {
    await pool.close(0);
    pool = null;
  }
}

module.exports = {
  getConnection,
  initPool,
  closePool,
};
