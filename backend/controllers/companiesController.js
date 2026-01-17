const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function listCompanies(req, res) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        SELECT company_id AS "company_id",
               company_code AS "company_code",
               company_name AS "company_name",
               address AS "address",
               city AS "city",
               country AS "country",
               is_active AS "is_active"
          FROM companies
         WHERE is_deleted = 'N'
           AND is_active = 'Y'
         ORDER BY company_name
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json({ companies: result.rows });
  } catch (err) {
    console.error("Failed to list companies:", err);
    return res.status(500).json({ error: "Failed to list companies" });
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

async function createCompany(req, res) {
  const {
    company_code: companyCode,
    company_name: companyName,
    address,
    city,
    country,
    is_active: isActive,
  } = req.body || {};

  if (!companyName) {
    return res.status(400).json({ error: "company_name is required" });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        INSERT INTO companies (
          company_code,
          company_name,
          address,
          city,
          country,
          is_active,
          is_deleted,
          created_at,
          updated_at
        )
        VALUES (
          :company_code,
          :company_name,
          :address,
          :city,
          :country,
          :is_active,
          'N',
          SYSTIMESTAMP,
          SYSTIMESTAMP
        )
        RETURNING company_id INTO :company_id
      `,
      {
        company_code: companyCode || null,
        company_name: companyName,
        address: address || null,
        city: city || null,
        country: country || null,
        is_active: isActive || "Y",
        company_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const companyId = result.outBinds.company_id[0];
    return res.status(201).json({ company_id: companyId });
  } catch (err) {
    console.error("Failed to create company:", err);
    return res.status(500).json({ error: "Failed to create company" });
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

async function updateCompany(req, res) {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) {
    return res.status(400).json({ error: "invalid company id" });
  }

  const {
    company_code: companyCode,
    company_name: companyName,
    address,
    city,
    country,
    is_active: isActive,
  } = req.body || {};

  if (!companyName) {
    return res.status(400).json({ error: "company_name is required" });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE companies
           SET company_code = :company_code,
               company_name = :company_name,
               address = :address,
               city = :city,
               country = :country,
               is_active = :is_active,
               updated_at = SYSTIMESTAMP
         WHERE company_id = :company_id
           AND is_deleted = 'N'
      `,
      {
        company_id: companyId,
        company_code: companyCode || null,
        company_name: companyName,
        address: address || null,
        city: city || null,
        country: country || null,
        is_active: isActive || "Y",
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "company not found" });
    }

    return res.json({ company_id: companyId });
  } catch (err) {
    console.error("Failed to update company:", err);
    return res.status(500).json({ error: "Failed to update company" });
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

async function deleteCompany(req, res) {
  const companyId = Number(req.params.id);
  if (!Number.isFinite(companyId)) {
    return res.status(400).json({ error: "invalid company id" });
  }

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      `
        UPDATE companies
           SET is_deleted = 'Y',
               deleted_at = SYSTIMESTAMP,
               updated_at = SYSTIMESTAMP
         WHERE company_id = :company_id
           AND is_deleted = 'N'
      `,
      { company_id: companyId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "company not found" });
    }

    return res.json({ company_id: companyId });
  } catch (err) {
    console.error("Failed to delete company:", err);
    return res.status(500).json({ error: "Failed to delete company" });
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
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
};
