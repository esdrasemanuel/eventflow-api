const prisma = require("../prisma");

function formatTime(value) {
  if (!value) {
    return null;
  }

  return value.toISOString().substring(11, 16);
}

async function eventsList(req, res) {
  try {
    const today = new Date();

    const start_day = new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate(),0,0,0,0));

    const end_day = new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate(),23,59,59,999));

    const events = await prisma.events.findMany({
      where: {
        event_date: {
          gte: start_day,
          lte: end_day
        }
      },
      include: {
        activities: {
          include: {
            beverage_services: true
          }
        }
      }
    });

    const formattedEvents = events.map((event) => ({
      ...event,
      start_time: formatTime(event.start_time),
      end_time: formatTime(event.end_time),

      activities: event.activities.map((activity) => ({
        ...activity,
        start_time: formatTime(activity.start_time),
        end_time: formatTime(activity.end_time)
      }))
    }));

    return res.status(200).json(formattedEvents);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Events list failed",
      details: error.message
    });
  }
}
async function allEventsList(req, res) {
  try {
    const today = new Date();

    const start_day = new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate(),0,0,0,0));

    const events = await prisma.events.findMany({
      where: {
        event_date: {
          gte: start_day
        }
      },
      include: {
        activities: {
          include: {
            beverage_services: true
          }
        }
      }
    });

    const formattedEvents = events.map((event) => ({
      ...event,
      start_time: formatTime(event.start_time),
      end_time: formatTime(event.end_time),

      activities: event.activities.map((activity) => ({
        ...activity,
        start_time: formatTime(activity.start_time),
        end_time: formatTime(activity.end_time)
      }))
    }));

    return res.status(200).json(formattedEvents);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "All events list failed",
      details: error.message
    });
  }
}

module.exports = {
  eventsList,
  allEventsList
};