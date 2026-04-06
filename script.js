// =====================
// FIREBASE
// =====================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNwan6r8B5fqxLnX5JXR1Z_Yaq158QmH4",
  authDomain: "chore-tracker-2f79d.firebaseapp.com",
  projectId: "chore-tracker-2f79d",
  storageBucket: "chore-tracker-2f79d.firebasestorage.app",
  messagingSenderId: "761245984745",
  appId: "1:761245984745:web:5497ac442b5ee69ca9cd78"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

async function uploadKidPhoto(kidId, file) {
  const ext = file.name.split(".").pop();
  const storageRef = ref(storage, `Photos/${kidId}.${ext}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}


// =====================
// CONFIGURATION
// =====================

// Default goal configuration — loaded from Firestore, seeded on first run
const DEFAULT_GOAL_CONFIG = {
  type: "percentage",   // percentage | streak | weekly | total-count | perfect-bonus
  timeRange: "month",   // month | week (used by percentage and weekly types)
  target: 80,           // e.g. 80% / 7-day streak / 20 total completions
  reward: "",           // free text: "Ice cream", "$20", "Movie night", etc.
  bonusTarget: 100,     // perfect-bonus only
  bonusReward: "",      // perfect-bonus only
};

let goalConfig = Object.assign({}, DEFAULT_GOAL_CONFIG);
let savedGoalConfig = Object.assign({}, DEFAULT_GOAL_CONFIG);

// Default kids written to Firestore on first run if no kids exist yet.
const DEFAULT_KIDS = [
  { id: "1", name: "Ally",     dob: "2012-03-16", chores: ["Clean Living Room"],           photo: "Photos/ally.jpeg" },
  { id: "2", name: "Olivia",   dob: "2012-12-11", chores: ["Clean Playroom"],              photo: "Photos/olivia.jpeg" },
  { id: "3", name: "Piper",    dob: "2013-06-28", chores: ["Guest and Upstairs Bathroom"], photo: "Photos/piper.jpeg" },
  { id: "4", name: "Marivel",  dob: "2014-11-13", chores: ["Clean Playroom"],              photo: "Photos/marivel.jpeg" },
  { id: "5", name: "Caroline", dob: "2015-08-04", chores: ["Clean Playroom"],              photo: "Photos/caroline.jpeg" },
  { id: "6", name: "Vivi",     dob: "2016-10-19", chores: ["Load/Unload Dishwasher"],      photo: "Photos/vivi.jpeg" },
  { id: "7", name: "Wren",     dob: "2017-10-08", chores: ["Feed dogs"],                   photo: "Photos/wren.jpeg" },
  { id: "8", name: "Emilio",   dob: "2021-11-12", chores: ["Pick up toys"],                photo: "Photos/emilio.jpeg" },
];

// Loaded from Firestore on startup — replaces the hardcoded array
let KIDS = [];


// =====================
// DATA
// =====================

// Stores every logged day. Each entry is an object:
// { kidId: 1, date: "2026-04-03", completed: true }
// Loaded from Firestore on startup, kept in memory while the app is running.
let log = [];

// Tracks which kid's detail page is open
let activeKidId = null;

// Tracks which calendar day is currently selected (as "YYYY-MM-DD" string)
let selectedDate = null;


// =====================
// HELPERS
// =====================

// Calculates a person's current age from a "YYYY-MM-DD" date of birth string
function calculateAge(dob) {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  // Subtract 1 if their birthday hasn't happened yet this year
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}


// Returns how many days are in a given month
// month is 0-indexed: 0 = January, 11 = December
function getDaysInMonth(year, month) {
  // Day 0 of the NEXT month = last day of the current month
  return new Date(year, month + 1, 0).getDate();
}

// Converts "2026-04-03" to a readable string like "Apr 3, 2026"
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC", // prevents date from shifting due to local timezone offset
  });
}

// Returns today's date as a "YYYY-MM-DD" string
function todayString() {
  return new Date().toISOString().split("T")[0];
}


// =====================
// HOME VIEW
// =====================

// Builds and displays a card for each kid on the home screen
function renderHome() {
  const grid = document.getElementById("kids-grid");
  grid.innerHTML = ""; // clear before re-rendering

  const sortedKids = KIDS.filter(function (k) { return !k.archived; }).sort(function (a, b) { return a.dob < b.dob ? -1 : 1; });

  if (sortedKids.length === 0) {
    grid.innerHTML = `
      <div id="empty-state">
        <div id="empty-state-icon">🧹</div>
        <h2>Welcome to Chore Tracker!</h2>
        <p>No kids are set up yet. Head to <strong>Manage Kids</strong> in the Parent Dashboard to add your first kid and configure their chore and allowance.</p>
        <button id="empty-state-btn">Get Started</button>
      </div>
    `;
    document.getElementById("empty-state-btn").addEventListener("click", function () {
      openDashboard();
      openSettings();
    });
    return;
  }

  sortedKids.forEach(function (kid) {
    const age = kid.dob ? calculateAge(kid.dob) : null;
    const progress = getGoalProgress(kid.id);
    const reward = kid.reward || goalConfig.reward || "";

    const nameParts = kid.name.trim().split(" ");
    const initials = nameParts.length > 1
      ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
      : nameParts[0][0];
    const photoHtml = kid.photo
      ? `<img class="kid-photo" src="${kid.photo}" alt="${kid.name}" />`
      : `<div class="kid-photo kid-photo-placeholder">${initials}</div>`;

    const taskText = kid.chores.join(", ");

    const card = document.createElement("div");
    card.className = "kid-card";

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-name-age">
          <h2>${kid.name}</h2>
          ${age !== null ? `<p class="kid-age">Age ${age}</p>` : ""}
        </div>
        ${photoHtml}
      </div>
      <p class="kid-chore" title="${taskText}">${taskText}</p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: ${progress.barPercent}%"></div>
      </div>
      <div class="card-bottom-row">
        <span class="kid-on-track">${progress.label}${reward ? " · " + reward : ""}</span>
      </div>
    `;

    // Clicking a card checks for a PIN before opening the detail view
    card.addEventListener("click", function () {
      requestKidAccess(kid.id);
    });

    grid.appendChild(card);
  });
}


// =====================
// KID DETAIL VIEW
// =====================

// Opens the detail page for a specific kid
function requestKidAccess(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  if (kid.pin) {
    showPinModal(kidId);
  } else {
    openKid(kidId);
  }
}

function showPinModal(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  document.getElementById("pin-modal-name").textContent = kid.name;
  document.getElementById("pin-error").classList.add("hidden");
  document.getElementById("pin-modal").classList.remove("hidden");

  // Clone inputs to remove any previous event listeners
  document.querySelectorAll(".pin-digit").forEach(function (input) {
    const fresh = input.cloneNode(true);
    fresh.value = "";
    input.parentNode.replaceChild(fresh, input);
  });

  const inputs = document.querySelectorAll(".pin-digit");
  inputs[0].focus();

  inputs.forEach(function (input, i) {
    input.addEventListener("input", function () {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (input.value && i < 3) {
        inputs[i + 1].focus();
      }
      if (i === 3 && input.value) {
        submitPin(kidId);
      }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !input.value && i > 0) {
        inputs[i - 1].focus();
      }
    });
  });

  document.getElementById("pin-cancel-btn").onclick = closePinModal;
  document.getElementById("pin-modal-backdrop").onclick = closePinModal;
}

function closePinModal() {
  document.getElementById("pin-modal").classList.add("hidden");
}

function submitPin(kidId) {
  const inputs = document.querySelectorAll(".pin-digit");
  const entered = Array.from(inputs).map(function (i) { return i.value; }).join("");
  const kid = KIDS.find(function (k) { return k.id === kidId; });

  if (entered === kid.pin) {
    closePinModal();
    openKid(kidId);
  } else {
    document.getElementById("pin-error").classList.remove("hidden");
    inputs.forEach(function (input) { input.value = ""; });
    inputs[0].focus();
  }
}

async function openKid(kidId) {
  window.scrollTo(0, 0);
  activeKidId = kidId;
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const age = calculateAge(kid.dob);
  const reward = kid.reward || goalConfig.reward || "";

  location.hash = "kid-" + kidId;
  showView("kid-view");

  // Build photo element with camera edit button overlay
  const photoInner = kid.photo
    ? `<img class="detail-photo" src="${kid.photo}" alt="${kid.name}" />`
    : `<div class="detail-photo detail-photo-placeholder">${kid.name[0]}</div>`;
  const photoHtml = `
    <div class="detail-photo-wrap">
      ${photoInner}
      <label class="detail-photo-edit-btn" for="detail-photo-input" title="Change photo">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </label>
      <input type="file" id="detail-photo-input" accept="image/*" style="display:none" />
    </div>`;

  const ageLine = (kid.dob && !isNaN(age)) ? `<p>Age ${age}${reward ? " &bull; Reward: <strong>" + reward + "</strong>" : ""}</p>` : reward ? `<p>Reward: <strong>${reward}</strong></p>` : "";

  // Fill in the kid's header info
  document.getElementById("kid-header").innerHTML = `
    <div class="detail-header-row">
      <div class="detail-header-text">
        <h2>${kid.name}</h2>
        ${ageLine}
        <p class="kid-chore-label">Task: <strong>${kid.chores.join(", ")}</strong></p>
      </div>
      ${photoHtml}
    </div>
  `;

  // Wire up the photo edit button
  document.getElementById("detail-photo-input").addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    // Optimistic preview — swap whatever is there (img or placeholder div) for a real img
    const wrap = document.querySelector(".detail-photo-wrap");
    const existing = wrap.querySelector(".detail-photo, .detail-photo-placeholder");
    const previewImg = document.createElement("img");
    previewImg.className = "detail-photo";
    previewImg.src = URL.createObjectURL(file);
    previewImg.alt = kid.name;
    existing.replaceWith(previewImg);
    try {
      const url = await uploadKidPhoto(kidId, file);
      kid.photo = url;
      await setDoc(doc(db, "kids", kidId), { photo: url }, { merge: true });
      showToast("Photo updated!");
    } catch (err) {
      console.error("Photo upload failed:", err);
      showToast("Photo upload failed.");
    }
  });

  // If today has no entry yet, auto-log it as not completed.
  // This makes today show red by default — the kid must actively mark it done.
  const today = todayString();
  const hasEntryToday = log.find(function (e) {
    return e.kidId === kidId && e.date === today;
  });
  if (!hasEntryToday) {
    log.push({ kidId: kidId, date: today, completed: false });
    const entryKey = `${kidId}_${today}`;
    await setDoc(doc(db, "chore-log", entryKey), { kidId: kidId, date: today, completed: false });
  }

  // Reset selected date and hide the log controls until a day is picked
  selectedDate = null;
  document.getElementById("log-controls").classList.add("hidden");
  document.getElementById("log-prompt").classList.remove("hidden");

  renderMonthLog(kidId);
  renderKidProgress(kidId);
}

// Returns to the home view
function showView(viewId) {
  ["home-view", "kid-view", "dashboard-view", "settings-view", "loading-view"].forEach(function (id) {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(viewId).classList.remove("hidden");
}

function goHome() {
  window.scrollTo(0, 0);
  activeKidId = null;
  location.hash = "";
  showView("home-view");
  renderHome();
}


// =====================
// LOG AN ENTRY
// =====================

async function logEntry(kidId, date, completed) {
  // Look for an existing log entry for this kid on this date
  const existing = log.find(function (e) {
    return e.kidId === kidId && e.date === date;
  });

  if (existing) {
    // If already logged, just update the completed value (no duplicate)
    existing.completed = completed;
  } else {
    // Otherwise add a new entry
    log.push({ kidId: kidId, date: date, completed: completed });
  }

  // Save the updated entry to Firestore.
  // Each document is keyed by "kidId_date" so it's easy to find and overwrite.
  const entryKey = `${kidId}_${date}`;
  await setDoc(doc(db, "chore-log", entryKey), { kidId, date, 
    
   });

  // Refresh the log list and progress stats
  renderMonthLog(kidId);
  renderKidProgress(kidId);
}


// =====================
// RENDER THIS MONTH'S CALENDAR
// =====================

function renderMonthLog(kidId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const today = now.getDate();
  const totalDays = getDaysInMonth(year, month);

  // Build a lookup map: { "2026-04-03": true/false } for quick access
  const entryMap = {};
  log.forEach(function (e) {
    if (e.kidId === kidId) {
      entryMap[e.date] = e.completed;
    }
  });

  // What day of the week does the 1st fall on? 0=Sun, 6=Sat
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // "YYYY-MM" prefix for building date strings
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Replace the <ul> with a calendar container
  const container = document.getElementById("log-ul");
  container.innerHTML = "";
  container.className = "calendar-grid";

  // Render day-of-week header labels (Sun through Sat)
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayLabels.forEach(function (label) {
    const header = document.createElement("div");
    header.className = "cal-header";
    header.textContent = label;
    container.appendChild(header);
  });

  // Render empty cells before the 1st to align days correctly
  // e.g. if the 1st is Wednesday, we need 3 blank cells first
  for (let i = 0; i < firstDayOfWeek; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-day cal-blank";
    container.appendChild(blank);
  }

  // Render a cell for each day of the month
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const isFuture = day > today;
    const isToday = day === today;

    // Determine the status of this day
    let status = "unlogged"; // default: future days only
    if (!isFuture) {
      status = entryMap[dateStr] === true ? "complete" : "incomplete";
    }

    const cell = document.createElement("div");
    // Build class list based on status and whether it's today or selected
    const isSelected = dateStr === selectedDate;
    cell.className = `cal-day cal-${status}${isToday ? " cal-today" : ""}${isSelected ? " cal-selected" : ""}`;
    cell.textContent = day;

    // Only past days and today are clickable — future days do nothing
    if (!isFuture) {
      cell.style.cursor = "pointer";
      cell.addEventListener("click", function () {
        selectDay(dateStr);
      });
    }

    container.appendChild(cell);
  }
}


// =====================
// SELECT A DAY ON THE CALENDAR
// =====================

// Called when the user clicks a calendar day
function selectDay(dateStr) {
  selectedDate = dateStr;

  // Show the log controls and hide the prompt
  document.getElementById("log-controls").classList.remove("hidden");
  document.getElementById("log-prompt").classList.add("hidden");

  // Update the label above the buttons to show which date is selected
  document.getElementById("selected-date-label").textContent = formatDate(dateStr);

  // Clear any previous feedback message

  // Re-render the calendar so the selected day gets its highlight ring
  renderMonthLog(activeKidId);
}


// =====================
// PROGRESS CALCULATIONS
// =====================

// Returns completion stats for the current month
// Returns the kid's current progress toward their goal.
// Result shape varies by goal type but always includes: percent (0-100), label, detail, achieved.
function getGoalProgress(kidId) {
  const type = goalConfig.type;
  const target = goalConfig.target || 80;
  const timeRange = goalConfig.timeRange || "month";
  const now = new Date();
  const today = todayString();

  // Helper: get entries for this kid in a date range
  function entriesInRange(startDate, endDate) {
    return log.filter(function (e) {
      return e.kidId === kidId && e.date >= startDate && e.date <= endDate;
    });
  }

  function completedInRange(startDate, endDate) {
    return entriesInRange(startDate, endDate).filter(function (e) { return e.completed; }).length;
  }

  if (type === "percentage" || type === "perfect-bonus") {
    let startDate, totalDays, elapsed;
    if (timeRange === "week") {
      const dayOfWeek = now.getDay(); // 0=Sun
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      startDate = weekStart.toISOString().split("T")[0];
      totalDays = 7;
      elapsed = Math.min(dayOfWeek + 1, 7);
    } else {
      startDate = now.toISOString().slice(0, 7) + "-01";
      totalDays = getDaysInMonth(now.getFullYear(), now.getMonth());
      elapsed = now.getDate();
    }
    const completed = completedInRange(startDate, today);
    const percent = elapsed > 0 ? Math.round((completed / elapsed) * 100) : 0;
    const overallPercent = Math.round((completed / totalDays) * 100);
    const achieved = percent >= target;
    const bonusAchieved = type === "perfect-bonus" && percent === 100;
    const period = timeRange === "week" ? "this week" : "this month";
    return {
      percent,
      barPercent: percent,
      completed,
      elapsed,
      totalDays,
      achieved,
      bonusAchieved,
      label: `${percent}% completion ${period}`,
      detail: `${completed} of ${elapsed} days so far`,
      targetLabel: `Goal: ${target}%`,
      reward: bonusAchieved ? (goalConfig.bonusReward || goalConfig.reward) : goalConfig.reward,
      overallPercent,
    };
  }

  if (type === "streak") {
    // Count current consecutive completed days ending today or yesterday
    let streak = 0;
    const check = new Date(now);
    while (true) {
      const dateStr = check.toISOString().split("T")[0];
      const entry = log.find(function (e) { return e.kidId === kidId && e.date === dateStr; });
      if (entry && entry.completed) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    // Also find best streak ever
    const kidEntries = log
      .filter(function (e) { return e.kidId === kidId; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    let best = 0, current = 0;
    kidEntries.forEach(function (e) {
      if (e.completed) { current++; best = Math.max(best, current); }
      else { current = 0; }
    });
    const percent = Math.min(Math.round((streak / target) * 100), 100);
    return {
      percent,
      barPercent: percent,
      completed: streak,
      achieved: streak >= target,
      label: `${streak} day streak`,
      detail: `Best ever: ${best} days`,
      targetLabel: `Goal: ${target} consecutive days`,
      reward: goalConfig.reward,
    };
  }

  if (type === "weekly") {
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    const startDate = weekStart.toISOString().split("T")[0];
    const completed = completedInRange(startDate, today);
    const percent = Math.min(Math.round((completed / target) * 100), 100);
    return {
      percent,
      barPercent: percent,
      completed,
      achieved: completed >= target,
      label: `${completed} of ${target} days this week`,
      detail: `Week resets every Sunday`,
      targetLabel: `Goal: ${target} days/week`,
      reward: goalConfig.reward,
    };
  }

  if (type === "total-count") {
    const completed = log.filter(function (e) { return e.kidId === kidId && e.completed; }).length;
    const percent = Math.min(Math.round((completed / target) * 100), 100);
    return {
      percent,
      barPercent: percent,
      completed,
      achieved: completed >= target,
      label: `${completed} of ${target} total completions`,
      detail: completed >= target ? "Goal reached!" : `${target - completed} to go`,
      targetLabel: `Goal: ${target} completions`,
      reward: goalConfig.reward,
    };
  }

  // Fallback
  return { percent: 0, barPercent: 0, completed: 0, achieved: false, label: "", detail: "", targetLabel: "", reward: "" };
}


// =====================
// PARENT DASHBOARD
// =====================

function renderDashboard() {
  const activeKids = KIDS.filter(function (k) { return !k.archived; });

  let totalPercent = 0;
  let goalsAchieved = 0;
  activeKids.forEach(function (kid) {
    const progress = getGoalProgress(kid.id);
    totalPercent += progress.percent;
    if (progress.achieved) goalsAchieved++;
  });

  const groupRate = activeKids.length > 0 ? Math.round(totalPercent / activeKids.length) : 0;

  document.getElementById("dashboard-widgets").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${groupRate}%</div>
      <div class="stat-label">Group Progress</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${goalsAchieved} / ${activeKids.length}</div>
      <div class="stat-label">Goals Achieved</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${goalConfig.reward || "—"}</div>
      <div class="stat-label">Current Reward</div>
    </div>
  `;

  const sortedKids = activeKids.slice().sort(function (a, b) {
    if (!a.dob) return 1;
    if (!b.dob) return -1;
    return a.dob < b.dob ? -1 : 1;
  });

  let rows = "";
  sortedKids.forEach(function (kid) {
    const progress = getGoalProgress(kid.id);
    const age = kid.dob ? calculateAge(kid.dob) : null;
    const ageStr = age !== null ? ` (${age})` : "";
    const reward = kid.reward || goalConfig.reward || "—";
    const achievedStr = progress.achieved ? "✓" : "";

    rows += `
      <tr>
        <td><strong>${kid.name}</strong>${ageStr}</td>
        <td>${progress.label}</td>
        <td>${progress.barPercent}%</td>
        <td>${reward}</td>
        <td>${achievedStr}</td>
      </tr>
    `;
  });

  document.getElementById("dashboard-table").innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Progress</th>
          <th>%</th>
          <th>Reward</th>
          <th>Achieved</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function openDashboard() {
  window.scrollTo(0, 0);
  location.hash = "dashboard";
  showView("dashboard-view");
  renderDashboard();
}


// =====================
// RENDER PROGRESS SECTION
// =====================

function renderKidProgress(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const progress = getGoalProgress(kidId);
  const reward = kid.reward || goalConfig.reward || "";

  const achievedHtml = progress.achieved
    ? `<p class="goal-achieved">🎉 Goal reached! ${reward ? "Reward: <strong>" + reward + "</strong>" : ""}</p>`
    : reward ? `<p class="goal-reward-hint">Reward: <strong>${reward}</strong></p>` : "";

  const bonusHtml = progress.bonusAchieved && goalConfig.bonusReward
    ? `<p class="goal-achieved">⭐ Bonus unlocked: <strong>${goalConfig.bonusReward}</strong></p>`
    : "";

  document.getElementById("progress-details").innerHTML = `
    <div class="progress-block">
      <p class="goal-target-label">${progress.targetLabel}</p>
      <p><strong>${progress.label}</strong></p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: ${progress.barPercent}%"></div>
      </div>
      <p class="goal-detail">${progress.detail}</p>
      ${achievedHtml}
      ${bonusHtml}
    </div>
  `;
}


// =====================
// SETTINGS
// =====================

// Tracks which kid is being edited (null means we're adding a new one)
let editingKidId = null;

function openSettings() {
  window.scrollTo(0, 0);
  location.hash = "settings";
  showView("settings-view");
  renderSettingsList();
  renderGoalSettings(false);
}

function closeSettings() {
  openDashboard();
}

// Renders the list of current kids in the settings page
function renderSettingsList() {
  const list = document.getElementById("settings-kids-list");
  if (KIDS.length === 0) {
    list.innerHTML = "<p>No kids added yet.</p>";
    return;
  }

  const activeKids = KIDS.filter(function (k) { return !k.archived; }).sort(function (a, b) { return a.dob < b.dob ? -1 : 1; });
  const archivedKids = KIDS.filter(function (k) { return k.archived; }).sort(function (a, b) { return a.dob < b.dob ? -1 : 1; });

  let html = activeKids.map(function (kid) {
    const age = calculateAge(kid.dob);
    const hasHistory = log.some(function (e) { return e.kidId === kid.id; });
    const actionBtn = hasHistory
      ? `<button class="btn-archive" data-id="${kid.id}">Archive</button>`
      : `<button class="btn-remove" data-id="${kid.id}">Delete</button>`;
    return `
      <div class="settings-kid-row">
        <div class="settings-kid-info">
          <strong>${kid.name}</strong>
          <span>Age ${age} &bull; ${kid.chores.join(", ")}</span>
        </div>
        <div class="settings-kid-actions">
          <button class="btn-edit" data-id="${kid.id}">Edit</button>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join("");

  if (archivedKids.length > 0) {
    html += `<p class="archived-section-label">Archived</p>`;
    html += archivedKids.map(function (kid) {
      const age = calculateAge(kid.dob);
      return `
        <div class="settings-kid-row archived">
          <div class="settings-kid-info">
            <strong>${kid.name}</strong>
            <span>Age ${age} &bull; ${kid.chores.join(", ")}</span>
          </div>
          <div class="settings-kid-actions">
            <button class="btn-unarchive" data-id="${kid.id}">Unarchive</button>
          </div>
        </div>
      `;
    }).join("");
  }

  list.innerHTML = html;

  list.querySelectorAll(".btn-edit").forEach(function (btn) {
    btn.addEventListener("click", function () { openKidForm(btn.dataset.id); });
  });
  list.querySelectorAll(".btn-remove").forEach(function (btn) {
    btn.addEventListener("click", function () { removeKid(btn.dataset.id); });
  });
  list.querySelectorAll(".btn-archive").forEach(function (btn) {
    btn.addEventListener("click", function () { archiveKid(btn.dataset.id); });
  });
  list.querySelectorAll(".btn-unarchive").forEach(function (btn) {
    btn.addEventListener("click", function () { unarchiveKid(btn.dataset.id); });
  });
}

// Opens the add/edit form, pre-filling values if editing an existing kid
function openKidForm(kidId) {
  if (kidId) {
    openInlineEditForm(kidId);
  } else {
    editingKidId = null;
    document.getElementById("kid-form-section").classList.remove("hidden");
    document.getElementById("kid-form-title").textContent = "Add Kid";
    document.getElementById("form-name").value = "";
    document.getElementById("form-dob").value = "";
    document.getElementById("form-chore").value = "";
    document.getElementById("form-pin").value = "";
    document.getElementById("form-reward").value = "";
    document.getElementById("form-photo").value = "";
    addFormPhotoFile = null;
    const preview = document.getElementById("form-photo-preview");
    if (preview) { preview.outerHTML = `<div id="form-photo-preview" class="photo-edit-preview photo-edit-placeholder">?</div>`; }
    document.getElementById("save-kid-btn").disabled = true;
  }
}

function openInlineEditForm(kidId) {
  // Close any already-open inline form
  const existing = document.querySelector(".kid-inline-form");
  if (existing) existing.remove();

  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const editBtn = document.querySelector(`.btn-edit[data-id="${kidId}"]`);
  const row = editBtn.closest(".settings-kid-row");

  const currentPhotoHtml = kid.photo
    ? `<img class="photo-edit-preview" src="${kid.photo}" alt="${kid.name}" />`
    : `<div class="photo-edit-preview photo-edit-placeholder">${kid.name[0]}</div>`;

  const formEl = document.createElement("div");
  formEl.className = "kid-inline-form";
  formEl.innerHTML = `
    <div class="form-field">
      <label>Photo</label>
      <div class="photo-edit-wrap">
        ${currentPhotoHtml}
        <label class="btn-photo-choose" for="inline-form-photo">Change Photo</label>
        <input type="file" id="inline-form-photo" accept="image/*" style="display:none" />
      </div>
    </div>
    <div class="form-field">
      <label>Name</label>
      <input type="text" id="inline-form-name" value="${kid.name}" />
    </div>
    <div class="form-field">
      <label>Date of Birth</label>
      <input type="date" id="inline-form-dob" value="${kid.dob}" />
    </div>
    <div class="form-field">
      <label>Chore</label>
      <input type="text" id="inline-form-chore" value="${kid.chores.join(", ")}" />
    </div>
    <div class="form-field">
      <label>Reward (optional)</label>
      <input type="text" id="inline-form-reward" value="${kid.reward || ""}" placeholder="e.g. $20, Movie night" />
    </div>
    <div class="form-field">
      <label>PIN (optional)</label>
      <div class="pin-field-wrap">
        <input type="password" id="inline-form-pin" value="${kid.pin || ""}" placeholder="4-digit PIN" maxlength="4" inputmode="numeric" />
        <button type="button" class="btn-pin-toggle" data-target="inline-form-pin">Show</button>
      </div>
    </div>
    <div class="inline-form-buttons">
      <button class="btn-inline-save">Save</button>
      <button class="btn-inline-cancel">Cancel</button>
    </div>
  `;

  row.insertAdjacentElement("afterend", formEl);
  document.getElementById("inline-form-name").focus();

  const saveBtn = formEl.querySelector(".btn-inline-save");
  saveBtn.disabled = true;
  let selectedPhotoFile = null;

  const origName = kid.name;
  const origDob = kid.dob;
  const origChore = kid.chores.join(", ");
  const origPin = kid.pin || "";
  const origReward = kid.reward || "";

  function checkInlineDirty() {
    const name = document.getElementById("inline-form-name").value.trim();
    const dob = document.getElementById("inline-form-dob").value;
    const chore = document.getElementById("inline-form-chore").value.trim();
    const pin = document.getElementById("inline-form-pin").value.trim();
    const reward = document.getElementById("inline-form-reward").value.trim();
    saveBtn.disabled = !selectedPhotoFile && (name === origName && dob === origDob && chore === origChore && pin === origPin && reward === origReward);
  }

  document.getElementById("inline-form-photo").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedPhotoFile = file;
    const preview = formEl.querySelector(".photo-edit-preview");
    preview.outerHTML = `<img class="photo-edit-preview" src="${URL.createObjectURL(file)}" alt="preview" />`;
    saveBtn.disabled = false;
  });

  document.getElementById("inline-form-name").addEventListener("input", checkInlineDirty);
  document.getElementById("inline-form-dob").addEventListener("change", checkInlineDirty);
  document.getElementById("inline-form-chore").addEventListener("input", checkInlineDirty);
  document.getElementById("inline-form-pin").addEventListener("input", checkInlineDirty);
  document.getElementById("inline-form-reward").addEventListener("input", checkInlineDirty);

  saveBtn.addEventListener("click", function () { saveInlineEdit(kidId, selectedPhotoFile); });
  formEl.querySelector(".btn-inline-cancel").addEventListener("click", cancelInlineEdit);
  formEl.querySelectorAll(".btn-pin-toggle").forEach(wirePinToggle);
}

function wirePinToggle(btn) {
  btn.addEventListener("click", function () {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "Show" : "Hide";
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("toast-visible");
  setTimeout(function () {
    toast.classList.remove("toast-visible");
  }, 2500);
}

function cancelInlineEdit() {
  const existing = document.querySelector(".kid-inline-form");
  if (existing) existing.remove();
}

async function saveInlineEdit(kidId, photoFile) {
  const name = document.getElementById("inline-form-name").value.trim();
  const dob = document.getElementById("inline-form-dob").value;
  const chore = document.getElementById("inline-form-chore").value.trim();

  if (!name || !chore) {
    alert("Please fill in name and task fields.");
    return;
  }

  const pin = document.getElementById("inline-form-pin").value.trim() || null;
  const reward = document.getElementById("inline-form-reward").value.trim() || null;
  const existingKid = KIDS.find(function (k) { return k.id === kidId; });

  let photo = existingKid.photo || null;
  if (photoFile) {
    showToast("Uploading photo…");
    try {
      photo = await uploadKidPhoto(kidId, photoFile);
    } catch (e) {
      console.error("Photo upload failed:", e);
      alert("Photo upload failed: " + (e.message || e.code || "unknown error") + "\n\nCheck that Firebase Storage is enabled and rules allow writes.");
      return;
    }
  }

  const kidData = Object.assign({}, existingKid, { name, dob, chores: [chore], pin, photo, reward });

  await setDoc(doc(db, "kids", kidId), kidData);

  const idx = KIDS.findIndex(function (k) { return k.id === kidId; });
  KIDS[idx] = kidData;

  renderSettingsList();
  showToast("Changes saved.");
}

function closeKidForm() {
  editingKidId = null;
  document.getElementById("kid-form-section").classList.add("hidden");
}

// =====================
// GOAL & REWARD SETTINGS
// =====================

const GOAL_TYPE_LABELS = {
  "percentage":    "Percentage of days",
  "streak":        "Consecutive days (streak)",
  "weekly":        "Days per week",
  "total-count":   "Total completions",
  "perfect-bonus": "Hit target + perfect bonus",
};

function renderGoalSettings(isDirty) {
  const container = document.getElementById("goal-settings-form");
  const type = goalConfig.type;

  container.innerHTML = `
    <div class="form-field">
      <label>Goal Type</label>
      <select id="goal-type-select">
        ${Object.entries(GOAL_TYPE_LABELS).map(function ([val, label]) {
          return `<option value="${val}" ${type === val ? "selected" : ""}>${label}</option>`;
        }).join("")}
      </select>
    </div>
    ${type !== "streak" ? `
    <div class="form-field" id="goal-time-range-field" ${type === "total-count" || type === "perfect-bonus" ? 'style="display:none"' : ""}>
      <label>Time Range</label>
      <select id="goal-time-range-select">
        <option value="week" ${goalConfig.timeRange === "week" ? "selected" : ""}>This week</option>
        <option value="month" ${goalConfig.timeRange === "month" ? "selected" : ""}>This month</option>
      </select>
    </div>` : ""}
    <div class="form-field">
      <label id="goal-target-label">${getTargetLabel(type)}</label>
      <input type="number" id="goal-target-input" value="${goalConfig.target}" min="1" />
    </div>
    <div class="form-field">
      <label>Reward</label>
      <input type="text" id="goal-reward-input" value="${goalConfig.reward || ""}" placeholder="e.g. Movie night, $20, Ice cream" />
    </div>
    ${type === "perfect-bonus" ? `
    <div class="form-field">
      <label>Bonus Reward (for 100%)</label>
      <input type="text" id="goal-bonus-reward-input" value="${goalConfig.bonusReward || ""}" placeholder="e.g. Extra screen time" />
    </div>` : ""}
  `;

  document.getElementById("goal-settings-buttons").style.display = isDirty ? "flex" : "none";

  container.querySelectorAll("input, select").forEach(function (el) {
    el.addEventListener("input", markGoalDirty);
    el.addEventListener("change", markGoalDirty);
  });

  document.getElementById("goal-type-select").addEventListener("change", function () {
    goalConfig.type = this.value;
    renderGoalSettings(true);
  });
}

function getTargetLabel(type) {
  if (type === "percentage" || type === "perfect-bonus") return "Target (% of days)";
  if (type === "streak") return "Target (consecutive days)";
  if (type === "weekly") return "Target (days per week)";
  if (type === "total-count") return "Target (total completions)";
  return "Target";
}

function markGoalDirty() {
  document.getElementById("goal-settings-buttons").style.display = "flex";
}

async function saveGoalSettings() {
  const type = document.getElementById("goal-type-select").value;
  const timeRangeEl = document.getElementById("goal-time-range-select");
  const timeRange = timeRangeEl ? timeRangeEl.value : goalConfig.timeRange;
  const target = parseInt(document.getElementById("goal-target-input").value);
  const reward = document.getElementById("goal-reward-input").value.trim();
  const bonusRewardEl = document.getElementById("goal-bonus-reward-input");
  const bonusReward = bonusRewardEl ? bonusRewardEl.value.trim() : "";

  if (isNaN(target) || target < 1) {
    alert("Please enter a valid target.");
    return;
  }

  goalConfig = { type, timeRange, target, reward, bonusTarget: 100, bonusReward };
  await setDoc(doc(db, "settings", "goal-config"), goalConfig);
  savedGoalConfig = Object.assign({}, goalConfig);
  renderGoalSettings(false);
  showToast("Goal settings saved.");
}

async function saveKid() {
  const name = document.getElementById("form-name").value.trim();
  const dob = document.getElementById("form-dob").value;
  const chore = document.getElementById("form-chore").value.trim();

  if (!name || !chore) {
    alert("Please fill in name and task fields.");
    return;
  }

  const pin = document.getElementById("form-pin").value.trim() || null;
  const reward = document.getElementById("form-reward").value.trim() || null;
  const id = editingKidId || String(Date.now());

  let photo = null;
  if (addFormPhotoFile) {
    showToast("Uploading photo…");
    photo = await uploadKidPhoto(id, addFormPhotoFile);
  }

  const kidData = { id, name, dob, chores: [chore], photo, pin, reward };

  await setDoc(doc(db, "kids", id), kidData);

  // Update local KIDS array
  const existingIndex = KIDS.findIndex(function (k) { return k.id === id; });
  if (existingIndex >= 0) {
    KIDS[existingIndex] = kidData;
  } else {
    KIDS.push(kidData);
  }

  closeKidForm();
  renderSettingsList();
}

async function removeKid(kidId) {
  const hasHistory = log.some(function (e) { return e.kidId === kidId; });
  if (hasHistory) {
    alert("This kid has logged history and cannot be deleted. Use Archive instead.");
    return;
  }
  if (!confirm("Permanently delete this kid? This cannot be undone.")) return;
  await deleteDoc(doc(db, "kids", kidId));
  KIDS = KIDS.filter(function (k) { return k.id !== kidId; });
  renderSettingsList();
}

async function archiveKid(kidId) {
  if (!confirm("Archive this kid? They will be hidden from the app but their history will be preserved.")) return;
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  kid.archived = true;
  await setDoc(doc(db, "kids", kidId), kid);
  renderSettingsList();
}

async function unarchiveKid(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  kid.archived = false;
  await setDoc(doc(db, "kids", kidId), kid);
  renderSettingsList();
}


// =====================
// BUTTON WIRING
// =====================

document.getElementById("back-btn").addEventListener("click", goHome);
document.getElementById("dashboard-back-btn").addEventListener("click", goHome);
document.getElementById("open-dashboard-btn").addEventListener("click", openDashboard);
document.getElementById("open-settings-btn").addEventListener("click", openSettings);
document.getElementById("settings-back-btn").addEventListener("click", closeSettings);
document.getElementById("add-kid-btn").addEventListener("click", function () { openKidForm(null); });
document.getElementById("save-kid-btn").addEventListener("click", saveKid);
document.querySelectorAll("#kid-form-section .btn-pin-toggle").forEach(wirePinToggle);

let addFormPhotoFile = null;
document.getElementById("form-photo").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  addFormPhotoFile = file;
  const preview = document.getElementById("form-photo-preview");
  preview.outerHTML = `<img id="form-photo-preview" class="photo-edit-preview" src="${URL.createObjectURL(file)}" alt="preview" />`;
  checkAddKidForm();
});

function checkAddKidForm() {
  const name = document.getElementById("form-name").value.trim();
  const chore = document.getElementById("form-chore").value.trim();
  document.getElementById("save-kid-btn").disabled = !(name && chore);
}
document.getElementById("form-name").addEventListener("input", checkAddKidForm);
document.getElementById("form-chore").addEventListener("input", checkAddKidForm);
document.getElementById("save-goal-btn").addEventListener("click", saveGoalSettings);
document.getElementById("cancel-goal-btn").addEventListener("click", function () {
  if (!confirm("You have unsaved changes. Are you sure you want to cancel?")) return;
  goalConfig = Object.assign({}, savedGoalConfig);
  renderGoalSettings(false);
});
document.getElementById("cancel-kid-btn").addEventListener("click", closeKidForm);
document.getElementById("site-logo").addEventListener("click", goHome);

document.getElementById("mark-complete").addEventListener("click", function () {
  if (!selectedDate) return;
  logEntry(activeKidId, selectedDate, true);
});

document.getElementById("mark-incomplete").addEventListener("click", function () {
  if (!selectedDate) return;
  logEntry(activeKidId, selectedDate, false);
});


// =====================
// FOOTER & FEEDBACK
// =====================

const FOOTER_TAGLINES = [
  "Powered by bad ideas and AI",
];

document.getElementById("footer-tagline").textContent =
  FOOTER_TAGLINES[Math.floor(Math.random() * FOOTER_TAGLINES.length)];

function openFeedbackModal() {
  document.getElementById("feedback-name").value = "";
  document.getElementById("feedback-message").value = "";
  document.getElementById("feedback-submit-btn").disabled = true;
  document.getElementById("feedback-modal").classList.remove("hidden");
  document.getElementById("feedback-message").focus();
}

function closeFeedbackModal() {
  document.getElementById("feedback-modal").classList.add("hidden");
}

emailjs.init("aJF-FlyUjv0n3P_FT");

async function submitFeedback() {
  const name = document.getElementById("feedback-name").value.trim();
  const message = document.getElementById("feedback-message").value.trim();
  if (!message) return;

  document.getElementById("feedback-submit-btn").disabled = true;

  try {
    // Save to Firestore
    await setDoc(doc(db, "feedback", String(Date.now())), {
      name: name || "Anonymous",
      body: message,
      timestamp: new Date().toISOString(),
    });

    // Send email via EmailJS
    await emailjs.send("service_s3we7hd", "template_d43d4fo", {
      name: name || "Anonymous",
      message,
      timestamp: new Date().toLocaleString(),
    });

    closeFeedbackModal();
    showToast("Feedback sent. Thanks!");
  } catch (e) {
    console.error("Feedback submission failed:", e);
    alert("Something went wrong submitting your feedback. Please try again.");
    document.getElementById("feedback-submit-btn").disabled = false;
  }
}

document.getElementById("feedback-btn").addEventListener("click", openFeedbackModal);
document.getElementById("feedback-cancel-btn").addEventListener("click", closeFeedbackModal);
document.getElementById("feedback-modal-backdrop").addEventListener("click", closeFeedbackModal);
document.getElementById("feedback-submit-btn").addEventListener("click", submitFeedback);
document.getElementById("feedback-message").addEventListener("input", function () {
  document.getElementById("feedback-submit-btn").disabled = !this.value.trim();
});

// =====================
// INITIALIZE
// =====================

// Load all chore log entries from Firestore, then render the home screen.
// async/await is used here because fetching from Firestore takes a moment —
// we need to wait for the data to arrive before we can display anything.
async function init() {
  try {
    // Sign in anonymously so Firestore/Storage rules can require request.auth != null
    await signInAnonymously(auth);

    // Load kids from Firestore
    const kidsSnapshot = await getDocs(collection(db, "kids"));

    if (kidsSnapshot.empty) {
      // First run — seed Firestore with the default kids
      for (const kid of DEFAULT_KIDS) {
        await setDoc(doc(db, "kids", kid.id), kid);
      }
      KIDS = DEFAULT_KIDS.slice();
    } else {
      KIDS = kidsSnapshot.docs.map(function (d) { return d.data(); });
    }

    // Load goal config — seed defaults if not yet saved
    const settingsSnapshot = await getDocs(collection(db, "settings"));
    const goalConfigData = settingsSnapshot.docs.find(function (d) { return d.id === "goal-config"; });
    if (goalConfigData) {
      goalConfig = Object.assign({}, DEFAULT_GOAL_CONFIG, goalConfigData.data());
    } else {
      await setDoc(doc(db, "settings", "goal-config"), DEFAULT_GOAL_CONFIG);
    }
    savedGoalConfig = Object.assign({}, goalConfig);

    // Load chore log
    const logSnapshot = await getDocs(collection(db, "chore-log"));
    log = logSnapshot.docs.map(function (d) { return d.data(); });
  } catch (e) {
    console.error("Firestore load failed:", e);
  }
  document.getElementById("loading-view").classList.add("hidden");
  navigateTo(location.hash);
}

function navigateTo(hash) {
  if (hash.startsWith("#kid-")) {
    const kidId = hash.slice(5);
    const kid = KIDS.find(function (k) { return k.id === kidId; });
    if (kid) {
      openKid(kidId);
      return;
    }
  }
  if (hash === "#dashboard") {
    showView("dashboard-view");
    renderDashboard();
    return;
  }
  if (hash === "#settings") {
    showView("settings-view");
    renderSettingsList();
    renderGoalSettings(false);
    return;
  }
  // Default: home
  showView("home-view");
  renderHome();
}

window.addEventListener("hashchange", function () {
  navigateTo(location.hash);
});

init();
