const express = require("express");
const { createSale } = require("../controllers/salesController");

const router = express.Router();

router.post("/", createSale);

module.exports = router;
