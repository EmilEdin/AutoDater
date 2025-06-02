// options.js

// Saves options to chrome.storage
function saveOptions(e) {
  e.preventDefault();
  const geminiKey = document.getElementById("geminiKey").value.trim();
  const googleClientId = document.getElementById("googleClientId").value.trim();

  chrome.storage.local.set(
    { GEMINI_API_KEY: geminiKey, GOOGLE_CLIENT_ID: googleClientId },
    () => {
      const status = document.getElementById("status");
      status.textContent = "Saved.";
      setTimeout(() => (status.textContent = ""), 2000);
    }
  );
}

// Restores the saved values and populates the form
function restoreOptions() {
  chrome.storage.local.get(["GEMINI_API_KEY", "GOOGLE_CLIENT_ID"], (items) => {
    if (items.GEMINI_API_KEY) {
      document.getElementById("geminiKey").value = items.GEMINI_API_KEY;
    }
    if (items.GOOGLE_CLIENT_ID) {
      document.getElementById("googleClientId").value = items.GOOGLE_CLIENT_ID;
    }
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("options-form").addEventListener("submit", saveOptions);
