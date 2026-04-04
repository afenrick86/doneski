// =====================
// CONFIGURATION — EDIT THIS SECTION
// =====================
// Update each child's name, date of birth (YYYY-MM-DD), and assigned chores.
// Age and max allowance are calculated automatically from the DOB.

// Monthly allowance amounts by age range
const ALLOWANCE_TIERS = [
  { maxAge: 5,  amount: 5  },
  { maxAge: 8,  amount: 10 },
  { maxAge: 12, amount: 20 },
  { maxAge: Infinity, amount: 40 },
];

// photo: set to a file path like "photos/ally.jpg" to show a real image.
// Leave as null to show an initials placeholder instead.
const KIDS = [
  { id: 1, name: "Ally",     dob: "2012-03-16", chores: ["Clean Living Room"],          photo: "photos/ally.jpeg" },
  { id: 2, name: "Olivia",   dob: "2012-12-11", chores: ["Clean Playroom"],             photo: "photos/olivia.jpeg" },
  { id: 3, name: "Piper",    dob: "2013-06-28", chores: ["Guest and Upstairs Bathroom"],photo: "photos/piper.jpeg" },
  { id: 4, name: "Marivel",  dob: "2014-11-13", chores: ["Clean Playroom"],             photo: "photos/marivel.jpeg" },
  { id: 5, name: "Caroline", dob: "2015-08-04", chores: ["Clean Playroom"],             photo: "photos/caroline.jpeg" },
  { id: 6, name: "Vivi",     dob: "2016-10-19", chores: ["Load/Unload Dishwasher"],     photo: "photos/vivi.jpeg" },
  { id: 7, name: "Wren",     dob: "2017-10-08", chores: ["Feed dogs"],                  photo: "photos/wren.jpeg" },
  { id: 8, name: "Emilio",   dob: "2021-11-12", chores: ["Pick up toys"],               photo: "photos/emilio.jpeg" },
];


// =====================
// DATA
// =====================

// Stores every logged day. Each entry is an object:
// { kidId: 1, date: "2026-04-03", completed: true }
//
// localStorage.getItem returns a JSON string if data exists, or null if not.
// JSON.parse converts that string back into a JavaScript array.
// The "|| []" means "if nothing is stored yet, start with an empty array."
let log = JSON.parse(localStorage.getItem("chore-log")) || [];

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

  KIDS.forEach(function (kid) {
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
        <span class="kid-on-track">On track to earn: $${projectedEarned} of $${maxAllowance}.00</span>
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
function openKid(kidId) {
  activeKidId = kidId;
  const kid = KIDS.find(function (k) { return k.id === kidId; });
  const age = calculateAge(kid.dob);
  const maxAllowance = getMaxAllowance(kid);

  // Hide the home view, show the kid view
  document.getElementById("home-view").classList.add("hidden");
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

  // Reset selected date and hide the log controls until a day is picked
  selectedDate = null;
  document.getElementById("log-controls").classList.add("hidden");
  document.getElementById("log-prompt").classList.remove("hidden");

  renderMonthLog(kidId);
  renderKidProgress(kidId);
}

// Returns to the home view
function goHome() {
  activeKidId = null;
  document.getElementById("kid-view").classList.add("hidden");
  document.getElementById("home-view").classList.remove("hidden");
  renderHome(); // re-render so progress bars on cards are up to date
}


// =====================
// LOG AN ENTRY
// =====================

function logEntry(kidId, date, completed) {
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

  // Save the updated log to localStorage so it survives page refreshes.
  // JSON.stringify converts the JavaScript array into a string for storage.
  localStorage.setItem("chore-log", JSON.stringify(log));

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
    let status = "unlogged"; // default: gray
    if (!isFuture && dateStr in entryMap) {
      status = entryMap[dateStr] ? "complete" : "incomplete";
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
  document.getElementById("selected-date-label").textContent =
    "Logging for: " + formatDate(dateStr);

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
      <p>Completion rate: <strong>${percent}%</strong></p>
      <p>On track to earn: <strong>$${projectedEarned}</strong> of $${maxAllowance.toFixed(2)}</p>
    </div>
    <div class="progress-block">
      <h3>Last Month's Payout</h3>
      <p>Completion: <strong>${prev.percent}%</strong> (${prev.completed} of ${prev.totalDays} days)</p>
      <p>Allowance earned: <strong>$${prev.earned}</strong></p>
    </div>
  `;
}


// =====================
// BUTTON WIRING
// =====================

document.getElementById("back-btn").addEventListener("click", goHome);

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

// Render the home screen when the page first loads
renderHome();
