const oracledb = require("oracledb");
const { getConnection } = require("../db");

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function createSale(req, res) {
  const {
    sale_number: saleNumber,
    customer_id: customerId,
    cashier_id: cashierIdRaw,
    warehouse_id: warehouseIdRaw,
    gross_amount: grossAmountRaw,
    discount_amount: discountAmountRaw,
    tax_amount: taxAmountRaw,
    total_amount: totalAmountRaw,
    payment_status: paymentStatus,
    status,
    notes,
    items,
  } = req.body || {};

  const warehouseId = warehouseIdRaw || req.user?.warehouse_id;
  const cashierId = req.user?.user_id || cashierIdRaw;

  const numericWarehouseId = Number(warehouseId);
  if (!Number.isFinite(numericWarehouseId)) {
    return res.status(400).json({ error: "warehouse_id is required" });
  }

  if (!saleNumber || !cashierId || !Array.isArray(items)) {
    return res.status(400).json({
      error: "sale_number, cashier_id, warehouse_id, and items are required",
    });
  }

  if (
    req.user?.warehouse_id &&
    Number(req.user.warehouse_id) !== numericWarehouseId
  ) {
    return res.status(403).json({ error: "warehouse scope mismatch" });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: "items must not be empty" });
  }

  const normalizedItems = items.map((item, index) => {
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unit_price, 0);
    const discountAmount = toNumber(item.discount_amount, 0);
    const taxAmount = toNumber(item.tax_amount, 0);
    const lineTotal =
      item.line_total !== undefined
        ? toNumber(item.line_total, 0)
        : quantity * unitPrice - discountAmount + taxAmount;

    return {
      line_number: item.line_number || index + 1,
      product_id: item.product_id,
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      line_total: lineTotal,
    };
  });

  for (const item of normalizedItems) {
    if (!item.product_id || item.quantity <= 0 || item.unit_price < 0) {
      return res.status(400).json({ error: "Invalid sale item data" });
    }
  }

  const grossAmount =
    grossAmountRaw !== undefined
      ? toNumber(grossAmountRaw, 0)
      : normalizedItems.reduce(
          (sum, item) => sum + item.unit_price * item.quantity,
          0
        );
  const discountAmount =
    discountAmountRaw !== undefined
      ? toNumber(discountAmountRaw, 0)
      : normalizedItems.reduce((sum, item) => sum + item.discount_amount, 0);
  const taxAmount =
    taxAmountRaw !== undefined
      ? toNumber(taxAmountRaw, 0)
      : normalizedItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const totalAmount =
    totalAmountRaw !== undefined
      ? toNumber(totalAmountRaw, 0)
      : normalizedItems.reduce((sum, item) => sum + item.line_total, 0);

  let connection;
  try {
    connection = await getConnection();

    const saleResult = await connection.execute(
      `
        INSERT INTO sales_transactions (
          sale_number,
          sale_datetime,
          customer_id,
          cashier_id,
          warehouse_id,
          gross_amount,
          discount_amount,
          tax_amount,
          total_amount,
          payment_status,
          status,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          :sale_number,
          SYSTIMESTAMP,
          :customer_id,
          :cashier_id,
          :warehouse_id,
          :gross_amount,
          :discount_amount,
          :tax_amount,
          :total_amount,
          :payment_status,
          :status,
          :notes,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING sale_id INTO :sale_id
      `,
      {
        sale_number: saleNumber,
        customer_id: customerId || null,
        cashier_id: cashierId,
        warehouse_id: numericWarehouseId,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_status: paymentStatus || "UNPAID",
        status: status || "COMPLETED",
        notes: notes || null,
        sale_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    const saleId = saleResult.outBinds.sale_id[0];

    const saleItemBinds = normalizedItems.map((item) => ({
      sale_id: saleId,
      line_number: item.line_number,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      tax_amount: item.tax_amount,
      line_total: item.line_total,
    }));

    await connection.executeMany(
      `
        INSERT INTO sale_items (
          sale_id,
          line_number,
          product_id,
          quantity,
          unit_price,
          discount_amount,
          tax_amount,
          line_total,
          created_at,
          updated_at
        )
        VALUES (
          :sale_id,
          :line_number,
          :product_id,
          :quantity,
          :unit_price,
          :discount_amount,
          :tax_amount,
          :line_total,
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
      `,
      saleItemBinds,
      {
        bindDefs: {
          sale_id: { type: oracledb.NUMBER },
          line_number: { type: oracledb.NUMBER },
          product_id: { type: oracledb.NUMBER },
          quantity: { type: oracledb.NUMBER },
          unit_price: { type: oracledb.NUMBER },
          discount_amount: { type: oracledb.NUMBER },
          tax_amount: { type: oracledb.NUMBER },
          line_total: { type: oracledb.NUMBER },
        },
      }
    );

    for (const item of normalizedItems) {
      const updateResult = await connection.execute(
        `
          UPDATE inventory_balances
             SET quantity_on_hand = quantity_on_hand - :quantity,
                 updated_at = SYSTIMESTAMP,
                 last_movement_at = SYSTIMESTAMP
           WHERE product_id = :product_id
             AND warehouse_id = :warehouse_id
             AND quantity_on_hand >= :quantity
        `,
        {
          quantity: item.quantity,
          product_id: item.product_id,
          warehouse_id: numericWarehouseId,
        }
      );

      if (updateResult.rowsAffected === 0) {
        throw new Error(
          `Insufficient inventory for product_id ${item.product_id}`
        );
      }
    }

    await connection.commit();

    return res.status(201).json({ sale_id: saleId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Failed to create sale:", err);
    return res.status(500).json({ error: "Failed to create sale" });
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
  createSale,
};
