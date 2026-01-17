const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function getProducts(req, res) {
  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        SELECT product_id AS "product_id",
               product_code AS "product_code",
               product_name AS "product_name",
               barcode AS "barcode",
               category_id AS "category_id",
               description AS "description",
               unit_of_measure AS "unit_of_measure",
               unit_price AS "unit_price",
               cost_price AS "cost_price",
               tax_rate AS "tax_rate",
               is_active AS "is_active"
          FROM products
         WHERE is_deleted = 'N'
         ORDER BY product_name
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.json({ products: result.rows });
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return res.status(500).json({ error: "Failed to fetch products" });
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

async function createProduct(req, res) {
  const {
    product_code: productCode,
    product_name: productName,
    barcode,
    category_id: categoryId,
    description,
    unit_of_measure: unitOfMeasure,
    unit_price: unitPrice,
    cost_price: costPrice,
    tax_rate: taxRate,
    is_active: isActive,
  } = req.body || {};

  if (!productCode || !productName || unitPrice === undefined) {
    return res.status(400).json({
      error: "product_code, product_name, and unit_price are required",
    });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        INSERT INTO products (
          product_code,
          product_name,
          barcode,
          category_id,
          description,
          unit_of_measure,
          unit_price,
          cost_price,
          tax_rate,
          is_active,
          is_deleted,
          created_at,
          updated_at
        )
        VALUES (
          :product_code,
          :product_name,
          :barcode,
          :category_id,
          :description,
          :unit_of_measure,
          :unit_price,
          :cost_price,
          :tax_rate,
          :is_active,
          'N',
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING product_id INTO :product_id
      `,
      {
        product_code: productCode,
        product_name: productName,
        barcode: barcode || null,
        category_id: categoryId || null,
        description: description || null,
        unit_of_measure: unitOfMeasure || "UNIT",
        unit_price: Number(unitPrice),
        cost_price: costPrice !== undefined ? Number(costPrice) : null,
        tax_rate: taxRate !== undefined ? Number(taxRate) : 0,
        is_active: isActive || "Y",
        product_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const productId = result.outBinds.product_id[0];
    return res.status(201).json({ product_id: productId });
  } catch (err) {
    console.error("Failed to create product:", err);
    return res.status(500).json({ error: "Failed to create product" });
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

async function updateProduct(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) {
    return res.status(400).json({ error: "invalid product id" });
  }

  const {
    product_code: productCode,
    product_name: productName,
    barcode,
    category_id: categoryId,
    description,
    unit_of_measure: unitOfMeasure,
    unit_price: unitPrice,
    cost_price: costPrice,
    tax_rate: taxRate,
    is_active: isActive,
  } = req.body || {};

  if (!productCode || !productName || unitPrice === undefined) {
    return res.status(400).json({
      error: "product_code, product_name, and unit_price are required",
    });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        UPDATE products
           SET product_code = :product_code,
               product_name = :product_name,
               barcode = :barcode,
               category_id = :category_id,
               description = :description,
               unit_of_measure = :unit_of_measure,
               unit_price = :unit_price,
               cost_price = :cost_price,
               tax_rate = :tax_rate,
               is_active = :is_active,
               updated_at = SYSTIMESTAMP
         WHERE product_id = :product_id
           AND is_deleted = 'N'
      `,
      {
        product_id: productId,
        product_code: productCode,
        product_name: productName,
        barcode: barcode || null,
        category_id: categoryId || null,
        description: description || null,
        unit_of_measure: unitOfMeasure || "UNIT",
        unit_price: Number(unitPrice),
        cost_price: costPrice !== undefined ? Number(costPrice) : null,
        tax_rate: taxRate !== undefined ? Number(taxRate) : 0,
        is_active: isActive || "Y",
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "product not found" });
    }

    return res.json({ product_id: productId });
  } catch (err) {
    console.error("Failed to update product:", err);
    return res.status(500).json({ error: "Failed to update product" });
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

async function deleteProduct(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isFinite(productId)) {
    return res.status(400).json({ error: "invalid product id" });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        UPDATE products
           SET is_deleted = 'Y',
               deleted_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE product_id = :product_id
           AND is_deleted = 'N'
      `,
      { product_id: productId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "product not found" });
    }

    return res.json({ product_id: productId });
  } catch (err) {
    console.error("Failed to delete product:", err);
    return res.status(500).json({ error: "Failed to delete product" });
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
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
