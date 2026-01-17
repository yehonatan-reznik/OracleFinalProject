const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function listReceipts(req, res) {
  const warehouseId = req.query.warehouse_id || req.user?.warehouse_id;
  if (!warehouseId) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }
  if (
    req.user?.warehouse_id &&
    Number(req.user.warehouse_id) !== Number(warehouseId)
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT r.receipt_number AS "receipt_number",
               r.quantity AS "quantity",
               r.received_at AS "received_at",
               p.product_name AS "product_name",
               s.supplier_name AS "supplier_name"
          FROM inventory_receipts r
          JOIN products p ON p.product_id = r.product_id
          LEFT JOIN suppliers s ON s.supplier_id = r.supplier_id
         WHERE r.warehouse_id = :warehouse_id
         ORDER BY r.created_at DESC
         FETCH FIRST 10 ROWS ONLY
      `,
      { warehouse_id: Number(warehouseId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ receipts: result.rows });
  } catch (err) {
    console.error("Failed to list receipts:", err);
    return res.status(500).json({ error: "Failed to list receipts" });
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
  listReceipts,
};
