const CONFIG = {
  SHEET_ID: '1xAvzje818V3J3dyO1_u_UlJBKGr_e-LPA2RnKhcB2YI',
  TABS: {
    morning: 'Morning Data Drop',
    evening: 'Evening Data Drop',
    measurements: 'Body Measurements',
  },
  DOB: '2001-11-06',
  HEIGHT_IN: 69.5,
  EAT_CONSTANT: 250,
  ROL_TARGET_BAND: { low: -1, high: -0.5 },
};

const MORNING_COLUMNS = {
  date: 'Date',
  weight: 'Morning Body Weight (lbs)',
  sleepHours: 'Sleep Duration (Hours)',
};

const EVENING_COLUMNS = {
  date: 'Date',
  calories: 'Total Calories',
  protein: 'Macros - Protein (g)',
  carbs: 'Macros - Carbs (g)',
  fat: 'Macros - Fat (g)',
  steps: 'Daily Steps (NEAT)',
};

const MEASUREMENT_COLUMNS = {
  date: 'Date',
  neck: 'Neck (inches)',
  chest: 'Chest (inches)',
  waist: 'True Waist (inches)',
  naval: 'Naval (inches)',
  hip: 'Hip / Glute (inches)',
  bicepsL: 'Biceps (Left)',
  bicepsR: 'Biceps (Right)',
  thighL: 'Thigh (Left)',
  thighR: 'Thigh (Right)',
};

const MEASUREMENT_SERIES = [
  { key: 'neck', label: 'Neck', color: '#2b6cb0' },
  { key: 'chest', label: 'Chest', color: '#dd6b20' },
  { key: 'waist', label: 'Waist', color: '#38a169' },
  { key: 'naval', label: 'Naval', color: '#805ad5' },
  { key: 'hip', label: 'Hip/Glute', color: '#d53f8c' },
  { key: 'bicepsL', label: 'Bicep L', color: '#3182ce' },
  { key: 'bicepsR', label: 'Bicep R', color: '#63b3ed' },
  { key: 'thighL', label: 'Thigh L', color: '#b7791f' },
  { key: 'thighR', label: 'Thigh R', color: '#ecc94b' },
];

function csvUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet (${res.status}): ${url}`);
  const text = await res.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() }).data;
}

function toKey(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toKey(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return toKey(year, +m[1], +m[2]);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function todayKey() {
  const d = new Date();
  return toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// UTC arithmetic keeps calendar-day stepping exact regardless of the
// viewer's local timezone/DST, since dates are otherwise just Y-M-D strings.
function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function dayNumberToKey(n) {
  const d = new Date(n * 86400000);
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function buildContinuousCalendar(firstKey, lastKey) {
  const start = dayNumber(firstKey);
  const end = dayNumber(lastKey);
  const arr = [];
  for (let n = start; n <= end; n++) arr.push(dayNumberToKey(n));
  return arr;
}

function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeRows(rows, columnMap) {
  const out = [];
  for (const row of rows) {
    const date = parseDateKey(row[columnMap.date]);
    if (!date) continue;
    const record = { date };
    for (const key in columnMap) {
      if (key === 'date') continue;
      record[key] = toNum(row[columnMap[key]]);
    }
    out.push(record);
  }
  return out;
}

function buildDateIndexedTable(...recordSets) {
  const table = new Map();
  for (const records of recordSets) {
    for (const record of records) {
      table.set(record.date, { ...table.get(record.date), ...record });
    }
  }
  return table;
}

function alignSeries(dateArray, table, field) {
  return dateArray.map((date) => {
    const rec = table.get(date);
    return rec && rec[field] != null ? rec[field] : null;
  });
}

// Index-aligned to a continuous calendar array, so a window of `windowDays`
// elements is always exactly that many calendar days, not "N data points."
function rollingAverage(arr, windowDays) {
  return arr.map((_, i) => {
    if (i < windowDays - 1) return null;
    const window = arr.slice(i - windowDays + 1, i + 1).filter((v) => v != null);
    if (window.length === 0) return null;
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
}

function computeWeeklyRateOfLoss(avgWeight) {
  return avgWeight.map((v, i) => {
    const prior = avgWeight[i - 7];
    return v == null || prior == null ? null : v - prior;
  });
}

function computeEstimatedTDEE(avgCalories, weeklyRoL) {
  return avgCalories.map((v, i) => {
    const rol = weeklyRoL[i];
    return v == null || rol == null ? null : v - rol * 500;
  });
}

function computeBodyFatPercent(rawWaist, rawNeck, heightIn) {
  return rawWaist.map((w, i) => {
    const n = rawNeck[i];
    if (w == null || n == null || w <= n) return null;
    return 86.01 * Math.log10(w - n) - 70.041 * Math.log10(heightIn) + 36.76;
  });
}

function firstValidIndex(arr) {
  for (let i = 0; i < arr.length; i++) if (arr[i] != null) return i;
  return -1;
}

function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
}

function firstValidValue(arr) {
  const i = firstValidIndex(arr);
  return i === -1 ? null : arr[i];
}

function lastValidValue(arr) {
  const i = lastValidIndex(arr);
  return i === -1 ? null : arr[i];
}

function computeAge(dobKey) {
  const [by, bm, bd] = dobKey.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - by;
  const hadBirthdayThisYear = now.getMonth() + 1 > bm || (now.getMonth() + 1 === bm && now.getDate() >= bd);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

function computeDashboardStats(series) {
  const currentAvgWeight = lastValidValue(series.avgWeight);
  const currentAvgCalories = lastValidValue(series.avgCalories);
  const currentWeeklyRoL = lastValidValue(series.weeklyRoL);
  const currentAvgProtein = lastValidValue(series.avgProtein);
  const currentAvgCarbs = lastValidValue(series.avgCarbs);
  const currentAvgFat = lastValidValue(series.avgFat);
  const currentAvgSteps = lastValidValue(series.avgSteps);

  const totalWeightLost =
    lastValidValue(series.avgWeight) != null && firstValidValue(series.avgWeight) != null
      ? lastValidValue(series.avgWeight) - firstValidValue(series.avgWeight)
      : null;

  const age = computeAge(CONFIG.DOB);
  const heightCm = CONFIG.HEIGHT_IN * 2.54;
  const bmr = currentAvgWeight != null ? 10 * (currentAvgWeight / 2.20462) + 6.25 * heightCm - 5 * age + 5 : null;
  const tef =
    currentAvgProtein != null && currentAvgCarbs != null && currentAvgFat != null
      ? currentAvgProtein * 4 * 0.25 + currentAvgCarbs * 4 * 0.075 + currentAvgFat * 9 * 0.02
      : null;
  const neat = currentAvgSteps != null ? currentAvgSteps * 0.04 : null;
  const eat = CONFIG.EAT_CONSTANT;
  const theoreticalTDEE = bmr != null && tef != null && neat != null ? bmr + tef + neat + eat : null;
  const expectedRoL = currentAvgCalories != null && theoreticalTDEE != null ? (currentAvgCalories - theoreticalTDEE) / 500 : null;
  const trackingVariance = currentWeeklyRoL != null && expectedRoL != null ? currentWeeklyRoL - expectedRoL : null;

  return {
    currentAvgWeight,
    totalWeightLost,
    currentAvgCalories,
    currentWeeklyRoL,
    currentEstTDEE: lastValidValue(series.estTDEE),
    currentAvgSteps,
    currentAvgProtein,
    currentAvgCarbs,
    currentAvgFat,
    currentAvgSleep: lastValidValue(series.avgSleep),
    currentAvgWeeklyRoL: lastValidValue(series.avgWeeklyRoL),
    currentAvgTDEE: lastValidValue(series.avgTDEE),
    currentBodyFat: lastValidValue(series.bodyFatPct),
    bmr,
    tef,
    neat,
    eat,
    theoreticalTDEE,
    expectedRoL,
    trackingVariance,
  };
}

function setStat(id, value, decimals) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value === null || value === undefined || !Number.isFinite(value) ? 'No data' : value.toFixed(decimals);
}

function renderStatTiles(stats) {
  setStat('stat-avg-weight', stats.currentAvgWeight, 1);
  setStat('stat-total-lost', stats.totalWeightLost, 1);
  setStat('stat-avg-cals', stats.currentAvgCalories, 0);
  setStat('stat-weekly-rol', stats.currentWeeklyRoL, 2);
  setStat('stat-est-tdee', stats.currentEstTDEE, 0);
  setStat('stat-avg-steps', stats.currentAvgSteps, 0);
  setStat('stat-avg-protein', stats.currentAvgProtein, 1);
  setStat('stat-avg-carbs', stats.currentAvgCarbs, 1);
  setStat('stat-avg-fat', stats.currentAvgFat, 1);
  setStat('stat-avg-sleep', stats.currentAvgSleep, 1);
  setStat('stat-avg-weekly-rol', stats.currentAvgWeeklyRoL, 2);
  setStat('stat-avg-tdee', stats.currentAvgTDEE, 0);
  setStat('stat-bodyfat', stats.currentBodyFat, 1);
  setStat('stat-bmr', stats.bmr, 0);
  setStat('stat-tef', stats.tef, 0);
  setStat('stat-neat', stats.neat, 0);
  setStat('stat-eat', stats.eat, 0);
  setStat('stat-theoretical-tdee', stats.theoreticalTDEE, 0);
  setStat('stat-expected-rol', stats.expectedRoL, 2);
  setStat('stat-tracking-variance', stats.trackingVariance, 2);
}

function renderWeightCaloriesChart(dateArray, avgWeight, rawCalories) {
  new Chart(document.getElementById('chart-weight-calories'), {
    type: 'line',
    data: {
      labels: dateArray,
      datasets: [
        {
          label: '7-Day Avg Weight (lbs)',
          data: avgWeight,
          yAxisID: 'yWeight',
          borderColor: '#2b6cb0',
          spanGaps: true,
          tension: 0.15,
          pointRadius: 2,
        },
        {
          label: 'Daily Calories',
          data: rawCalories,
          yAxisID: 'yCalories',
          borderColor: '#dd6b20',
          spanGaps: true,
          tension: 0,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        yWeight: { type: 'linear', position: 'left', title: { display: true, text: 'Weight (lbs)' } },
        yCalories: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Calories' } },
      },
    },
  });
}

function renderMeasurementsChart(dateArray, table) {
  new Chart(document.getElementById('chart-measurements'), {
    type: 'line',
    data: {
      labels: dateArray,
      datasets: MEASUREMENT_SERIES.map((s) => ({
        label: s.label,
        data: alignSeries(dateArray, table, s.key),
        borderColor: s.color,
        spanGaps: true,
        tension: 0,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { title: { display: true, text: 'Inches' } },
      },
    },
  });
}

function renderRateOfLossChart(dateArray, weeklyRoL) {
  new Chart(document.getElementById('chart-rate-of-loss'), {
    type: 'line',
    data: {
      labels: dateArray,
      datasets: [
        {
          label: 'Weekly Rate of Loss (lbs)',
          data: weeklyRoL,
          borderColor: '#c53030',
          spanGaps: true,
          tension: 0.15,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { title: { display: true, text: 'lbs / week' } },
      },
      plugins: {
        annotation: {
          annotations: {
            targetBand: {
              type: 'box',
              yMin: CONFIG.ROL_TARGET_BAND.low,
              yMax: CONFIG.ROL_TARGET_BAND.high,
              backgroundColor: 'rgba(56, 161, 105, 0.15)',
              borderWidth: 0,
            },
          },
        },
      },
    },
  });
}

function showContent() {
  document.getElementById('tracker-status').classList.add('is-hidden');
  document.getElementById('tracker-content').classList.remove('is-hidden');
}

function showError(err) {
  console.error(err);
  const statusEl = document.getElementById('tracker-status');
  statusEl.textContent = 'Could not load tracker data: ' + err.message;
  statusEl.classList.remove('is-loading');
  statusEl.classList.add('is-error');
}

async function main() {
  const [morningRaw, eveningRaw, measurementRaw] = await Promise.all([
    fetchCsv(csvUrl(CONFIG.TABS.morning)),
    fetchCsv(csvUrl(CONFIG.TABS.evening)),
    fetchCsv(csvUrl(CONFIG.TABS.measurements)),
  ]);

  const morning = normalizeRows(morningRaw, MORNING_COLUMNS);
  const evening = normalizeRows(eveningRaw, EVENING_COLUMNS);
  const measurements = normalizeRows(measurementRaw, MEASUREMENT_COLUMNS);

  const allDates = [...morning, ...evening, ...measurements].map((r) => r.date);
  if (allDates.length === 0) throw new Error('No data found in any sheet yet.');
  const firstDate = allDates.reduce((a, b) => (a < b ? a : b));

  const dateArray = buildContinuousCalendar(firstDate, todayKey());
  const table = buildDateIndexedTable(morning, evening, measurements);

  const rawWeight = alignSeries(dateArray, table, 'weight');
  const rawCalories = alignSeries(dateArray, table, 'calories');
  const rawProtein = alignSeries(dateArray, table, 'protein');
  const rawCarbs = alignSeries(dateArray, table, 'carbs');
  const rawFat = alignSeries(dateArray, table, 'fat');
  const rawSteps = alignSeries(dateArray, table, 'steps');
  const rawSleep = alignSeries(dateArray, table, 'sleepHours');
  const rawWaist = alignSeries(dateArray, table, 'waist');
  const rawNeck = alignSeries(dateArray, table, 'neck');

  const avgWeight = rollingAverage(rawWeight, 7);
  const avgCalories = rollingAverage(rawCalories, 7);
  const avgProtein = rollingAverage(rawProtein, 7);
  const avgCarbs = rollingAverage(rawCarbs, 7);
  const avgFat = rollingAverage(rawFat, 7);
  const avgSteps = rollingAverage(rawSteps, 7);
  const avgSleep = rollingAverage(rawSleep, 7);

  const weeklyRoL = computeWeeklyRateOfLoss(avgWeight);
  const estTDEE = computeEstimatedTDEE(avgCalories, weeklyRoL);
  const avgWeeklyRoL = rollingAverage(weeklyRoL, 7);
  const avgTDEE = rollingAverage(estTDEE, 7);
  const bodyFatPct = computeBodyFatPercent(rawWaist, rawNeck, CONFIG.HEIGHT_IN);

  const stats = computeDashboardStats({
    avgWeight,
    avgCalories,
    weeklyRoL,
    estTDEE,
    avgSteps,
    avgProtein,
    avgCarbs,
    avgFat,
    avgSleep,
    avgWeeklyRoL,
    avgTDEE,
    bodyFatPct,
  });

  renderStatTiles(stats);
  renderWeightCaloriesChart(dateArray, avgWeight, rawCalories);
  renderMeasurementsChart(dateArray, table);
  renderRateOfLossChart(dateArray, weeklyRoL);

  showContent();
}

main().catch(showError);
