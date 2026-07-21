const prisma = require("../prisma");

function formatTime(value) {
  if (!value) {
    return null;
  }

  return value.toISOString().substring(11, 16);
}

function formatEventDate(dateInstance) {
  if (!dateInstance) return "";
  const date = new Date(dateInstance);
  
  // Get the day of the week and month name in English
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();

  // Logic to determine the correct ordinal suffix
  let suffix = "th";
  if (day < 11 || day > 13) {
    switch (day % 10) {
      case 1: suffix = "st"; break;
      case 2: suffix = "nd"; break;
      case 3: suffix = "rd"; break;
    }
  }

  return `${weekday}, ${day}${suffix} ${month} ${year}`;
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
            beverage_services: true,
            activity_equipment: true,
            food_services: {
              include: {
                food_items: true
              }
            }
          }
        }
      }
    });

    const now = formatTime(new Date());

    const overview = {
      eventsToday: events.length,
      inProgress: 0,
      tasks: 0,
      drinkReception: 0
    };

    const eventList = events.map((event) => {
      const eventStartTime = formatTime(event.start_time);
      const eventEndTime = formatTime(event.end_time);

      if (
        eventStartTime &&
        eventEndTime &&
        eventStartTime <= now &&
        eventEndTime >= now
      ) {
        overview.inProgress++;
      }

      const activities = event.activities.map((activity) => {
        overview.tasks++;

        if (
          activity.beverage_services &&
          activity.beverage_services.length > 0
        ) {
          overview.drinkReception++;
        }

        return {
          ...activity,
          start_time: formatTime(activity.start_time),
          end_time: formatTime(activity.end_time)
        };
      });

      return {
        ...event,
        start_time: eventStartTime,
        end_time: eventEndTime,
        event_date_formated: formatEventDate(event.event_date),
        activities
      };
    });

    const formattedEvents = {
      overview,
      events: eventList
    };

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
            beverage_services: true,
            activity_equipment: true,
            food_services: {
              include: {
                food_items: true
              }
            }
          }
        }
      }
    });

    const formattedEvents = events.map((event) => ({
      ...event,
      start_time: formatTime(event.start_time),
      end_time: formatTime(event.end_time),
      event_date_formated: formatEventDate(event.event_date),


      activities: event.activities.map((activity) => ({
        ...activity,
        start_time: formatTime(activity.start_time),
        end_time: formatTime(activity.end_time),
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