// content_script.js

// === CONFIG ===
// Interval for auto-swiping (ms). Adjust if Tinder throttles you.
const SWIPE_INTERVAL = 5000; 

// Keep track of match IDs we've already greeted
let greetedMatches = new Set();

// Keep track of conversation IDs already checked for “date”
let checkedConversations = new Set();

// 1. AUTO-SWIPE FUNCTIONALITY
setInterval(() => {
  // Tinder Web “Like” button usually has aria-label="Like"
  const likeBtn = document.querySelector('button[aria-label="Like"]');
  if (likeBtn) {
    likeBtn.click();
    console.log("[%cAuto-Swipe%c] Liked one profile.", "color: green;", "");
  }
}, SWIPE_INTERVAL);

// 2. DETECT NEW MATCHES
// Tinder’s sidebar lists matches under a container. We watch DOM mutations.
const matchSidebarSelector = "div[aria-label='Matches']"; 
const matchObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    m.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      // Each match entry often has a data-match-id attribute
      const matchElement = node.querySelector("[data-testid='matchListItem']");
      if (matchElement) {
        const matchId = matchElement.getAttribute("data-match-id");
        if (matchId && !greetedMatches.has(matchId)) {
          greetedMatches.add(matchId);
          console.log("[%cNew Match%c] ID:", "color: blue;", "", matchId);
          // Inform background: new match found
          chrome.runtime.sendMessage({
            type: "NEW_MATCH",
            matchId,
            matchName: matchElement.innerText || "",
          });
        }
      }
    });
  }
});

// Wait until match sidebar is available
function observeMatches() {
  const sidebar = document.querySelector(matchSidebarSelector);
  if (!sidebar) {
    // Retry after a short delay
    setTimeout(observeMatches, 2000);
    return;
  }
  matchObserver.observe(sidebar, { childList: true, subtree: true });
}
observeMatches();

// 3. MONITOR OPEN CHAT FOR DATE DETECTION
// Whenever the user opens a chat, the chat window DOM is inserted under a container
// We watch for new chat containers, then observe their messages.
const chatWindowSelector = "div[aria-label='Conversation']"; 
const chatObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    m.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      // If a new chat window appears
      if (node.matches && node.matches(chatWindowSelector)) {
        const convId = node.getAttribute("data-match-id");
        if (convId && !checkedConversations.has(convId)) {
          // Start observing this conversation’s message list
          watchConversation(node, convId);
        }
      }
    });
  }
});

function observeChats() {
  const root = document.body;
  chatObserver.observe(root, { childList: true, subtree: true });
}
observeChats();

// For a given conversation DOM node, observe incoming messages
function watchConversation(convNode, convId) {
  checkedConversations.add(convId);
  const messageList = convNode.querySelector("div[aria-label='Message list']");
  if (!messageList) return;

  const msgObserver = new MutationObserver((records) => {
    records.forEach((rec) => {
      rec.addedNodes.forEach((newMsg) => {
        if (newMsg.nodeType !== 1) return;
        // Extract message text
        const textElem = newMsg.querySelector("span[dir='auto']");
        if (!textElem) return;
        const msgText = textElem.innerText || "";
        const isFromThem = newMsg.matches("div[aria-label='Incoming message']");
        if (isFromThem) {
          console.log("[%cIncoming Msg%c] from match", "color: purple;", "", msgText);
          // Send the full conversation text to background for date detection
          const allMsgs = [...messageList.querySelectorAll("span[dir='auto']")]
            .map((sp) => sp.innerText)
            .join("\n");
          chrome.runtime.sendMessage({
            type: "CHECK_FOR_DATE",
            matchId: convId,
            conversation: allMsgs,
          });
        }
      });
    });
  });

  msgObserver.observe(messageList, { childList: true, subtree: true });
}

// 4. RECEIVE AUTO-RESPONSE FOR NEW MATCH
// Background will send a “SEND_GREETING” message when AI greeting is ready
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEND_GREETING") {
    const { matchId, greeting } = msg;
    // Find and open the match’s chat
    const matchItem = document.querySelector(`[data-match-id="${matchId}"]`);
    if (matchItem) {
      matchItem.click(); // Open conversation
      setTimeout(() => {
        // Find the text input area (textarea or div[contenteditable])
        const textbox = document.querySelector("textarea");
        if (textbox) {
          textbox.value = greeting;
          // Tinder Web uses an invisible button to send
          const sendBtn = document.querySelector("button[aria-label='Send']");
          if (sendBtn) {
            sendBtn.click();
            console.log("[%cAuto-Msg%c] Sent greeting to", "color: teal;", "", matchId);
          }
        }
      }, 2000); // wait for chat to load
    }
  }
});
