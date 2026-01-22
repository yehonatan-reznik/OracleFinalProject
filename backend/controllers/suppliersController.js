const oracledb = require("oracledb");
const { getConnection } = require("../db");
const { useLocalData, localData } = require("../localData");

async function listSuppliers(req, res) {
  if (useLocalData) {
    return res.json({ suppliers: localData.listSuppliers() });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT supplier_id AS "supplier_id",
               supplier_code AS "supplier_code",
               supplier_name AS "supplier_name",
               contact_name AS "contact_name",
               phone_number AS "phone_number",
               email AS "email",
               tax_id AS "tax_id",
               address AS "address",
               is_active AS "is_active"
          FROM suppliers
         WHERE is_deleted = 'N'
         ORDER BY supplier_name
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ suppliers: result.rows });
  } catch (err) {
    console.error("Failed to list suppliers:", err);
    return res.status(500).json({ error: "Failed to list suppliers" });
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

async function createSupplier(req, res) {
  const {
    supplier_code: supplierCode,
    supplier_name: supplierName,
    contact_name: contactName,
    phone_number: phoneNumber,
    email,
    tax_id: taxId,
    address,
    is_active: isActive,
  } = req.body || {};

  if (!supplierName) {
    return res.status(400).json({ error: "supplier_name is required" });
  }

  if (useLocalData) {
    try {
      const supplierId = localData.createSupplier(req.body || {});
      return res.status(201).json({ supplier_id: supplierId });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        INSERT INTO suppliers (
          supplier_code,
          supplier_name,
          contact_name,
          phone_number,
          email,
          tax_id,
          address,
          is_active,
          is_deleted,
          created_at,
          updated_at
        )
        VALUES (
          :supplier_code,
          :supplier_name,
          :contact_name,
          :phone_number,
          :email,
          :tax_id,
          :address,
          :is_active,
          'N',
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING supplier_id INTO :supplier_id
      `,
      {
        supplier_code: supplierCode || null,
        supplier_name: supplierName,
        contact_name: contactName || null,
        phone_number: phoneNumber || null,
        email: email || null,
        tax_id: taxId || null,
        address: address || null,
        is_active: isActive || "Y",
        supplier_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const supplierId = result.outBinds.supplier_id[0];
    return res.status(201).json({ supplier_id: supplierId });
  } catch (err) {
    console.error("Failed to create supplier:", err);
    return res.status(500).json({ error: "Failed to create supplier" });
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

async function updateSupplier(req, res) {
  const supplierId = Number(req.params.id);
  if (!Number.isFinite(supplierId)) {
    return res.status(400).json({ error: "invalid supplier id" });
  }

  const {
    supplier_code: supplierCode,
    supplier_name: supplierName,
    contact_name: contactName,
    phone_number: phoneNumber,
    email,
    tax_id: taxId,
    address,
    is_active: isActive,
  } = req.body || {};

  if (!supplierName) {
    return res.status(400).json({ error: "supplier_name is required" });
  }

  if (useLocalData) {
    try {
      const updated = localData.updateSupplier(supplierId, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: "supplier not found" });
      }
      return res.json({ supplier_id: supplierId });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE suppliers
           SET supplier_code = :supplier_code,
               supplier_name = :supplier_name,
               contact_name = :contact_name,
               phone_number = :phone_number,
               email = :email,
               tax_id = :tax_id,
               address = :address,
               is_active = :is_active,
               updated_at = SYSTIMESTAMP
         WHERE supplier_id = :supplier_id
           AND is_deleted = 'N'
      `,
      {
        supplier_id: supplierId,
        supplier_code: supplierCode || null,
        supplier_name: supplierName,
        contact_name: contactName || null,
        phone_number: phoneNumber || null,
        email: email || null,
        tax_id: taxId || null,
        address: address || null,
        is_active: isActive || "Y",
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "supplier not found" });
    }

    return res.json({ supplier_id: supplierId });
  } catch (err) {
    console.error("Failed to update supplier:", err);
    return res.status(500).json({ error: "Failed to update supplier" });
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

async function deleteSupplier(req, res) {
  const supplierId = Number(req.params.id);
  if (!Number.isFinite(supplierId)) {
    return res.status(400).json({ error: "invalid supplier id" });
  }

  if (useLocalData) {
    const deleted = localData.deleteSupplier(supplierId);
    if (!deleted) {
      return res.status(404).json({ error: "supplier not found" });
    }
    return res.json({ supplier_id: supplierId });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE suppliers
           SET is_deleted = 'Y',
               deleted_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE supplier_id = :supplier_id
           AND is_deleted = 'N'
      `,
      { supplier_id: supplierId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "supplier not found" });
    }

    return res.json({ supplier_id: supplierId });
  } catch (err) {
    console.error("Failed to delete supplier:", err);
    return res.status(500).json({ error: "Failed to delete supplier" });
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
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
