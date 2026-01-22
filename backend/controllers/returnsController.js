const oracledb = require("oracledb");
const { getConnection } = require("../db");
const { useLocalData, localData } = require("../localData");

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  return items
    .map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
      unit_price: item.unit_price !== undefined ? Number(item.unit_price) : null,
      tax_amount: item.tax_amount !== undefined ? Number(item.tax_amount) : 0,
      line_total:
        item.line_total !== undefined
          ? Number(item.line_total)
          : item.unit_price !== undefined
          ? Number(item.unit_price) * Number(item.quantity)
          : null,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.product_id) &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    );
}

async function listReturns(req, res) {
  const warehouseId = req.query.warehouse_id || req.user?.warehouse_id;
  if (
    req.user?.warehouse_id &&
    warehouseId &&
    Number(req.user.warehouse_id) !== Number(warehouseId)
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }
  if (useLocalData) {
    const numericId = warehouseId ? Number(warehouseId) : null;
    return res.json({
      returns: localData.listReturns(Number.isFinite(numericId) ? numericId : null),
    });
  }
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT return_id,
               return_number,
               sale_id,
               warehouse_id,
               cashier_id,
               reason,
               status,
               created_at
          FROM returns
         WHERE (:warehouse_id IS NULL OR warehouse_id = :warehouse_id)
         ORDER BY created_at DESC
      `,
      { warehouse_id: warehouseId ? Number(warehouseId) : null },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ returns: result.rows });
  } catch (err) {
    console.error("Failed to list returns:", err);
    return res.status(500).json({ error: "Failed to list returns" });
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

async function createReturn(req, res) {
  const {
    warehouse_id: warehouseIdRaw,
    sale_id: saleIdRaw,
    sale_number: saleNumber,
    reason,
  } = req.body || {};

  const items = normalizeItems(req.body?.items);
  if (!items.length) {
    return res.status(400).json({ error: "items are required" });
  }

  const warehouseId = Number(warehouseIdRaw || req.user?.warehouse_id);
  if (!Number.isFinite(warehouseId)) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }

  if (req.user?.warehouse_id && Number(req.user.warehouse_id) !== warehouseId) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  if (useLocalData) {
    try {
      const created = localData.createReturn({
        return_number: null,
        sale_id: saleIdRaw ? Number(saleIdRaw) : null,
        warehouse_id: warehouseId,
        cashier_id: req.user?.user_id || null,
        reason: reason || null,
        status: "COMPLETED",
        items,
      });
      return res.status(201).json({ return_id: created.return_id });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();

    let saleId = saleIdRaw ? Number(saleIdRaw) : null;
    if (!saleId && saleNumber) {
      const saleResult = await connection.execute(
        `
          SELECT sale_id
            FROM sales_transactions
           WHERE sale_number = :sale_number
           FETCH FIRST 1 ROW ONLY
        `,
        { sale_number: saleNumber },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      saleId = saleResult.rows[0]?.SALE_ID || null;
    }

    const returnNumber = `RET-${Date.now().toString().slice(-8)}`;
    const returnResult = await connection.execute(
      `
        INSERT INTO returns (
          return_number,
          sale_id,
          warehouse_id,
          cashier_id,
          reason,
          status,
          created_at,
          updated_at
        )
        VALUES (
          :return_number,
          :sale_id,
          :warehouse_id,
          :cashier_id,
          :reason,
          'COMPLETED',
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING return_id INTO :return_id
      `,
      {
        return_number: returnNumber,
        sale_id: saleId,
        warehouse_id: warehouseId,
        cashier_id: req.user?.user_id || null,
        reason: reason || null,
        return_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    const returnId = returnResult.outBinds.return_id[0];

    const itemBinds = items.map((item) => ({
      return_id: returnId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_amount: item.tax_amount,
      line_total: item.line_total,
    }));

    await connection.executeMany(
      `
        INSERT INTO return_items (
          return_id,
          product_id,
          quantity,
          unit_price,
          tax_amount,
          line_total,
          created_at,
          updated_at
        )
        VALUES (
          :return_id,
          :product_id,
          :quantity,
          :unit_price,
          :tax_amount,
          :line_total,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `,
      itemBinds
    );

    for (const item of items) {
      await connection.execute(
        `
          MERGE INTO inventory_balances i
          USING (
            SELECT :product_id AS product_id,
                   :warehouse_id AS warehouse_id
              FROM dual
          ) src
             ON (i.product_id = src.product_id AND i.warehouse_id = src.warehouse_id)
          WHEN MATCHED THEN
            UPDATE SET quantity_on_hand = i.quantity_on_hand + :quantity,
                       updated_at = SYSTIMESTAMP,
                       last_movement_at = SYSTIMESTAMP
          WHEN NOT MATCHED THEN
            INSERT (
              product_id,
              warehouse_id,
              quantity_on_hand,
              quantity_reserved,
              created_at,
              updated_at,
              last_movement_at
            )
            VALUES (
              :product_id,
              :warehouse_id,
              :quantity,
              0,
              SYSTIMESTAMP,
              SYSTIMESTAMP,
              SYSTIMESTAMP
            )
        `,
        {
          product_id: item.product_id,
          warehouse_id: warehouseId,
          quantity: item.quantity,
        }
      );
    }

    await connection.commit();

    return res.status(201).json({ return_id: returnId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Failed to create return:", err);
    return res.status(500).json({ error: "Failed to create return" });
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
  listReturns,
  createReturn,
};
