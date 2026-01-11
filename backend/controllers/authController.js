const bcrypt = require("bcrypt");
const { getConnection } = require("../db");

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  let connection;
  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        SELECT user_id,
               email,
               password_hash,
               role
          FROM app_users
         WHERE email = :email
      `,
      { email }
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValidPassword = await bcrypt.compare(
      password,
      user.PASSWORD_HASH || ""
    );
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      user_id: user.USER_ID,
      email: user.EMAIL,
      role: user.ROLE,
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

module.exports = {
  login,
};
