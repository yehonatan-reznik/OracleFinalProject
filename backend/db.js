const oracledb = require("oracledb");

require("dotenv").config();

if (process.env.oci_lib_dir) {
  oracledb.initOracleClient({ libDir: process.env.oci_lib_dir });
}

oracledb.outFormat = oracledb.outFormat || oracledb.OUT_FORMAT_OBJECT;

let pool;

async function initPool() {
  if (pool) {
    return pool;
  }

  const connectString = process.env.db_connect_string;
  const tnsAdmin = process.env.tns_admin;

  console.log("using tns_admin:", tnsAdmin);
  console.log("using connectString:", connectString);
  console.log("oracle client version:", oracledb.oracleClientVersionString);

  try {
    const poolConfig = {
      poolAlias: "main",
      user: process.env.db_user,
      password: process.env.db_password,
      connectString: process.env.db_connect_string,
    };

    pool = await oracledb.createPool(poolConfig);
  } catch (err) {
    console.error("Failed to create pool:", err);
    throw err;
  }

  return pool;
}

async function getConnection() {
  try {
    if (!pool) {
      await initPool();
    }
    return await pool.getConnection();
  } catch (err) {
    console.error("Failed to get connection:", err);
    throw err;
  }
}

async function query(sql, binds = {}, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    return await connection.execute(sql, binds, options);
  } catch (err) {
    console.error("Query failed:", err);
    throw err;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error("Failed to close connection:", closeErr);
      }
    }
  }
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
  query,
  closePool,
};
