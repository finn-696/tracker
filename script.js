/* ---------- Helpers ---------- */

// Lokales Datum (nicht UTC) — sonst landen Einträge nach Mitternacht auf dem Vortag
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const todayKey = () => dateKey();

function load(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Nutzereingaben dürfen kein HTML einschleusen
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/* Toast-Feedback */
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* Zwei-Klick-Löschen statt confirm() (Dialoge sind in der Vorschau blockiert) */
function armDelete(btn, label, onConfirm) {
  if (btn.dataset.armed === "1") {
    onConfirm();
    return;
  }
  btn.dataset.armed = "1";
  const original = btn.textContent;
  btn.textContent = label;
  btn.classList.add("armed");
  setTimeout(() => {
    btn.dataset.armed = "";
    btn.textContent = original;
    btn.classList.remove("armed");
  }, 2500);
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab + "Tab").classList.add("active");
  });
});

document.getElementById("today").textContent = new Date().toLocaleDateString("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/* ---------- Dashboard-Ringe ---------- */
function ringHTML(emoji, pct, label, color) {
  const C = 2 * Math.PI * 26;
  const clamped = Math.max(0, Math.min(100, pct));
  const off = C * (1 - clamped / 100);
  return `
    <div class="ring-card">
      <svg viewBox="0 0 64 64">
        <circle class="ring-bg" cx="32" cy="32" r="26"/>
        <circle class="ring-fill" cx="32" cy="32" r="26" stroke="${color}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        <text x="32" y="38" text-anchor="middle" class="ring-emoji">${emoji}</text>
      </svg>
      <span class="ring-label">${label}</span>
      <span class="ring-pct" style="color:${color}">${Math.round(pct)}%</span>
    </div>
  `;
}

function renderDashboard() {
  const today = todayKey();
  const habits = load(HABITS_KEY);
  const done = habits.filter((h) => h.history.includes(today)).length;
  const habitPct = habits.length ? (done / habits.length) * 100 : 0;

  const goals = loadNutritionGoals();
  const kcal = (loadFoodLog()[today] || []).reduce((s, f) => s + f.kcal, 0);
  const kcalPct = (kcal / goals.kcal) * 100;
  const water = loadWaterLog()[today] || 0;
  const waterPct = (water / goals.water) * 100;

  document.getElementById("dashboard").innerHTML =
    ringHTML("🌱", habitPct, `${done}/${habits.length}`, "#34d399") +
    ringHTML("🔥", kcalPct, `${kcal} kcal`, "#fbbf24") +
    ringHTML("💧", waterPct, `${water} ml`, "#38bdf8");
}

/* ====================================================== */
/* HABITS                                                  */
/* ====================================================== */
const HABITS_KEY = "habits";
const DAY_LETTERS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function calcStreak(habit) {
  let streak = 0;
  let date = new Date();

  if (!habit.history.includes(todayKey())) {
    date.setDate(date.getDate() - 1);
  }

  while (habit.history.includes(dateKey(date))) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

/* Letzte 7 Tage als klickbare Punkte (auch nachträglich abhakbar) */
function weekDotsHTML(habit) {
  let html = '<div class="week-dots">';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const filled = habit.history.includes(key);
    html += `
      <div class="wd${i === 0 ? " today" : ""}" data-date="${key}" title="${formatDate(key)}">
        <span class="wd-day">${DAY_LETTERS[d.getDay()]}</span>
        <span class="wd-dot${filled ? " filled" : ""}"></span>
      </div>
    `;
  }
  return html + "</div>";
}

function renderHabits() {
  const habits = load(HABITS_KEY);
  const list = document.getElementById("habitList");
  const today = todayKey();
  list.innerHTML = "";

  if (habits.length === 0) {
    list.innerHTML = '<li class="empty">Noch keine Gewohnheiten – füge eine hinzu!</li>';
  }

  habits.forEach((habit, index) => {
    const done = habit.history.includes(today);
    const streak = calcStreak(habit);

    const li = document.createElement("li");
    li.className = "habit" + (done ? " done" : "");

    li.innerHTML = `
      <div class="habit-top">
        <div class="habit-left">
          <div class="checkbox">${done ? "✓" : ""}</div>
          <span class="habit-name">${esc(habit.name)}</span>
        </div>
        <div class="habit-right">
          ${streak > 0 ? `<span class="streak">🔥 ${streak}</span>` : ""}
          <button class="delete-btn" title="Löschen">✕</button>
        </div>
      </div>
      ${weekDotsHTML(habit)}
    `;

    li.querySelector(".checkbox").addEventListener("click", () => toggleHabitDate(index, today));
    li.querySelector(".delete-btn").addEventListener("click", (e) => {
      armDelete(e.currentTarget, "Sicher?", () => deleteHabit(index));
    });
    li.querySelectorAll(".wd").forEach((wd) => {
      wd.addEventListener("click", () => toggleHabitDate(index, wd.dataset.date));
    });

    list.appendChild(li);
  });

  const doneCount = habits.filter((h) => h.history.includes(today)).length;
  document.getElementById("summary").textContent =
    habits.length === 0 ? "" : `${doneCount} von ${habits.length} heute erledigt`;

  renderDashboard();
}

function toggleHabitDate(index, date) {
  const habits = load(HABITS_KEY);
  const habit = habits[index];
  const pos = habit.history.indexOf(date);

  if (pos === -1) habit.history.push(date);
  else habit.history.splice(pos, 1);

  save(HABITS_KEY, habits);
  renderHabits();
}

function deleteHabit(index) {
  const habits = load(HABITS_KEY);
  const name = habits[index].name;
  habits.splice(index, 1);
  save(HABITS_KEY, habits);
  renderHabits();
  toast(`"${name}" gelöscht`);
}

document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("habitInput");
  const name = input.value.trim();
  if (!name) return;

  const habits = load(HABITS_KEY);
  habits.push({ name, history: [] });
  save(HABITS_KEY, habits);

  input.value = "";
  renderHabits();
});

/* ====================================================== */
/* FITNESS                                                 */
/* ====================================================== */
const EXERCISES_KEY = "exercises";
let activeExerciseId = null;

const UNIT_LABELS = { kg: "kg", kg_reps: "kg", reps: "Wdh.", min: "Min", km: "km", km_zeit: "min/km" };

/* Pace als "5:30" formatieren (aus 5.5 Dezimal-Minuten) */
function paceFormat(p) {
  let m = Math.floor(p);
  let s = Math.round((p - m) * 60);
  if (s === 60) { m++; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* Einen Wert mit Einheit anzeigen, z.B. "60 kg" oder "5:30 min/km" */
function valueLabel(ex, v) {
  if (ex.unit === "km_zeit") return `${paceFormat(v)} min/km`;
  return `${v} ${UNIT_LABELS[ex.unit]}`;
}

/* Bei Pace ist kleiner = besser, sonst entscheidet die Zielrichtung (Standard: größer = besser) */
function lowerIsBetter(ex) {
  if (ex.unit === "km_zeit") return true;
  if (ex.goalValue == null || ex.entries.length === 0) return false;
  const first = [...ex.entries].sort((a, b) => a.date.localeCompare(b.date))[0].value;
  return ex.goalValue < first;
}

/* "60 kg × 8" bzw. "5 km in 30 Min · 6:00 min/km" */
function entryLabel(ex, entry, long) {
  if (ex.unit === "kg_reps") {
    return `${entry.value} kg${entry.reps ? " × " + entry.reps : ""}`;
  }
  if (ex.unit === "km_zeit") {
    const pace = `${paceFormat(entry.value)} min/km`;
    if (long && entry.km) return `${entry.km} km in ${entry.min} Min · ${pace}`;
    return pace;
  }
  return `${entry.value} ${UNIT_LABELS[ex.unit]}`;
}

/* Veränderung zum Vortermin, z.B. "+2,5 kg" oder "−15 s/km" */
function deltaLabel(ex, delta) {
  if (ex.unit === "km_zeit") {
    const secs = Math.round(delta * 60);
    return (secs > 0 ? "+" : "−") + Math.abs(secs) + " s/km";
  }
  const d = Math.round(delta * 10) / 10;
  return (d > 0 ? "+" : "−") + Math.abs(d) + " " + UNIT_LABELS[ex.unit];
}

function buildSvgPoints(entries, width, height, padding, goalValue) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return { points: "", sorted };

  const values = sorted.map((e) => e.value);
  if (typeof goalValue === "number" && !isNaN(goalValue)) values.push(goalValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const points = sorted.map((e, i) => {
    const x = sorted.length === 1 ? padding : padding + (i / (sorted.length - 1)) * usableW;
    const y = padding + usableH - ((e.value - min) / range) * usableH;
    return `${x},${y}`;
  });

  let goalY = null;
  if (typeof goalValue === "number" && !isNaN(goalValue)) {
    goalY = padding + usableH - ((goalValue - min) / range) * usableH;
  }

  return { points: points.join(" "), sorted, min, max, goalY };
}

function calcGoalProgress(ex) {
  if (ex.goalValue == null || isNaN(ex.goalValue)) return null;

  const sorted = [...ex.entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;

  const start = sorted[0].value;
  const current = sorted[sorted.length - 1].value;
  const goal = ex.goalValue;

  let pct;
  if (goal === start) {
    pct = current >= goal ? 100 : 0;
  } else if (goal > start) {
    pct = ((current - start) / (goal - start)) * 100;
  } else {
    pct = ((start - current) / (start - goal)) * 100;
  }
  pct = Math.max(0, Math.min(100, pct));

  let daysLeft = null;
  if (ex.goalDate) {
    const diff = new Date(ex.goalDate) - new Date(todayKey());
    daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return { pct, current, goal, daysLeft, reached: pct >= 100 };
}

function daysLeftLabel(progress, withDate, ex) {
  if (progress.daysLeft == null) return "";
  const n = Math.abs(progress.daysLeft);
  const tage = n === 1 ? "Tag" : "Tage";
  if (progress.daysLeft > 0)
    return withDate ? `noch ${n} ${tage} bis ${formatDate(ex.goalDate)}` : `noch ${n} ${tage}`;
  if (progress.daysLeft === 0) return "heute fällig";
  return withDate ? `${n} ${tage} überfällig (${formatDate(ex.goalDate)})` : `${n} ${tage} überfällig`;
}

function renderSparkline(ex) {
  const { points, sorted } = buildSvgPoints(ex.entries, 100, 36, 4);
  if (sorted.length < 2) {
    return `<svg class="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none"></svg>`;
  }
  const gradId = `grad-${ex.id}`;
  return `
    <svg class="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#818cf8"/>
          <stop offset="100%" stop-color="#34d399"/>
        </linearGradient>
      </defs>
      <polyline points="${points}" fill="none" stroke="url(#${gradId})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderExercises() {
  const exercises = load(EXERCISES_KEY);
  const grid = document.getElementById("exerciseList");
  grid.innerHTML = "";

  if (exercises.length === 0) {
    grid.innerHTML = '<p class="empty">Noch keine Übung – füge eine hinzu!</p>';
    return;
  }

  exercises.forEach((ex) => {
    const sorted = [...ex.entries].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    const progress = calcGoalProgress(ex);

    let goalBarHtml = "";
    if (progress) {
      const days = daysLeftLabel(progress, false, ex);
      goalBarHtml = `
        <div class="goal-bar-wrap">
          <div class="goal-bar-labels">
            <span>${progress.reached ? "🎉 Ziel erreicht!" : `Ziel: ${valueLabel(ex, progress.goal)}`}</span>
            <span class="pct">${Math.round(progress.pct)}%${days ? " · " + days : ""}</span>
          </div>
          <div class="goal-bar">
            <div class="goal-bar-fill${progress.reached ? " complete" : ""}" style="width:${progress.pct}%"></div>
          </div>
        </div>
      `;
    }

    const card = document.createElement("div");
    card.className = "exercise-card";
    card.innerHTML = `
      <div class="exercise-card-top">
        <div class="exercise-name-group">
          <span class="exercise-icon">${ex.icon || "💪"}</span>
          <span class="exercise-name">${esc(ex.name)}</span>
        </div>
        <span class="exercise-latest">${latest ? entryLabel(ex, latest) : "–"}</span>
      </div>
      <div class="exercise-meta">${ex.entries.length} Einträge${latest ? " · zuletzt " + formatDate(latest.date) : ""}</div>
      ${renderSparkline(ex)}
      ${goalBarHtml}
    `;
    card.addEventListener("click", () => openModal(ex.id));
    grid.appendChild(card);
  });
}

document.getElementById("exerciseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("exerciseName");
  const goalValueInput = document.getElementById("exerciseGoalValue");
  const goalDateInput = document.getElementById("exerciseGoalDate");

  const name = nameInput.value.trim();
  if (!name) return;

  const goalValue = goalValueInput.value === "" ? null : parseFloat(goalValueInput.value);

  const exercises = load(EXERCISES_KEY);
  exercises.push({
    id: Date.now().toString(),
    name,
    icon: document.getElementById("exerciseIcon").value,
    unit: document.getElementById("exerciseUnit").value,
    goalValue,
    goalDate: goalDateInput.value || null,
    entries: [],
  });
  save(EXERCISES_KEY, exercises);

  nameInput.value = "";
  goalValueInput.value = "";
  goalDateInput.value = "";
  renderExercises();
  toast(`"${name}" angelegt`);
});

/* ---- Modal ---- */
const modal = document.getElementById("exerciseModal");

function openModal(id) {
  activeExerciseId = id;
  document.getElementById("logDate").value = todayKey();
  renderModal();
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  activeExerciseId = null;
}

document.getElementById("modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

function getActiveExercise() {
  return load(EXERCISES_KEY).find((ex) => ex.id === activeExerciseId);
}

function renderModal() {
  const ex = getActiveExercise();
  if (!ex) return closeModal();

  document.getElementById("modalTitle").textContent = `${ex.icon || "💪"} ${ex.name}`;

  // Eingabefelder je nach Einheit umschalten
  const isKgReps = ex.unit === "kg_reps";
  const isKmZeit = ex.unit === "km_zeit";
  const valueInput = document.getElementById("logValue");
  const repsInput = document.getElementById("logReps");
  const kmInput = document.getElementById("logKm");
  const minInput = document.getElementById("logMin");
  valueInput.classList.toggle("hide", isKmZeit);
  valueInput.required = !isKmZeit;
  repsInput.classList.toggle("hide", !isKgReps);
  repsInput.required = isKgReps;
  kmInput.classList.toggle("hide", !isKmZeit);
  kmInput.required = isKmZeit;
  minInput.classList.toggle("hide", !isKmZeit);
  minInput.required = isKmZeit;
  valueInput.placeholder = isKgReps ? "kg" : "Wert";
  document.getElementById("modalGoalValue").placeholder = isKmZeit ? "Ziel-Pace (5.5 = 5:30)" : "Zielwert";

  // Werte formatieren: bei Pace "5:30" statt 5.5
  const fmtVal = (v) => (isKmZeit ? paceFormat(v) : v);

  // Diagramm
  const chart = document.getElementById("modalChart");
  const { points, sorted, min, max, goalY } = buildSvgPoints(ex.entries, 300, 120, 14, ex.goalValue);
  chart.innerHTML = "";

  if (sorted.length >= 2) {
    let goalLineHtml = "";
    if (goalY != null) {
      goalLineHtml = `
        <line x1="14" y1="${goalY}" x2="286" y2="${goalY}" stroke="#f472b6" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="286" y="${goalY - 4 < 10 ? goalY + 12 : goalY - 4}" fill="#f472b6" font-size="9" text-anchor="end">Ziel: ${fmtVal(ex.goalValue)}</text>
      `;
    }
    const pts = points.split(" ");
    chart.innerHTML = `
      <text x="4" y="12" fill="#8b93c8" font-size="8" opacity="0.8">${fmtVal(max)}</text>
      <text x="4" y="116" fill="#8b93c8" font-size="8" opacity="0.8">${fmtVal(min)}</text>
      ${goalLineHtml}
      <polyline points="${points}" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${sorted.map((e, i) => {
        const [x, y] = pts[i].split(",");
        let pointText = "";
        if (ex.unit === "kg_reps" && e.reps) pointText = `×${e.reps}`;
        if (ex.unit === "km_zeit" && e.km) pointText = `${e.km}km`;
        let label = "";
        if (pointText) {
          const ly = parseFloat(y) - 7 < 10 ? parseFloat(y) + 14 : parseFloat(y) - 7;
          label = `<text x="${x}" y="${ly}" fill="#8b93c8" font-size="8" text-anchor="middle">${pointText}</text>`;
        }
        return `<circle cx="${x}" cy="${y}" r="3" fill="#818cf8"/>${label}`;
      }).join("")}
    `;
  } else {
    chart.innerHTML = `<text x="150" y="60" fill="#8b93c8" font-size="11" text-anchor="middle">Mind. 2 Einträge für eine Grafik nötig</text>`;
  }

  // Ziel-Fortschritt
  const progressBox = document.getElementById("goalProgress");
  const progress = calcGoalProgress(ex);
  if (progress) {
    const days = daysLeftLabel(progress, true, ex);
    progressBox.className = "goal-progress";
    progressBox.innerHTML = `
      <div class="goal-progress-top">
        <span>${progress.reached ? "🎉 Ziel erreicht!" : `Auf dem Weg zu ${valueLabel(ex, progress.goal)}`}</span>
        <span class="pct">${Math.round(progress.pct)}%</span>
      </div>
      <div class="goal-bar">
        <div class="goal-bar-fill${progress.reached ? " complete" : ""}" style="width:${progress.pct}%"></div>
      </div>
      ${days ? `<div class="goal-progress-sub">${days}</div>` : ""}
    `;
  } else {
    progressBox.className = "goal-progress empty";
    progressBox.textContent = "Noch kein Ziel gesetzt – trag unten eins ein, um deinen Fortschritt zu sehen.";
  }

  // Ziel-Felder vorbefüllen
  document.getElementById("modalUnit").value = ex.unit;
  document.getElementById("modalGoalValue").value = ex.goalValue ?? "";
  document.getElementById("modalGoalDate").value = ex.goalDate ?? "";

  // Statistiken
  const sortedByDate = [...ex.entries].sort((a, b) => a.date.localeCompare(b.date));
  const values = ex.entries.map((e) => e.value);
  const latest = sortedByDate.length ? sortedByDate[sortedByDate.length - 1].value : 0;
  const first = sortedByDate.length ? sortedByDate[0].value : 0;
  const lowerBetter = lowerIsBetter(ex);
  const best = values.length ? (lowerBetter ? Math.min(...values) : Math.max(...values)) : 0;
  const totalDiff = latest - first;
  const unit = UNIT_LABELS[ex.unit];

  document.getElementById("modalStats").innerHTML = `
    <div class="stat-box">
      <div class="stat-value">${values.length ? fmtVal(best) : "–"}</div>
      <div class="stat-label">Bestwert (${unit})</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${values.length ? fmtVal(latest) : "–"}</div>
      <div class="stat-label">Aktuell (${unit})</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${ex.entries.length > 1 ? deltaLabel(ex, totalDiff) : "–"}</div>
      <div class="stat-label">Seit Beginn</div>
    </div>
  `;

  // Journal: Verlauf mit Veränderung zum jeweils vorherigen Eintrag
  const history = document.getElementById("logHistory");
  history.innerHTML = "";
  sortedByDate
    .map((entry, i) => ({ entry, delta: i > 0 ? entry.value - sortedByDate[i - 1].value : null }))
    .reverse()
    .forEach(({ entry, delta }) => {
      let deltaHtml = "";
      if (delta !== null) {
        if (Math.abs(delta) < 0.001) {
          deltaHtml = `<span class="delta delta-neutral">＝</span>`;
        } else {
          const better = lowerBetter ? delta < 0 : delta > 0;
          deltaHtml = `<span class="delta ${better ? "delta-up" : "delta-down"}">${better ? "▲" : "▼"} ${deltaLabel(ex, delta)}</span>`;
        }
      }
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${formatDate(entry.date)} — <strong>${entryLabel(ex, entry, true)}</strong></span>
        <span style="display:flex; align-items:center; gap:8px;">
          ${deltaHtml}
          <button title="Löschen">✕</button>
        </span>
      `;
      li.querySelector("button").addEventListener("click", (e) => {
        armDelete(e.currentTarget, "Sicher?", () => deleteLog(entry.date));
      });
      history.appendChild(li);
    });
}

document.getElementById("logForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const date = document.getElementById("logDate").value;
  if (!date) return;

  const exercises = load(EXERCISES_KEY);
  const ex = exercises.find((x) => x.id === activeExerciseId);

  let entry;
  if (ex.unit === "km_zeit") {
    const km = parseFloat(document.getElementById("logKm").value);
    const min = parseFloat(document.getElementById("logMin").value);
    if (isNaN(km) || km <= 0 || isNaN(min) || min <= 0) {
      toast("Bitte Strecke (km) und Zeit (Min) angeben");
      return;
    }
    // Getrackt wird die Pace: Minuten pro Kilometer
    const pace = Math.round((min / km) * 100) / 100;
    entry = { date, value: pace, km, min };
  } else {
    const value = parseFloat(document.getElementById("logValue").value);
    if (isNaN(value)) return;
    entry = { date, value };
    if (ex.unit === "kg_reps") {
      const reps = parseInt(document.getElementById("logReps").value, 10);
      if (isNaN(reps) || reps < 1) {
        toast("Bitte Wiederholungen angeben");
        return;
      }
      entry.reps = reps;
    }
  }

  // Pro Tag ein Wert: vorhandenen Eintrag ersetzen
  const existing = ex.entries.findIndex((en) => en.date === date);
  if (existing !== -1) ex.entries[existing] = entry;
  else ex.entries.push(entry);

  save(EXERCISES_KEY, exercises);
  document.getElementById("logValue").value = "";
  document.getElementById("logReps").value = "";
  document.getElementById("logKm").value = "";
  document.getElementById("logMin").value = "";
  renderModal();
  renderExercises();
});

function deleteLog(date) {
  const exercises = load(EXERCISES_KEY);
  const ex = exercises.find((x) => x.id === activeExerciseId);
  ex.entries = ex.entries.filter((en) => en.date !== date);
  save(EXERCISES_KEY, exercises);
  renderModal();
  renderExercises();
}

document.getElementById("modalGoalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const goalValueInput = document.getElementById("modalGoalValue");

  const exercises = load(EXERCISES_KEY);
  const ex = exercises.find((x) => x.id === activeExerciseId);

  ex.unit = document.getElementById("modalUnit").value;
  ex.goalValue = goalValueInput.value === "" ? null : parseFloat(goalValueInput.value);
  ex.goalDate = document.getElementById("modalGoalDate").value || null;

  save(EXERCISES_KEY, exercises);
  renderModal();
  renderExercises();
  toast("Gespeichert ✓");
});

document.getElementById("deleteExercise").addEventListener("click", (e) => {
  armDelete(e.currentTarget, "Wirklich löschen? Nochmal klicken", () => {
    let exercises = load(EXERCISES_KEY);
    const ex = exercises.find((x) => x.id === activeExerciseId);
    exercises = exercises.filter((x) => x.id !== activeExerciseId);
    save(EXERCISES_KEY, exercises);
    closeModal();
    renderExercises();
    toast(`"${ex.name}" gelöscht`);
  });
});

/* ====================================================== */
/* ERNÄHRUNG                                               */
/* ====================================================== */
const NUTRITION_GOALS_KEY = "nutritionGoals";
const FOOD_LOG_KEY = "foodLog";
const WATER_LOG_KEY = "waterLog";

const FOOD_DB = [
  ["Apfel", 52], ["Banane", 89], ["Orange", 47], ["Birne", 57], ["Traube", 69],
  ["Erdbeere", 32], ["Himbeere", 52], ["Blaubeere", 57], ["Wassermelone", 30], ["Mango", 60],
  ["Ananas", 50], ["Pfirsich", 39], ["Avocado", 160],
  ["Tomate", 18], ["Gurke", 16], ["Karotte", 41], ["Brokkoli", 34], ["Spinat", 23],
  ["Paprika", 31], ["Zwiebel", 40], ["Kartoffel (gekocht)", 87], ["Süßkartoffel", 86], ["Salat", 15],
  ["Vollkornbrot", 247], ["Weißbrot", 265], ["Brötchen", 290], ["Reis (gekocht)", 130],
  ["Nudeln (gekocht)", 131], ["Haferflocken", 372], ["Müsli", 379], ["Cornflakes", 357], ["Quinoa (gekocht)", 120],
  ["Ei", 155], ["Milch", 64], ["Joghurt (Natur)", 59], ["Magerquark", 67], ["Käse (Gouda)", 356],
  ["Butter", 717], ["Frischkäse", 242],
  ["Hähnchenbrust", 165], ["Pute", 135], ["Rindfleisch", 250], ["Schweinefleisch", 242],
  ["Lachs", 208], ["Thunfisch (Dose)", 116], ["Garnelen", 99],
  ["Tofu", 76], ["Linsen (gekocht)", 116], ["Kichererbsen (gekocht)", 164], ["Bohnen (gekocht)", 127],
  ["Mandeln", 579], ["Walnüsse", 654], ["Cashewkerne", 553], ["Erdnussbutter", 588], ["Erdnüsse", 567],
  ["Schokolade", 546], ["Honig", 304], ["Zucker", 387], ["Nutella", 539], ["Marmelade", 250],
  ["Pizza", 266], ["Pommes Frites", 312], ["Burger", 295], ["Döner", 250], ["Sushi", 145],
  ["Currywurst", 280], ["Pfannkuchen", 227], ["Croissant", 406],
  ["Chips", 536], ["Popcorn", 387],
  ["Cola", 42], ["Apfelsaft", 46], ["Orangensaft", 45], ["Bier", 43], ["Wein", 83],
  ["Kaffee", 2], ["Olivenöl", 884],
];

function loadNutritionGoals() {
  return Object.assign({ kcal: 2000, water: 2000 }, JSON.parse(localStorage.getItem(NUTRITION_GOALS_KEY) || "{}"));
}
function saveNutritionGoalsData(goals) {
  localStorage.setItem(NUTRITION_GOALS_KEY, JSON.stringify(goals));
}

function loadFoodLog() {
  return JSON.parse(localStorage.getItem(FOOD_LOG_KEY) || "{}");
}
function saveFoodLog(log) {
  localStorage.setItem(FOOD_LOG_KEY, JSON.stringify(log));
}

function loadWaterLog() {
  return JSON.parse(localStorage.getItem(WATER_LOG_KEY) || "{}");
}
function saveWaterLog(log) {
  localStorage.setItem(WATER_LOG_KEY, JSON.stringify(log));
}

/* ---- Lebensmittel-Suche ---- */
const foodSearchInput = document.getElementById("foodSearch");
const foodSuggestions = document.getElementById("foodSuggestions");
const foodAmountInput = document.getElementById("foodAmount");
const foodKcal100Input = document.getElementById("foodKcal100");
const kcalPreview = document.getElementById("kcalPreview");

function hideSuggestions() {
  foodSuggestions.classList.add("hidden");
  foodSuggestions.innerHTML = "";
}

foodSearchInput.addEventListener("input", () => {
  const query = foodSearchInput.value.trim().toLowerCase();
  if (!query) return hideSuggestions();

  const matches = FOOD_DB.filter(([name]) => name.toLowerCase().includes(query)).slice(0, 8);
  if (matches.length === 0) return hideSuggestions();

  foodSuggestions.innerHTML = matches
    .map(([name, kcal100]) =>
      `<div class="suggestion-item" data-name="${esc(name)}" data-kcal="${kcal100}"><span>${esc(name)}</span><span>${kcal100} kcal/100g</span></div>`
    )
    .join("");
  foodSuggestions.classList.remove("hidden");
});

foodSuggestions.addEventListener("click", (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;
  foodSearchInput.value = item.dataset.name;
  foodKcal100Input.value = item.dataset.kcal;
  hideSuggestions();
  updateKcalPreview();
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#foodForm")) hideSuggestions();
});

function updateKcalPreview() {
  const amount = parseFloat(foodAmountInput.value) || 0;
  const kcal100 = parseFloat(foodKcal100Input.value) || 0;
  kcalPreview.textContent = `= ${Math.round((amount * kcal100) / 100)} kcal`;
}

foodAmountInput.addEventListener("input", updateKcalPreview);
foodKcal100Input.addEventListener("input", updateKcalPreview);

/* ---- Essen eintragen ---- */
document.getElementById("foodForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = foodSearchInput.value.trim();
  const amount = parseFloat(foodAmountInput.value);
  let kcal100 = parseFloat(foodKcal100Input.value);
  if (!name || !amount) return;

  // kcal-Feld leer? Exakten Treffer aus der Datenbank übernehmen
  if (isNaN(kcal100)) {
    const match = FOOD_DB.find(([n]) => n.toLowerCase() === name.toLowerCase());
    if (match) {
      kcal100 = match[1];
    } else {
      toast("Bitte kcal/100g angeben – Lebensmittel nicht in der Liste");
      foodKcal100Input.focus();
      return;
    }
  }

  const kcal = Math.round((amount * kcal100) / 100);

  const log = loadFoodLog();
  const today = todayKey();
  if (!log[today]) log[today] = [];
  log[today].push({ name, amount, kcal });
  saveFoodLog(log);

  foodSearchInput.value = "";
  foodAmountInput.value = "100";
  foodKcal100Input.value = "";
  kcalPreview.textContent = "= 0 kcal";
  hideSuggestions();

  renderNutrition();
  toast(`${name}: ${kcal} kcal eingetragen`);
});

function deleteFoodEntry(index) {
  const log = loadFoodLog();
  const today = todayKey();
  if (!log[today]) return;
  log[today].splice(index, 1);
  saveFoodLog(log);
  renderNutrition();
}

/* ---- Wasser ---- */
document.querySelectorAll(".water-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const amount = parseInt(btn.dataset.amount, 10);
    const log = loadWaterLog();
    const today = todayKey();
    log[today] = Math.max(0, (log[today] || 0) + amount);
    saveWaterLog(log);
    renderNutrition();
  });
});

document.getElementById("waterGlasses").addEventListener("click", (e) => {
  const glass = e.target.closest(".water-glass");
  if (!glass) return;
  const index = parseInt(glass.dataset.index, 10);
  const log = loadWaterLog();
  const today = todayKey();
  const filledCount = Math.round((log[today] || 0) / 250);
  // Klick aufs oberste gefüllte Glas nimmt es zurück, sonst bis hierhin auffüllen
  log[today] = (filledCount === index + 1 ? index : index + 1) * 250;
  saveWaterLog(log);
  renderNutrition();
});

/* ---- Tagesziele (echtes Formular: Enter funktioniert, Feedback per Toast) ---- */
document.getElementById("nutritionGoalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const kcalInput = document.getElementById("kcalGoalInput");
  const waterInput = document.getElementById("waterGoalInput");
  const kcalGoal = parseFloat(kcalInput.value);
  const waterGoal = parseFloat(waterInput.value);

  if (isNaN(kcalGoal) && isNaN(waterGoal)) {
    toast("Gib mindestens ein Ziel ein");
    return;
  }

  const goals = loadNutritionGoals();
  if (!isNaN(kcalGoal) && kcalGoal > 0) goals.kcal = kcalGoal;
  if (!isNaN(waterGoal) && waterGoal > 0) goals.water = waterGoal;
  saveNutritionGoalsData(goals);

  kcalInput.value = "";
  waterInput.value = "";
  renderNutrition();
  toast(`Ziele gespeichert: ${goals.kcal} kcal · ${goals.water} ml ✓`);
});

/* ---- Render ---- */
function renderNutrition() {
  const goals = loadNutritionGoals();
  const today = todayKey();

  // Kalorien
  const todayFood = loadFoodLog()[today] || [];
  const totalKcal = todayFood.reduce((sum, f) => sum + f.kcal, 0);
  const kcalPct = Math.min(100, (totalKcal / goals.kcal) * 100);
  const over = totalKcal > goals.kcal;

  document.getElementById("kcalSummary").textContent = `${totalKcal} / ${goals.kcal} kcal`;
  const kcalFill = document.getElementById("kcalBarFill");
  kcalFill.style.width = `${kcalPct}%`;
  kcalFill.classList.toggle("over", over);
  document.getElementById("kcalRemaining").textContent = over
    ? `${totalKcal - goals.kcal} kcal über dem Ziel`
    : `Noch ${goals.kcal - totalKcal} kcal übrig`;

  const foodList = document.getElementById("foodLogList");
  foodList.innerHTML = "";
  if (todayFood.length === 0) {
    foodList.innerHTML = '<li class="empty">Noch nichts gegessen heute</li>';
  } else {
    todayFood.forEach((f, index) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${esc(f.name)} <span class="food-meta">${f.amount} g</span></span>
        <span style="display:flex; align-items:center; gap:8px;">
          <strong>${f.kcal} kcal</strong>
          <button title="Löschen">✕</button>
        </span>
      `;
      li.querySelector("button").addEventListener("click", (e) => {
        armDelete(e.currentTarget, "Sicher?", () => deleteFoodEntry(index));
      });
      foodList.appendChild(li);
    });
  }

  // Wasser
  const totalWater = loadWaterLog()[today] || 0;
  const waterPct = Math.min(100, (totalWater / goals.water) * 100);

  document.getElementById("waterSummary").textContent = `${totalWater} / ${goals.water} ml`;
  document.getElementById("waterBarFill").style.width = `${waterPct}%`;

  const glassCount = Math.max(1, Math.round(goals.water / 250));
  const filledCount = Math.round(totalWater / 250);
  const glassesEl = document.getElementById("waterGlasses");
  glassesEl.innerHTML = "";
  for (let i = 0; i < glassCount; i++) {
    const span = document.createElement("span");
    span.className = "water-glass" + (i < filledCount ? " filled" : "");
    span.dataset.index = i;
    span.textContent = "💧";
    span.title = `${(i + 1) * 250} ml`;
    glassesEl.appendChild(span);
  }

  // Aktuelle Ziele als Platzhalter anzeigen
  document.getElementById("kcalGoalInput").placeholder = `kcal-Ziel (aktuell ${goals.kcal})`;
  document.getElementById("waterGoalInput").placeholder = `Wasser-Ziel ml (aktuell ${goals.water})`;

  renderNutritionJournal();
  renderDashboard();
}

/* Tage-Journal: Rückblick auf die letzten 14 Tage mit Einträgen */
function renderNutritionJournal() {
  const goals = loadNutritionGoals();
  const foodLog = loadFoodLog();
  const waterLog = loadWaterLog();
  const today = todayKey();

  const dates = [...new Set([...Object.keys(foodLog), ...Object.keys(waterLog)])]
    .filter((d) => (foodLog[d] || []).length > 0 || (waterLog[d] || 0) > 0)
    .sort()
    .reverse()
    .slice(0, 14);

  const list = document.getElementById("nutritionJournalList");
  list.innerHTML = "";

  if (dates.length === 0) {
    list.innerHTML = '<li class="empty">Noch keine Einträge</li>';
    return;
  }

  dates.forEach((d) => {
    const kcal = (foodLog[d] || []).reduce((s, f) => s + f.kcal, 0);
    const water = waterLog[d] || 0;
    const over = kcal > goals.kcal;
    const dayName = d === today ? "Heute" : new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" });

    const li = document.createElement("li");
    li.innerHTML = `
      <span>${dayName}, ${formatDate(d)}</span>
      <span class="journal-vals">
        <span class="${over ? "delta-down" : ""}">🔥 ${kcal}${over ? " (+" + (kcal - goals.kcal) + ")" : ""}</span>
        <span style="color:var(--blue)">💧 ${water} ml</span>
      </span>
    `;
    list.appendChild(li);
  });
}

/* ---------- Init ---------- */
renderHabits();
renderExercises();
renderNutrition();

/* PWA: Service Worker für Offline-Nutzung (nur über https oder localhost möglich) */
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
