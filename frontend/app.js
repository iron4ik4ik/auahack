import { CONFIG, esc, fmtTenge } from './js/config.js';
import { onConnection } from './js/api.js';
import {
  S, subscribe, notify, view, loadLive, startDemo, exitDemo, addItem, consume, donate, removeItem,
  generateRecipe, scanFile, demoReceiptCandidates, addDemoReceiptItems,
} from './js/store.js';
import { icon, toast, animateNumbers } from './js/ui.js';
import {
  homeView, fridgeView, fridgeChips, fridgeList, scanView, scan, resetScan, validateFile,
  chefView, impactView, impactState, chartBlock, aboutView,
} from './js/views.js';

const $ = (sel, root = document) => root.querySelector(sel);

const ROUTES = {
  '/': { title: 'Главная', icon: 'home', render: homeView },
  '/fridge': { title: 'Холодильник', icon: 'fridge', render: fridgeView },
  '/scan': { title: 'Скан', icon: 'scan', render: scanView },
  '/chef': { title: 'Рецепты', icon: 'chef', render: chefView },
  '/impact': { title: 'Эффект', icon: 'chart', render: impactView },
  '/about': { title: 'О продукте', icon: 'info', render: aboutView, hideMobile: true },
};
let current = '/';

/* ---------- Каркас ---------- */
function renderNav() {
  const link = (path, r, cls) => `<a href="#${path}" class="${cls} ${path === current ? 'is-active' : ''}" ${path === current ? 'aria-current="page"' : ''}>${icon(r.icon, 20)}<span>${r.title}</span></a>`;
  $('#nav').innerHTML = Object.entries(ROUTES).map(([p, r]) => link(p, r, 'nav-link')).join('');
  $('#bottom-nav').innerHTML = Object.entries(ROUTES).filter(([, r]) => !r.hideMobile).map(([p, r]) => link(p, r, 'bn-link')).join('');
}

function renderBanner() {
  const b = $('#demo-banner');
  b.hidden = S.mode !== 'demo';
  if (S.mode === 'demo') {
    b.innerHTML = `<span><strong>Демо-режим.</strong> Все данные ниже — примеры. Они не сохраняются и не смешиваются с вашими.</span>
      <span class="banner-actions"><button class="btn btn-sm btn-secondary" data-action="start-demo">Перезапустить демо</button>
      <button class="btn btn-sm btn-ghost" data-action="exit-demo">Выйти</button></span>`;
  }
}

let online = null;
function renderStatus() {
  const chip = $('#status-chip');
  let cls = 'chip-muted', text = 'Проверка связи…';
  if (S.mode === 'demo') { cls = 'chip-demo'; text = 'Демо-режим'; }
  else if (online === true) { cls = 'chip-ok'; text = 'API Online'; }
  else if (online === false) { cls = 'chip-bad'; text = 'API Offline'; }
  chip.className = `chip ${cls}`;
  $('#status-text').textContent = text;
}
onConnection((ok) => { if (online !== ok) { online = ok; renderStatus(); } });

/* ---------- Рендер ---------- */
let routeChanged = true;
function render() {
  const route = ROUTES[current] || ROUTES['/'];
  const root = $('#view');
  const scrollY = window.scrollY;
  root.innerHTML = route.render();
  root.classList.toggle('enter', routeChanged);
  animateNumbers(root);
  renderNav();
  renderBanner();
  renderStatus();
  document.title = `${route.title} · EcoFridge AI`;
  if (routeChanged) { root.focus({ preventScroll: true }); window.scrollTo(0, 0); } else window.scrollTo(0, scrollY);
  routeChanged = false;
}

function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (!ROUTES[path]) { location.hash = '#/'; return; }
  if (path !== '/scan' && scan.phase !== 'processing') resetScan();
  current = path;
  routeChanged = true;
  render();
}
window.addEventListener('hashchange', route);
subscribe(() => { if (!scanBusy) render(); });

/* ---------- Диалоги ---------- */
const addDialog = $('#add-dialog');
const addForm = $('#add-form');
const confirmDialog = $('#confirm-dialog');
let submitting = false;

$('#f-category').innerHTML = CONFIG.CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');

function openAdd() {
  addForm.reset();
  clearErrors();
  $('#add-mode-note').textContent = S.mode === 'demo' ? 'Демо-режим: продукт добавится только в демо-данные.' : '';
  if (!addDialog.open) addDialog.showModal();
  $('#f-name').focus();
}
function closeDialog(d) { if (d.open) d.close(); }

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeDialog(e.target.closest('dialog'));
  else if (e.target instanceof HTMLDialogElement) closeDialog(e.target); // клик по затемнению
});

function clearErrors() {
  addForm.querySelectorAll('.field-error').forEach((p) => { p.textContent = ''; });
  addForm.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}
function fieldError(id, input, msg) {
  $(`#${id}`).textContent = msg;
  $(`#${input}`).setAttribute('aria-invalid', 'true');
}

function readAddForm() {
  clearErrors();
  const name = $('#f-name').value.trim();
  const price = $('#f-price').value.trim();
  const weight = $('#f-weight').value.trim();
  const days = $('#f-days').value.trim();
  let bad = null;
  const fail = (err, input, msg) => { fieldError(err, input, msg); bad = bad || input; };
  if (name.length < 2) fail('e-name', 'f-name', 'Введите название (минимум 2 символа).');
  if (price === '' || !/^\d+$/.test(price)) fail('e-price', 'f-price', 'Цена — целое число, не меньше 0.');
  else if (+price > 1000000) fail('e-price', 'f-price', 'Слишком большая цена.');
  if (weight === '' || !(parseFloat(weight) > 0)) fail('e-weight', 'f-weight', 'Вес должен быть больше 0.');
  else if (parseFloat(weight) > 50) fail('e-weight', 'f-weight', 'Максимум 50 кг.');
  if (days === '' || !/^\d+$/.test(days)) fail('e-days', 'f-days', 'Укажите целое число дней, от 0.');
  else if (+days > 365) fail('e-days', 'f-days', 'Не больше 365 дней.');
  if (bad) { $(`#${bad}`).focus(); return null; }
  return { name, category: $('#f-category').value, price_tenge: parseInt(price, 10), weight_kg: parseFloat(weight), days_left: parseInt(days, 10) };
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting) return;
  const data = readAddForm();
  if (!data) return;
  submitting = true;
  const btn = $('#add-submit');
  btn.disabled = true; btn.textContent = 'Добавляем…';
  $('#e-form').textContent = '';
  try {
    await addItem(data);
    closeDialog(addDialog);
    toast(`«${data.name}» добавлен в холодильник`);
  } catch (err) {
    $('#e-form').textContent = err.message;
  } finally {
    submitting = false; btn.disabled = false; btn.textContent = 'Добавить в холодильник';
  }
});

function askConfirm(item) {
  return new Promise((resolve) => {
    $('#confirm-text').textContent = `«${item.name}» будет убран из холодильника.`;
    const onClose = () => { confirmDialog.removeEventListener('close', onClose); resolve(confirmDialog.returnValue === 'ok'); };
    confirmDialog.returnValue = '';
    confirmDialog.addEventListener('close', onClose);
    confirmDialog.showModal();
    $('#confirm-ok').focus();
  });
}

/* ---------- Сканирование ---------- */
let scanBusy = false;

function setFile(file) {
  const err = validateFile(file);
  if (err) { scan.error = err; render(); return; }
  scan.error = '';
  if (scan.previewUrl) URL.revokeObjectURL(scan.previewUrl);
  Object.assign(scan, { file, previewUrl: URL.createObjectURL(file), phase: 'ready' });
  render();
}

async function runScan() {
  if (scanBusy || !scan.file) return;
  scanBusy = true;
  scan.phase = 'processing';
  render();
  try {
    const [res] = await Promise.all([scanFile(scan.file), new Promise((r) => setTimeout(r, 1500))]);
    scan.result = { ...res, addedIds: new Set(res.added.map((i) => i.id)) };
    scan.phase = 'review';
    toast(`Найдено позиций: ${res.added.length}`);
  } catch (err) {
    scan.phase = 'error';
    scan.error = err.message;
  } finally {
    scanBusy = false;
    render();
  }
}

/* ---------- Действия ---------- */
async function guard(fn) {
  try { await fn(); } catch (err) { toast(err.message || 'Что-то пошло не так', 'error'); }
}

const actions = {
  'start-demo': async () => {
    await startDemo();
    toast('Демо запущено: данные — примеры, а не ваши реальные');
    if (current === '/scan') resetScan();
    if (current !== '/' && current !== '/fridge' && current !== '/chef' && current !== '/impact') location.hash = '#/';
  },
  'start-demo-scan': async () => { await startDemo(); location.hash = '#/scan'; },
  'exit-demo': () => { exitDemo(); resetScan(); toast('Вы вернулись к своим данным'); },
  'open-add': openAdd,
  reload: () => loadLive(),
  'generate-recipe': () => generateRecipe(),
  filter: (el) => { S.filter = el.dataset.filter; updateFridge(); },
  'reset-filters': () => { S.filter = 'all'; S.query = ''; const i = $('#search-input'); if (i) i.value = ''; updateFridge(); },
  consume: (el) => guard(async () => {
    const item = await consume(el.dataset.id);
    if (item) toast(item.price_tenge > 0 ? `+${fmtTenge(item.price_tenge)} спасено в семейный бюджет!` : `«${item.name}» съеден — отлично!`);
  }),
  donate: (el) => guard(async () => {
    const item = await donate(el.dataset.id);
    if (item) toast(`🤝 «${item.name}» отправится тем, кому нужнее — не на свалку!`);
  }),
  remove: (el) => guard(async () => {
    const item = view().items.find((i) => i.id === el.dataset.id);
    if (!item) return;
    if (await askConfirm(item)) { await removeItem(item.id); toast(`«${item.name}» удалён`, 'info'); }
  }),
  metric: (el) => { impactState.metric = el.dataset.metric; render(); },
  'scan-run': runScan,
  'scan-retry': () => { if (scan.file) runScan(); else { resetScan(); render(); } },
  'scan-reset': () => { resetScan(); render(); },
  'scan-remove': (el) => guard(async () => { await removeItem(el.dataset.id); }),
  'demo-receipt': () => { scan.candidates = demoReceiptCandidates(); scan.selected = new Set(scan.candidates.map((c) => c.id)); scan.phase = 'review'; render(); },
  'demo-receipt-confirm': () => {
    const chosen = scan.candidates.filter((c) => scan.selected.has(c.id));
    addDemoReceiptItems(chosen);
    toast(`Добавлено товаров: ${chosen.length}`);
    resetScan();
    location.hash = '#/fridge';
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) { if (el.tagName === 'A') return; fn(el); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'file-input' && t.files[0]) setFile(t.files[0]);
  if (t.dataset?.action === 'toggle-candidate') {
    if (t.checked) scan.selected.add(t.dataset.id); else scan.selected.delete(t.dataset.id);
    render();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search-input') { S.query = e.target.value; updateFridge(); }
});

/* Drag-and-drop */
document.addEventListener('dragover', (e) => { const z = e.target.closest?.('#dropzone'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
document.addEventListener('dragleave', (e) => { e.target.closest?.('#dropzone')?.classList.remove('is-over'); });
document.addEventListener('drop', (e) => {
  const z = e.target.closest?.('#dropzone');
  if (!z) return;
  e.preventDefault(); z.classList.remove('is-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function updateFridge() {
  if (current !== '/fridge') { render(); return; }
  $('#fridge-chips').innerHTML = fridgeChips();
  $('#fridge-list').innerHTML = fridgeList();
}

/* ---------- Старт ---------- */
route();
loadLive();
