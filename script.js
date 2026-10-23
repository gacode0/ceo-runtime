// ============================================================
// CEO DAILY RUNTIME – schedule tracker (offline-first)
// ============================================================

// ---------- DEFAULT SCHEDULE (exact items as per spec) ----------
const DEFAULT_SCHEDULE = [
  { start: "05:00", end: "05:30", name: "Wake-Up & Mental Prep" },
  { start: "05:30", end: "06:30", name: "The Gym (Physical Discipline)" },
  { start: "06:30", end: "07:30", name: "Hygiene & Breakfast" },
  { start: "07:30", end: "09:00", name: "Deep Work / NOUN Studies" },
  { start: "09:00", end: "12:00", name: "Company (Execution & Team Management)" },
  { start: "12:00", end: "13:00", name: "Lunch & Mental Break" },
  { start: "13:00", end: "16:00", name: "Core Business (Sales, Growth, Strategy)" },
  { start: "16:00", end: "18:00", name: "Technical / Product Focus" },
  { start: "18:00", end: "19:00", name: "Admin & Inbox Zero" },
  { start: "19:00", end: "21:00", name: "Evening Routine & Dinner" },
  { start: "21:00", end: "22:00", name: "Wind Down & Reflection" },
  { start: "22:00", end: "23:59", name: "Lights Out (Sleep)" }
];

// ---------- DOM refs ----------
const currentDateEl = document.getElementById('currentDate');
const liveClockEl = document.getElementById('liveClock');
const currentTaskNameEl = document.getElementById('currentTaskName');
const currentTaskTimeEl = document.getElementById('currentTaskTime');
const rightNowPanel = document.querySelector('.right-now-panel');
const scheduleListEl = document.getElementById('scheduleList');
const taskCountEl = document.getElementById('taskCount');
const taskForm = document.getElementById('taskForm');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const taskNameInput = document.getElementById('taskName');
const formErrorEl = document.getElementById('formError');

// ---------- STATE ----------
let schedule = [];          // array of { start, end, name }
let updateInterval = null;

// ---------- STORAGE ----------
const STORAGE_KEY = 'ceo_daily_runtime_schedule';

function loadSchedule() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        schedule = parsed;
        return;
      }
    } catch (e) { /* ignore corrupt data */ }
  }
  // fallback: default schedule
  schedule = DEFAULT_SCHEDULE.map(task => ({ ...task }));
  saveSchedule(); // persist defaults immediately
}

function saveSchedule() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

// ---------- TIME HELPERS ----------
/**
 * Convert "HH:MM" to minutes since midnight.
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if current time (in minutes) falls within the task interval.
 * Handles end = "23:59" gracefully (treats 23:59 as end of day).
 * Also supports cross-midnight intervals if they exist (start > end),
 * but our default schedule doesn't have those. We'll handle it anyway.
 */
function isTaskActiveNow(task, nowMinutes) {
  const startMin = timeToMinutes(task.start);
  let endMin = timeToMinutes(task.end);

  // Edge case: end time is "23:59" → treat as 1439 (already correct)
  // But if start > end, it means the interval crosses midnight.
  if (startMin <= endMin) {
    // normal interval (e.g. 05:00–05:30)
    return nowMinutes >= startMin && nowMinutes < endMin;
  } else {
    // crosses midnight (e.g. 23:00–02:00) — not in our schedule but robust
    return nowMinutes >= startMin || nowMinutes < endMin;
  }
}

// ---------- RENDER SCHEDULE LIST ----------
function renderSchedule() {
  // sort chronologically by start time
  const sorted = [...schedule].sort((a, b) => {
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });

  // update count
  taskCountEl.textContent = `${sorted.length} block${sorted.length !== 1 ? 's' : ''}`;

  // build list HTML
  if (sorted.length === 0) {
    scheduleListEl.innerHTML = `<li style="color:#94a3b8; text-align:center; padding:1rem;">No blocks yet. Add one above.</li>`;
    return;
  }

  const nowMinutes = getCurrentMinutes();
  const fragment = document.createDocumentFragment();

  sorted.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = 'schedule-item';

    const isActive = isTaskActiveNow(task, nowMinutes);
    if (isActive) {
      li.classList.add('active-task');
    }

    // left side: time + name
    const leftDiv = document.createElement('div');
    leftDiv.className = 'item-left';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'item-time';
    timeSpan.textContent = `${task.start} – ${task.end}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = task.name;

    leftDiv.appendChild(timeSpan);
    leftDiv.appendChild(nameSpan);

    // right side: delete button
    const rightDiv = document.createElement('div');
    rightDiv.className = 'item-right';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '✕';
    deleteBtn.setAttribute('aria-label', `Delete ${task.name}`);
    deleteBtn.dataset.start = task.start;
    deleteBtn.dataset.end = task.end;
    deleteBtn.dataset.name = task.name;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.start, task.end, task.name);
    });

    rightDiv.appendChild(deleteBtn);

    li.appendChild(leftDiv);
    li.appendChild(rightDiv);
    fragment.appendChild(li);
  });

  scheduleListEl.innerHTML = '';
  scheduleListEl.appendChild(fragment);
}

// ---------- DELETE TASK ----------
function deleteTask(start, end, name) {
  // Remove the first matching task (start, end, name)
  const index = schedule.findIndex(
    t => t.start === start && t.end === end && t.name === name
  );
  if (index !== -1) {
    schedule.splice(index, 1);
    saveSchedule();
    renderSchedule();
    updateCurrentTaskPanel(); // refresh "right now" in case we deleted the active one
    clearError();
  }
}

// ---------- ADD TASK (form submit) ----------
function handleAddTask(e) {
  e.preventDefault();
  clearError();

  const start = startTimeInput.value.trim();
  const end = endTimeInput.value.trim();
  const name = taskNameInput.value.trim();

  // validation
  if (!start || !end || !name) {
    showError('All fields are required.');
    return;
  }

  if (name.length > 60) {
    showError('Task name must be 60 characters or less.');
    return;
  }

  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);

  if (startMin >= endMin) {
    showError('End time must be after start time.');
    return;
  }

  // (optional) prevent overlapping? not required, but we could check
  // spec only asks for end > start, so we proceed.

  // add task
  schedule.push({ start, end, name });
  saveSchedule();

  // re-render
  renderSchedule();
  updateCurrentTaskPanel();

  // reset form (keep current time as convenience)
  taskNameInput.value = '';
  // set start/end to sensible defaults (current time + 1h)
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMin = String(now.getMinutes()).padStart(2, '0');
  startTimeInput.value = `${currentHour}:${currentMin}`;
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const laterHour = String(later.getHours()).padStart(2, '0');
  const laterMin = String(later.getMinutes()).padStart(2, '0');
  endTimeInput.value = `${laterHour}:${laterMin}`;
}

// ---------- ERROR HELPERS ----------
function showError(msg) {
  formErrorEl.textContent = msg;
}
function clearError() {
  formErrorEl.textContent = '';
}

// ---------- CURRENT TIME (minutes) ----------
function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ---------- UPDATE "RIGHT NOW" PANEL ----------
function updateCurrentTaskPanel() {
  const nowMinutes = getCurrentMinutes();
  const sorted = [...schedule].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  let activeTask = null;
  for (const task of sorted) {
    if (isTaskActiveNow(task, nowMinutes)) {
      activeTask = task;
      break;
    }
  }

  if (activeTask) {
    currentTaskNameEl.textContent = activeTask.name;
    currentTaskTimeEl.textContent = `${activeTask.start} – ${activeTask.end}`;
    rightNowPanel.classList.add('active');
    // also update active class in list (re-render to be safe)
    // we re-render list but that might be expensive. Instead, we can update classes
    // but simpler: call renderSchedule() which also uses the same logic.
    // However renderSchedule() will also rebuild list, which is fine for 30s interval.
    // We'll do it to keep active highlight in sync.
    // (renderSchedule already calls isTaskActiveNow internally)
    // We'll call it from the main tick function.
  } else {
    // No active task (before first or after last)
    currentTaskNameEl.textContent = '—';
    currentTaskTimeEl.textContent = 'No active block';
    rightNowPanel.classList.remove('active');
  }
}

// ---------- UPDATE LIVE CLOCK & DATE ----------
function updateDateTime() {
  const now = new Date();

  // Date: "Monday, October 23, 2026"
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  currentDateEl.textContent = now.toLocaleDateString('en-US', options);

  // Time: HH:MM:SS (24h)
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  liveClockEl.textContent = `${hours}:${minutes}:${seconds}`;
}

// ---------- MAIN TICK (every 30s as required, but clock updates every second) ----------
function tick() {
  // update clock & date every second (better UX)
  updateDateTime();

  // The spec says "check the time and update the 'Right Now' panel automatically every 30 seconds"
  // We'll update the right-now panel and schedule highlights every 30 seconds.
  // But we can also update them every second for a seamless experience – but to follow spec,
  // we'll separate: clock every second, right-now + highlight every 30s.
  // However, if we update every 30s, the active highlight in the list will lag.
  // We'll re-render the schedule list every 30s to keep active highlight in sync.
  // We'll also update the right-now panel.
  // Actually, for better UX, we can update the right-now panel every 30s but the highlight
  // is part of the list. We'll call a function that updates both.
}

// Separate function for the 30s update
function updateRightNowAndHighlight() {
  updateCurrentTaskPanel();
  renderSchedule(); // re-renders and applies active class correctly
}

// ---------- INIT ----------
function init() {
  // load data
  loadSchedule();

  // initial renders
  updateDateTime();
  updateCurrentTaskPanel();
  renderSchedule();

  // set form defaults to current time + 1h
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMin = String(now.getMinutes()).padStart(2, '0');
  startTimeInput.value = `${currentHour}:${currentMin}`;
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const laterHour = String(later.getHours()).padStart(2, '0');
  const laterMin = String(later.getMinutes()).padStart(2, '0');
  endTimeInput.value = `${laterHour}:${laterMin}`;

  // event listeners
  taskForm.addEventListener('submit', handleAddTask);

  // tick every second for clock
  setInterval(() => {
    updateDateTime();
  }, 1000);

  // update right-now panel and active highlight every 30 seconds (spec)
  // but also do an immediate update after init.
  setInterval(() => {
    updateRightNowAndHighlight();
  }, 30000); // 30 seconds

  // Also update right-now panel when the minute changes? The 30s interval covers it.
  // But to be safe, we can also call updateRightNowAndHighlight() on each minute change,
  // but the 30s is fine.
}

// start the app
init();