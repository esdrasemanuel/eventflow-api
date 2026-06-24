const { parseBEOFromFile } = require("../services/beoParser");

async function importBEO(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const parsedData = await parseBEOFromFile(req.file.path);

    return res.status(200).json({
      message: "BEO parsed successfully",
      fileName: req.file.originalname,
      data: parsedData
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to import BEO",
      details: error.message
    });
  }
}

module.exports = {
  importBEO
};