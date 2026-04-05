// =====================
// FIREBASE
// =====================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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


// =====================
// CONFIGURATION
// =====================

// Monthly allowance amounts by age range — loaded from Firestore, seeded on first run
const DEFAULT_TIERS = [
  { maxAge: 5,        amount: 5  },
  { maxAge: 8,        amount: 10 },
  { maxAge: 12,       amount: 20 },
  { maxAge: Infinity, amount: 40 },
];

let ALLOWANCE_TIERS = DEFAULT_TIERS.slice();
let savedPayScaleTiers = DEFAULT_TIERS.slice();

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

// Returns the max monthly allowance for a kid based on their current age tier
function getMaxAllowance(kid) {
  const age = calculateAge(kid.dob);
  // Walk through the tiers and return the amount for the first tier the age fits into
  const tier = ALLOWANCE_TIERS.find(function (t) { return age <= t.maxAge; });
  return tier.amount;
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
  sortedKids.forEach(function (kid) {
    const age = calculateAge(kid.dob);
    const maxAllowance = getMaxAllowance(kid);
    const { percent } = getThisMonthProgress(kid.id);

    const projectedEarned = ((percent / 100) * maxAllowance).toFixed(2);

    // Build the photo element: real image if photo path is set, initials otherwise.
    // The initials are the first letter of the first and last word of the name.
    const nameParts = kid.name.trim().split(" ");
    const initials = nameParts.length > 1
      ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
      : nameParts[0][0];
    const photoHtml = kid.photo
      ? `<img class="kid-photo" src="${kid.photo}" alt="${kid.name}" />`
      : `<div class="kid-photo kid-photo-placeholder">${initials}</div>`;

    // The full chore string — used in the title attribute so hovering shows the full text
    const choreText = kid.chores.join(", ");

    // Create a <div> element for this kid's card
    const card = document.createElement("div");
    card.className = "kid-card";

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-name-age">
          <h2>${kid.name}</h2>
          <p class="kid-age">Age ${age}</p>
        </div>
        ${photoHtml}
      </div>
      <p class="kid-chore" title="${choreText}">${choreText}</p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: ${percent}%"></div>
      </div>
      <div class="card-bottom-row">
        <span class="kid-on-track">Earnings: $${projectedEarned} of $${maxAllowance}.00</span>
      </div>
    `;

    // Clicking a card opens that kid's detail view
    card.addEventListener("click", function () {
      openKid(kid.id);
    });

    grid.appendChild(card);
  });
}


// =====================
// KID DETAIL VIEW
// =====================

// Opens the detail page for a specific kid
async function openKid(kidId) {
  window.scrollTo(0, 0);
  activeKidId = kidId;
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const age = calculateAge(kid.dob);
  const maxAllowance = getMaxAllowance(kid);

  // Hide all other views, show the kid view
  document.getElementById("home-view").classList.add("hidden");
  document.getElementById("loading-view").classList.add("hidden");
  document.getElementById("kid-view").classList.remove("hidden");

  // Build photo element — same logic as the home card
  const photoHtml = kid.photo
    ? `<img class="detail-photo" src="${kid.photo}" alt="${kid.name}" />`
    : `<div class="detail-photo detail-photo-placeholder">${kid.name[0]}</div>`;

  // Fill in the kid's header info
  document.getElementById("kid-header").innerHTML = `
    <div class="detail-header-row">
      <div class="detail-header-text">
        <h2>${kid.name}</h2>
        <p>Age ${age} &bull; Max allowance: $${maxAllowance.toFixed(2)}/mo</p>
        <p class="kid-chore-label">Assigned: <strong>${kid.chores.join(", ")}</strong></p>
      </div>
      ${photoHtml}
    </div>
  `;

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
function goHome() {
  window.scrollTo(0, 0);
  activeKidId = null;
  document.getElementById("kid-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("settings-view").classList.add("hidden");
  document.getElementById("loading-view").classList.add("hidden");
  document.getElementById("home-view").classList.remove("hidden");
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
  await setDoc(doc(db, "chore-log", entryKey), { kidId, date, completed });

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
function getThisMonthProgress(kidId) {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  // How many days have passed so far this month (including today)
  const daysSoFar = now.getDate();

  // Count how many of those days were marked completed
  const completed = log.filter(function (e) {
    return e.kidId === kidId && e.date.startsWith(currentMonth) && e.completed;
  }).length;

  // Percentage of days completed out of days elapsed
  const percent = daysSoFar > 0
    ? Math.round((completed / daysSoFar) * 100)
    : 0;

  return { completed, daysSoFar, percent };
}

// Returns the allowance earned for the previous month based on completion
function getPreviousMonthAllowance(kidId) {
  const now = new Date();

  // Figure out the previous month's year and month number
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;

  // Build the "YYYY-MM" prefix for the previous month
  const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;

  const totalDays = getDaysInMonth(prevYear, prevMonth);

  const completed = log.filter(function (e) {
    return e.kidId === kidId && e.date.startsWith(prevMonthStr) && e.completed;
  }).length;

  const percent = totalDays > 0 ? Math.round((completed / totalDays) * 100) : 0;

  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const earned = ((percent / 100) * getMaxAllowance(kid)).toFixed(2);

  return { percent, earned, totalDays, completed };
}


// =====================
// PARENT DASHBOARD
// =====================

// Calculates total earnings across all logged months for a kid
function getLifetimeEarnings(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });

  // Collect all unique "YYYY-MM" months that exist in the log for this kid
  const months = [];
  log.forEach(function (e) {
    if (e.kidId === kidId && months.indexOf(e.date.slice(0, 7)) === -1) {
      months.push(e.date.slice(0, 7));
    }
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  let total = 0;

  months.forEach(function (monthStr) {
    const parts = monthStr.split("-");
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed for getDaysInMonth
    const totalDays = getDaysInMonth(year, month);
    // For the current month use days elapsed; for past months use all days
    const daysToCount = monthStr === currentMonth ? new Date().getDate() : totalDays;
    const completed = log.filter(function (e) {
      return e.kidId === kidId && e.date.startsWith(monthStr) && e.completed;
    }).length;
    const percent = daysToCount > 0 ? completed / daysToCount : 0;
    total += percent * getMaxAllowance(kid);
  });

  return total.toFixed(2);
}

function renderDashboard() {
  // Aggregate group stats across all kids
  let totalProjected = 0;
  let totalLastMonth = 0;
  let totalCompletionPercent = 0;

  const activeKids = KIDS.filter(function (k) { return !k.archived; });

  activeKids.forEach(function (kid) {
    const { percent } = getThisMonthProgress(kid.id);
    const maxAllowance = getMaxAllowance(kid);
    totalProjected += (percent / 100) * maxAllowance;
    totalCompletionPercent += percent;
    const prev = getPreviousMonthAllowance(kid.id);
    totalLastMonth += parseFloat(prev.earned);
  });

  const groupRate = activeKids.length > 0 ? Math.round(totalCompletionPercent / activeKids.length) : 0;

  document.getElementById("dashboard-widgets").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${groupRate}%</div>
      <div class="stat-label">Group Completion This Month</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">$${totalProjected.toFixed(2)}</div>
      <div class="stat-label">Projected Payout This Month</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">$${totalLastMonth.toFixed(2)}</div>
      <div class="stat-label">Total Paid Last Month</div>
    </div>
  `;

  // Per-kid earnings table
  let rows = "";
  const sortedKids = activeKids.slice().sort(function (a, b) { return a.dob < b.dob ? -1 : 1; });
  sortedKids.forEach(function (kid) {
    const { percent } = getThisMonthProgress(kid.id);
    const maxAllowance = getMaxAllowance(kid);
    const projected = ((percent / 100) * maxAllowance).toFixed(2);
    const prev = getPreviousMonthAllowance(kid.id);
    const lifetime = getLifetimeEarnings(kid.id);

    rows += `
      <tr>
        <td><strong>${kid.name}</strong> (${calculateAge(kid.dob)})</td>
        <td>${percent}%</td>
        <td>$${projected}</td>
        <td>$${prev.earned}</td>
        <td>$${lifetime}</td>
      </tr>
    `;
  });

  document.getElementById("dashboard-table").innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Kid</th>
          <th>This Month</th>
          <th>Projected</th>
          <th>Last Month</th>
          <th>Lifetime</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function openDashboard() {
  window.scrollTo(0, 0);
  document.getElementById("home-view").classList.add("hidden");
  document.getElementById("loading-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");
  renderDashboard();
}


// =====================
// RENDER PROGRESS SECTION
// =====================

function renderKidProgress(kidId) {
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const { completed, daysSoFar, percent } = getThisMonthProgress(kidId);
  const prev = getPreviousMonthAllowance(kidId);
  const maxAllowance = getMaxAllowance(kid);
  const projectedEarned = ((percent / 100) * maxAllowance).toFixed(2);

  document.getElementById("progress-details").innerHTML = `
    <div class="progress-block">
      <h3>This Month</h3>
      <p>Days completed: <strong>${completed}</strong> of ${daysSoFar} days so far</p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: ${percent}%"></div>
      </div>
      <p>Earnings: <strong>$${projectedEarned}</strong> of $${maxAllowance.toFixed(2)}</p>
    </div>
    <div class="progress-block">
      <h3>Last Month's Payout</h3>
      <p>Completion: <strong>${prev.percent}%</strong> (${prev.completed} of ${prev.totalDays} days)</p>
      <p>Allowance earned: <strong>$${prev.earned}</strong></p>
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
  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("settings-view").classList.remove("hidden");
  renderSettingsList();
  renderPayScale();
}

function closeSettings() {
  document.getElementById("settings-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");
  renderDashboard();
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
  }
}

function openInlineEditForm(kidId) {
  // Close any already-open inline form
  const existing = document.querySelector(".kid-inline-form");
  if (existing) existing.remove();

  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const editBtn = document.querySelector(`.btn-edit[data-id="${kidId}"]`);
  const row = editBtn.closest(".settings-kid-row");

  const formEl = document.createElement("div");
  formEl.className = "kid-inline-form";
  formEl.innerHTML = `
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
    <div class="inline-form-buttons">
      <button class="btn-inline-save">Save</button>
      <button class="btn-inline-cancel">Cancel</button>
    </div>
  `;

  row.insertAdjacentElement("afterend", formEl);
  document.getElementById("inline-form-name").focus();

  formEl.querySelector(".btn-inline-save").addEventListener("click", function () { saveInlineEdit(kidId); });
  formEl.querySelector(".btn-inline-cancel").addEventListener("click", cancelInlineEdit);
}

function cancelInlineEdit() {
  const existing = document.querySelector(".kid-inline-form");
  if (existing) existing.remove();
}

async function saveInlineEdit(kidId) {
  const name = document.getElementById("inline-form-name").value.trim();
  const dob = document.getElementById("inline-form-dob").value;
  const chore = document.getElementById("inline-form-chore").value.trim();

  if (!name || !dob || !chore) {
    alert("Please fill in all fields.");
    return;
  }

  const existingKid = KIDS.find(function (k) { return k.id === kidId; });
  const kidData = Object.assign({}, existingKid, { name, dob, chores: [chore] });

  await setDoc(doc(db, "kids", kidId), kidData);

  const idx = KIDS.findIndex(function (k) { return k.id === kidId; });
  KIDS[idx] = kidData;

  renderSettingsList();
}

function closeKidForm() {
  editingKidId = null;
  document.getElementById("kid-form-section").classList.add("hidden");
}

// Deep-clones a tiers array, preserving Infinity values
function cloneTiers(tiers) {
  return tiers.map(function (t) { return { maxAge: t.maxAge, amount: t.amount }; });
}

function sortTiers(tiers) {
  return tiers.slice().sort(function (a, b) {
    if (a.maxAge === Infinity) return 1;
    if (b.maxAge === Infinity) return -1;
    return a.maxAge - b.maxAge;
  });
}

// Renders the pay scale editor rows — one row per tier
function renderPayScale(isDirty) {
  ALLOWANCE_TIERS = sortTiers(ALLOWANCE_TIERS);

  const container = document.getElementById("pay-scale-list");
  container.innerHTML = `
    <div class="pay-scale-header">
      <span>Max Age</span>
      <span>Monthly Amount ($)</span>
      <span></span>
    </div>
  `;

  ALLOWANCE_TIERS.forEach(function (tier, index) {
    const row = document.createElement("div");
    row.className = "pay-scale-row";
    const isInfinity = tier.maxAge === Infinity;
    row.innerHTML = `
      <input type="number" class="tier-age" data-index="${index}"
        value="${isInfinity ? "" : tier.maxAge}"
        placeholder="Any age" min="1" max="99" />
      <input type="number" class="tier-amount" data-index="${index}"
        value="${tier.amount}" min="0" step="1" />
      <button class="btn-remove tier-remove" data-index="${index}">Remove</button>
    `;
    container.appendChild(row);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "btn-add-tier";
  addBtn.textContent = "+ Add Tier";
  addBtn.addEventListener("click", addPayScaleTier);
  container.appendChild(addBtn);

  container.querySelectorAll(".tier-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!confirm("Remove this tier from the pay scale?")) return;
      const i = parseInt(btn.dataset.index);
      ALLOWANCE_TIERS.splice(i, 1);
      renderPayScale(true);
    });
  });

  container.querySelectorAll(".tier-age, .tier-amount").forEach(function (input) {
    input.addEventListener("input", function () {
      document.getElementById("pay-scale-buttons").style.display = "flex";
    });
  });

  document.getElementById("pay-scale-buttons").style.display = isDirty ? "flex" : "none";
}

function addPayScaleTier() {
  ALLOWANCE_TIERS.push({ maxAge: Infinity, amount: 0 });
  renderPayScale(true);
}

async function savePayScale() {
  const ageInputs = document.querySelectorAll(".tier-age");
  const amountInputs = document.querySelectorAll(".tier-amount");

  const tiers = [];
  for (let i = 0; i < ageInputs.length; i++) {
    const maxAge = ageInputs[i].value === "" ? Infinity : parseInt(ageInputs[i].value);
    const amount = parseFloat(amountInputs[i].value);
    if (isNaN(amount)) {
      alert("Please fill in all amount fields.");
      return;
    }
    tiers.push({ maxAge, amount });
  }

  const sortedTiers = sortTiers(tiers);
  await setDoc(doc(db, "settings", "pay-scale"), { tiers: sortedTiers });
  ALLOWANCE_TIERS = sortedTiers;
  savedPayScaleTiers = cloneTiers(sortedTiers);
  renderPayScale(false);
}

async function saveKid() {
  const name = document.getElementById("form-name").value.trim();
  const dob = document.getElementById("form-dob").value;
  const chore = document.getElementById("form-chore").value.trim();

  if (!name || !dob || !chore) {
    alert("Please fill in all fields.");
    return;
  }

  // Use existing id when editing, generate a new one when adding
  const id = editingKidId || String(Date.now());
  const kidData = { id, name, dob, chores: [chore], photo: null };

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
document.getElementById("save-pay-scale-btn").addEventListener("click", savePayScale);
document.getElementById("cancel-pay-scale-btn").addEventListener("click", function () {
  if (!confirm("You have unsaved changes. Are you sure you want to cancel?")) return;
  ALLOWANCE_TIERS = cloneTiers(savedPayScaleTiers);
  renderPayScale(false);
});
document.getElementById("cancel-kid-btn").addEventListener("click", closeKidForm);
document.querySelector("header h1").addEventListener("click", goHome);

document.getElementById("mark-complete").addEventListener("click", function () {
  if (!selectedDate) return;
  logEntry(activeKidId, selectedDate, true);
});

document.getElementById("mark-incomplete").addEventListener("click", function () {
  if (!selectedDate) return;
  logEntry(activeKidId, selectedDate, false);
});


// =====================
// INITIALIZE
// =====================

// Load all chore log entries from Firestore, then render the home screen.
// async/await is used here because fetching from Firestore takes a moment —
// we need to wait for the data to arrive before we can display anything.
async function init() {
  try {
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

    // Load pay scale — seed defaults if not yet saved
    const payScaleDoc = await getDocs(collection(db, "settings"));
    const payScaleData = payScaleDoc.docs.find(function (d) { return d.id === "pay-scale"; });
    if (payScaleData) {
      ALLOWANCE_TIERS = payScaleData.data().tiers;
    } else {
      await setDoc(doc(db, "settings", "pay-scale"), { tiers: DEFAULT_TIERS });
    }
    savedPayScaleTiers = cloneTiers(ALLOWANCE_TIERS);

    // Load chore log
    const logSnapshot = await getDocs(collection(db, "chore-log"));
    log = logSnapshot.docs.map(function (d) { return d.data(); });
  } catch (e) {
    console.error("Firestore load failed:", e);
  }
  document.getElementById("loading-view").classList.add("hidden");
  document.getElementById("home-view").classList.remove("hidden");
  renderHome();
}

init();
