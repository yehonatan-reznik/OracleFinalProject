const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function getProducts(req, res) {
  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        SELECT product_id,
               product_code,
               product_name,
               barcode,
               category_id,
               description,
               unit_of_measure,
               unit_price,
               cost_price,
               tax_rate,
               is_active
          FROM products
         WHERE is_deleted = 'N'
         ORDER BY product_name
      `
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
          is_active
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
          :is_active
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

module.exports = {
  getProducts,
  createProduct,
};
