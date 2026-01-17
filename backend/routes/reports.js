const express = require("express");
const {
  getPosReport,
  getWarehouseReport,
} = require("../controllers/reportsController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/pos", authenticate, getPosReport);
router.get("/warehouse", authenticate, getWarehouseReport);

module.exports = router;
