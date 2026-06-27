const express = require("express");
const multer = require("multer");
const { importBEO } = require("../controllers/importController");

const router = express.Router();

const upload = multer({
  dest: "uploads/"
});

router.post("/beo", upload.single("file"), importBEO);

router.get("/test-db", async (req, res) => {
    const pool = require("../db");

    const result = await pool.query("SELECT NOW()");

    res.json(result.rows);
});

module.exports = router;