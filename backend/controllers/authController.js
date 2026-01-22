const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const oracledb = require("oracledb");
const { getConnection } = require("../db");
const { useLocalData, localData } = require("../localData");

const isTruthy = (value) => {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const useLocalAuth =
  isTruthy(process.env.local_auth) || isTruthy(process.env.LOCAL_AUTH);
const seedLocalAuth =
  isTruthy(process.env.local_auth_seed) ||
  isTruthy(process.env.LOCAL_AUTH_SEED) ||
  isTruthy(process.env.LOCAL_DEMO);
const localStore = {
  nextId: 1,
  users: [],
};
const localDefaults = {
  companyId: 1,
  warehouseId: 1,
  warehouseCode: "LOCAL",
};

const normalizeText = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const getJwtSecret = () =>
  process.env.jwt_secret || process.env.JWT_SECRET;

const buildLocalContext = (payload, user) => {
  const companyNameInput =
    normalizeText(payload.company_name) || normalizeText(user.company_name);
  const warehouseNameInput =
    normalizeText(payload.warehouse_name) || normalizeText(user.warehouse_name);
  const warehouseCodeInput =
    normalizeText(payload.warehouse_code) ||
    normalizeText(user.warehouse_code) ||
    localDefaults.warehouseCode;

  let companyId = localDefaults.companyId;
  let warehouseId = localDefaults.warehouseId;
  let companyName = companyNameInput || "Local Company";
  let warehouseName = warehouseNameInput || "Local Warehouse";
  let warehouseCode = warehouseCodeInput;

  if (useLocalData) {
    const matchedCompany = companyNameInput
      ? localData.findCompanyByName(companyNameInput)
      : null;
    if (matchedCompany) {
      companyId = matchedCompany.company_id;
      companyName = matchedCompany.company_name;
    } else if (!companyNameInput) {
      const fallbackCompany = localData.listCompanies()[0];
      if (fallbackCompany) {
        companyId = fallbackCompany.company_id;
        companyName = fallbackCompany.company_name;
      }
    }

    let matchedWarehouse = null;
    if (warehouseNameInput) {
      matchedWarehouse = localData.findWarehouseByName(
        warehouseNameInput,
        companyId
      );
    }
    if (!matchedWarehouse && warehouseCodeInput) {
      matchedWarehouse = localData.findWarehouseByCode(warehouseCodeInput);
    }
    if (!matchedWarehouse) {
      const companyWarehouses = localData.listWarehouses(companyId);
      matchedWarehouse = companyWarehouses[0] || null;
    }
    if (matchedWarehouse) {
      warehouseId = matchedWarehouse.warehouse_id;
      warehouseName = matchedWarehouse.warehouse_name;
      warehouseCode = matchedWarehouse.warehouse_code || warehouseCode;
      companyId = matchedWarehouse.company_id || companyId;
      if (!companyNameInput) {
        const fallbackCompany = localData
          .listCompanies()
          .find((company) => company.company_id === companyId);
        if (fallbackCompany) {
          companyName = fallbackCompany.company_name;
        }
      }
    }
  }

  return {
    company_id: companyId,
    company_name: companyName,
    warehouse_id: warehouseId,
    warehouse_code: warehouseCode,
    warehouse_name: warehouseName,
  };
};

let localSeeded = false;
const seedLocalUsers = () => {
  if (!useLocalAuth || !seedLocalAuth || localSeeded) {
    return;
  }
  if (localStore.users.length) {
    localSeeded = true;
    return;
  }

  const passwordHash = bcrypt.hashSync("demo123", 10);
  localStore.users.push(
    {
      user_id: localStore.nextId++,
      username: "pos_demo",
      email: "pos@acme.test",
      full_name: "POS Demo User",
      role: "POS",
      password_hash: passwordHash,
      company_name: "Acme Foods",
      warehouse_name: "Acme Central",
    },
    {
      user_id: localStore.nextId++,
      username: "wh_demo",
      email: "warehouse@acme.test",
      full_name: "Warehouse Demo User",
      role: "WAREHOUSE",
      password_hash: passwordHash,
      company_name: "Acme Foods",
      warehouse_name: "Acme Central",
    }
  );

  localSeeded = true;
};

seedLocalUsers();

function findLocalUser(identifier) {
  const needle = normalizeText(identifier).toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    localStore.users.find(
      (user) =>
        user.username.toLowerCase() === needle ||
        user.email.toLowerCase() === needle
    ) || null
  );
}

async function localLogin(req, res) {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: "identifier and password required" });
  }

  const user = findLocalUser(identifier);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, user.password_hash || "");
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({ error: "jwt secret not configured" });
  }

  const context = buildLocalContext(req.body || {}, user);
  const token = jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      company_id: context.company_id,
      warehouse_id: context.warehouse_id,
    },
    jwtSecret,
    { expiresIn: "7d" }
  );

  return res.status(200).json({
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    company_id: context.company_id,
    company_name: context.company_name,
    warehouse_id: context.warehouse_id,
    warehouse_code: context.warehouse_code,
    warehouse_name: context.warehouse_name,
    token,
  });
}

async function localRegister(req, res) {
  const {
    username,
    email,
    password,
    full_name,
    role,
    company_name: companyNameRaw,
    warehouse_name: warehouseNameRaw,
  } = req.body || {};
  if (!username || !email || !password || !full_name || !role) {
    return res.status(400).json({ error: "missing required fields" });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "invalid email" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password too short" });
  }

  const normalizedRole = role.trim().toUpperCase();
  if (!["POS", "WAREHOUSE"].includes(normalizedRole)) {
    return res.status(400).json({ error: "role must be POS or WAREHOUSE" });
  }

  const companyName = normalizeText(companyNameRaw);
  const warehouseName = normalizeText(warehouseNameRaw);
  if (!companyName || !warehouseName) {
    return res
      .status(400)
      .json({ error: "company_name and warehouse_name are required" });
  }

  const usernameLower = normalizeText(username).toLowerCase();
  const emailLower = normalizeText(email).toLowerCase();
  const dup = localStore.users.some(
    (user) =>
      user.username.toLowerCase() === usernameLower ||
      user.email.toLowerCase() === emailLower
  );
  if (dup) {
    return res.status(409).json({ error: "user already exists" });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = {
    user_id: localStore.nextId++,
    username: normalizeText(username),
    email: normalizeText(email),
    full_name: normalizeText(full_name),
    role: normalizedRole,
    password_hash,
    company_name: companyName,
    warehouse_name: warehouseName,
  };
  localStore.users.push(user);

  const context = buildLocalContext(
    { company_name: companyName, warehouse_name: warehouseName },
    user
  );

  return res.status(201).json({
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    company_id: context.company_id,
    company_name: context.company_name,
    warehouse_id: context.warehouse_id,
    warehouse_name: context.warehouse_name,
  });
}

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

async function fetchUserContext(connection, userId) {
  if (!userId) {
    return null;
  }

  const result = await connection.execute(
    `
      select uwa.company_id,
             c.company_name,
             uwa.warehouse_id,
             w.warehouse_code,
             w.warehouse_name
        from user_warehouse_access uwa
        join companies c on c.company_id = uwa.company_id
        join warehouses w on w.warehouse_id = uwa.warehouse_id
       where uwa.user_id = :user_id
    `,
    { user_id: userId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows[0] || null;
}

async function login(req, res) {
  if (useLocalAuth) {
    return localLogin(req, res);
  }

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

    const jwt_secret = getJwtSecret();
    if (!jwt_secret) {
      return res.status(500).json({ error: "jwt secret not configured" });
    }

    const companyName = (companyNameRaw || "").trim();
    const warehouseCode = (warehouseCodeRaw || "").trim();
    const warehouseName = (warehouseNameRaw || "").trim();

    let company = null;
    let warehouse = null;

    if (companyName || warehouseId || warehouseCode || warehouseName) {
      company = await fetchCompany(connection, companyName);
      warehouse = await fetchWarehouse(connection, {
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
    } else {
      const context = await fetchUserContext(connection, user.USER_ID);
      if (context) {
        company = {
          COMPANY_ID: context.COMPANY_ID,
          COMPANY_NAME: context.COMPANY_NAME,
        };
        warehouse = {
          WAREHOUSE_ID: context.WAREHOUSE_ID,
          WAREHOUSE_CODE: context.WAREHOUSE_CODE,
          WAREHOUSE_NAME: context.WAREHOUSE_NAME,
          COMPANY_ID: context.COMPANY_ID,
          COMPANY_NAME: context.COMPANY_NAME,
        };
      }
    }

    if (user.ROLE === "WAREHOUSE") {
      if (!company?.COMPANY_ID || !warehouse) {
        return res.status(400).json({
          error:
            "warehouse account is missing company/warehouse assignment",
        });
      }
    }

    if (user.ROLE === "POS") {
      if (!warehouse) {
        return res.status(400).json({
          error: "POS account is missing warehouse assignment",
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
  if (useLocalAuth) {
    return localRegister(req, res);
  }

  const {
    username,
    email,
    password,
    full_name,
    role,
    company_name: companyNameRaw,
    warehouse_name: warehouseNameRaw,
  } = req.body || {};
  if (!username || !email || !password || !full_name || !role) {
    return res.status(400).json({ error: "missing required fields" });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "invalid email" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "password too short" });
  }

  const normalizedRole = role.trim().toUpperCase();
  if (!["POS", "WAREHOUSE"].includes(normalizedRole)) {
    return res.status(400).json({ error: "role must be POS or WAREHOUSE" });
  }

  const companyName = (companyNameRaw || "").trim();
  const warehouseName = (warehouseNameRaw || "").trim();
  if (!companyName || !warehouseName) {
    return res
      .status(400)
      .json({ error: "company_name and warehouse_name are required" });
  }

  let connection;
  try {
    connection = await getConnection();

    const company = await fetchCompany(connection, companyName);
    if (!company) {
      return res.status(400).json({ error: "company not found" });
    }

    const warehouse = await fetchWarehouse(connection, {
      warehouseName,
      companyId: company.COMPANY_ID,
    });
    if (!warehouse) {
      return res.status(400).json({ error: "warehouse not found" });
    }

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
        role: normalizedRole,
      }
    );

    await connection.execute(
      `
        insert into user_warehouse_access (
          user_id,
          company_id,
          warehouse_id,
          created_at
        )
        values (
          :user_id,
          :company_id,
          :warehouse_id,
          systimestamp
        )
      `,
      {
        user_id: next_id,
        company_id: company.COMPANY_ID,
        warehouse_id: warehouse.WAREHOUSE_ID,
      }
    );

    await connection.commit();

    return res.status(201).json({
      user_id: next_id,
      username,
      email,
      full_name,
      role: normalizedRole,
      company_id: company.COMPANY_ID,
      company_name: company.COMPANY_NAME,
      warehouse_id: warehouse.WAREHOUSE_ID,
      warehouse_name: warehouse.WAREHOUSE_NAME,
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
