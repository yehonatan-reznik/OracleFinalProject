const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const oracledb = require("oracledb");
const { getConnection } = require("../db");

async function fetchCompany(connection, companyName) {
  if (!companyName) {
    return null;
  }
  const result = await connection.execute(
    `
      select company_id,
             company_name
        from companies
       where lower(company_name) = lower(:company_name)
         and is_deleted = 'N'
         and is_active = 'Y'
    `,
    { company_name: companyName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows[0] || null;
}

async function fetchWarehouse(
  connection,
  { warehouseId, warehouseCode, warehouseName, companyId }
) {
  if (!warehouseId && !warehouseCode && !warehouseName) {
    return null;
  }

  const result = await connection.execute(
    `
      select w.warehouse_id,
             w.warehouse_code,
             w.warehouse_name,
             w.company_id,
             c.company_name
        from warehouses w
        left join companies c on c.company_id = w.company_id
       where w.is_deleted = 'N'
         and w.is_active = 'Y'
         and (
           w.warehouse_id = :warehouse_id
           or lower(w.warehouse_code) = lower(:warehouse_code)
           or lower(w.warehouse_name) = lower(:warehouse_name)
         )
         and (:company_id is null or w.company_id = :company_id)
       fetch first 1 row only
    `,
    {
      warehouse_id: warehouseId || null,
      warehouse_code: warehouseCode || null,
      warehouse_name: warehouseName || null,
      company_id: companyId || null,
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows[0] || null;
}

async function login(req, res) {
  const {
    identifier,
    password,
    company_name: companyNameRaw,
    warehouse_id: warehouseId,
    warehouse_code: warehouseCodeRaw,
    warehouse_name: warehouseNameRaw,
  } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: "identifier and password required" });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        select user_id,
               username,
               email,
               password_hash,
               full_name,
               role,
               is_active,
               is_deleted
          from inventory_user.app_users
         where lower(username) = lower(:id)
            or lower(email) = lower(:id)
         fetch first 1 row only
      `,
      { id: identifier },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.IS_ACTIVE !== "Y" || user.IS_DELETED !== "N") {
      return res.status(403).json({ error: "User is inactive" });
    }

    const ok = await bcrypt.compare(password, user.PASSWORD_HASH || "");
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const jwt_secret = process.env.jwt_secret || process.env.JWT_SECRET;
    if (!jwt_secret) {
      return res.status(500).json({ error: "jwt secret not configured" });
    }

    const companyName = (companyNameRaw || "").trim();
    const warehouseCode = (warehouseCodeRaw || "").trim();
    const warehouseName = (warehouseNameRaw || "").trim();

    let company = await fetchCompany(connection, companyName);
    let warehouse = await fetchWarehouse(connection, {
      warehouseId,
      warehouseCode,
      warehouseName,
      companyId: company?.COMPANY_ID || null,
    });

    if (warehouse && !company && warehouse.COMPANY_ID) {
      company = {
        COMPANY_ID: warehouse.COMPANY_ID,
        COMPANY_NAME: warehouse.COMPANY_NAME || null,
      };
    }

    if (user.ROLE === "WAREHOUSE") {
      if (!company?.COMPANY_ID || !warehouse) {
        return res.status(400).json({
          error: "company_name and warehouse are required for warehouse login",
        });
      }
    }

    if (user.ROLE === "POS") {
      if (!warehouse) {
        return res.status(400).json({
          error: "warehouse is required for POS login",
        });
      }
    }

    const token = jwt.sign(
      {
        user_id: user.USER_ID,
        username: user.USERNAME,
        email: user.EMAIL,
        role: user.ROLE,
        company_id: company?.COMPANY_ID || null,
        warehouse_id: warehouse?.WAREHOUSE_ID || null,
      },
      jwt_secret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      user_id: user.USER_ID,
      username: user.USERNAME,
      email: user.EMAIL,
      full_name: user.FULL_NAME,
      role: user.ROLE,
      company_id: company?.COMPANY_ID || null,
      company_name: company?.COMPANY_NAME || null,
      warehouse_id: warehouse?.WAREHOUSE_ID || null,
      warehouse_code: warehouse?.WAREHOUSE_CODE || null,
      warehouse_name: warehouse?.WAREHOUSE_NAME || null,
      token,
    });
  } catch (err) {
    console.error("Login failed:", err);
    return res.status(500).json({ error: "Login failed" });
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

async function register(req, res) {
  const { username, email, password, full_name, role } = req.body || {};
  if (!username || !email || !password || !full_name || !role) {
    return res.status(400).json({ error: "missing required fields" });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "invalid email" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password too short" });
  }

  let connection;
  try {
    connection = await getConnection();

    const dup = await connection.execute(
      `
        select 1
          from inventory_user.app_users
         where lower(username) = lower(:u)
            or lower(email) = lower(:e)
         fetch first 1 row only
      `,
      { u: username, e: email }
    );

    if (dup.rows.length) {
      return res.status(409).json({ error: "user already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const id_result = await connection.execute(
      `
        select inventory_user.APP_USERS_SEQ.nextval as next_id
          from dual
      `
    );

    const firstRow = id_result.rows?.[0];
    const next_id =
      (firstRow && (firstRow.NEXT_ID ?? firstRow[0])) ?? null;
    if (next_id === null || next_id === undefined) {
      throw new Error("Failed to generate user_id from app_users_seq");
    }

    await connection.execute(
      `
        insert into inventory_user.app_users (
          user_id,
          username,
          email,
          password_hash,
          full_name,
          role,
          is_active,
          is_deleted,
          created_at,
          updated_at
        )
        values (
          :user_id,
          :username,
          :email,
          :password_hash,
          :full_name,
          :role,
          'Y',
          'N',
          systimestamp,
          systimestamp
        )
      `,
      {
        user_id: next_id,
        username,
        email,
        password_hash,
        full_name,
        role,
      }
    );

    await connection.commit();

    return res.status(201).json({
      user_id: next_id,
      username,
      email,
      full_name,
      role,
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
    console.error("Register failed:", err);
    return res.status(500).json({ error: "Register failed" });
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
  login,
  register,
};
