const express = require("express");
const { listReceipts } = require("../controllers/receiptsController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, listReceipts);

module.exports = router;
