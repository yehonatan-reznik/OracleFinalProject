const express = require("express");
const { listReturns, createReturn } = require("../controllers/returnsController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, listReturns);
router.post("/", authenticate, createReturn);

module.exports = router;
