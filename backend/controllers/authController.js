const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getConnection } = require("../db");

async function login(req, res) {
  const { identifier, password } = req.body || {};
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
      { id: identifier }
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

    const token = jwt.sign(
      {
        user_id: user.USER_ID,
        username: user.USERNAME,
        email: user.EMAIL,
        role: user.ROLE,
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
