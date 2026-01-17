const express = require("express");
const {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require("../controllers/suppliersController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, listSuppliers);
router.post("/", authenticate, createSupplier);
router.put("/:id", authenticate, updateSupplier);
router.delete("/:id", authenticate, deleteSupplier);

module.exports = router;
