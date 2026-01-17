const express = require("express");
const {
  listInventory,
  getInventoryItem,
  receiveStock,
  adjustStock,
} = require("../controllers/inventoryController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, listInventory);
router.get(
  "/warehouse/:warehouseId/product/:productId",
  authenticate,
  getInventoryItem
);
router.post("/receive", authenticate, receiveStock);
router.post("/adjust", authenticate, adjustStock);

module.exports = router;
