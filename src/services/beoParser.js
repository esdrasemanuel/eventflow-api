// VERSION 0.9

const fs = require("fs");

const baseRoomHints = [
  "Snug & Secret Garden",
  "Secret Garden",
  "Orient 1,2 & 3",
  "Orient 2,3 & 4",
  "Orient 3&4",
  "Orient 1&2",
  "Full Orient",
  "Orient 1",
  "Orient 2",
  "Orient 3",
  "Orient 4",
  "Odyssey",
  "Rovo's",
  "Concourse",
  "Restaurant",
  "Snug",
  "Lobby"
];

const setups = [
  "Existing Layout",
  "U-Shaped",
  "Theatre",
  "Boardroom",
  "Cabaret",
  "Reception",
  "Classroom",
  "Banquet",
  "Hollow Square",
  "To Be Confirmed",
  "See Notes DDR",
  "Existing Layout DDR",
  "Reception DDR",
  "Theatre DDR",
  "Boardroom DDR",
  "Cabaret DDR",
  "See Notes",
  "DDR"
];

async function extractTextFromPDF(filePath) {
  const { PDFParse } = await import("pdf-parse");
  const file = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: file });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

function isNoiseLine(line) {
  return (
    line === "THE ALEX" ||
    line.includes("41-47 Fenian Street") ||
    line.includes("Dublin 2, D02 H678") ||
    line.includes("+353 1 6073700") ||
    line.startsWith("Customer Initials") ||
    /^-- \d+ of \d+ --$/.test(line) ||
    line.startsWith("Date Last Printed") ||
    line.includes("Organisation Authorized Signature") ||
    line.includes("Authorized Signature") ||
    line.includes("All prices are inclusive of VAT")
  );
}

function normalizeLines(text) {
  return text
    .split("\n")
    .map(line => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter(line => !isNoiseLine(line));
}

function isDateLine(line) {
  return /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{2}(st|nd|rd|th)\s+\w+\s+\d{4}$/i.test(line);
}

function splitIntoEventBlocks(lines) {
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("Account Name")) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

function parseHeader(lines, eventId) {
  const joined = lines.join(" ");

  const accountMatch = joined.match(/Account Name (.*?) Contract Number/i);
  const contractMatch = joined.match(/Contract Number (\d+)/i);
  const contactMatch = joined.match(/Contact Name (.*?) Catering Manager/i);
  const managerMatch = joined.match(/Catering Manager (.*?) Address/i);
  const emailMatch = joined.match(/E-mail\s+([^\s]+@[^\s]+)\s+Total Rooms/i);
  const totalRoomsMatch = joined.match(/Total Rooms\s+(\d+)/i);

  const bookingTypes = [
    "Non Residential Meeting",
    "Residential Conference",
    "Non Residential Conference",
    "Leisure Group",
    "Incentive"
  ];

  const bookingType = bookingTypes.find(type => joined.includes(type)) || null;

  let bookingName = null;
  if (bookingType) {
    const afterType = joined.split(bookingType)[1];
    if (afterType) {
      const match = afterType.match(/(.*?) Telephone/i);
      bookingName = match ? match[1].trim() : null;
    }
  }

  return {
    eventId,
    accountName: accountMatch ? accountMatch[1].trim() : null,
    contractNumber: contractMatch ? contractMatch[1] : null,
    contactName: contactMatch ? contactMatch[1].trim() : null,
    cateringManager: managerMatch ? managerMatch[1].trim() : null,
    bookingType,
    bookingName,
    email: emailMatch ? emailMatch[1] : null,
    totalRooms: totalRoomsMatch ? Number(totalRoomsMatch[1]) : null,
    date: lines.find(isDateLine) || null
  };
}

function findNextSectionIndex(lines, startIndex, sectionNames) {
  for (let i = startIndex; i < lines.length; i++) {
    if (sectionNames.some(section => lines[i].startsWith(section))) {
      return i;
    }
  }

  return lines.length;
}

function discoverRooms(lines) {
  const rooms = new Set(baseRoomHints);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      lines[i + 1] &&
      /^\d{2}:\d{2}\s+to\s+\d{2}:\d{2}$/.test(lines[i + 1]) &&
      !line.includes("EUR") &&
      !line.includes("Exp") &&
      !line.includes("Food")
    ) {
      rooms.add(line);
    }

    const equipmentHeader = line.match(/^(.+?)\s+\d{2}:\d{2}\s+to\s+\d{2}:\d{2}$/);
    if (equipmentHeader && equipmentHeader[1]) {
      rooms.add(equipmentHeader[1].trim());
    }
  }

  return [...rooms].sort((a, b) => b.length - a.length);
}

function parseScheduleEntries(lines) {
  const start = lines.findIndex(line =>
    line.startsWith("Time Room Function Setup")
  );

  if (start === -1) return [];

  const stopIndex = findNextSectionIndex(lines, start + 1, [
    "Food",
    "Beverage Service",
    "External Equipment",
    "Billing Instruction",
    "Agreement Notes",
    "Deposit %",
    "Revenue Summary"
  ]);

  const entries = [];
  let currentLine = null;
  let currentNotes = [];
  let noteMode = false;

  function closeCurrent() {
    if (currentLine) {
      entries.push({
        rawLine: currentLine,
        notes: currentNotes
      });
    }

    currentLine = null;
    currentNotes = [];
    noteMode = false;
  }

  for (let i = start + 1; i < stopIndex; i++) {
    const line = lines[i];

    const startsWithTime = /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(line);

    if (startsWithTime) {
      closeCurrent();
      currentLine = line;
      continue;
    }

    if (line === "Event" || line === "Notes:" || line.startsWith("Event ")) {
      noteMode = true;

      const inlineNote = line.replace(/^Event\s*/, "").replace(/^Notes:\s*/, "").trim();
      if (inlineNote) currentNotes.push(inlineNote);

      continue;
    }

    if (line === ".") {
      noteMode = false;
      continue;
    }

    if (!currentLine) continue;

    if (noteMode) {
      currentNotes.push(line);
      continue;
    }

    currentLine += " " + line;
  }

  closeCurrent();

  return entries.filter(entry => /\d+\/\d+/.test(entry.rawLine));
}

function parseActivityLine(entry, eventId, warnings, knownRooms) {
  const line = entry.rawLine;

  const timeMatch = line.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (!timeMatch) return null;

  const startTime = timeMatch[1];
  const endTime = timeMatch[2];

  let rest = line.replace(timeMatch[0], "").trim();

  const paxMatch = rest.match(/(\d+)\/(\d+)/);

  if (!paxMatch) {
    warnings.push(`Could not detect pax in activity line: ${line}`);
    return null;
  }

  const beforePax = rest.substring(0, paxMatch.index).trim();
  const afterPax = rest.substring(paxMatch.index).trim();

  const detectedSetup = setups.find(setup => beforePax.endsWith(setup));

  let roomAndFunction = beforePax;
  let setupName = null;

  if (detectedSetup) {
    setupName = detectedSetup;
    roomAndFunction = beforePax
      .substring(0, beforePax.length - detectedSetup.length)
      .trim();
  } else {
    setupName = null;
    warnings.push(`Setup not confidently detected in activity line: ${line}`);
  }

  const { room, functionName } = detectRoomAndFunction(roomAndFunction, knownRooms);

  if (!room) {
    warnings.push(`Could not detect room in activity line: ${line}`);
  }

  if (!functionName) {
    warnings.push(`Could not detect function in activity line: ${line}`);
  }

  const rentalMatch = afterPax.match(/(EUR\s[\d,]+\.\d{2}|INC|Incl)/i);

  return {
    eventId,
    startTime,
    endTime,
    time: `${startTime} - ${endTime}`,
    room: room || "Unknown Room",
    function: functionName || "Unknown",
    setup: setupName,
    expected: Number(paxMatch[1]),
    guaranteed: Number(paxMatch[2]),
    rental: rentalMatch ? rentalMatch[1] : null,
    notes: entry.notes || [],
    foodService: null,
    beverageService: null,
    equipment: []
  };
}

function detectRoomAndFunction(text, knownRooms) {
  const knownRoom = knownRooms.find(room => text.startsWith(room));

  if (knownRoom) {
    return {
      room: knownRoom,
      functionName: text.substring(knownRoom.length).trim()
    };
  }

  const orientMatch = text.match(/^(Orient\s[\d,&\s]+)\s+(.+)$/i);
  if (orientMatch) {
    return {
      room: orientMatch[1].trim(),
      functionName: orientMatch[2].trim()
    };
  }

  const tokens = text.split(" ").filter(Boolean);

  if (tokens.length === 1) {
    return {
      room: tokens[0],
      functionName: "Unknown"
    };
  }

  return {
    room: tokens[0],
    functionName: tokens.slice(1).join(" ")
  };
}

function parseActivities(lines, eventId, warnings, knownRooms) {
  return parseScheduleEntries(lines)
    .map(entry => parseActivityLine(entry, eventId, warnings, knownRooms))
    .filter(Boolean);
}

function isRoomTimeStart(lines, index, knownRooms) {
  return (
    knownRooms.includes(lines[index]) &&
    lines[index + 1] &&
    /^\d{2}:\d{2}\s+to\s+\d{2}:\d{2}$/.test(lines[index + 1])
  );
}

function parseEventDietaries(lines, knownRooms) {
  const dietaries = [];
  let collecting = false;

  const stopWords = [
    "Beverage Service",
    "External Equipment",
    "Agreement Notes",
    "Billing Instruction",
    "Deposit %",
    "Revenue Summary"
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.startsWith("Dietaries") ||
      line.startsWith("Dietary Requirements") ||
      line.startsWith("Dietary requirements") ||
      line.startsWith("Dietary // Allergens") ||
      line.startsWith("Dietaries:")
    ) {
      collecting = true;
      dietaries.push(line);
      continue;
    }

    if (collecting) {
      if (
        stopWords.some(w => line.startsWith(w)) ||
        isRoomTimeStart(lines, i, knownRooms) ||
        /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(line)
      ) {
        collecting = false;
        continue;
      }

      dietaries.push(line);
    }
  }

  return [...new Set(dietaries)];
}

function parseFoodServices(lines, eventId, knownRooms) {
  const foodIndex = lines.findIndex(line => line === "Food");
  if (foodIndex === -1) return [];

  const stopIndex = findNextSectionIndex(lines, foodIndex + 1, [
    "Beverage Service",
    "External Equipment",
    "Agreement Notes",
    "Billing Instruction",
    "Deposit %",
    "Revenue Summary"
  ]);

  const foodLines = lines.slice(foodIndex + 1, stopIndex);
  const services = [];

  let current = null;
  let currentItem = null;
  let dietaryMode = false;

  function closeItem() {
    if (current && currentItem) {
      current.items.push(currentItem);
      currentItem = null;
    }
  }

  function closeService() {
    closeItem();
    if (current) services.push(current);
    current = null;
  }

  for (let i = 0; i < foodLines.length; i++) {
    const line = foodLines[i];

    if (line === "Food" || line.startsWith("Menu ")) continue;

    if (isRoomTimeStart(foodLines, i, knownRooms)) {
      closeService();

      const timeMatch = foodLines[i + 1].match(
        /^(\d{2}:\d{2})\s+to\s+(\d{2}:\d{2})$/
      );

      current = {
        eventId,
        room: foodLines[i],
        startTime: timeMatch[1],
        endTime: timeMatch[2],
        serviceName: foodLines[i + 2] || null,
        servicePrice: null,
        expected: null,
        items: []
      };

      dietaryMode = false;
      i += 2;
      continue;
    }

    if (!current) continue;

    if (
      line.startsWith("Dietaries") ||
      line.startsWith("Dietary Requirements") ||
      line.startsWith("Dietary requirements") ||
      line.startsWith("Dietary // Allergens") ||
      line.startsWith("Dietaries:")
    ) {
      closeItem();
      dietaryMode = true;
      continue;
    }

    if (dietaryMode) {
      if (
        isRoomTimeStart(foodLines, i, knownRooms) ||
        line.startsWith("Beverage Service") ||
        line.startsWith("External Equipment")
      ) {
        dietaryMode = false;
      }

      continue;
    }

    if (/^Package Exp\s+\d+/i.test(line)) {
      current.expected = Number(line.match(/\d+/)[0]);
      continue;
    }

    const expMatch = line.match(/^Exp\s+(\d+)/i);

    if (expMatch) {
      if (currentItem) currentItem.expected = Number(expMatch[1]);
      else current.expected = Number(expMatch[1]);

      continue;
    }

    const priceMatch = line.match(/^EUR\s+([\d,]+\.\d{2})(.*)?/i);

    if (priceMatch) {
      const price = `EUR ${priceMatch[1]}${priceMatch[2] || ""}`.trim();

      if (currentItem) currentItem.price = price;
      else current.servicePrice = price;

      continue;
    }

    if (line.length > 1) {
      if (
        currentItem &&
        !currentItem.name.endsWith(")") &&
        /^[\w\d,)\s-]+$/.test(line) &&
        !/^Exp\s+\d+/i.test(line)
      ) {
        currentItem.name += " " + line;
        continue;
      }

      closeItem();

      currentItem = {
        name: line,
        price: null,
        expected: null
      };
    }
  }

  closeService();

  return services;
}

function parseBeverageServices(lines, eventId, knownRooms) {
  const beverageIndexes = [];

  lines.forEach((line, index) => {
    if (line === "Beverage Service") beverageIndexes.push(index);
  });

  if (beverageIndexes.length === 0) return [];

  const services = [];

  for (let b = 0; b < beverageIndexes.length; b++) {
    const beverageIndex = beverageIndexes[b];

    const stopIndex = findNextSectionIndex(lines, beverageIndex + 1, [
      "External Equipment",
      "Agreement Notes",
      "Billing Instruction",
      "Deposit %",
      "Revenue Summary"
    ]);

    const beverageLines = lines.slice(beverageIndex + 1, stopIndex);

    let current = null;

    function closeService() {
      if (
        current &&
        (current.room ||
          current.startTime ||
          current.items.length > 0 ||
          current.notes.length > 0)
      ) {
        services.push(current);
      }

      current = null;
    }

    for (const line of beverageLines) {
      const room = knownRooms.find(r => line.startsWith(r));

      if (room) {
        closeService();

        const remaining = line.replace(room, "").trim();

        current = {
          eventId,
          room,
          startTime: null,
          endTime: null,
          serviceName: remaining.replace("EUR", "").trim() || "Beverage Service",
          price: null,
          expected: null,
          barTabLimit: null,
          notes: [],
          items: []
        };

        continue;
      }

      if (!current) {
        current = {
          eventId,
          room: null,
          startTime: null,
          endTime: null,
          serviceName: "Beverage Service",
          price: null,
          expected: null,
          barTabLimit: null,
          notes: [],
          items: []
        };
      }

      const timeMatch = line.match(/^(\d{2}:\d{2})\s+to\s+(\d{2}:\d{2})$/);

      if (timeMatch) {
        current.startTime = timeMatch[1];
        current.endTime = timeMatch[2];
        continue;
      }

      const expMatch = line.match(/^Exp\s+(\d+)/i);

      if (expMatch) {
        current.expected = Number(expMatch[1]);
        continue;
      }

      const euroMatch = line.match(/€\s?([\d,]+(?:\.\d{2})?)/);
      if (euroMatch && !current.barTabLimit) {
        current.barTabLimit = Number(euroMatch[1].replace(",", ""));
      }

      if (/EUR\s?[\d,]+/.test(line) && !current.price) {
        current.price = line;
        continue;
      }

      if (
        line.includes("Minimum Spend") ||
        line.includes("Bar Tab") ||
        line.includes("Limit") ||
        line.includes("organiser") ||
        line.includes("credit card") ||
        line.includes("extending") ||
        line.includes("No doubles") ||
        line.includes("top-shelf")
      ) {
        current.notes.push(line);
        continue;
      }

      if (line === "00") continue;

      current.items.push(line);
    }

    closeService();
  }

  return services;
}

function parseEquipment(lines, accountName) {
  const equipmentIndex = lines.findIndex(line => line === "External Equipment");
  if (equipmentIndex === -1) return [];

  const stopIndex = findNextSectionIndex(lines, equipmentIndex + 1, [
    "Agreement Notes",
    "Billing Instruction",
    "Deposit %",
    "Revenue Summary",
    "Organisation Authorized Signature",
    "Date Last Printed"
  ]);

  const eqLines = lines.slice(equipmentIndex + 1, stopIndex);
  const equipment = [];

  let collecting = false;
  let currentItem = null;

  function closeItem() {
    if (currentItem) {
      const cleaned = cleanEquipmentItem(currentItem, accountName);

      if (cleaned && !isBadEquipmentItem(cleaned, accountName)) {
        equipment.push(cleaned);
      }

      currentItem = null;
    }
  }

  for (const line of eqLines) {
    if (isEquipmentStopLine(line, accountName)) {
      closeItem();
      break;
    }

    const headerMatch = line.match(/^(.+?)\s+\d{2}:\d{2}\s+to\s+\d{2}:\d{2}$/);

    if (headerMatch) {
      closeItem();
      collecting = true;
      continue;
    }

    if (!collecting) continue;

    if (/^\d+\s+/.test(line)) {
      closeItem();
      currentItem = line;
      continue;
    }

    if (currentItem) {
      if (isEquipmentStopLine(line, accountName)) {
        closeItem();
        break;
      }

      currentItem += " " + line;
    }
  }

  closeItem();

  return [...new Set(equipment)];
}

function isEquipmentStopLine(line, accountName) {
  return (
    isNoiseLine(line) ||
    line.startsWith("Deposit") ||
    line.startsWith("Revenue Summary") ||
    line.startsWith("Date Qty") ||
    line.includes("Total per Day") ||
    line === "Total" ||
    /^Total\s+[\d,]+\.\d{2}/.test(line) ||
    /^Unallocated\s+/.test(line) ||
    /^0\.00\s+/.test(line) ||
    /^\d{2}\/\d{2}\/\d{2}/.test(line) ||
    (accountName && line.includes(accountName))
  );
}

function cleanEquipmentItem(item, accountName) {
  let cleaned = item
    .replace(/^\d+\s+/, "")
    .replace(/\s+Incl\b.*$/i, "")
    .replace(/\s+EUR\s+[\d.]+\s+Custom Rate\b.*$/i, "")
    .replace(/\s+All prices are inclusive of VAT.*$/i, "")
    .trim();

  if (accountName && cleaned.includes(accountName)) {
    cleaned = cleaned.split(accountName)[0].trim();
  }

  cleaned = cleaned
    .replace(/\s+\d{2}\/\d{2}\/\d{2}.*$/i, "")
    .replace(/\s+Organisation.*$/i, "")
    .replace(/\s+Authorized Signature.*$/i, "")
    .trim();

  return cleaned;
}

function isBadEquipmentItem(item, accountName) {
  return (
    !item ||
    item.includes("Organisation") ||
    item.includes("Authorized Signature") ||
    item.includes("Date Last Printed") ||
    item.includes("Revenue Summary") ||
    item.includes("Total per Day") ||
    /\d{2}\/\d{2}\/\d{2}/.test(item) ||
    (accountName && item.includes(accountName))
  );
}

function parseOperationalNotes(lines) {
  const notes = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Event" || lines[i] === "Notes:") {
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];

        if (
          /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(line) ||
          line === "Food" ||
          line === "Beverage Service" ||
          line === "External Equipment" ||
          line === "Agreement Notes" ||
          line === "Billing Instruction"
        ) {
          break;
        }

        if (!isNoiseLine(line) && line !== ".") {
          notes.push(line);
        }
      }
    }
  }

  return [...new Set(notes)];
}

function parseAgreementNotes(lines) {
  const index = lines.findIndex(line => line === "Agreement Notes");

  if (index === -1) return [];

  const stopIndex = findNextSectionIndex(lines, index + 1, [
    "Deposit %",
    "Revenue Summary"
  ]);

  return lines.slice(index + 1, stopIndex).filter(line => !isNoiseLine(line));
}

function parseBillingInstructions(lines) {
  const index = lines.findIndex(line => line === "Billing Instruction");

  if (index === -1) return [];

  const stopIndex = findNextSectionIndex(lines, index + 1, [
    "Agreement Notes",
    "Deposit %",
    "Revenue Summary"
  ]);

  return lines.slice(index + 1, stopIndex).filter(line => !isNoiseLine(line));
}

function linkFoodToActivities(activities, foodServices) {
  return activities.map(activity => {
    const foodService = foodServices.find(
      food =>
        food.eventId === activity.eventId &&
        food.room === activity.room &&
        food.startTime === activity.startTime &&
        food.endTime === activity.endTime
    );

    return {
      ...activity,
      foodService: foodService || null
    };
  });
}

function linkBeverageToActivities(activities, beverageServices) {
  return activities.map(activity => {
    const beverageService = beverageServices.find(
      bev =>
        bev.eventId === activity.eventId &&
        bev.room === activity.room &&
        bev.startTime === activity.startTime &&
        bev.endTime === activity.endTime
    );

    return {
      ...activity,
      beverageService: beverageService || null
    };
  });
}

function linkEquipmentToActivities(activities, equipment) {
  return activities.map(activity => {
    const functionName = activity.function.toLowerCase();

    if (
      functionName.includes("meeting") ||
      functionName.includes("office") ||
      functionName.includes("filming") ||
      functionName.includes("registration") ||
      functionName.includes("conference") ||
      functionName.includes("set up")
    ) {
      return {
        ...activity,
        equipment
      };
    }

    return {
      ...activity,
      equipment: []
    };
  });
}

function parseBEO(text) {
  const lines = normalizeLines(text);
  const blocks = splitIntoEventBlocks(lines);

  const events = blocks.map((block, index) => {
    const eventId = index + 1;
    const warnings = [];
    const knownRooms = discoverRooms(block);

    const header = parseHeader(block, eventId);
    const operationalNotes = parseOperationalNotes(block);
    const agreementNotes = parseAgreementNotes(block);
    const billingInstructions = parseBillingInstructions(block);
    const eventDietaries = parseEventDietaries(block, knownRooms);

    let activities = parseActivities(block, eventId, warnings, knownRooms);

    const foodServices = parseFoodServices(block, eventId, knownRooms);
    const beverageServices = parseBeverageServices(block, eventId, knownRooms);
    const equipment = parseEquipment(block, header.accountName);

    activities = linkFoodToActivities(activities, foodServices);
    activities = linkBeverageToActivities(activities, beverageServices);
    activities = linkEquipmentToActivities(activities, equipment);

    if (eventDietaries.length > 0) {
      warnings.push(
        "Dietary information detected at event level. Please review association manually."
      );
    }

    return {
      ...header,
      operationalNotes,
      agreementNotes,
      billingInstructions,
      eventDietaries,
      warnings,
      activities,
      equipment
    };
  });

  return {
    totalEvents: events.length,
    events
  };
}

// async function main() {
//   try {
//     const text = await extractTextFromPDF("./beo2.pdf");
//     const result = parseBEO(text);

//     fs.writeFileSync(
//       "./parsed-beo-teste.json",
//       JSON.stringify(result, null, 2),
//       "utf-8"
//     );

//     console.log("Parsing completed.");
//     console.log(`Events found: ${result.totalEvents}`);
//     console.log("Result saved to parsed-beo-clean.json");
//   } catch (error) {
//     console.error("Error:", error);
//   }
// }

async function parseBEOFromFile(filePath) {
  const text = await extractTextFromPDF(filePath);
  return parseBEO(text);
}

module.exports = {
  parseBEOFromFile
};

//main();