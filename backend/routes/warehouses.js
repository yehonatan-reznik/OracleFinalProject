const express = require("express");
const {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require("../controllers/warehousesController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", listWarehouses);
router.post("/", authenticate, createWarehouse);
router.put("/:id", authenticate, updateWarehouse);
router.delete("/:id", authenticate, deleteWarehouse);

module.exports = router;
