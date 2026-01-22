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
    }))
    .filter(
      (item) =>
        Number.isFinite(item.product_id) &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    );
}

async function listTransfers(req, res) {
  const status = req.query.status || null;
  const direction = req.query.direction || null;
  const warehouseId = req.user?.warehouse_id || req.query.warehouse_id;
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
      transfers: localData.listTransfers({
        status,
        direction,
        warehouseId: Number.isFinite(numericId) ? numericId : null,
      }),
    });
  }

  let connection;
  try {
    connection = await getConnection();

    const binds = {
      status: status || null,
      warehouse_id: warehouseId ? Number(warehouseId) : null,
    };

    let directionClause = "";
    if (direction === "incoming") {
      directionClause = "AND t.to_warehouse_id = :warehouse_id";
    } else if (direction === "outgoing") {
      directionClause = "AND t.from_warehouse_id = :warehouse_id";
    } else if (warehouseId) {
      directionClause =
        "AND (t.from_warehouse_id = :warehouse_id OR t.to_warehouse_id = :warehouse_id)";
    }

    const transfersResult = await connection.execute(
      `
        SELECT t.transfer_id,
               t.transfer_number,
               t.company_id,
               t.from_warehouse_id,
               t.to_warehouse_id,
               t.status,
               t.notes,
               t.requested_by,
               t.approved_by,
               t.approved_at,
               t.created_at,
               t.updated_at,
               wf.warehouse_name AS from_warehouse_name,
               wt.warehouse_name AS to_warehouse_name
          FROM warehouse_transfers t
          JOIN warehouses wf ON wf.warehouse_id = t.from_warehouse_id
          JOIN warehouses wt ON wt.warehouse_id = t.to_warehouse_id
         WHERE (:status IS NULL OR t.status = :status)
         ${directionClause}
         ORDER BY t.created_at DESC
      `,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const transfers = transfersResult.rows;
    if (!transfers.length) {
      return res.json({ transfers: [] });
    }

    const transferIds = transfers.map((t) => t.TRANSFER_ID);
    const itemsResult = await connection.execute(
      `
        SELECT i.transfer_id,
               i.product_id,
               i.quantity,
               p.product_name
          FROM warehouse_transfer_items i
          JOIN products p ON p.product_id = i.product_id
         WHERE i.transfer_id IN (${transferIds.map((_, idx) => `:id${idx}`).join(", ")})
      `,
      transferIds.reduce((acc, id, idx) => {
        acc[`id${idx}`] = id;
        return acc;
      }, {}),
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const itemsByTransfer = new Map();
    for (const item of itemsResult.rows) {
      if (!itemsByTransfer.has(item.TRANSFER_ID)) {
        itemsByTransfer.set(item.TRANSFER_ID, []);
      }
      itemsByTransfer.get(item.TRANSFER_ID).push({
        product_id: item.PRODUCT_ID,
        product_name: item.PRODUCT_NAME,
        quantity: item.QUANTITY,
      });
    }

    const enriched = transfers.map((t) => ({
      transfer_id: t.TRANSFER_ID,
      transfer_number: t.TRANSFER_NUMBER,
      company_id: t.COMPANY_ID,
      from_warehouse_id: t.FROM_WAREHOUSE_ID,
      to_warehouse_id: t.TO_WAREHOUSE_ID,
      from_warehouse_name: t.FROM_WAREHOUSE_NAME,
      to_warehouse_name: t.TO_WAREHOUSE_NAME,
      status: t.STATUS,
      notes: t.NOTES,
      requested_by: t.REQUESTED_BY,
      approved_by: t.APPROVED_BY,
      approved_at: t.APPROVED_AT,
      created_at: t.CREATED_AT,
      updated_at: t.UPDATED_AT,
      items: itemsByTransfer.get(t.TRANSFER_ID) || [],
    }));

    return res.json({ transfers: enriched });
  } catch (err) {
    console.error("Failed to list transfers:", err);
    return res.status(500).json({ error: "Failed to list transfers" });
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

async function createTransfer(req, res) {
  const {
    from_warehouse_id: fromWarehouseRaw,
    to_warehouse_id: toWarehouseRaw,
    notes,
    transfer_number: transferNumberRaw,
  } = req.body || {};

  const items = normalizeItems(req.body?.items);
  if (!items.length) {
    return res.status(400).json({ error: "items are required" });
  }

  const fromWarehouseId = Number(fromWarehouseRaw || req.user?.warehouse_id);
  const toWarehouseId = Number(toWarehouseRaw);
  if (!Number.isFinite(fromWarehouseId) || !Number.isFinite(toWarehouseId)) {
    return res
      .status(400)
      .json({ error: "from_warehouse_id and to_warehouse_id are required" });
  }

  if (fromWarehouseId === toWarehouseId) {
    return res
      .status(400)
      .json({ error: "from_warehouse_id and to_warehouse_id must differ" });
  }

  if (
    req.user?.warehouse_id &&
    Number(req.user.warehouse_id) !== fromWarehouseId
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  if (useLocalData) {
    try {
      const created = localData.createTransfer({
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        notes: notes || null,
        transfer_number: transferNumberRaw || null,
        requested_by: req.user?.user_id || null,
        items,
      });
      return res.status(201).json({ transfer_id: created.transfer_id });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();

    const warehouseResult = await connection.execute(
      `
        SELECT warehouse_id, company_id
          FROM warehouses
         WHERE warehouse_id IN (:from_id, :to_id)
           AND is_deleted = 'N'
           AND is_active = 'Y'
      `,
      { from_id: fromWarehouseId, to_id: toWarehouseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (warehouseResult.rows.length !== 2) {
      return res.status(400).json({ error: "invalid warehouse selection" });
    }

    const companyId = warehouseResult.rows[0].COMPANY_ID;
    const sameCompany = warehouseResult.rows.every(
      (row) => row.COMPANY_ID === companyId
    );
    if (!sameCompany || !companyId) {
      return res
        .status(400)
        .json({ error: "warehouses must belong to the same company" });
    }

    const transferNumber =
      transferNumberRaw || `TRF-${Date.now().toString().slice(-8)}`;

    const transferResult = await connection.execute(
      `
        INSERT INTO warehouse_transfers (
          transfer_number,
          company_id,
          from_warehouse_id,
          to_warehouse_id,
          status,
          notes,
          requested_by,
          created_at,
          updated_at
        )
        VALUES (
          :transfer_number,
          :company_id,
          :from_warehouse_id,
          :to_warehouse_id,
          'PENDING',
          :notes,
          :requested_by,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING transfer_id INTO :transfer_id
      `,
      {
        transfer_number: transferNumber,
        company_id: companyId,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        notes: notes || null,
        requested_by: req.user?.user_id || null,
        transfer_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    const transferId = transferResult.outBinds.transfer_id[0];

    const itemBinds = items.map((item) => ({
      transfer_id: transferId,
      product_id: item.product_id,
      quantity: item.quantity,
    }));

    await connection.executeMany(
      `
        INSERT INTO warehouse_transfer_items (
          transfer_id,
          product_id,
          quantity,
          created_at,
          updated_at
        )
        VALUES (
          :transfer_id,
          :product_id,
          :quantity,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `,
      itemBinds
    );

    await connection.commit();

    return res.status(201).json({ transfer_id: transferId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Failed to create transfer:", err);
    return res.status(500).json({ error: "Failed to create transfer" });
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

async function approveTransfer(req, res) {
  const transferId = Number(req.params.id);
  if (!Number.isFinite(transferId)) {
    return res.status(400).json({ error: "invalid transfer id" });
  }

  if (useLocalData) {
    try {
      const updated = localData.approveTransfer(
        transferId,
        req.user?.user_id || null
      );
      if (!updated) {
        return res.status(404).json({ error: "transfer not found" });
      }
      return res.json({ transfer_id: transferId, status: "COMPLETED" });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();

    const transferResult = await connection.execute(
      `
        SELECT transfer_id,
               from_warehouse_id,
               to_warehouse_id,
               status
          FROM warehouse_transfers
         WHERE transfer_id = :transfer_id
         FOR UPDATE
      `,
      { transfer_id: transferId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const transfer = transferResult.rows[0];
    if (!transfer) {
      return res.status(404).json({ error: "transfer not found" });
    }
    if (transfer.STATUS !== "PENDING") {
      return res.status(400).json({ error: "transfer is not pending" });
    }

    const itemsResult = await connection.execute(
      `
        SELECT product_id,
               quantity
          FROM warehouse_transfer_items
         WHERE transfer_id = :transfer_id
      `,
      { transfer_id: transferId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const items = itemsResult.rows;
    for (const item of items) {
      const updateResult = await connection.execute(
        `
          UPDATE inventory_balances
             SET quantity_on_hand = quantity_on_hand - :quantity,
                 updated_at = SYSTIMESTAMP,
                 last_movement_at = SYSTIMESTAMP
           WHERE warehouse_id = :warehouse_id
             AND product_id = :product_id
             AND quantity_on_hand >= :quantity
        `,
        {
          warehouse_id: transfer.FROM_WAREHOUSE_ID,
          product_id: item.PRODUCT_ID,
          quantity: item.QUANTITY,
        }
      );

      if (updateResult.rowsAffected === 0) {
        throw new Error(
          `Insufficient stock for product_id ${item.PRODUCT_ID}`
        );
      }

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
          product_id: item.PRODUCT_ID,
          warehouse_id: transfer.TO_WAREHOUSE_ID,
          quantity: item.QUANTITY,
        }
      );
    }

    await connection.execute(
      `
        UPDATE warehouse_transfers
           SET status = 'COMPLETED',
               approved_by = :approved_by,
               approved_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE transfer_id = :transfer_id
      `,
      {
        transfer_id: transferId,
        approved_by: req.user?.user_id || null,
      }
    );

    await connection.commit();

    return res.json({ transfer_id: transferId, status: "COMPLETED" });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Failed to approve transfer:", err);
    return res.status(500).json({ error: err.message || "Failed to approve transfer" });
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

async function rejectTransfer(req, res) {
  const transferId = Number(req.params.id);
  if (!Number.isFinite(transferId)) {
    return res.status(400).json({ error: "invalid transfer id" });
  }

  if (useLocalData) {
    const updated = localData.rejectTransfer(
      transferId,
      req.user?.user_id || null
    );
    if (!updated) {
      return res.status(404).json({ error: "transfer not found or not pending" });
    }
    return res.json({ transfer_id: transferId, status: "REJECTED" });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE warehouse_transfers
           SET status = 'REJECTED',
               approved_by = :approved_by,
               approved_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE transfer_id = :transfer_id
           AND status = 'PENDING'
      `,
      {
        transfer_id: transferId,
        approved_by: req.user?.user_id || null,
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "transfer not found or not pending" });
    }

    return res.json({ transfer_id: transferId, status: "REJECTED" });
  } catch (err) {
    console.error("Failed to reject transfer:", err);
    return res.status(500).json({ error: "Failed to reject transfer" });
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
  listTransfers,
  createTransfer,
  approveTransfer,
  rejectTransfer,
};
