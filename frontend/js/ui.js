import { esc, STATUS, fmtTenge, fmtKg, daysLabel, iconFor } from './config.js';

/* ---------- Иконки (inline SVG) ---------- */
const PATHS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  fridge: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M9 6v1M9 13v3"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  chef: '<path d="M7 14a4 4 0 1 1 1-7.9A4 4 0 0 1 16 6a4 4 0 0 1 1 8v5H7z"/><path d="M7 17h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19c2-4 5-7 9-9"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
};
export const icon = (name, size = 20) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

/* ---------- Базовые компоненты ---------- */
export const Badge = (status) =>
  `<span class="badge badge-${status}">${STATUS[status].label}</span>`;

export const Card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;

export const EmptyState = ({ emoji = '🌿', title, text = '', actions = '' }) =>
  `<div class="empty">
     <div class="empty-emoji" aria-hidden="true">${emoji}</div>
     <h3>${esc(title)}</h3>
     ${text ? `<p class="muted">${esc(text)}</p>` : ''}
     ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
   </div>`;

export const ErrorState = (message, retryAction) =>
  `<div class="empty empty-error" role="alert">
     <div class="empty-emoji" aria-hidden="true">⚠️</div>
     <h3>Не удалось загрузить данные</h3>
     <p class="muted">${esc(message)}</p>
     <div class="empty-actions"><button class="btn btn-primary" data-action="${retryAction}">${icon('retry', 18)} Повторить</button></div>
   </div>`;

export const LoadingState = (text = 'Загружаем…') =>
  `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${esc(text)}</span></div>`;

export const Skeleton = (n, cls = 'sk-card') =>
  `<div class="skeleton-grid" aria-hidden="true">${Array.from({ length: n }, () => `<div class="${cls} skeleton"></div>`).join('')}</div>`;

/* ---------- Карточка продукта ---------- */
export function ItemCard(item, { pending = false, compact = false } = {}) {
  const priceText = item.price_tenge > 0 ? fmtTenge(item.price_tenge) : 'Цена не указана';
  return `<article class="item item-${item.status}" data-id="${esc(item.id)}">
    <div class="item-top">
      <div class="item-icon" aria-hidden="true">${iconFor(item)}</div>
      <div class="item-main">
        <h3 class="item-name" title="${esc(item.name)}">${esc(item.name)}</h3>
        <p class="item-meta">${esc(item.category)} · ${fmtKg(item.weight_kg)}</p>
      </div>
      ${Badge(item.status)}
    </div>
    <div class="item-info">
      <span class="item-days">${icon('clock', 16)} ${daysLabel(item.days_left)}</span>
      <span class="item-price">${priceText}</span>
    </div>
    <div class="item-actions">
      <button class="btn btn-primary btn-sm" data-action="consume" data-id="${esc(item.id)}" ${pending ? 'disabled aria-busy="true"' : ''}>
        ${icon('check', 16)} Съели${item.price_tenge > 0 && !compact ? ` · +${fmtTenge(item.price_tenge)}` : ''}
      </button>
      ${compact ? '' : `<button class="btn btn-ghost btn-sm" data-action="remove" data-id="${esc(item.id)}" ${pending ? 'disabled' : ''} aria-label="Удалить ${esc(item.name)}">${icon('trash', 16)} Удалить</button>`}
    </div>
  </article>`;
}

/* ---------- Toast ---------- */
export function toast(message, type = 'success') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  const close = () => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', close);
  setTimeout(close, type === 'error' ? 6000 : 4000);
}

/* ---------- Count-up для KPI (уважает reduced motion) ---------- */
const lastValues = new Map();
export function animateNumbers(root) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count);
    const key = el.dataset.key || el.id;
    const from = lastValues.get(key) ?? 0;
    lastValues.set(key, to);
    const dec = parseInt(el.dataset.dec || '0', 10);
    const fmt = (v) => v.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduce || !isFinite(to) || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
