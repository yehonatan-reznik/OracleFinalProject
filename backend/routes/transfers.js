const express = require("express");
const {
  listTransfers,
  createTransfer,
  approveTransfer,
  rejectTransfer,
} = require("../controllers/transfersController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, listTransfers);
router.post("/", authenticate, createTransfer);
router.post("/:id/approve", authenticate, approveTransfer);
router.post("/:id/reject", authenticate, rejectTransfer);

module.exports = router;
