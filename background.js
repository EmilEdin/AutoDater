// background.js

let GEMINI_API_KEY = "";
let GOOGLE_CLIENT_ID = "";

// On startup, load stored API keys
chrome.storage.local.get(["GEMINI_API_KEY", "GOOGLE_CLIENT_ID"], (items) => {
  GEMINI_API_KEY = items.GEMINI_API_KEY || "";
  GOOGLE_CLIENT_ID = items.GOOGLE_CLIENT_ID || "";
});

// Listen for messages from content_script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "NEW_MATCH") {
    handleNewMatch(msg.matchId, msg.matchName);
  } else if (msg.type === "CHECK_FOR_DATE") {
    handleDateCheck(msg.matchId, msg.conversation);
  }
});


// 1. WHEN A NEW MATCH APPEARS → ASK AI FOR A GREETING
async function handleNewMatch(matchId, matchName) {
  if (!GEMINI_API_KEY) {
    console.warn("No Gemini API key set.");
    return;
  }
  // Simple prompt: greet the new match by name
  const prompt = `You are a friendly, witty Tinder user. Write a short icebreaker message to someone named ${matchName}.`;
  const greeting = await callGeminiAPI(prompt);
  if (greeting) {
    // Send greeting back to content script
    chrome.tabs.query({ url: "*://tinder.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: "SEND_GREETING",
          matchId,
          greeting
        });
      });
    });
  }
}


// 2. WHEN CHAT MESSAGES ARRIVE → CHECK IF A DATE WAS SET
async function handleDateCheck(matchId, conversation) {
  if (!GEMINI_API_KEY) return;

  const prompt = `
You are an AI that extracts date/time commitments from Tinder conversations. 
Given the conversation below, identify if the match has agreed to meet in person. 
If yes, respond with a JSON string exactly in this format:
{"date":"YYYY-MM-DD","time":"HH:MM","location":"LOCATION_IF_ANY"} 
If no meeting is set, reply with {"date":null}.
Conversation:
${conversation}
`;

  const aiResponse = await callGeminiAPI(prompt);
  let parsed;
  try {
    parsed = JSON.parse(aiResponse.trim());
  } catch (e) {
    console.warn("Failed to parse AI response for date:", aiResponse);
    return;
  }
  if (parsed.date) {
    // We have a date → create / prompt calendar event
    createGoogleCalendarEvent(matchId, parsed).catch((err) =>
      console.error("Calendar error:", err)
    );
  }
}


// 3. CALL GEMINI (OR OTHER LLM) VIA FETCH
async function callGeminiAPI(prompt) {
  const url = "https://api.gemini.example/v1/generate"; // replace with real endpoint
  const payload = {
    prompt: prompt,
    max_tokens: 150,
    temperature: 0.7
  };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    return json.choices?.[0]?.text || "";
  } catch (e) {
    console.error("Error calling Gemini:", e);
    return "";
  }
}


// 4. GOOGLE CALENDAR EVENT CREATION

// 4.a. Launch OAuth flow to get a token
function getGoogleAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      return reject("No Google Client ID set");
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        return reject(chrome.runtime.lastError);
      }
      resolve(token);
    });
  });
}

// 4.b. Create the event
async function createGoogleCalendarEvent(matchId, { date, time, location }) {
  try {
    const token = await getGoogleAuthToken(true);
    // Construct RFC3339 date-time strings
    const [year, month, day] = date.split("-");
    const [hour, minute] = time.split(":");
    const startDateTime = new Date(
      Date.UTC(year, month - 1, day, hour, minute)
    ).toISOString();
    // Default duration: 1 hour
    const endDateTime = new Date(
      Date.UTC(year, month - 1, day, hour + 1, minute)
    ).toISOString();

    const event = {
      summary: "Tinder Date",
      location: location || "",
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
      description: `Auto-added Tinder date for match ${matchId}.`
    };

    const calendarUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const resp = await fetch(calendarUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Calendar API error: ${errText}`);
    }
    console.log("[Calendar] Event created successfully.");
    // Optionally notify the user
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Tinder Date Added",
      message: `An event has been added on ${date} at ${time}.`
    });
  } catch (err) {
    console.error("Failed to create calendar event:", err);
  }
}
