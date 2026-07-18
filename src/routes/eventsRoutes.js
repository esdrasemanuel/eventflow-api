const express = require("express");
const { eventsList, allEventsList } = require("../controllers/eventsController");

const router = express.Router();

router.get("/events_list", eventsList);
router.get("/all_events_list", allEventsList);

module.exports = router;