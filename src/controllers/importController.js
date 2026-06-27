const { parseBEOFromFile } = require("../services/beoParser");
const { syncParsedBEO } = require("../services/eventSyncService");

async function importBEO(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const parsedData = await parseBEOFromFile(req.file.path);

    const syncResult = await syncParsedBEO(
      parsedData,
      req.file.originalname
    );

    return res.status(201).json({
      message: "BEO imported and synced successfully",
      result: syncResult
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