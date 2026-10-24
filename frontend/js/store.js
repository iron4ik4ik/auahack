import { CONFIG, co2For, normalizeItem, countByStatus, atRiskTenge, iconFor } from './config.js';
import { api, ApiError } from './api.js';
import { generateLocalRecipe } from './recipes.js';

/* ---------- Состояние ---------- */
export const S = {
  mode: 'live', // 'live' | 'demo'
  live: { status: 'idle', stats: null, items: [], error: '' },
  demo: null, // { stats, items, log, nextId }
  recipe: { status: 'idle', data: null, error: '' },
  filter: 'all',
  query: '',
  pending: new Set(),
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); };
export const notify = () => listeners.forEach((fn) => fn());

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Селекторы ---------- */
export function view() {
  const src = S.mode === 'demo' ? S.demo : S.live;
  const items = (src?.items ?? []);
  const raw = src?.stats ?? { saved_tenge: 0, co2_saved_kg: 0, items_saved_count: 0 };
  return {
    items,
    counts: countByStatus(items),
    stats: {
      saved_tenge: raw.saved_tenge,
      co2_saved_kg: raw.co2_saved_kg,
      items_saved_count: raw.items_saved_count,
      at_risk_tenge: atRiskTenge(items), // всегда считается из списка — единая логика
    },
  };
}

export const isEmptyAccount = () => {
  const { items, stats } = view();
  return items.length === 0 && stats.saved_tenge === 0 && stats.items_saved_count === 0;
};

/* ---------- События для графика (только то, что сделано в этом браузере) ---------- */
function readEvents() {
  try { return JSON.parse(localStorage.getItem(CONFIG.EVENTS_KEY) || '[]'); } catch { return []; }
}
function pushEvent(ev) {
  try {
    const list = readEvents();
    list.push(ev);
    localStorage.setItem(CONFIG.EVENTS_KEY, JSON.stringify(list.slice(-500)));
  } catch { /* localStorage недоступен — график просто останется пустым */ }
}

/** Ряд за последние 7 дней: [{label, saved, co2, count}] */
export function impactSeries() {
  const events = S.mode === 'demo' ? S.demo.log : readEvents();
  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days.push({ start: d.getTime(), label: d.toLocaleDateString('ru-RU', { weekday: 'short' }), saved: 0, co2: 0, count: 0 });
  }
  for (const ev of events) {
    const day = [...days].reverse().find((d) => ev.ts >= d.start);
    if (day && ev.ts < day.start + 86400000) { day.saved += ev.price; day.co2 += ev.co2; day.count += 1; }
  }
  return days;
}

/* ---------- Live-режим ---------- */
function setLive(state) {
  S.live.stats = state.stats;
  S.live.items = (state.items || []).map(normalizeItem);
  S.live.status = 'ready';
  S.live.error = '';
}

export async function loadLive() {
  S.live.status = 'loading';
  notify();
  try {
    setLive(await api.getState());
  } catch (e) {
    S.live.status = 'error';
    S.live.error = e.message;
  }
  notify();
}

/* ---------- Демо-режим ---------- */
function buildDemo() {
  const mk = (id, name, category, price_tenge, weight_kg, days_left) => normalizeItem({ id: `demo-${id}`, name, category, price_tenge, weight_kg, days_left });
  const items = [
    mk(1, 'Молоко 2.5%, 1 л', 'Молочные продукты', 680, 1.0, 1),
    mk(2, 'Шпинат свежий', 'Овощи и фрукты', 890, 0.2, 1),
    mk(3, 'Помидоры', 'Овощи и фрукты', 1150, 0.5, 1),
    mk(4, 'Яйца С1, 10 шт', 'Молочные продукты', 750, 0.6, 2),
    mk(5, 'Куриное филе', 'Мясо и птица', 2190, 0.9, 3),
    mk(6, 'Сыр Гауда', 'Молочные продукты', 1890, 0.3, 6),
    mk(7, 'Кефир 1%, 0.9 л', 'Молочные продукты', 620, 0.9, 2),
    mk(8, 'Хлеб зерновой', 'Хлеб и выпечка', 450, 0.4, 5),
  ];
  // Условная история «съеденного вовремя» за неделю — только для демонстрации графика.
  const history = [[6, 1450, 0.8], [5, 0, 0], [4, 2300, 1.1], [3, 890, 0.3], [2, 3100, 1.6], [1, 1200, 0.6], [0, 0, 0]];
  const log = [];
  const now = new Date(); now.setHours(12, 0, 0, 0);
  history.forEach(([ago, price, kg]) => {
    if (price > 0) log.push({ ts: now.getTime() - ago * 86400000, price, co2: co2For(kg) });
  });
  return {
    items,
    log,
    nextId: 100,
    stats: {
      saved_tenge: log.reduce((s, e) => s + e.price, 0),
      co2_saved_kg: Math.round(log.reduce((s, e) => s + e.co2, 0) * 100) / 100,
      items_saved_count: log.length,
    },
  };
}

export async function startDemo() {
  S.demo = buildDemo(); // всегда с нуля — повторный запуск не создаёт дубликатов
  S.mode = 'demo';
  S.filter = 'all';
  S.query = '';
  S.recipe = { status: 'idle', data: null, error: '' };
  notify();
  await generateRecipe();
}

export function exitDemo() {
  S.mode = 'live';
  S.demo = null;
  S.recipe = { status: 'idle', data: null, error: '' };
  notify();
  if (S.live.status === 'idle' || S.live.status === 'error') loadLive();
}

/* ---------- Действия с продуктами ---------- */
export async function addItem(payload) {
  if (S.mode === 'demo') {
    S.demo.items.push(normalizeItem({ ...payload, id: `demo-${S.demo.nextId++}` }));
  } else {
    setLive(await api.addItem(payload));
  }
  notify();
}

/** Возвращает продукт, который «съели», или null (если уже обработан). */
export async function consume(id) {
  if (S.pending.has(id)) return null;
  const { items } = view();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  S.pending.add(id);
  notify();
  try {
    if (S.mode === 'demo') {
      await delay(250);
      S.demo.items = S.demo.items.filter((i) => i.id !== id);
      S.demo.stats.saved_tenge += item.price_tenge;
      S.demo.stats.co2_saved_kg = Math.round((S.demo.stats.co2_saved_kg + co2For(item.weight_kg)) * 100) / 100;
      S.demo.stats.items_saved_count += 1;
      S.demo.log.push({ ts: Date.now(), price: item.price_tenge, co2: co2For(item.weight_kg) });
    } else {
      setLive(await api.consume(id));
      pushEvent({ ts: Date.now(), price: item.price_tenge, co2: co2For(item.weight_kg) });
    }
    return item;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) { await loadLive(); return null; } // уже обработан
    throw e;
  } finally {
    S.pending.delete(id);
    notify();
  }
}

export async function removeItem(id) {
  if (S.pending.has(id)) return false;
  S.pending.add(id);
  notify();
  try {
    if (S.mode === 'demo') S.demo.items = S.demo.items.filter((i) => i.id !== id);
    else setLive(await api.remove(id));
    return true;
  } finally {
    S.pending.delete(id);
    notify();
  }
}

/* ---------- Сканирование ---------- */
const DEMO_RECEIPT = [
  ['Творог 5%, 350 г', 'Молочные продукты', 740, 0.35, 3],
  ['Огурцы тепличные', 'Овощи и фрукты', 780, 0.6, 4],
  ['Сметана 20%', 'Молочные продукты', 590, 0.4, 2],
  ['Форель охлаждённая', 'Рыба', 3200, 0.5, 2],
];
/** Кандидаты демо-чека (ещё не в холодильнике). Уже добавленные не предлагаются повторно. */
export function demoReceiptCandidates() {
  const have = new Set(S.demo.items.map((i) => i.name));
  return DEMO_RECEIPT.filter((r) => !have.has(r[0])).map((r, idx) => ({
    id: `cand-${idx}`, name: r[0], category: r[1], price_tenge: r[2], weight_kg: r[3], days_left: r[4],
  }));
}
export function addDemoReceiptItems(candidates) {
  candidates.forEach((c) => S.demo.items.push(normalizeItem({ ...c, id: `demo-${S.demo.nextId++}` })));
  notify();
}

/** Реальная отправка файла на backend. Backend сразу добавляет позиции в холодильник. */
export async function scanFile(file) {
  const res = await api.scanFile(file);
  if (res.state) setLive(res.state);
  notify();
  return {
    store: res.scanned_store,
    total: res.total_receipt_tenge ?? 0,
    added: (res.added_items || []).map(normalizeItem),
    recognizedByAi: res.recognized_by === 'ai',
  };
}

/* ---------- Рецепт ---------- */
const difficultyFor = (min) => (min <= 20 ? 'Легко' : min <= 35 ? 'Средне' : 'Сложно');

function normalizeRemoteRecipe(r, items) {
  const used = (r.used_ingredients || []).map((x) => (typeof x === 'string' ? x : x.name));
  const matched = items.filter((it) => used.some((u) => it.name.toLowerCase().includes(u.toLowerCase()) || u.toLowerCase().includes(it.name.toLowerCase().split(/[ ,(«]/)[0])));
  const first = matched[0] || { name: r.title, category: '' };
  return {
    title: r.title,
    emoji: iconFor({ name: first.name, category: first.category || '' }),
    cooking_time_min: r.cooking_time_min,
    difficulty: difficultyFor(r.cooking_time_min),
    used_ingredients: used,
    fridge_item_ids: matched.map((i) => i.id),
    rescued_count: matched.filter((i) => i.status !== 'fresh').length,
    money_saved_tenge: r.money_saved_tenge,
    co2_prevented_kg: r.co2_prevented_kg,
    steps: r.steps || [],
    eco_tip: r.eco_tip || '',
    source: r.source === 'ai' ? 'ai' : 'server-fallback',
  };
}

export async function generateRecipe() {
  const { items } = view();
  S.recipe = { status: 'loading', data: null, error: '' };
  notify();
  try {
    if (items.length === 0) {
      S.recipe = { status: 'empty', data: null, error: '' };
    } else if (S.mode === 'demo') {
      await delay(900);
      const data = generateLocalRecipe(items);
      S.recipe = data ? { status: 'ready', data, error: '' } : { status: 'empty', data: null, error: '' };
    } else {
      const raw = await api.generateRecipe();
      S.recipe = { status: 'ready', data: normalizeRemoteRecipe(raw, items), error: '' };
    }
  } catch (e) {
    S.recipe = { status: 'error', data: null, error: e.message };
  }
  notify();
}
