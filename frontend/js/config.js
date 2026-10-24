/* Единые константы и формулы. Здесь — единственное место, где считаются статусы, CO₂ и суммы. */

export const CONFIG = {
  /** Оценочный коэффициент (кг CO₂-экв на 1 кг выброшенной еды). Приблизительная оценка, не научный расчёт. */
  CO2_KG_PER_KG_FOOD: 2.5,
  URGENT_MAX_DAYS: 1,
  WARNING_MAX_DAYS: 3,
  MAX_FILE_MB: 8,
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  REQUEST_TIMEOUT_MS: 45000,
  EVENTS_KEY: 'ecofridge.events.v1',
  CATEGORIES: ['Молочные продукты', 'Мясо и птица', 'Овощи и фрукты', 'Хлеб и выпечка', 'Рыба', 'Готовая еда', 'Другое'],
};

export const STATUS = {
  urgent: { label: 'Срочно', hint: 'Использовать сегодня-завтра' },
  warning: { label: 'Скоро', hint: 'Испортится через 2–3 дня' },
  fresh: { label: 'Свежие', hint: 'Есть запас времени' },
};

/** Единственная функция расчёта статуса — совпадает с логикой backend. */
export function statusOf(daysLeft) {
  if (daysLeft <= CONFIG.URGENT_MAX_DAYS) return 'urgent';
  if (daysLeft <= CONFIG.WARNING_MAX_DAYS) return 'warning';
  return 'fresh';
}

export const co2For = (weightKg) => Math.round(weightKg * CONFIG.CO2_KG_PER_KG_FOOD * 100) / 100;

export function normalizeItem(raw) {
  const days = Number(raw.days_left) || 0;
  return {
    id: String(raw.id),
    name: String(raw.name ?? 'Продукт'),
    category: String(raw.category ?? 'Другое'),
    price_tenge: Number(raw.price_tenge) || 0,
    weight_kg: Number(raw.weight_kg) || 0,
    days_left: days,
    status: statusOf(days),
  };
}

export const countByStatus = (items) =>
  items.reduce((acc, it) => { acc[it.status] += 1; return acc; }, { urgent: 0, warning: 0, fresh: 0 });

export const atRiskTenge = (items) =>
  items.filter((i) => i.status !== 'fresh').reduce((s, i) => s + i.price_tenge, 0);

export const sortByUrgency = (items) => [...items].sort((a, b) => a.days_left - b.days_left);

/* ---------- Форматирование ---------- */
export const fmtNum = (n) => Math.round(n).toLocaleString('ru-RU');
export const fmtTenge = (n) => `${fmtNum(n)}\u00a0₸`;
export const fmtKg = (n) => `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}\u00a0кг`;
export const fmtCo2 = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function daysLabel(d) {
  if (d < 0) return 'Просрочен';
  if (d === 0) return 'Истекает сегодня';
  return `${d}\u00a0${plural(d, 'день', 'дня', 'дней')}`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = [
  [/молок|кефир|сметан|йогурт|творог|сливк|сыр|масл/i, '🥛'],
  [/яйц/i, '🥚'],
  [/помидор|томат/i, '🍅'],
  [/шпинат|салат|зелен|укроп|петруш/i, '🥬'],
  [/огур/i, '🥒'],
  [/морков/i, '🥕'],
  [/картоф/i, '🥔'],
  [/кур|индейк/i, '🍗'],
  [/говяд|свинин|мяс|фарш|колбас/i, '🥩'],
  [/рыб|лосос|форел/i, '🐟'],
  [/хлеб|батон|булк/i, '🍞'],
  [/яблок|банан|груш|фрукт|ягод/i, '🍎'],
];
export function iconFor(item) {
  const hay = `${item.name} ${item.category}`;
  const hit = ICONS.find(([re]) => re.test(hay));
  return hit ? hit[1] : '🍽️';
}
