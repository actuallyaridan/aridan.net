const userID = "701403809129168978";
let lastStatus;
let discordDataLatest;
let webSocket;
let heartbeatInterval;
let reconnectTimeout;

const elements = {
  loadingDiv: document.getElementById("loading"),
  errorMessage: document.getElementById("errorMessage"),
  spinner: document.getElementById("loadingSpinner"),
  contentDiv: document.getElementById("loadedLanyard"),
  lanyardDiscord: document.getElementById("lanyardDiscord"),
  amLanyardDiscord: document.getElementById("amLanyardDiscord"),
  activityLogoLarge: document.getElementById("activityLogoLarge"),
  activityName: document.getElementById("activityName"),
  activityDetails: document.getElementById("activityDetails"),
  activityState: document.getElementById("activityState"),
  amActivityLogoLarge: document.getElementById("amActivityLogoLarge"),
  amActivityName: document.getElementById("amActivityName"),
  amActivityState: document.getElementById("amActivityState"),
  amActivityDetails: document.getElementById("amActivityDetails"),
  amActivityTime: document.getElementById("amActivityTime"),
  amRemaining: document.getElementById("amRemaining"),
  amElapsed: document.getElementById("amElapsed"),
};

["amLanyardDiscord", "discordActivity"].forEach((id) =>
  document.getElementById(id)?.classList.add("activity")
);

function toggleLoading(isLoading) {
  document.querySelectorAll(".activity").forEach((el) => {
    el.classList.toggle("loadingUpdating", isLoading);
    el.querySelector(".smallLoader")?.classList.toggle("showSmallLoader", isLoading);
  });
}

function connectWebSocket() {
  console.log(
    "[Lanyard] Preparing connection to Lanyard WebSocket at wss://api.lanyard.rest/socket..."
  );
  webSocket = new WebSocket("wss://api.lanyard.rest/socket");

  webSocket.onopen = () => {
    console.log("[Lanyard] Ready. Attempting to connect and subscribe...");
    sendMessage({ op: 2, d: { subscribe_to_id: userID } });
  };

  webSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.op === 1) {
      console.log(
        `%c[Lanyard] Successfully subscribed to user ID ${userID}`,
        "color:green;"
      );
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(
        () => sendMessage({ op: 3 }),
        data.d.heartbeat_interval
      );
    } else if (data.op === 0) {
      toggleLoading(true);
      discordDataLatest = data.d;
    }
  };

  webSocket.onerror = (error) => {
    console.error("[Lanyard] Halting on critical WebSocket error:", error);
    webSocket.close();
  };

  webSocket.onclose = () => {
    console.warn("[Lanyard] Lost connection to Lanyard. Reconnecting...");
    clearInterval(heartbeatInterval);
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectWebSocket();
      }, 3000);
    }
  };
}

function sendMessage(message) {
  if (webSocket?.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify(message));
  } else {
    console.warn("[Lanyard] Connection lost. Unable to recover.");
  }
}

function updateLanyardData() {
  try {
    const discordData = discordDataLatest || {};
    const activities = discordData.activities || [];
    const discordStatus = discordData.discord_status || "";

    updateStatusWrapper(discordStatus);
    updateActivityInfo(activities, discordStatus);

    const musicActivity = activities.find(
      (activity) =>
        activity.name === "Apple Music" ||
        activity.application_id === "773825528921849856"
    );
    if (musicActivity) updateProgressBar(musicActivity.timestamps);

    toggleDisplay(elements.loadingDiv, false);
    toggleDisplay(elements.contentDiv, true);
    toggleDisplay(elements.errorMessage, false);
  } catch (error) {
    handleError(error);
  } finally {
    toggleLoading(false);
  }
}

function updateStatusWrapper(status) {
  if (status === lastStatus) return;
  lastStatus = status;

  document
    .querySelectorAll(".statusWrapper")
    .forEach((el) => el.classList.add("hide"));

  const statusElement = document.getElementById(
    `statusWrapper${capitalizeFirstLetter(status)}`
  );
  statusElement?.classList.remove("hide");
}

function updateActivityInfo(activities, status) {
  toggleDisplay(elements.lanyardDiscord, status === "online");

  let appleMusicActivity = null;
  const otherActivities = activities.filter((activity) => {
    if (
      activity.name === "Apple Music" ||
      activity.application_id === "773825528921849856"
    ) {
      appleMusicActivity = activity;
      return false;
    }
    return true;
  });

  appleMusicActivity
    ? updateAppleMusicInfo(appleMusicActivity)
    : toggleDisplay(elements.amLanyardDiscord, false);

  toggleDisplay(
    document.getElementById("discordActivity"),
    otherActivities.length > 0
  );

  updateActivityImages(otherActivities);
  updateActivityDetails(otherActivities);
}

function updateActivityImages(activities) {
  const hasImage = activities.some((activity) => activity.assets?.large_image);
  toggleDisplay(elements.activityLogoLarge, hasImage);

  activities.forEach((activity) => {
    if (activity.assets?.large_image) {
      updateImage(
        elements.activityLogoLarge,
        activity.assets.large_image,
        activity.application_id,
        activity.assets.large_text
      );
    }
  });
}

function updateActivityDetails(activities) {
  if (!activities.length) {
    [
      elements.activityName,
      elements.activityDetails,
      elements.activityState,
    ].forEach((el) => toggleDisplay(el, false));
    return;
  }

  const activity = activities[0];
  updateElementText(elements.activityName, activity.name);
  updateElementText(
    elements.activityDetails,
    activity.details || "No details available"
  );
  updateElementText(elements.activityState, activity.state || "");

  updateActivityTime(activity.timestamps);
}

function updateAppleMusicInfo(activity) {
  toggleDisplay(elements.amLanyardDiscord, true);

  if (activity.assets) {
    updateImage(
      elements.amActivityLogoLarge,
      activity.assets.large_image,
      activity.application_id,
      activity.assets.large_text
    );
  }

  updateElementText(elements.amActivityName, activity.name);
  updateElementText(
    elements.amActivityState,
    formatActivityState(activity.state)
  );
  updateElementText(elements.amActivityDetails, activity.details);

  updateActivityTime(activity.timestamps, "am");
  updateProgressBar(activity.timestamps);
}

function updateProgressBar(timestamps) {
  const progressBar = document.getElementById("amProgressBar");
  if (!progressBar) return;

  if (!timestamps?.start || !timestamps?.end) {
    progressBar.style.width = "0%";
    return;
  }

  const now = Date.now();
  const startTime = new Date(timestamps.start).getTime();
  const endTime = new Date(timestamps.end).getTime();

  if (now < startTime) {
    progressBar.style.width = "0%";
  } else if (now > endTime) {
    progressBar.style.width = "100%";
  } else {
    const duration = endTime - startTime;
    const elapsed = now - startTime;
    const percentage = (elapsed / duration) * 100;
    progressBar.style.width = `${percentage}%`;
  }
}

function updateActivityTime(timestamps, prefix = "") {
  const now = new Date();
  const timeElem = document.getElementById(`${prefix}ActivityTime`);
  const remainingElem = document.getElementById(`${prefix}Remaining`);
  const elapsedElem = document.getElementById(`${prefix}Elapsed`);

  const timeData = timestamps?.end
    ? calculateTimeDifference(new Date(timestamps.end), now)
    : timestamps?.start
      ? calculateTimeDifference(now, new Date(timestamps.start))
      : null;

  updateElementText(timeElem, timeData ? formatTime(timeData) : "-:-");
  toggleTimeDisplay(remainingElem, elapsedElem, !!timestamps?.end);
}

function calculateTimeDifference(end, start) {
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

function formatTime({ hours, minutes, seconds }) {
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function updateImage(element, image, appId, details = "") {
  if (!image) {
    element.style.display = "none";
    return;
  }
  element.src = getImageUrl(image, appId);
  element.alt = details || image;
  element.title = details || image;
  element.style.display = "block";
}

function updateElementText(element, text) {
  if (element) element.textContent = text;
  toggleDisplay(element, !!text);
}

function toggleTimeDisplay(remainingElem, elapsedElem, isRemaining) {
  if (remainingElem) remainingElem.classList.toggle("hide", !isRemaining);
  if (elapsedElem) elapsedElem.classList.toggle("hide", isRemaining);
}

function getImageUrl(image, appId) {
  return image.includes("external")
    ? `https://media.discordapp.net/external/${image.split("mp:external/")[1]}`
    : `https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=256`;
}

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pad(num) {
  return num.toString().padStart(2, "0");
}

function toggleDisplay(element, show) {
  if (element) element.style.display = show ? "flex" : "none";
}

function formatActivityState(state) {
  const byRegex = /by\s*(?:\(.*\)|[^)]+)/;
  return byRegex.test(state) ? state.replace(/by\s+/, "") : state;
}

function handleError(error) {
  console.error("Error:", error);
  elements.errorMessage.textContent = `An error occurred: ${error.message || error
    }`;
  toggleDisplay(elements.spinner, false);
  toggleDisplay(elements.contentDiv, false);
  toggleDisplay(elements.errorMessage, true);
}

if (document.querySelector(".discordWrapper")) {
  connectWebSocket();
  setInterval(updateLanyardData, 1000);
}
