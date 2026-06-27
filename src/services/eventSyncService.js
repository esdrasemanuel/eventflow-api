const crypto = require("crypto");
const pool = require("../db");

/*
  BEO(PDF) SYNC SERVICE
  This service receives the parsed BEO JSON and synchronizes it with the database.
  Creates new events if not exits or updates existing events so
  this is important because hotels may send updated BEO files for the same event.
*/

//Convert arrays into readable text for TEXT columns in PostgreSQL
function toText(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

// Creates a SHA-256 hash from any object. helps to detect if something changed between BEO imports
function hashObject(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex");
}

// Creates a stable key for the event.
// Used to identify the same event when a new updated BEO is imported.
function createEventKey(event) {
  return [
    event.contractNumber || "no-contract",
    event.date || "no-date",
    event.bookingName || "no-booking"
  ].join("|").toLowerCase().trim();
}

// Creates a stable key for each activity.
// To find the same operational activity in future BEO updates.
function createActivityKey(activity) {
  return [
    activity.room || "no-room",
    activity.function || "no-function",
    activity.startTime || "no-start",
    activity.endTime || "no-end"
  ].join("|").toLowerCase().trim();
}

// Creates a hash of the full activity content.
// If food, beverage, notes, equipment or setup changes, this hash changes too.
function createActivityHash(activity) {
  return hashObject({
    room: activity.room,
    function: activity.function,
    setup: activity.setup,
    expected: activity.expected,
    guaranteed: activity.guaranteed,
    rental: activity.rental,
    notes: activity.notes || [],
    foodService: activity.foodService || null,
    beverageService: activity.beverageService || null,
    equipment: activity.equipment || []
  });
}

async function syncParsedBEO(parsedData, sourceFile = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const summary = {
      createdEvents: 0,
      updatedEvents: 0,
      createdActivities: 0,
      updatedActivities: 0,
      unchangedActivities: 0,
      inactiveActivities: 0
    };

    for (const event of parsedData.events || []) {
      const eventKey = createEventKey(event);
      const importHash = hashObject(event);

      let eventId;

      const existingEvent = await client.query(
        `SELECT * FROM events WHERE event_key = $1`,
        [eventKey]
      );

      if (existingEvent.rows.length === 0) {
        const inserted = await client.query(
          `
          INSERT INTO events (
            event_key,
            account_name,
            contract_number,
            contact_name,
            catering_manager,
            booking_type,
            booking_name,
            email,
            total_rooms,
            event_date,
            operational_notes,
            agreement_notes,
            billing_instructions,
            event_dietaries,
            import_count,
            last_imported_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,NOW())
          RETURNING id
          `,
          [
            eventKey,
            event.accountName,
            event.contractNumber,
            event.contactName,
            event.cateringManager,
            event.bookingType,
            event.bookingName,
            event.email,
            event.totalRooms,
            event.date,
            toText(event.operationalNotes),
            toText(event.agreementNotes),
            toText(event.billingInstructions),
            toText(event.eventDietaries)
          ]
        );

        eventId = inserted.rows[0].id;
        summary.createdEvents++;
      } else {
        eventId = existingEvent.rows[0].id;

        await client.query(
          `
          UPDATE events
          SET
            account_name = $1,
            contract_number = $2,
            contact_name = $3,
            catering_manager = $4,
            booking_type = $5,
            booking_name = $6,
            email = $7,
            total_rooms = $8,
            event_date = $9,
            operational_notes = $10,
            agreement_notes = $11,
            billing_instructions = $12,
            event_dietaries = $13,
            import_count = COALESCE(import_count, 0) + 1,
            last_imported_at = NOW(),
            updated_at = NOW()
          WHERE id = $14
          `,
          [
            event.accountName,
            event.contractNumber,
            event.contactName,
            event.cateringManager,
            event.bookingType,
            event.bookingName,
            event.email,
            event.totalRooms,
            event.date,
            toText(event.operationalNotes),
            toText(event.agreementNotes),
            toText(event.billingInstructions),
            toText(event.eventDietaries),
            eventId
          ]
        );

        summary.updatedEvents++;
      }

      const importResult = await client.query(
        `
        INSERT INTO event_imports (
          event_id,
          import_hash,
          source_file
        )
        VALUES ($1,$2,$3)
        RETURNING id
        `,
        [eventId, importHash, sourceFile]
      );

      const importId = importResult.rows[0].id;

      await client.query(
        `
        UPDATE events
        SET current_import_id = $1
        WHERE id = $2
        `,
        [importId, eventId]
      );

      const incomingActivityKeys = [];

      for (const activity of event.activities || []) {
        const activityKey = createActivityKey(activity);
        const contentHash = createActivityHash(activity);

        incomingActivityKeys.push(activityKey);

        const existingActivity = await client.query(
          `
          SELECT *
          FROM activities
          WHERE event_id = $1
          AND activity_key = $2
          `,
          [eventId, activityKey]
        );

        let activityId;

        if (existingActivity.rows.length === 0) {
          const insertedActivity = await client.query(
            `
            INSERT INTO activities (
              event_id,
              import_id,
              activity_key,
              original_activity_key,
              content_hash,
              start_time,
              end_time,
              time_range,
              room,
              function_name,
              setup,
              expected,
              guaranteed,
              rental,
              notes,
              is_active,
              has_changes,
              needs_review
            )
            VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,FALSE,FALSE)
            RETURNING id
            `,
            [
              eventId,
              importId,
              activityKey,
              contentHash,
              activity.startTime,
              activity.endTime,
              activity.time,
              activity.room,
              activity.function,
              activity.setup,
              activity.expected,
              activity.guaranteed,
              activity.rental,
              toText(activity.notes)
            ]
          );

          activityId = insertedActivity.rows[0].id;

          await syncActivityChildren(client, activityId, activity);

          summary.createdActivities++;
        } else {
          const oldActivity = existingActivity.rows[0];
          activityId = oldActivity.id;

          if (oldActivity.content_hash === contentHash) {
            await client.query(
              `
              UPDATE activities
              SET
                is_active = TRUE,
                import_id = $1,
                updated_at = NOW()
              WHERE id = $2
              `,
              [importId, activityId]
            );

            summary.unchangedActivities++;
          } else {
            await client.query(
              `
              UPDATE activities
              SET
                import_id = $1,
                content_hash = $2,
                start_time = $3,
                end_time = $4,
                time_range = $5,
                room = $6,
                function_name = $7,
                setup = $8,
                expected = $9,
                guaranteed = $10,
                rental = $11,
                notes = $12,
                version = COALESCE(version, 1) + 1,
                is_active = TRUE,
                has_changes = TRUE,
                needs_review = TRUE,
                updated_at = NOW()
              WHERE id = $13
              `,
              [
                importId,
                contentHash,
                activity.startTime,
                activity.endTime,
                activity.time,
                activity.room,
                activity.function,
                activity.setup,
                activity.expected,
                activity.guaranteed,
                activity.rental,
                toText(activity.notes),
                activityId
              ]
            );

            await syncActivityChildren(client, activityId, activity);

            summary.updatedActivities++;
          }
        }
      }

      const inactiveCount = await markMissingActivitiesInactive(
        client,
        eventId,
        incomingActivityKeys
      );

      summary.inactiveActivities += inactiveCount;
    }

    await client.query("COMMIT");

    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function syncActivityChildren(client, activityId, activity) {
  await syncEquipment(client, activityId, activity.equipment || []);
  await syncFood(client, activityId, activity.foodService);
  await syncBeverage(client, activityId, activity.beverageService);
}

async function syncEquipment(client, activityId, equipmentList) {
  const existing = await client.query(
    `
    SELECT *
    FROM activity_equipment
    WHERE activity_id = $1
    `,
    [activityId]
  );

  const existingNames = existing.rows.map(row => row.equipment_name);
  const incomingNames = [...new Set(equipmentList)];

  for (const equipmentName of incomingNames) {
    if (!existingNames.includes(equipmentName)) {
      await client.query(
        `
        INSERT INTO activity_equipment (
          activity_id,
          equipment_name
        )
        VALUES ($1,$2)
        `,
        [activityId, equipmentName]
      );
    }
  }

  for (const row of existing.rows) {
    if (!incomingNames.includes(row.equipment_name) && row.is_checked === false) {
      await client.query(
        `
        DELETE FROM activity_equipment
        WHERE id = $1
        `,
        [row.id]
      );
    }
  }
}

async function syncFood(client, activityId, foodService) {
  await client.query(
    `
    DELETE FROM food_items
    WHERE food_service_id IN (
      SELECT id FROM food_services WHERE activity_id = $1
    )
    `,
    [activityId]
  );

  await client.query(
    `
    DELETE FROM food_services
    WHERE activity_id = $1
    `,
    [activityId]
  );

  if (!foodService) return;

  const foodResult = await client.query(
    `
    INSERT INTO food_services (
      activity_id,
      service_name,
      service_price,
      expected
    )
    VALUES ($1,$2,$3,$4)
    RETURNING id
    `,
    [
      activityId,
      foodService.serviceName,
      foodService.servicePrice,
      foodService.expected
    ]
  );

  const foodServiceId = foodResult.rows[0].id;

  for (const item of foodService.items || []) {
    await client.query(
      `
      INSERT INTO food_items (
        food_service_id,
        item_name,
        price,
        expected
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        foodServiceId,
        item.name,
        item.price,
        item.expected
      ]
    );
  }
}

async function syncBeverage(client, activityId, beverageService) {
  await client.query(
    `
    DELETE FROM beverage_services
    WHERE activity_id = $1
    `,
    [activityId]
  );

  if (!beverageService) return;

  const beverageNotes = [
    ...(beverageService.notes || []),
    ...(beverageService.items || [])
  ].join("\n");

  await client.query(
    `
    INSERT INTO beverage_services (
      activity_id,
      service_name,
      price,
      expected,
      bar_tab_limit,
      notes
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [
      activityId,
      beverageService.serviceName,
      beverageService.price,
      beverageService.expected,
      beverageService.barTabLimit,
      beverageNotes || null
    ]
  );
}

async function markMissingActivitiesInactive(client, eventId, incomingActivityKeys) {
  if (incomingActivityKeys.length === 0) {
    const result = await client.query(
      `
      UPDATE activities
      SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE event_id = $1
      AND is_active = TRUE
      `,
      [eventId]
    );

    return result.rowCount;
  }

  const result = await client.query(
    `
    UPDATE activities
    SET
      is_active = FALSE,
      updated_at = NOW()
    WHERE event_id = $1
    AND activity_key <> ALL($2::text[])
    AND is_active = TRUE
    `,
    [eventId, incomingActivityKeys]
  );

  return result.rowCount;
}

module.exports = {
  syncParsedBEO
};