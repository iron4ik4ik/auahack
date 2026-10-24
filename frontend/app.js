(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = { stats: { saved_tenge: 0, at_risk_tenge: 0, co2_saved_kg: 0, items_saved_count: 0 }, items: [] };
  let filter = 'all';

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {} };
    if (opts.json !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    if (opts.form) init.body = opts.form;
    let res;
    try { res = await fetch(path, init); } catch (e) { setOnline(false); throw new Error('Нет связи с сервером'); }
    setOnline(true);
    if (!res.ok) {
      let msg = 'Ошибка ' + res.status;
      try { const d = await res.json(); if (d.detail) msg = typeof d.detail === 'string' ? d.detail : msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function setOnline(ok) {
    $('api-dot').className = 'w-2 h-2 rounded-full ' + (ok ? 'bg-emerald-500 animate-pulse' : 'bg-red-500');
    $('api-text').textContent = ok ? 'API Online' : 'API Offline';
    $('api-status').className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ' +
      (ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200');
  }

  /* ---------- UI helpers ---------- */
  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4000);
  }

  function countUp(el, to, decimals = 0) {
    const from = parseFloat(el.dataset.v || '0'); el.dataset.v = to;
    if (from === to) { el.textContent = decimals ? to.toFixed(decimals) : fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = from + (to - from) * e;
      el.textContent = decimals ? v.toFixed(decimals) : fmt(v);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    const card = el.closest('.kpi'); card.classList.remove('kpi-bump'); void card.offsetWidth; card.classList.add('kpi-bump');
  }

  const dayWord = (d) => (d <= 0 ? 'Сегодня!' : d === 1 ? '1 день' : (d < 5 ? d + ' дня' : d + ' дней'));
  const badgeText = { urgent: '🔴', warning: '🟡', fresh: '🟢' };

  function render() {
    const s = state.stats;
    countUp($('kpi-saved'), s.saved_tenge);
    countUp($('kpi-risk'), s.at_risk_tenge);
    countUp($('kpi-co2'), s.co2_saved_kg, 1);
    $('kpi-count').textContent = s.items_saved_count;
    const urgentSum = state.items.filter((i) => i.status === 'urgent').reduce((a, i) => a + i.price_tenge, 0);
    $('chef-amount').textContent = fmt(urgentSum || s.at_risk_tenge);

    const list = state.items
      .filter((i) => filter === 'all' || i.status === filter)
      .sort((a, b) => a.days_left - b.days_left);
    $('items-count').textContent = '(' + list.length + ')';
    $('items-grid').innerHTML = list.length ? list.map(card).join('') :
      '<div class="col-span-full text-center py-12 text-slate-400">Здесь пока пусто. Отсканируйте чек — и AI всё добавит ✨</div>';

    renderImpact(s);
  }

  function renderImpact(s) {
    $('impact-saved').textContent = fmt(s.saved_tenge) + ' ₸';
    $('impact-risk').textContent = fmt(s.at_risk_tenge) + ' ₸';
    $('impact-co2').textContent = s.co2_saved_kg.toFixed(1) + ' кг';
    $('impact-count').textContent = s.items_saved_count;
    $('impact-km').textContent = fmt(s.co2_saved_kg * 5);
    $('impact-coffee').textContent = fmt(Math.round(s.saved_tenge / 800));

    const byStatus = { urgent: 0, warning: 0, fresh: 0 };
    state.items.forEach((i) => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
    const total = state.items.length || 1;
    ['urgent', 'warning', 'fresh'].forEach((st) => {
      const pct = Math.round((byStatus[st] / total) * 100);
      $('bar-' + st).style.width = pct + '%';
      $('count-' + st).textContent = byStatus[st];
    });
  }

  function card(i) {
    return `<article class="item-card ${esc(i.status)}" data-id="${esc(i.id)}">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0">
          <h3 class="font-bold truncate">${esc(i.name)}</h3>
          <p class="text-xs text-slate-500 mt-0.5">${esc(i.category)} · ${esc(i.weight_kg)} кг</p>
        </div>
        <span class="badge ${esc(i.status)} whitespace-nowrap">${badgeText[i.status] || ''} ${dayWord(i.days_left)}</span>
      </div>
      <p class="font-display font-extrabold text-2xl mt-3">${fmt(i.price_tenge)} ₸</p>
      <button data-consume="${esc(i.id)}" data-price="${esc(i.price_tenge)}" class="mt-3 w-full py-2.5 rounded-xl font-semibold text-sm bg-emerald-50 text-emerald-700 hover:bg-eco hover:text-white transition">
        ✅ Съели (+${fmt(i.price_tenge)} ₸)</button>
    </article>`;
  }

  async function refresh() {
    try { state = await api('/api/state'); render(); }
    catch (e) { setOnline(false); toast(e.message, 'err'); }
  }

  /* ---------- Scan receipt ---------- */
  const steps = ['Ищем магазин…', 'Распознаём позиции…', 'Определяем сроки годности…', 'Считаем стоимость…'];
  async function scan(payload, isForm) {
    const ov = $('scan-overlay'); ov.classList.remove('hidden');
    let k = 0; $('scan-step').textContent = steps[0];
    const iv = setInterval(() => { k = (k + 1) % steps.length; $('scan-step').textContent = steps[k]; }, 700);
    const minDelay = new Promise((r) => setTimeout(r, 2600));
    try {
      const [res] = await Promise.all([
        api('/api/scan-receipt', { method: 'POST', ...(isForm ? { form: payload } : { json: payload }) }), minDelay]);
      if (res.state) state = res.state; else await refresh();
      render();
      const n = (res.added_items || []).length;
      toast(`🧾 ${res.scanned_store || 'Чек'}: добавлено ${n} продуктов на ${fmt(res.total_receipt_tenge || 0)} ₸`);
    } catch (e) { toast(e.message, 'err'); }
    finally { clearInterval(iv); ov.classList.add('hidden'); }
  }

  $('btn-demo').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    await scan({ demo: true, store: 'Magnum Cash & Carry Астана' }, false);
    b.disabled = false;
  });
  $('file-input').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    await scan(fd, true); ev.target.value = '';
  });

  /* ---------- Manual add ---------- */
  const modal = $('modal');
  const toggleModal = (show) => modal.classList.toggle('hidden', !show);
  $('btn-add').addEventListener('click', () => toggleModal(true));
  $('modal-close').addEventListener('click', () => toggleModal(false));
  modal.addEventListener('click', (e) => { if (e.target === modal) toggleModal(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleModal(false); });

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name').trim(), category: f.get('category'),
      price_tenge: parseInt(f.get('price_tenge'), 10) || 0,
      weight_kg: parseFloat(f.get('weight_kg')) || 0,
      days_left: parseInt(f.get('days_left'), 10) || 0,
    };
    try {
      state = await api('/api/items', { method: 'POST', json: body });
      render(); toggleModal(false); e.target.reset();
      toast('➕ ' + body.name + ' добавлен в холодильник');
    } catch (err) { toast(err.message, 'err'); }
  });

  /* ---------- Filters ---------- */
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = b.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });

  /* ---------- Consume ---------- */
  $('items-grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-consume]'); if (!b) return;
    const price = parseInt(b.dataset.price, 10) || 0, rect = b.getBoundingClientRect();
    b.disabled = true;
    try {
      const newState = await api('/api/consume/' + encodeURIComponent(b.dataset.consume), { method: 'POST' });
      const fl = document.createElement('div');
      fl.className = 'float-money'; fl.textContent = '+' + fmt(price) + ' ₸';
      fl.style.left = rect.left + rect.width / 2 - 40 + 'px'; fl.style.top = rect.top + 'px';
      document.body.appendChild(fl); setTimeout(() => fl.remove(), 1300);
      b.closest('.item-card').classList.add('leaving');
      toast(`🎉 +${fmt(price)} ₸ спасено в семейный бюджет!`);
      setTimeout(() => { state = newState; render(); }, 450);
    } catch (err) { b.disabled = false; toast(err.message, 'err'); }
  });

  /* ---------- Recipe ---------- */
  $('btn-recipe').addEventListener('click', async (ev) => {
    const b = ev.currentTarget, box = $('recipe-box'); b.disabled = true;
    box.innerHTML = '<div class="py-8 text-center"><div class="spinner"></div><p class="mt-4 text-emerald-100">Шеф-повар AI колдует над рецептом…</p></div>';
    try {
      const r = await api('/api/generate-recipe', { method: 'POST' });
      box.innerHTML = recipeHTML(r);
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) { box.innerHTML = ''; toast(err.message, 'err'); }
    b.disabled = false;
  });

  function recipeHTML(r) {
    return `<div class="recipe-card bg-white text-slate-800 rounded-3xl p-6">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <h3 class="font-display font-extrabold text-2xl">${esc(r.title)}</h3>
        <span class="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">⏱ ${esc(r.cooking_time_min)} мин</span>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        ${(r.used_ingredients || []).map((x) => `<span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-100">${esc(typeof x === 'string' ? x : x.name)}</span>`).join('')}
      </div>
      <ol class="mt-5 space-y-3">
        ${(r.steps || []).map((s, n) => `<li class="flex gap-3"><span class="shrink-0 w-7 h-7 rounded-full bg-eco text-white text-sm font-bold grid place-items-center">${n + 1}</span><span class="text-sm pt-0.5">${esc(s)}</span></li>`).join('')}
      </ol>
      <div class="mt-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-center">
        🎉 Это блюдо спасет ${fmt(r.money_saved_tenge || 0)} ₸ и ${esc(r.co2_prevented_kg)} кг CO₂-экв!
      </div>
      ${r.eco_tip ? `<p class="mt-4 text-sm text-slate-600 bg-slate-50 rounded-xl p-3">🌍 <b>Эко-совет:</b> ${esc(r.eco_tip)}</p>` : ''}
    </div>`;
  }

  /* ---------- Tabs ---------- */
  function setTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.tabpanel !== tab));
    try { localStorage.setItem('ecofridge-tab', tab); } catch (_) {}
  }
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  let startTab = 'fridge';
  try { startTab = localStorage.getItem('ecofridge-tab') || 'fridge'; } catch (_) {}
  setTab(startTab);

  refresh();
})();
