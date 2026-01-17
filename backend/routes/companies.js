const express = require("express");
const {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} = require("../controllers/companiesController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", listCompanies);
router.post("/", authenticate, createCompany);
router.put("/:id", authenticate, updateCompany);
router.delete("/:id", authenticate, deleteCompany);

module.exports = router;
