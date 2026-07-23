const express = require("express");
const {
  setChecksByEvent,
  getChecksByEvent,
  saveComment,
  getCommentsByEvent
} = require("../controllers/setupController");

const router = express.Router();

router.post("/set_check", setChecksByEvent);
router.get("/checks/:eventId", getChecksByEvent);
router.post("/save_comment", saveComment);
router.get("/comments/:eventId", getCommentsByEvent);

module.exports = router;