const prisma = require("../prisma");

// save and update checklist items
async function setChecksByEvent(req, res) {
  try {
    const { event_id, room_name, item_key, is_checked, user_id } = req.body;

    if (!event_id || !room_name || !item_key) {
      return res.status(400).json({
        error: "Missing required fields: event_id, room_name, and item_key are mandatory."
      });
    }

    const numericUserId = parseInt(user_id, 10);

    const state = await prisma.roomChecklistState.upsert({
      where: {
        unique_event_room_item: {
          eventId: event_id,
          roomName: room_name,
          itemKey: item_key
        }
      },
      update: {
        isChecked: Boolean(is_checked),
        userId: numericUserId
      },
      create: {
        eventId: event_id,
        roomName: room_name,
        itemKey: item_key,
        isChecked: Boolean(is_checked),
        userId: numericUserId
      }
    });

    return res.status(200).json(state);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Toggle checklist item failed",
      details: error.message
    });
  }
}

// get all checks 
async function getChecksByEvent(req, res) {
  try {
    const { eventId } = req.params;

    const states = await prisma.roomChecklistState.findMany({
      where: {
        eventId: parseInt(eventId, 10)
      }
    });

    // formart like { "Ballroom A_auto-coffee": true }
    const stateMap = states.reduce((acc, curr) => {
      acc[`${curr.roomName}_${curr.itemKey}`] = curr.isChecked;
      return acc;
    }, {});

    return res.status(200).json(stateMap);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Get checklist states failed",
      details: error.message
    });
  }
}

// save and update the comments 
async function saveComment(req, res) {
  try {
    const { event_id, room_name, comment, user_id } = req.body;

    const numericUserId = parseInt(user_id, 10);

    if (!event_id || !room_name) {
      return res.status(400).json({
        error: "Missing required fields: event_id and room_name are mandatory."
      });
    }

    const savedComment = await prisma.roomSetupComment.upsert({
      where: {
        unique_event_room_comment: {
          eventId: event_id,
          roomName: room_name
        }
      },
      update: {
        comment: comment,
        userId: numericUserId
      },
      create: {
        eventId: event_id,
        roomName: room_name,
        comment: comment,
        userId: numericUserId
      }
    });

    return res.status(200).json(savedComment);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Save setup comment failed",
      details: error.message
    });
  }
}

// get all comments from events setup
async function getCommentsByEvent(req, res) {
  try {
    const { eventId } = req.params;

    const comments = await prisma.roomSetupComment.findMany({
      where: {
        eventId: parseInt(eventId, 10)
      }
    });

    // formart like { "Ballroom A": "extra chairs blabla" }
    const commentMap = comments.reduce((acc, curr) => {
      acc[curr.roomName] = curr.comment;
      return acc;
    }, {});

    return res.status(200).json(commentMap);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Get setup comments failed",
      details: error.message
    });
  }
}

module.exports = {
  setChecksByEvent,
  getChecksByEvent,
  saveComment,
  getCommentsByEvent
};