const { getConnection } = require("../db");

async function login(req, res) {
  const { username, password_hash: passwordHash } = req.body || {};

  if (!username || !passwordHash) {
    return res.status(400).json({ error: "username and password_hash required" });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        SELECT user_id,
               username,
               full_name,
               email,
               role,
               is_active
          FROM app_users
         WHERE username = :username
           AND password_hash = :password_hash
           AND is_deleted = 'N'
      `,
      { username, password_hash: passwordHash }
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.IS_ACTIVE && user.IS_ACTIVE !== "Y") {
      return res.status(403).json({ error: "User is inactive" });
    }

    return res.json({ user });
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

module.exports = {
  login,
};
