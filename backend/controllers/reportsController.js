const oracledb = require("oracledb");
const { getConnection } = require("../db");
const { useLocalData, localData } = require("../localData");

async function getPosReport(req, res) {
  const warehouseId = req.user?.warehouse_id || req.query.warehouse_id;
  if (!warehouseId) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }
  if (
    req.user?.warehouse_id &&
    Number(req.user.warehouse_id) !== Number(warehouseId)
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  if (useLocalData) {
    return res.json(localData.getPosReport(Number(warehouseId)));
  }

  let connection;
  try {
    connection = await getConnection();

    const salesResult = await connection.execute(
      `
        SELECT NVL(SUM(total_amount), 0) AS "total_sales"
          FROM sales_transactions
         WHERE warehouse_id = :warehouse_id
           AND sale_datetime >= TRUNC(SYSDATE)
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const returnsResult = await connection.execute(
      `
        SELECT COUNT(*) AS "return_count"
          FROM returns
         WHERE warehouse_id = :warehouse_id
           AND created_at >= TRUNC(SYSDATE)
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const lowStockResult = await connection.execute(
      `
        SELECT p.product_name AS "product_name",
               i.quantity_on_hand AS "quantity_on_hand",
               w.warehouse_name AS "warehouse_name"
          FROM inventory_balances i
          JOIN products p ON p.product_id = i.product_id
          JOIN warehouses w ON w.warehouse_id = i.warehouse_id
         WHERE i.warehouse_id = :warehouse_id
           AND i.quantity_on_hand <= 10
         ORDER BY i.quantity_on_hand ASC
         FETCH FIRST 10 ROWS ONLY
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const recentSalesResult = await connection.execute(
      `
        SELECT sale_number AS "sale_number",
               cashier_id AS "cashier_id",
               total_amount AS "total_amount",
               status AS "status"
          FROM sales_transactions
         WHERE warehouse_id = :warehouse_id
         ORDER BY sale_datetime DESC
         FETCH FIRST 10 ROWS ONLY
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const reasonResult = await connection.execute(
      `
        SELECT NVL(reason, 'Unspecified') AS "reason",
               COUNT(*) AS "total"
          FROM returns
         WHERE warehouse_id = :warehouse_id
           AND created_at >= TRUNC(SYSDATE)
         GROUP BY NVL(reason, 'Unspecified')
         ORDER BY total DESC
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.json({
      totals: {
        total_sales: salesResult.rows[0]?.total_sales || 0,
        returns_count: returnsResult.rows[0]?.return_count || 0,
      },
      low_stock: lowStockResult.rows,
      recent_sales: recentSalesResult.rows,
      return_reasons: reasonResult.rows,
    });
  } catch (err) {
    console.error("Failed to load POS report:", err);
    return res.status(500).json({ error: "Failed to load POS report" });
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

async function getWarehouseReport(req, res) {
  const warehouseId = req.user?.warehouse_id || req.query.warehouse_id;
  if (!warehouseId) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }
  if (
    req.user?.warehouse_id &&
    Number(req.user.warehouse_id) !== Number(warehouseId)
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  if (useLocalData) {
    return res.json(localData.getWarehouseReport(Number(warehouseId)));
  }

  let connection;
  try {
    connection = await getConnection();

    const lowStockResult = await connection.execute(
      `
        SELECT COUNT(*) AS "low_stock_count"
          FROM inventory_balances
         WHERE warehouse_id = :warehouse_id
           AND quantity_on_hand <= 10
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const pendingTransfersResult = await connection.execute(
      `
        SELECT COUNT(*) AS "pending_transfers"
          FROM warehouse_transfers
         WHERE to_warehouse_id = :warehouse_id
           AND status = 'PENDING'
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const stockTotalResult = await connection.execute(
      `
        SELECT NVL(SUM(quantity_on_hand), 0) AS "total_units"
          FROM inventory_balances
         WHERE warehouse_id = :warehouse_id
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const alertItemsResult = await connection.execute(
      `
        SELECT p.product_name AS "product_name",
               i.quantity_on_hand AS "quantity_on_hand"
          FROM inventory_balances i
          JOIN products p ON p.product_id = i.product_id
         WHERE i.warehouse_id = :warehouse_id
           AND i.quantity_on_hand <= 10
         ORDER BY i.quantity_on_hand ASC
         FETCH FIRST 5 ROWS ONLY
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.json({
      totals: {
        low_stock: lowStockResult.rows[0]?.low_stock_count || 0,
        pending_transfers: pendingTransfersResult.rows[0]?.pending_transfers || 0,
        total_units: stockTotalResult.rows[0]?.total_units || 0,
      },
      alerts: alertItemsResult.rows,
    });
  } catch (err) {
    console.error("Failed to load warehouse report:", err);
    return res.status(500).json({ error: "Failed to load warehouse report" });
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

module.exports = {
  getPosReport,
  getWarehouseReport,
};
