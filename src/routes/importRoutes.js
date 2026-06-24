const express = require("express");
const multer = require("multer");
const { importBEO } = require("../controllers/importController");

const router = express.Router();

const upload = multer({
  dest: "uploads/"
});

router.post("/beo", upload.single("file"), importBEO);

module.exports = router;