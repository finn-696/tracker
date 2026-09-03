/* =========================================================
   Finanzen – Depot (Aktien/ETF/Krypto) + Einnahmen/Ausgaben
   Kurse kommen live aus dem Netz, alles andere liegt lokal
   im Browser (localStorage) – es verlässt kein Beleg das Gerät.
   ========================================================= */

/* ---------- Helpers ---------- */

// Lokales Datum (nicht UTC) — sonst landen Einträge nach Mitternacht auf dem Vortag
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const todayKey = () => dateKey();
const monthKey = (d = new Date()) => dateKey(d).slice(0, 7);

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
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

function monthLabel(mKey) {
  return new Date(mKey + "-01T12:00:00").toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
function fmtEUR(n) {
  return eurFmt.format(Number.isFinite(n) ? n : 0);
}
function fmtNum(n, max = 2) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: max }).format(
    Number.isFinite(n) ? n : 0
  );
}
// Kurse: kleine Beträge (z.B. 0,000018 €) brauchen mehr Nachkommastellen
function fmtPrice(n, cur = "EUR") {
  const abs = Math.abs(n || 0);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  return (
    new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(n || 0) +
    " " + (cur === "EUR" ? "€" : cur)
  );
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return "–";
  return (n >= 0 ? "+" : "") + fmtNum(n, 2) + " %";
}
function fmtSigned(n) {
  return (n >= 0 ? "+" : "−") + fmtEUR(Math.abs(n)).replace("-", "");
}
const deltaClass = (n) => (n > 0 ? "delta-up" : n < 0 ? "delta-down" : "delta-neutral");

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

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Speicher-Schlüssel & Stammdaten ---------- */
const POS_KEY = "fin_positions";
const TX_KEY = "fin_tx";
const REC_KEY = "fin_recurring";
const BUDGET_KEY = "fin_budgets";
const PRICE_KEY = "fin_prices";
const SNAP_KEY = "fin_snapshots";
const SET_KEY = "fin_settings";
const FX_KEY = "fin_fx";

const DEFAULT_SETTINGS = { cashStart: 0, apiKey: "" };

const CATEGORIES = {
  aus: [
    { k: "wohnen", label: "🏠 Wohnen & Miete", color: "#818cf8" },
    { k: "lebensmittel", label: "🛒 Lebensmittel", color: "#34d399" },
    { k: "mobilitaet", label: "🚗 Mobilität", color: "#38bdf8" },
    { k: "abos", label: "📱 Abos & Handy", color: "#f472b6" },
    { k: "restaurant", label: "🍽️ Essen gehen", color: "#fbbf24" },
    { k: "freizeit", label: "🎉 Freizeit", color: "#a78bfa" },
    { k: "shopping", label: "👕 Shopping", color: "#fb923c" },
    { k: "gesundheit", label: "💊 Gesundheit", color: "#4ade80" },
    { k: "bildung", label: "🎓 Bildung", color: "#22d3ee" },
    { k: "fixkosten", label: "💡 Strom & Versicherung", color: "#f87171" },
    { k: "investition", label: "📈 Investition", color: "#2dd4bf" },
    { k: "sonstiges_aus", label: "💸 Sonstiges", color: "#94a3b8" },
  ],
  ein: [
    { k: "gehalt", label: "💼 Gehalt", color: "#34d399" },
    { k: "nebenjob", label: "🧾 Nebenjob", color: "#38bdf8" },
    { k: "dividende", label: "📈 Dividende & Zinsen", color: "#fbbf24" },
    { k: "geschenk", label: "🎁 Geschenk", color: "#f472b6" },
    { k: "erstattung", label: "↩️ Erstattung", color: "#a78bfa" },
    { k: "sonstiges_ein", label: "💰 Sonstiges", color: "#94a3b8" },
  ],
};

function catInfo(key) {
  return (
    CATEGORIES.aus.concat(CATEGORIES.ein).find((c) => c.k === key) || {
      k: key,
      label: "❔ Unbekannt",
      color: "#94a3b8",
    }
  );
}

/* ---------- Datenzugriff ---------- */
const loadPositions = () => load(POS_KEY, []);
const loadTx = () => load(TX_KEY, []);
const loadRecurring = () => load(REC_KEY, []);
const loadBudgets = () => load(BUDGET_KEY, {});
const loadPrices = () => load(PRICE_KEY, {});
const loadSnapshots = () => load(SNAP_KEY, {});
const loadSettings = () => Object.assign({}, DEFAULT_SETTINGS, load(SET_KEY, {}));

const posId = (p) => `${p.type}:${p.symbol.toUpperCase()}`;

/* ---------- Währungen ---------- */
/* Frankfurter liefert Kurse mit Basis EUR: rates.USD = 1,16 heißt 1 € = 1,16 $ */
async function refreshFxRates() {
  const cached = load(FX_KEY, null);
  if (cached && Date.now() - cached.ts < 12 * 3600 * 1000) return cached.rates;
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,CHF,GBP");
    const data = await res.json();
    if (data && data.rates) {
      save(FX_KEY, { ts: Date.now(), rates: data.rates });
      return data.rates;
    }
  } catch {
    /* offline: alter Stand ist besser als gar keiner */
  }
  return (cached && cached.rates) || {};
}

function toEUR(value, currency) {
  if (!currency || currency === "EUR") return value;
  const rates = (load(FX_KEY, null) || {}).rates || {};
  const rate = rates[currency];
  return rate ? value / rate : value;
}

/* ---------- Kursquellen ---------- */
/* Direkt zuerst, danach über offene Text-Proxys (manche Börsen-APIs
   schicken keine CORS-Header, dann springt der Proxy ein). */
const PROXIES = [
  (u) => u,
  (u) => "https://r.jina.ai/" + u,
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
];

/* Harter Abbruch: eine hängende Anfrage darf nicht die ganze Runde blockieren */
async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url, ms) {
  return (await fetchWithTimeout(url, ms)).json();
}

/* Proxys liefern manchmal Text mit Vorspann – wir schneiden ab dem JSON ab */
async function fetchJSONviaProxy(url) {
  let lastErr;
  for (const wrap of PROXIES) {
    try {
      const res = await fetchWithTimeout(wrap(url), 10000);
      const text = await res.text();
      const start = text.indexOf("{");
      if (start === -1) throw new Error("kein JSON");
      return JSON.parse(text.slice(start));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("keine Quelle erreichbar");
}

/* Krypto: Coinbase-Tageskerzen liefern Kurs, Vortag und Verlauf in einem Aufruf */
async function fetchCrypto(symbol) {
  const sym = symbol.toUpperCase();
  try {
    const rows = await fetchJSON(
      `https://api.exchange.coinbase.com/products/${sym}-EUR/candles?granularity=86400`
    );
    if (Array.isArray(rows) && rows.length > 1) {
      const spark = rows.slice(0, 30).map((r) => r[4]).reverse();
      return {
        price: rows[0][4],
        prev: rows[1][4],
        currency: "EUR",
        spark,
        source: "Coinbase",
      };
    }
  } catch {
    /* nächste Quelle */
  }

  try {
    const data = await fetchJSON(`https://api.coinbase.com/v2/prices/${sym}-EUR/spot`);
    const price = parseFloat(data && data.data && data.data.amount);
    if (Number.isFinite(price)) {
      return { price, prev: null, currency: "EUR", spark: [], source: "Coinbase" };
    }
  } catch {
    /* nächste Quelle */
  }

  const id = COINGECKO_IDS[sym];
  if (id) {
    try {
      const data = await fetchJSON(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur&include_24hr_change=true`
      );
      const entry = data[id];
      if (entry && Number.isFinite(entry.eur)) {
        const chg = entry.eur_24h_change;
        return {
          price: entry.eur,
          prev: Number.isFinite(chg) ? entry.eur / (1 + chg / 100) : null,
          currency: "EUR",
          spark: [],
          source: "CoinGecko",
        };
      }
    } catch {
      /* nächste Quelle */
    }
  }

  return fetchYahoo(`${sym}-EUR`);
}

const COINGECKO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano",
  DOGE: "dogecoin", DOT: "polkadot", LINK: "chainlink", AVAX: "avalanche-2",
  LTC: "litecoin", BNB: "binancecoin", TRX: "tron", SHIB: "shiba-inu",
  UNI: "uniswap", ATOM: "cosmos", XMR: "monero", ETC: "ethereum-classic",
  NEAR: "near", ARB: "arbitrum", OP: "optimism", SUI: "sui", TON: "the-open-network",
  PEPE: "pepe", MATIC: "matic-network", USDT: "tether", USDC: "usd-coin",
  ALGO: "algorand", FIL: "filecoin", AAVE: "aave", XLM: "stellar", HBAR: "hedera-hashgraph",
};

/* Aktien/ETFs: Twelve Data (CORS-freundlich, kostenloser Key), sonst Yahoo über Proxy */
async function fetchStockBatch(symbols, apiKey) {
  const out = {};
  if (!symbols.length) return out;

  const key = apiKey || "demo";
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${symbols.join(",")}&apikey=${encodeURIComponent(key)}`;
    const data = await fetchJSON(url);
    // Bei einem Symbol kommt das Objekt direkt, bei mehreren nach Symbol geschlüsselt
    const entries = symbols.length === 1 ? { [symbols[0]]: data } : data;
    for (const sym of symbols) {
      const q = entries && entries[sym];
      const price = q && parseFloat(q.close);
      if (Number.isFinite(price)) {
        out[sym] = {
          price,
          prev: parseFloat(q.previous_close) || null,
          currency: q.currency || "USD",
          name: q.name || "",
          spark: [],
          source: "Twelve Data",
        };
      }
    }
  } catch {
    /* Yahoo übernimmt */
  }

  // Die Ausweichquelle darf nicht Symbol für Symbol warten – sonst dauert
  // eine Runde mit mehreren Werten Minuten.
  await Promise.all(
    symbols
      .filter((sym) => !out[sym])
      .map(async (sym) => {
        try {
          out[sym] = await fetchYahoo(sym);
        } catch {
          /* Symbol bleibt ohne Kurs */
        }
      })
  );
  return out;
}

/* Verlauf für die Sparkline – nur wenn nötig, um das Anfrage-Limit zu schonen */
async function fetchStockSpark(symbol, apiKey) {
  const key = apiKey || "demo";
  try {
    const data = await fetchJSON(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=30&apikey=${encodeURIComponent(key)}`
    );
    if (data && Array.isArray(data.values)) {
      return data.values.map((v) => parseFloat(v.close)).reverse().filter(Number.isFinite);
    }
  } catch {
    /* ohne Sparkline ist die Position trotzdem nutzbar */
  }
  return [];
}

async function fetchYahoo(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
  const data = await fetchJSONviaProxy(url);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) throw new Error("Symbol unbekannt");
  const meta = result.meta;
  const closes =
    (result.indicators && result.indicators.quote && result.indicators.quote[0].close) || [];
  return {
    price: meta.regularMarketPrice,
    prev: meta.chartPreviousClose ?? meta.previousClose ?? null,
    currency: meta.currency || "USD",
    name: meta.shortName || meta.longName || "",
    spark: closes.filter(Number.isFinite).slice(-30),
    source: "Yahoo",
  };
}

/* Alle Kurse einsammeln und im Cache ablegen */
let refreshing = false;
let refreshQueued = false;
async function refreshPrices(silent = false) {
  const positions = loadPositions();
  // Läuft schon eine Runde? Dann direkt danach noch einmal – sonst fehlt die eben
  // hinzugefügte Position im Ergebnis.
  if (refreshing) {
    refreshQueued = true;
    return;
  }
  if (!positions.length) {
    setPriceStatus("Noch keine Position im Depot");
    return;
  }

  if (navigator.onLine === false) {
    setPriceStatus("Offline – es gelten die zuletzt geladenen Kurse", "warn");
    return;
  }

  refreshing = true;
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Lade Kurse…";
  setPriceStatus("Kurse werden geholt…");

  const settings = loadSettings();
  const prices = loadPrices();
  const failed = [];
  let ok = 0;

  await refreshFxRates();

  const stockSymbols = [
    ...new Set(positions.filter((p) => p.type === "aktie").map((p) => p.symbol.toUpperCase())),
  ];
  const cryptoSymbols = [
    ...new Set(positions.filter((p) => p.type === "krypto").map((p) => p.symbol.toUpperCase())),
  ];

  const stockQuotes = await fetchStockBatch(stockSymbols, settings.apiKey);
  for (const sym of stockSymbols) {
    const q = stockQuotes[sym];
    const id = "aktie:" + sym;
    if (q && Number.isFinite(q.price)) {
      prices[id] = Object.assign({}, prices[id], q, { ts: Date.now() });
      ok++;
    } else {
      failed.push(sym);
    }
  }

  const cryptoQuotes = await Promise.all(
    cryptoSymbols.map(async (sym) => {
      try {
        return { sym, q: await fetchCrypto(sym) };
      } catch {
        return { sym, q: null };
      }
    })
  );
  cryptoQuotes.forEach(({ sym, q }) => {
    const id = "krypto:" + sym;
    if (q && Number.isFinite(q.price)) {
      prices[id] = Object.assign({}, prices[id], q, { ts: Date.now() });
      ok++;
    } else {
      failed.push(sym);
    }
  });

  // Sparklines für Aktien nachladen (max. 3 pro Runde wegen Anfrage-Limit)
  let sparkBudget = 3;
  for (const sym of stockSymbols) {
    if (sparkBudget <= 0) break;
    const entry = prices["aktie:" + sym];
    if (!entry || (entry.spark && entry.spark.length > 2 && Date.now() - (entry.sparkTs || 0) < 20 * 3600 * 1000))
      continue;
    const spark = await fetchStockSpark(sym, settings.apiKey);
    if (spark.length > 2) {
      entry.spark = spark;
      entry.sparkTs = Date.now();
      sparkBudget--;
    }
  }

  save(PRICE_KEY, prices);
  refreshing = false;
  btn.disabled = false;
  btn.textContent = "🔄 Kurse aktualisieren";

  if (refreshQueued) {
    refreshQueued = false;
    renderAll();
    return refreshPrices(silent);
  }

  if (failed.length) {
    setPriceStatus(
      `${ok} aktuell · ${failed.length} ohne Kurs (${failed.join(", ")})`,
      "warn"
    );
    if (!silent) toast(`Kein Kurs für ${failed.join(", ")} – Kurs manuell setzen?`);
  } else {
    setPriceStatus(`${ok} Kurse aktuell · ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`);
    if (!silent) toast("Kurse aktualisiert 📈");
  }
  renderAll();
}

function setPriceStatus(text, tone) {
  const el = document.getElementById("priceStatus");
  el.textContent = text;
  el.classList.toggle("warn", tone === "warn");
}

/* ---------- Bewertung ---------- */
/* Ein Eintrag pro Position: Kurs, Wert und Gewinn/Verlust – alles in Euro */
function valuate(p) {
  const prices = loadPrices();
  const entry = prices[posId(p)] || {};
  const manual = Number.isFinite(p.manual) ? p.manual : null;
  const currency = manual !== null ? p.currency || "EUR" : entry.currency || p.currency || "EUR";
  const price = manual !== null ? manual : Number.isFinite(entry.price) ? entry.price : null;
  const prev = manual !== null ? null : Number.isFinite(entry.prev) ? entry.prev : null;

  const priceEUR = price === null ? null : toEUR(price, currency);
  const prevEUR = prev === null ? null : toEUR(prev, currency);
  const buyEUR = toEUR(p.buy, p.currency || currency);

  const value = priceEUR === null ? null : priceEUR * p.qty;
  const cost = buyEUR * p.qty;
  const profit = value === null ? null : value - cost;
  const profitPct = value === null || cost === 0 ? null : (profit / cost) * 100;
  const dayAbs = priceEUR === null || prevEUR === null ? null : (priceEUR - prevEUR) * p.qty;
  const dayPct = priceEUR === null || !prevEUR ? null : ((priceEUR - prevEUR) / prevEUR) * 100;

  return {
    price, priceEUR, prevEUR, currency, value, cost, profit, profitPct, dayAbs, dayPct,
    manual: manual !== null,
    stale: price === null,
    source: entry.source || null,
    ts: entry.ts || null,
    spark: entry.spark || [],
    name: p.name || entry.name || "",
  };
}

function depotTotals() {
  const positions = loadPositions();
  let value = 0, cost = 0, day = 0, missing = 0, byType = { aktie: 0, krypto: 0 };
  positions.forEach((p) => {
    const v = valuate(p);
    if (v.value === null) {
      missing++;
      cost += v.cost;
      byType[p.type] += v.cost; // ohne Kurs zählt der Einstand
      value += v.cost;
      return;
    }
    value += v.value;
    cost += v.cost;
    byType[p.type] += v.value;
    if (v.dayAbs !== null) day += v.dayAbs;
  });
  return { value, cost, profit: value - cost, day, missing, byType, count: positions.length };
}

function cashBalance() {
  const settings = loadSettings();
  return loadTx().reduce(
    (sum, t) => sum + (t.type === "ein" ? t.amount : -t.amount),
    Number(settings.cashStart) || 0
  );
}

function netWorth() {
  return cashBalance() + depotTotals().value;
}

function monthTotals(mKey) {
  const tx = loadTx().filter((t) => t.date.slice(0, 7) === mKey);
  const ein = tx.filter((t) => t.type === "ein").reduce((s, t) => s + t.amount, 0);
  const aus = tx.filter((t) => t.type === "aus").reduce((s, t) => s + t.amount, 0);
  return { ein, aus, saldo: ein - aus, quote: ein > 0 ? ((ein - aus) / ein) * 100 : null, tx };
}

/* ---------- Diagramme ---------- */
/* Kleine Sparkline für die Positionskarte */
function sparklineHTML(values, color) {
  if (!values || values.length < 2) return '<span class="spark-empty">–</span>';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 72;
      const y = 24 - ((v - min) / span) * 22 - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 72 24" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

/* Großes Linien-Diagramm (Vermögensverlauf & Kursverlauf im Detail) */
function lineChart(svg, values, color) {
  if (!values || values.length < 2) {
    svg.innerHTML = `<text x="150" y="62" text-anchor="middle" fill="#8b93c8" font-size="10">Noch zu wenig Daten</text>`;
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const x = (i) => (i / (values.length - 1)) * 300;
  const y = (v) => 112 - ((v - min) / span) * 96;

  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `0,120 ${line} 300,120`;
  const up = values[values.length - 1] >= values[0];
  const stroke = color || (up ? "#34d399" : "#f87171");

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#chartFill)"/>
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  `;
}

function statBox(label, value, cls) {
  return `<div class="stat-box">
      <div class="stat-value ${cls || ""}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

/* ---------- Kopfbereich ---------- */
function renderHeader() {
  const depot = depotTotals();
  const cash = cashBalance();
  const total = cash + depot.value;

  document.getElementById("nwValue").textContent = fmtEUR(total);

  const deltaEl = document.getElementById("nwDelta");
  if (depot.count === 0) {
    deltaEl.textContent = "Depot noch leer";
    deltaEl.className = "nw-delta delta-neutral";
  } else {
    const pct = total - depot.day !== 0 ? (depot.day / (total - depot.day)) * 100 : 0;
    deltaEl.textContent = `${fmtSigned(depot.day)} heute (${fmtPct(pct)})`;
    deltaEl.className = "nw-delta " + deltaClass(depot.day);
  }

  document.getElementById("nwSplit").innerHTML = `
    <span class="nw-chip">📈 Depot ${fmtEUR(depot.value)}</span>
    <span class="nw-chip">🏦 Konto ${fmtEUR(cash)}</span>
  `;
}

/* Ein Vermögensstand pro Tag – die Basis für den Verlauf */
function recordSnapshot() {
  if (!loadPositions().length && !loadTx().length && !loadSettings().cashStart) return;
  const snaps = loadSnapshots();
  snaps[todayKey()] = Math.round(netWorth() * 100) / 100;
  const keys = Object.keys(snaps).sort();
  // Nur die letzten 400 Tage behalten
  keys.slice(0, Math.max(0, keys.length - 400)).forEach((k) => delete snaps[k]);
  save(SNAP_KEY, snaps);
}

/* ---------- Übersicht ---------- */
function renderOverview() {
  const depot = depotTotals();
  const cash = cashBalance();

  document.getElementById("overviewStats").innerHTML =
    statBox("Depotwert", fmtEUR(depot.value), "") +
    statBox("Konto", fmtEUR(cash), "") +
    statBox("Heute", fmtSigned(depot.day), deltaClass(depot.day)) +
    statBox(
      "Gewinn gesamt",
      fmtSigned(depot.profit),
      deltaClass(depot.profit)
    );

  // Verlauf
  const snaps = loadSnapshots();
  const keys = Object.keys(snaps).sort().slice(-60);
  lineChart(document.getElementById("nwChart"), keys.map((k) => snaps[k]));
  document.getElementById("nwChartRange").textContent = keys.length
    ? `${formatDate(keys[0])} – heute`
    : "";

  // Aufteilung
  const parts = [
    { label: "Aktien & ETFs", value: depot.byType.aktie, color: "#818cf8" },
    { label: "Krypto", value: depot.byType.krypto, color: "#fbbf24" },
    { label: "Konto", value: Math.max(0, cash), color: "#34d399" },
  ].filter((p) => p.value > 0);
  const sum = parts.reduce((s, p) => s + p.value, 0);

  document.getElementById("allocTotal").textContent = sum ? fmtEUR(sum) : "";
  document.getElementById("allocBar").innerHTML = sum
    ? parts
        .map(
          (p) =>
            `<span class="alloc-seg" style="width:${((p.value / sum) * 100).toFixed(1)}%;background:${p.color}" title="${esc(p.label)}"></span>`
        )
        .join("")
    : '<span class="alloc-seg empty-seg"></span>';
  document.getElementById("allocLegend").innerHTML = sum
    ? parts
        .map(
          (p) => `<span class="alloc-item"><i style="background:${p.color}"></i>${esc(p.label)}
            <b>${((p.value / sum) * 100).toFixed(0)} %</b></span>`
        )
        .join("")
    : '<span class="fin-hint">Noch nichts zu verteilen – leg im Depot los.</span>';

  // Bewegung heute
  const movers = loadPositions()
    .map((p) => ({ p, v: valuate(p) }))
    .filter((m) => m.v.dayAbs !== null)
    .sort((a, b) => Math.abs(b.v.dayAbs) - Math.abs(a.v.dayAbs))
    .slice(0, 5);

  const moversList = document.getElementById("moversList");
  document.getElementById("moversSub").textContent = movers.length ? "Top 5" : "";
  moversList.innerHTML = movers.length
    ? movers
        .map(
          (m) => `<li>
            <span>${m.p.type === "krypto" ? "🪙" : "📈"} <strong>${esc(m.p.symbol.toUpperCase())}</strong></span>
            <span class="journal-vals">
              <span class="${deltaClass(m.v.dayPct)}">${fmtPct(m.v.dayPct)}</span>
              <span class="${deltaClass(m.v.dayAbs)}">${fmtSigned(m.v.dayAbs)}</span>
            </span>
          </li>`
        )
        .join("")
    : '<li class="empty">Keine Kursbewegung vorhanden</li>';

  // Monat
  const mKey = monthKey();
  const m = monthTotals(mKey);
  document.getElementById("overviewMonthLabel").textContent = monthLabel(mKey);
  document.getElementById("overviewMonth").innerHTML =
    statBox("Einnahmen", fmtEUR(m.ein), "delta-up") +
    statBox("Ausgaben", fmtEUR(m.aus), "delta-down") +
    statBox("Saldo", fmtSigned(m.saldo), deltaClass(m.saldo)) +
    statBox("Sparquote", m.quote === null ? "–" : fmtNum(m.quote, 0) + " %", deltaClass(m.quote));
}

/* ---------- Depot ---------- */
function renderDepot() {
  const positions = loadPositions();
  const list = document.getElementById("positionList");

  if (!positions.length) {
    list.innerHTML =
      '<p class="empty">Noch keine Position – trag deine erste Aktie oder Kryptowährung ein.</p>';
    document.getElementById("depotSummary").textContent = "";
    return;
  }

  const rows = positions
    .map((p) => ({ p, v: valuate(p) }))
    .sort((a, b) => (b.v.value ?? b.v.cost) - (a.v.value ?? a.v.cost));

  list.innerHTML = rows
    .map(({ p, v }) => {
      const color = v.profit >= 0 ? "#34d399" : "#f87171";
      const dayTxt = v.dayPct === null ? "" : `<span class="pos-day ${deltaClass(v.dayPct)}">${fmtPct(v.dayPct)} heute</span>`;
      return `
        <div class="position-card" data-id="${p.id}">
          <div class="pos-main">
            <div class="pos-ident">
              <span class="pos-icon">${p.type === "krypto" ? "🪙" : "📈"}</span>
              <div>
                <div class="pos-symbol">${esc(p.symbol.toUpperCase())}${v.manual ? '<span class="pos-flag">manuell</span>' : ""}${v.stale ? '<span class="pos-flag warn">kein Kurs</span>' : ""}</div>
                <div class="pos-sub">${esc(v.name || (p.type === "krypto" ? "Krypto" : "Aktie / ETF"))}</div>
              </div>
            </div>
            <div class="pos-values">
              <div class="pos-value">${v.value === null ? "–" : fmtEUR(v.value)}</div>
              <div class="pos-profit ${deltaClass(v.profit)}">${v.profit === null ? "" : `${fmtSigned(v.profit)} (${fmtPct(v.profitPct)})`}</div>
            </div>
          </div>
          <div class="pos-foot">
            <span class="pos-meta">${fmtNum(p.qty, 8)} × ${v.price === null ? "?" : fmtPrice(v.price, v.currency)}</span>
            ${dayTxt}
            ${sparklineHTML(v.spark, color)}
          </div>
        </div>`;
    })
    .join("");

  list.querySelectorAll(".position-card").forEach((card) => {
    card.addEventListener("click", () => openPosition(card.dataset.id));
  });

  const t = depotTotals();
  document.getElementById("depotSummary").textContent =
    `${t.count} Positionen · Einstand ${fmtEUR(t.cost)} · Wert ${fmtEUR(t.value)} · ${fmtSigned(t.profit)}`;
}

/* ---------- Positions-Detail ---------- */
let openPositionId = null;

function openPosition(id) {
  const p = loadPositions().find((x) => x.id === id);
  if (!p) return;
  openPositionId = id;
  const v = valuate(p);

  document.getElementById("posModalTitle").textContent =
    `${p.type === "krypto" ? "🪙" : "📈"} ${p.symbol.toUpperCase()}${v.name ? " · " + v.name : ""}`;

  const priceEl = document.getElementById("posModalPrice");
  priceEl.innerHTML =
    v.price === null
      ? '<span class="delta-neutral">Kein Kurs geladen – unten manuell setzen</span>'
      : `${fmtPrice(v.price, v.currency)} <span class="${deltaClass(v.dayPct)}">${v.dayPct === null ? "" : fmtPct(v.dayPct)}</span>
         <span class="pos-source">${v.manual ? "manuell" : esc(v.source || "")}${v.ts && !v.manual ? " · " + new Date(v.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr" : ""}</span>`;

  lineChart(document.getElementById("posChart"), v.spark, v.profit >= 0 ? "#34d399" : "#f87171");

  document.getElementById("posStats").innerHTML =
    statBox("Menge", fmtNum(p.qty, 8), "") +
    statBox("Kaufkurs", fmtPrice(p.buy, p.currency || "EUR"), "") +
    statBox("Wert", v.value === null ? "–" : fmtEUR(v.value), "") +
    statBox("Einstand", fmtEUR(v.cost), "") +
    statBox("Gewinn", v.profit === null ? "–" : fmtSigned(v.profit), deltaClass(v.profit)) +
    statBox("Rendite", v.profitPct === null ? "–" : fmtPct(v.profitPct), deltaClass(v.profitPct));

  document.getElementById("editQty").value = p.qty;
  document.getElementById("editBuy").value = p.buy;
  document.getElementById("editManual").value = Number.isFinite(p.manual) ? p.manual : "";

  document.getElementById("positionModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("positionModal").classList.add("hidden");
  openPositionId = null;
}

/* ---------- Cashflow ---------- */
let currentMonth = monthKey();

function fillCategorySelect(select, type) {
  select.innerHTML = CATEGORIES[type]
    .map((c) => `<option value="${c.k}">${c.label}</option>`)
    .join("");
}

function renderCashflow() {
  document.getElementById("monthLabel").textContent = monthLabel(currentMonth);
  const m = monthTotals(currentMonth);

  document.getElementById("monthStats").innerHTML =
    statBox("Einnahmen", fmtEUR(m.ein), "delta-up") +
    statBox("Ausgaben", fmtEUR(m.aus), "delta-down") +
    statBox("Saldo", fmtSigned(m.saldo), deltaClass(m.saldo)) +
    statBox("Sparquote", m.quote === null ? "–" : fmtNum(m.quote, 0) + " %", deltaClass(m.quote));

  const list = document.getElementById("txList");
  const tx = m.tx.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  list.innerHTML = tx.length
    ? tx
        .map((t) => {
          const cat = catInfo(t.category);
          return `<li data-id="${t.id}">
            <span class="tx-left">
              <span class="tx-cat" style="border-color:${cat.color}">${esc(cat.label)}</span>
              <span class="tx-meta">${formatDate(t.date)}${t.note ? " · " + esc(t.note) : ""}${t.src ? " · 🔁" : ""}</span>
            </span>
            <span class="journal-vals">
              <span class="${t.type === "ein" ? "delta-up" : "delta-down"}">${t.type === "ein" ? "+" : "−"}${fmtEUR(t.amount)}</span>
              <button type="button" class="tx-del" title="Löschen">✕</button>
            </span>
          </li>`;
        })
        .join("")
    : '<li class="empty">Keine Buchungen in diesem Monat</li>';

  list.querySelectorAll(".tx-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.closest("li").dataset.id;
      armDelete(btn, "Sicher?", () => {
        save(TX_KEY, loadTx().filter((t) => t.id !== id));
        toast("Buchung gelöscht");
        renderAll();
      });
    });
  });

  renderRecurring();
}

function renderRecurring() {
  const recs = loadRecurring();
  const list = document.getElementById("recurringList");
  list.innerHTML = recs.length
    ? recs
        .map((r) => {
          const cat = catInfo(r.category);
          return `<li data-id="${r.id}">
            <span>${esc(cat.label)} <span class="tx-meta">am ${r.day}. · ${esc(r.note || "")}</span></span>
            <span class="journal-vals">
              <span class="${r.type === "ein" ? "delta-up" : "delta-down"}">${r.type === "ein" ? "+" : "−"}${fmtEUR(r.amount)}</span>
              <button type="button" class="rec-del" title="Beenden">✕</button>
            </span>
          </li>`;
        })
        .join("")
    : '<li class="empty">Keine Daueraufträge angelegt</li>';

  list.querySelectorAll(".rec-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest("li").dataset.id;
      armDelete(btn, "Beenden?", () => {
        save(REC_KEY, loadRecurring().filter((r) => r.id !== id));
        toast("Dauerauftrag beendet – alte Buchungen bleiben");
        renderAll();
      });
    });
  });
}

/* Daueraufträge bis zum aktuellen Monat fortschreiben */
function applyRecurring() {
  const recs = loadRecurring();
  if (!recs.length) return;
  const tx = loadTx();
  const now = monthKey();
  let added = 0;

  recs.forEach((r) => {
    let [y, m] = String(r.startMonth || monthKey()).split("-").map(Number);
    if (!y || !m) return;
    let guard = 0;
    while (guard++ < 240) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > now) break;
      const src = `${r.id}@${key}`;
      if (!tx.some((t) => t.src === src)) {
        const lastDay = new Date(y, m, 0).getDate();
        tx.push({
          id: uid(),
          date: `${key}-${String(Math.min(r.day, lastDay)).padStart(2, "0")}`,
          type: r.type,
          amount: r.amount,
          category: r.category,
          note: r.note,
          src,
        });
        added++;
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }
  });

  if (added) save(TX_KEY, tx);
}

/* ---------- Analyse ---------- */
function renderAnalyse() {
  const m = monthTotals(currentMonth);
  document.getElementById("catMonthLabel").textContent = monthLabel(currentMonth);

  // Ausgaben nach Kategorie
  const byCat = {};
  m.tx.filter((t) => t.type === "aus").forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;

  document.getElementById("categoryBars").innerHTML = cats.length
    ? cats
        .map(([k, amount]) => {
          const cat = catInfo(k);
          const share = m.aus ? (amount / m.aus) * 100 : 0;
          return `<div class="cat-row">
            <div class="cat-top">
              <span>${esc(cat.label)}</span>
              <span class="cat-amount">${fmtEUR(amount)} · ${fmtNum(share, 0)} %</span>
            </div>
            <div class="fin-bar"><div class="fin-bar-fill" style="width:${maxCat ? (amount / maxCat) * 100 : 0}%;background:${cat.color}"></div></div>
          </div>`;
        })
        .join("")
    : '<p class="fin-hint">Für diesen Monat sind noch keine Ausgaben erfasst.</p>';

  // Letzte 6 Monate
  const months = [];
  const base = new Date(currentMonth + "-01T12:00:00");
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const data = months.map((k) => ({ k, ...monthTotals(k) }));
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.ein, d.aus)));

  document.getElementById("monthsChart").innerHTML = data
    .map(
      (d) => `<div class="mc-col" title="${monthLabel(d.k)}">
        <div class="mc-bars">
          <span class="mc-bar mc-in" style="height:${(d.ein / maxVal) * 100}%" title="Einnahmen ${fmtEUR(d.ein)}"></span>
          <span class="mc-bar mc-out" style="height:${(d.aus / maxVal) * 100}%" title="Ausgaben ${fmtEUR(d.aus)}"></span>
        </div>
        <span class="mc-label">${new Date(d.k + "-01T12:00:00").toLocaleDateString("de-DE", { month: "short" })}</span>
        <span class="mc-saldo ${deltaClass(d.saldo)}">${fmtNum(d.saldo, 0)} €</span>
      </div>`
    )
    .join("");

  // Budgets
  const budgets = loadBudgets();
  const keys = Object.keys(budgets).filter((k) => budgets[k] > 0);
  const totalBudget = keys.reduce((s, k) => s + budgets[k], 0);
  const spentBudgeted = keys.reduce((s, k) => s + (byCat[k] || 0), 0);
  document.getElementById("budgetSub").textContent = totalBudget
    ? `${fmtEUR(spentBudgeted)} / ${fmtEUR(totalBudget)}`
    : "";

  document.getElementById("budgetList").innerHTML = keys.length
    ? keys
        .sort((a, b) => (byCat[b] || 0) / budgets[b] - (byCat[a] || 0) / budgets[a])
        .map((k) => {
          const cat = catInfo(k);
          const spent = byCat[k] || 0;
          const pct = (spent / budgets[k]) * 100;
          const over = spent > budgets[k];
          return `<div class="cat-row" data-cat="${k}">
            <div class="cat-top">
              <span>${esc(cat.label)}</span>
              <span class="cat-amount ${over ? "delta-down" : ""}">${fmtEUR(spent)} / ${fmtEUR(budgets[k])}
                <button type="button" class="budget-del" title="Budget entfernen">✕</button></span>
            </div>
            <div class="fin-bar"><div class="fin-bar-fill" style="width:${Math.min(100, pct)}%;background:${over ? "#f87171" : cat.color}"></div></div>
          </div>`;
        })
        .join("")
    : '<p class="fin-hint">Noch kein Budget gesetzt – wähle unten eine Kategorie und ein Monatslimit.</p>';

  document.querySelectorAll(".budget-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.closest(".cat-row").dataset.cat;
      armDelete(btn, "Weg?", () => {
        const b = loadBudgets();
        delete b[k];
        save(BUDGET_KEY, b);
        toast("Budget entfernt");
        renderAll();
      });
    });
  });
}

/* ---------- Gesamt-Render ---------- */
function renderAll() {
  recordSnapshot();
  renderHeader();
  renderOverview();
  renderDepot();
  renderCashflow();
  renderAnalyse();
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

/* ---------- Depot: Position anlegen ---------- */
document.getElementById("positionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const symbol = document.getElementById("posSymbol").value.trim().toUpperCase();
  const qty = parseFloat(document.getElementById("posQty").value);
  const buy = parseFloat(document.getElementById("posBuy").value);
  if (!symbol || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(buy) || buy < 0) return;

  const positions = loadPositions();
  positions.push({
    id: uid(),
    type: document.getElementById("posType").value,
    symbol,
    name: document.getElementById("posName").value.trim(),
    qty,
    buy,
    currency: document.getElementById("posCurrency").value,
    manual: null,
    added: todayKey(),
  });
  save(POS_KEY, positions);

  e.target.reset();
  document.getElementById("posSymbol").focus();
  toast(`${symbol} hinzugefügt 📈`);
  renderAll();
  refreshPrices(true);
});

document.getElementById("refreshBtn").addEventListener("click", () => refreshPrices());

/* ---------- Positions-Detail ---------- */
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("positionModal").addEventListener("click", (e) => {
  if (e.target.id === "positionModal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

document.getElementById("posEditForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const positions = loadPositions();
  const p = positions.find((x) => x.id === openPositionId);
  if (!p) return;

  const qty = parseFloat(document.getElementById("editQty").value);
  const buy = parseFloat(document.getElementById("editBuy").value);
  const manualRaw = document.getElementById("editManual").value;
  const manual = manualRaw === "" ? null : parseFloat(manualRaw);

  if (Number.isFinite(qty) && qty > 0) p.qty = qty;
  if (Number.isFinite(buy) && buy >= 0) p.buy = buy;
  p.manual = Number.isFinite(manual) ? manual : null;

  save(POS_KEY, positions);
  toast("Position gespeichert");
  renderAll();
  openPosition(p.id);
});

document.getElementById("deletePosition").addEventListener("click", (e) => {
  armDelete(e.target, "Wirklich löschen?", () => {
    save(POS_KEY, loadPositions().filter((p) => p.id !== openPositionId));
    closeModal();
    toast("Position gelöscht");
    renderAll();
  });
});

/* ---------- Cashflow ---------- */
function shiftMonth(delta) {
  const [y, m] = currentMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentMonth = monthKey(d);
  renderCashflow();
  renderAnalyse();
}
document.getElementById("prevMonth").addEventListener("click", () => shiftMonth(-1));
document.getElementById("nextMonth").addEventListener("click", () => shiftMonth(1));

let txType = "aus";
document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    txType = btn.dataset.type;
    fillCategorySelect(document.getElementById("txCategory"), txType);
  });
});

document.getElementById("txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("txAmount").value);
  const date = document.getElementById("txDate").value || todayKey();
  if (!Number.isFinite(amount) || amount <= 0) return;

  const category = document.getElementById("txCategory").value;
  const note = document.getElementById("txNote").value.trim();
  const recurring = document.getElementById("txRecurring").checked;

  if (recurring) {
    const recs = loadRecurring();
    const rec = {
      id: uid(),
      type: txType,
      amount,
      category,
      note,
      day: Number(date.slice(8, 10)),
      startMonth: date.slice(0, 7),
    };
    recs.push(rec);
    save(REC_KEY, recs);
    applyRecurring();
    toast("Dauerauftrag angelegt 🔁");
  } else {
    const tx = loadTx();
    tx.push({ id: uid(), date, type: txType, amount, category, note });
    save(TX_KEY, tx);
    toast(txType === "ein" ? "Einnahme gebucht 💰" : "Ausgabe gebucht 💸");
  }

  document.getElementById("txAmount").value = "";
  document.getElementById("txNote").value = "";
  document.getElementById("txRecurring").checked = false;
  currentMonth = date.slice(0, 7);
  renderAll();
});

/* ---------- Budgets & Einstellungen ---------- */
document.getElementById("budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const cat = document.getElementById("budgetCategory").value;
  const limit = parseFloat(document.getElementById("budgetLimit").value);
  if (!Number.isFinite(limit) || limit <= 0) return;

  const budgets = loadBudgets();
  budgets[cat] = limit;
  save(BUDGET_KEY, budgets);
  document.getElementById("budgetLimit").value = "";
  toast("Budget gesetzt 🎯");
  renderAnalyse();
});

document.getElementById("settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const settings = loadSettings();
  const cash = parseFloat(document.getElementById("cashStart").value);
  settings.cashStart = Number.isFinite(cash) ? cash : 0;
  settings.apiKey = document.getElementById("apiKey").value.trim();
  save(SET_KEY, settings);
  toast("Gespeichert ⚙️");
  renderAll();
  if (settings.apiKey) refreshPrices(true);
});

/* ---------- Export / Import ---------- */
const DATA_KEYS = [POS_KEY, TX_KEY, REC_KEY, BUDGET_KEY, SNAP_KEY, SET_KEY];

document.getElementById("exportBtn").addEventListener("click", () => {
  const dump = {};
  DATA_KEYS.forEach((k) => (dump[k] = load(k, null)));
  document.getElementById("dataArea").value = JSON.stringify(dump);
  toast("Export erstellt – Text kopieren");
});

document.getElementById("importBtn").addEventListener("click", (e) => {
  const raw = document.getElementById("dataArea").value.trim();
  if (!raw) {
    toast("Erst einen Export einfügen");
    return;
  }
  armDelete(e.target, "Daten ersetzen?", () => {
    try {
      const dump = JSON.parse(raw);
      DATA_KEYS.forEach((k) => {
        if (dump[k] !== undefined && dump[k] !== null) save(k, dump[k]);
      });
      initForms();
      applyRecurring();
      renderAll();
      toast("Import fertig ✅");
    } catch {
      toast("Das war kein gültiger Export");
    }
  });
});

/* ---------- Init ---------- */
function initForms() {
  const settings = loadSettings();
  document.getElementById("cashStart").value = settings.cashStart || "";
  document.getElementById("apiKey").value = settings.apiKey || "";
  document.getElementById("txDate").value = todayKey();
  fillCategorySelect(document.getElementById("txCategory"), txType);
  document.getElementById("budgetCategory").innerHTML = CATEGORIES.aus
    .map((c) => `<option value="${c.k}">${c.label}</option>`)
    .join("");
}

initForms();
applyRecurring();
renderAll();

// Kurse beim Öffnen frisch holen, wenn der Cache älter als 15 Minuten ist
const prices = loadPrices();
const newest = Math.max(0, ...Object.values(prices).map((p) => p.ts || 0));
if (loadPositions().length) {
  if (Date.now() - newest > 15 * 60 * 1000) {
    refreshPrices(true);
  } else {
    setPriceStatus(
      `Kurse von ${new Date(newest).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
    );
  }
}

// Zurück im Vordergrund? Dann Kurse nachziehen.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const newestTs = Math.max(0, ...Object.values(loadPrices()).map((p) => p.ts || 0));
  if (loadPositions().length && Date.now() - newestTs > 15 * 60 * 1000) refreshPrices(true);
});

/* PWA: Service Worker für Offline-Nutzung (nur über https oder localhost möglich) */
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
