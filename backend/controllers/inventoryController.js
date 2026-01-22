const oracledb = require("oracledb");
const { getConnection } = require("../db");
const { useLocalData, localData } = require("../localData");

function resolveWarehouseId(req, res) {
  const warehouseId =
    req.query.warehouse_id ||
    req.body?.warehouse_id ||
    req.params?.warehouseId ||
    req.user?.warehouse_id;

  const numericId = Number(warehouseId);
  if (!Number.isFinite(numericId)) {
    res.status(400).json({ error: "warehouse_id is required" });
    return null;
  }

  if (req.user?.warehouse_id && Number(req.user.warehouse_id) !== numericId) {
    res.status(403).json({ error: "warehouse scope mismatch" });
    return null;
  }

  return numericId;
}

async function listInventory(req, res) {
  const warehouseId = resolveWarehouseId(req, res);
  if (!warehouseId) {
    return;
  }

  if (useLocalData) {
    return res.json({ items: localData.listInventory(warehouseId) });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT p.product_id AS "product_id",
               p.product_code AS "product_code",
               p.product_name AS "product_name",
               p.barcode AS "barcode",
               p.unit_price AS "unit_price",
               p.tax_rate AS "tax_rate",
               NVL(i.quantity_on_hand, 0) AS "quantity_on_hand"
          FROM products p
          LEFT JOIN inventory_balances i
            ON i.product_id = p.product_id
           AND i.warehouse_id = :warehouse_id
         WHERE p.is_deleted = 'N'
         ORDER BY p.product_name
      `,
      { warehouse_id: warehouseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("Failed to list inventory:", err);
    return res.status(500).json({ error: "Failed to list inventory" });
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

async function getInventoryItem(req, res) {
  const warehouseId = resolveWarehouseId(req, res);
  if (!warehouseId) {
    return;
  }

  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId)) {
    return res.status(400).json({ error: "invalid product id" });
  }

  if (useLocalData) {
    return res.json({
      inventory: localData.getInventoryItem(warehouseId, productId),
    });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT inventory_id AS "inventory_id",
               product_id AS "product_id",
               warehouse_id AS "warehouse_id",
               quantity_on_hand AS "quantity_on_hand",
               quantity_reserved AS "quantity_reserved"
          FROM inventory_balances
         WHERE warehouse_id = :warehouse_id
           AND product_id = :product_id
      `,
      { warehouse_id: warehouseId, product_id: productId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows[0];
    return res.json({
      inventory: row || {
        product_id: productId,
        warehouse_id: warehouseId,
        quantity_on_hand: 0,
        quantity_reserved: 0,
      },
    });
  } catch (err) {
    console.error("Failed to fetch inventory item:", err);
    return res.status(500).json({ error: "Failed to fetch inventory item" });
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

async function receiveStock(req, res) {
  const warehouseId = resolveWarehouseId(req, res);
  if (!warehouseId) {
    return;
  }

  const productId = Number(req.body?.product_id);
  const quantity = Number(req.body?.quantity);
  const supplierId = req.body?.supplier_id ? Number(req.body.supplier_id) : null;
  const receivedAt = req.body?.received_at
    ? new Date(req.body.received_at)
    : new Date();
  if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "product_id and quantity are required" });
  }

  if (useLocalData) {
    try {
      localData.receiveStock({
        warehouseId,
        productId,
        quantity,
        supplierId,
        userId: req.user?.user_id || null,
      });
      return res.json({ warehouse_id: warehouseId, product_id: productId });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();
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
        product_id: productId,
        warehouse_id: warehouseId,
        quantity,
      },
      { autoCommit: false }
    );

    await connection.execute(
      `
        INSERT INTO inventory_receipts (
          receipt_number,
          warehouse_id,
          product_id,
          supplier_id,
          quantity,
          received_at,
          created_by,
          created_at
        )
        VALUES (
          :receipt_number,
          :warehouse_id,
          :product_id,
          :supplier_id,
          :quantity,
          :received_at,
          :created_by,
          SYSTIMESTAMP
        )
      `,
      {
        receipt_number: `RCV-${Date.now().toString().slice(-8)}`,
        warehouse_id: warehouseId,
        product_id: productId,
        supplier_id: Number.isFinite(supplierId) ? supplierId : null,
        quantity,
        received_at: receivedAt,
        created_by: req.user?.user_id || null,
      }
    );

    await connection.commit();

    return res.json({ warehouse_id: warehouseId, product_id: productId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Failed to receive stock:", err);
    return res.status(500).json({ error: "Failed to receive stock" });
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

async function adjustStock(req, res) {
  const warehouseId = resolveWarehouseId(req, res);
  if (!warehouseId) {
    return;
  }

  const productId = Number(req.body?.product_id);
  const newQuantity = Number(req.body?.quantity_on_hand);
  if (!Number.isFinite(productId) || !Number.isFinite(newQuantity) || newQuantity < 0) {
    return res
      .status(400)
      .json({ error: "product_id and quantity_on_hand are required" });
  }

  if (useLocalData) {
    try {
      localData.adjustStock({
        warehouseId,
        productId,
        quantity: newQuantity,
      });
      return res.json({ warehouse_id: warehouseId, product_id: productId });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();
    const existing = await connection.execute(
      `
        SELECT inventory_id
          FROM inventory_balances
         WHERE warehouse_id = :warehouse_id
           AND product_id = :product_id
      `,
      { warehouse_id: warehouseId, product_id: productId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existing.rows.length) {
      await connection.execute(
        `
          UPDATE inventory_balances
             SET quantity_on_hand = :quantity_on_hand,
                 updated_at = SYSTIMESTAMP,
                 last_movement_at = SYSTIMESTAMP
           WHERE warehouse_id = :warehouse_id
             AND product_id = :product_id
        `,
        {
          warehouse_id: warehouseId,
          product_id: productId,
          quantity_on_hand: newQuantity,
        },
        { autoCommit: true }
      );
    } else {
      await connection.execute(
        `
          INSERT INTO inventory_balances (
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
            :quantity_on_hand,
            0,
            SYSTIMESTAMP,
            SYSTIMESTAMP,
            SYSTIMESTAMP
          )
        `,
        {
          product_id: productId,
          warehouse_id: warehouseId,
          quantity_on_hand: newQuantity,
        },
        { autoCommit: true }
      );
    }

    return res.json({ warehouse_id: warehouseId, product_id: productId });
  } catch (err) {
    console.error("Failed to adjust stock:", err);
    return res.status(500).json({ error: "Failed to adjust stock" });
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
  listInventory,
  getInventoryItem,
  receiveStock,
  adjustStock,
};
