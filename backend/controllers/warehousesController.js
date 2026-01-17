const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function listWarehouses(req, res) {
  const companyId = req.query.company_id ? Number(req.query.company_id) : null;
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT warehouse_id AS "warehouse_id",
               warehouse_code AS "warehouse_code",
               warehouse_name AS "warehouse_name",
               company_id AS "company_id",
               address AS "address",
               city AS "city",
               country AS "country",
               is_active AS "is_active"
          FROM warehouses
         WHERE is_deleted = 'N'
           AND is_active = 'Y'
           AND (:company_id is null or company_id = :company_id)
         ORDER BY warehouse_name
      `,
      { company_id: companyId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ warehouses: result.rows });
  } catch (err) {
    console.error("Failed to list warehouses:", err);
    return res.status(500).json({ error: "Failed to list warehouses" });
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

async function createWarehouse(req, res) {
  const {
    warehouse_code: warehouseCode,
    warehouse_name: warehouseName,
    company_id: companyId,
    address,
    city,
    country,
    is_active: isActive,
  } = req.body || {};

  if (!warehouseCode || !warehouseName || !companyId) {
    return res.status(400).json({
      error: "warehouse_code, warehouse_name, and company_id are required",
    });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        INSERT INTO warehouses (
          warehouse_code,
          warehouse_name,
          company_id,
          address,
          city,
          country,
          is_active,
          is_deleted,
          created_at,
          updated_at
        )
        VALUES (
          :warehouse_code,
          :warehouse_name,
          :company_id,
          :address,
          :city,
          :country,
          :is_active,
          'N',
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING warehouse_id INTO :warehouse_id
      `,
      {
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        company_id: Number(companyId),
        address: address || null,
        city: city || null,
        country: country || null,
        is_active: isActive || "Y",
        warehouse_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const warehouseId = result.outBinds.warehouse_id[0];
    return res.status(201).json({ warehouse_id: warehouseId });
  } catch (err) {
    console.error("Failed to create warehouse:", err);
    return res.status(500).json({ error: "Failed to create warehouse" });
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

async function updateWarehouse(req, res) {
  const warehouseId = Number(req.params.id);
  if (!Number.isFinite(warehouseId)) {
    return res.status(400).json({ error: "invalid warehouse id" });
  }

  const {
    warehouse_code: warehouseCode,
    warehouse_name: warehouseName,
    company_id: companyId,
    address,
    city,
    country,
    is_active: isActive,
  } = req.body || {};

  if (!warehouseCode || !warehouseName || !companyId) {
    return res.status(400).json({
      error: "warehouse_code, warehouse_name, and company_id are required",
    });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE warehouses
           SET warehouse_code = :warehouse_code,
               warehouse_name = :warehouse_name,
               company_id = :company_id,
               address = :address,
               city = :city,
               country = :country,
               is_active = :is_active,
               updated_at = SYSTIMESTAMP
         WHERE warehouse_id = :warehouse_id
           AND is_deleted = 'N'
      `,
      {
        warehouse_id: warehouseId,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        company_id: Number(companyId),
        address: address || null,
        city: city || null,
        country: country || null,
        is_active: isActive || "Y",
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "warehouse not found" });
    }

    return res.json({ warehouse_id: warehouseId });
  } catch (err) {
    console.error("Failed to update warehouse:", err);
    return res.status(500).json({ error: "Failed to update warehouse" });
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

async function deleteWarehouse(req, res) {
  const warehouseId = Number(req.params.id);
  if (!Number.isFinite(warehouseId)) {
    return res.status(400).json({ error: "invalid warehouse id" });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE warehouses
           SET is_deleted = 'Y',
               deleted_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE warehouse_id = :warehouse_id
           AND is_deleted = 'N'
      `,
      { warehouse_id: warehouseId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "warehouse not found" });
    }

    return res.json({ warehouse_id: warehouseId });
  } catch (err) {
    console.error("Failed to delete warehouse:", err);
    return res.status(500).json({ error: "Failed to delete warehouse" });
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
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
