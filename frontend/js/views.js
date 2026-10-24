import {
  CONFIG, STATUS, esc, fmtTenge, fmtNum, fmtCo2, fmtKg, daysLabel, plural, sortByUrgency, iconFor,
} from './config.js';
import { S, view, isEmptyAccount, impactSeries } from './store.js';
import {
  icon, Badge, Card, EmptyState, ErrorState, LoadingState, Skeleton, ItemCard,
} from './ui.js';

const demo = () => S.mode === 'demo';

/* ================= Главная ================= */
function kpiCards(stats, items) {
  const riskCount = items.filter((i) => i.status !== 'fresh').length;
  const tag = demo() ? '<span class="kpi-tag">демо</span>' : '';
  return `<div class="kpis">
    <div class="kpi">
      <p class="kpi-label">Сэкономлено денег ${tag}</p>
      <p class="kpi-value"><span data-key="k-saved" data-count="${stats.saved_tenge}">0</span>&nbsp;₸</p>
      <p class="kpi-note">${fmtNum(stats.items_saved_count)} ${plural(stats.items_saved_count, 'продукт съеден', 'продукта съедено', 'продуктов съедено')} вовремя</p>
    </div>
    <div class="kpi kpi-risk">
      <p class="kpi-label">Продукты под риском ${tag}</p>
      <p class="kpi-value"><span data-key="k-risk" data-count="${stats.at_risk_tenge}">0</span>&nbsp;₸</p>
      <p class="kpi-note">${riskCount} ${plural(riskCount, 'позиция требует', 'позиции требуют', 'позиций требуют')} внимания</p>
    </div>
    <div class="kpi">
      <p class="kpi-label">CO₂-экв. предотвращено ${tag}</p>
      <p class="kpi-value"><span data-key="k-co2" data-count="${stats.co2_saved_kg}" data-dec="1">0</span>&nbsp;<small>кг</small></p>
      <p class="kpi-note">Оценка, <a href="#/impact">как считаем</a></p>
    </div>
  </div>`;
}

export function homeView() {
  const { items, stats } = view();
  const hero = `<section class="hero">
    <h1>Твой холодильник. Меньше отходов. Больше экономии</h1>
    <p class="lead">Следи за сроками годности, используй продукты вовремя и придумывай блюда из того, что уже есть дома.</p>
    <div class="hero-actions">
      <button class="btn btn-primary btn-lg" data-action="start-demo">${icon('play', 18)} Запустить демо</button>
      <button class="btn btn-secondary btn-lg" data-action="open-add">${icon('plus', 18)} Добавить продукт</button>
      <a class="btn btn-secondary btn-lg" href="#/scan">${icon('scan', 18)} Сканировать чек</a>
    </div>
  </section>`;

  if (!demo() && S.live.status === 'loading') return `${hero}${Skeleton(3, 'sk-kpi')}${Skeleton(3)}`;
  if (!demo() && S.live.status === 'error') return `${hero}${Card(ErrorState(S.live.error, 'reload'))}`;
  if (!demo() && S.live.status === 'idle') return `${hero}${Skeleton(3, 'sk-kpi')}`;

  if (isEmptyAccount()) {
    return `${hero}${Card(EmptyState({
      emoji: '🧺', title: 'Холодильник пока пуст',
      text: 'Добавьте первый продукт, загрузите фото чека — или посмотрите, как всё работает, на демо-данных.',
      actions: `<button class="btn btn-primary" data-action="open-add">Добавить продукт</button>
                <a class="btn btn-secondary" href="#/scan">Сканировать чек</a>
                <button class="btn btn-ghost" data-action="start-demo">Запустить демо</button>`,
    }))}`;
  }

  const first = sortByUrgency(items.filter((i) => i.status !== 'fresh')).slice(0, 3);
  const rec = S.recipe.status === 'ready' ? S.recipe.data : null;
  return `${hero}${kpiCards(stats, items)}
    <div class="two-col">
      <section class="block">
        <div class="block-head"><h2>Что съесть первым</h2><a href="#/fridge" class="link">Весь холодильник →</a></div>
        ${first.length
    ? `<div class="stack">${first.map((i) => ItemCard(i, { pending: S.pending.has(i.id), compact: true })).join('')}</div>`
    : Card(EmptyState({ emoji: '✅', title: 'Срочных продуктов нет', text: 'Все продукты свежие — отличная работа.' }))}
      </section>
      <section class="block">
        <div class="block-head"><h2>AI Zero-Waste Chef</h2></div>
        ${rec ? `<a class="card recipe-teaser" href="#/chef">
            <span class="teaser-emoji" aria-hidden="true">${rec.emoji}</span>
            <span><strong>${esc(rec.title)}</strong><small class="muted">${rec.cooking_time_min} мин · ${esc(rec.difficulty)}${rec.source === 'local' ? ' · локальный демо-рецепт' : ''}</small></span>
          </a>`
    : Card(EmptyState({ emoji: '🍳', title: 'Что приготовить сегодня?', text: 'Подберём блюдо из продуктов, которые скоро испортятся.', actions: '<a class="btn btn-primary" href="#/chef">Приготовить из моих продуктов</a>' }))}
      </section>
    </div>`;
}

/* ================= Холодильник ================= */
const FILTERS = [['all', 'Все'], ['urgent', 'Срочно'], ['warning', 'Скоро'], ['fresh', 'Свежие']];

export function fridgeFilteredItems() {
  const { items } = view();
  const q = S.query.trim().toLowerCase();
  return sortByUrgency(items).filter((i) => (S.filter === 'all' || i.status === S.filter) && (!q || i.name.toLowerCase().includes(q)));
}

export function fridgeChips() {
  const { items, counts } = view();
  const total = items.length;
  return FILTERS.map(([key, label]) => {
    const n = key === 'all' ? total : counts[key];
    return `<button class="chip-btn ${S.filter === key ? 'is-active' : ''}" data-action="filter" data-filter="${key}" aria-pressed="${S.filter === key}">
      ${label} <span class="chip-count">${n}</span></button>`;
  }).join('');
}

export function fridgeList() {
  const { items } = view();
  if (!demo() && S.live.status === 'loading') return Skeleton(6);
  if (!demo() && S.live.status === 'error') return ErrorState(S.live.error, 'reload');
  if (items.length === 0) {
    return EmptyState({
      emoji: '🧊', title: 'В холодильнике пока ничего нет', text: 'Добавьте продукт вручную или загрузите фото чека.',
      actions: `<button class="btn btn-primary" data-action="open-add">Добавить продукт</button><a class="btn btn-secondary" href="#/scan">Сканировать чек</a>`,
    });
  }
  const list = fridgeFilteredItems();
  if (list.length === 0) {
    return EmptyState({
      emoji: '🔍', title: 'Ничего не найдено', text: 'Попробуйте изменить запрос или фильтр.',
      actions: '<button class="btn btn-secondary" data-action="reset-filters">Сбросить фильтры</button>',
    });
  }
  return `<div class="grid-items">${list.map((i) => ItemCard(i, { pending: S.pending.has(i.id) })).join('')}</div>`;
}

export function fridgeView() {
  return `<div class="page-head">
      <div><h1>Умный холодильник</h1><p class="muted">Сроки считаются автоматически: ≤ 1 дня — срочно, 2–3 дня — скоро, дольше — свежие.</p></div>
      <button class="btn btn-primary" data-action="open-add">${icon('plus', 18)} Добавить продукт</button>
    </div>
    <div class="toolbar">
      <div class="search">
        ${icon('search', 18)}
        <label class="sr-only" for="search-input">Поиск по названию</label>
        <input id="search-input" type="search" placeholder="Поиск по названию" value="${esc(S.query)}" autocomplete="off" />
      </div>
      <div class="chips" id="fridge-chips" role="group" aria-label="Фильтр по статусу">${fridgeChips()}</div>
    </div>
    <div id="fridge-list" aria-live="polite">${fridgeList()}</div>`;
}

/* ================= Сканирование ================= */
export const scan = {
  phase: 'idle', file: null, previewUrl: '', error: '', result: null, candidates: [], selected: new Set(),
};
export function resetScan() {
  if (scan.previewUrl) URL.revokeObjectURL(scan.previewUrl);
  Object.assign(scan, { phase: 'idle', file: null, previewUrl: '', error: '', result: null, candidates: [], selected: new Set() });
}

export function validateFile(file) {
  if (!CONFIG.ALLOWED_TYPES.includes(file.type)) return 'Поддерживаются только изображения JPG, PNG или WebP.';
  if (file.size > CONFIG.MAX_FILE_MB * 1024 * 1024) return `Файл слишком большой. Максимум ${CONFIG.MAX_FILE_MB} МБ.`;
  if (file.size === 0) return 'Файл пустой.';
  return '';
}

function scanItemsList(items, { removable }) {
  return `<ul class="review-list">${items.map((i) => `
    <li class="review-row">
      <span class="item-icon" aria-hidden="true">${iconFor(i)}</span>
      <span class="review-main"><strong title="${esc(i.name)}">${esc(i.name)}</strong>
        <small class="muted">${esc(i.category)} · ${fmtKg(i.weight_kg)} · ${daysLabel(i.days_left)}</small></span>
      <span class="review-price">${fmtTenge(i.price_tenge)}</span>
      ${removable ? `<button class="btn btn-ghost btn-sm" data-action="scan-remove" data-id="${esc(i.id)}" aria-label="Удалить ${esc(i.name)}">${icon('trash', 16)}</button>` : ''}
    </li>`).join('')}</ul>`;
}

export function scanView() {
  const head = `<div class="page-head"><div><h1>Сканирование чека</h1>
    <p class="muted">Загрузите фото чека или продуктов — мы предложим список для проверки.</p></div></div>`;

  if (scan.phase === 'error') {
    return `${head}${Card(`<div class="empty empty-error" role="alert"><div class="empty-emoji">⚠️</div><h3>Не получилось обработать фото</h3>
      <p class="muted">${esc(scan.error)}</p>
      <div class="empty-actions"><button class="btn btn-primary" data-action="scan-retry">Попробовать снова</button>
      <button class="btn btn-ghost" data-action="scan-reset">Выбрать другое фото</button></div></div>`)}`;
  }

  if (scan.phase === 'processing') {
    return `${head}${Card(`<div class="scan-processing">
      <div class="preview-wrap scanning"><img src="${scan.previewUrl}" alt="Загруженное фото" /><span class="scan-bar" aria-hidden="true"></span></div>
      ${LoadingState('Распознаём позиции…')}</div>`)}`;
  }

  if (scan.phase === 'review' && demo()) {
    const sel = scan.candidates.filter((c) => scan.selected.has(c.id));
    return `${head}${Card(`
      <div class="notice notice-demo"><strong>Демонстрационный чек.</strong> Это пример товаров, а не результат распознавания вашего фото нейросетью.</div>
      <h2 class="h3">Проверьте товары перед добавлением</h2>
      ${scan.candidates.length === 0
    ? EmptyState({ emoji: '✅', title: 'Все товары демо-чека уже в холодильнике', actions: '<a class="btn btn-primary" href="#/fridge">Перейти в холодильник</a>' })
    : `<ul class="review-list">${scan.candidates.map((c) => `
        <li class="review-row"><label class="check">
          <input type="checkbox" data-action="toggle-candidate" data-id="${c.id}" ${scan.selected.has(c.id) ? 'checked' : ''} />
          <span class="item-icon" aria-hidden="true">${iconFor(c)}</span>
          <span class="review-main"><strong>${esc(c.name)}</strong><small class="muted">${esc(c.category)} · ${fmtKg(c.weight_kg)} · ${daysLabel(c.days_left)}</small></span>
          <span class="review-price">${fmtTenge(c.price_tenge)}</span></label></li>`).join('')}</ul>
        <div class="modal-actions"><button class="btn btn-ghost" data-action="scan-reset">Отмена</button>
        <button class="btn btn-primary" data-action="demo-receipt-confirm" ${sel.length ? '' : 'disabled'}>Добавить выбранные (${sel.length})</button></div>`}`)}`;
  }

  if (scan.phase === 'review' && scan.result) {
    const r = scan.result;
    const notice = r.recognizedByAi
      ? '<div class="notice notice-ok"><strong>Распознано AI.</strong> Проверьте список и удалите лишнее.</div>'
      : '<div class="notice notice-demo"><strong>AI-ключ на сервере не настроен.</strong> Показан демонстрационный набор товаров — это не результат распознавания вашего фото.</div>';
    const items = view().items.filter((i) => r.addedIds.has(i.id));
    return `${head}${Card(`${notice}
      <h2 class="h3">Добавлено в холодильник${r.store ? ` · ${esc(r.store)}` : ''}</h2>
      ${items.length ? scanItemsList(items, { removable: true }) : '<p class="muted">Все добавленные позиции удалены.</p>'}
      <div class="modal-actions"><button class="btn btn-ghost" data-action="scan-reset">Загрузить ещё</button>
      <a class="btn btn-primary" href="#/fridge">Всё верно — в холодильник</a></div>`)}`;
  }

  if (scan.phase === 'ready') {
    return `${head}${Card(`<div class="scan-ready">
      <div class="preview-wrap"><img src="${scan.previewUrl}" alt="Предварительный просмотр фото" /></div>
      <div class="scan-info">
        <p><strong>${esc(scan.file.name)}</strong></p>
        <p class="muted">${(scan.file.size / 1024 / 1024).toFixed(2)} МБ</p>
        <div class="empty-actions left">
          <button class="btn btn-primary" data-action="scan-run">Распознать</button>
          <button class="btn btn-ghost" data-action="scan-reset">Выбрать другое</button>
        </div></div></div>`)}`;
  }

  // idle
  if (demo()) {
    return `${head}${Card(EmptyState({
      emoji: '🧾', title: 'Демо-чек Magnum',
      text: 'В демо-режиме распознавание реальных фото отключено, чтобы не смешивать демо и ваши данные. Выйдите из демо, чтобы загрузить фото.',
      actions: '<button class="btn btn-primary" data-action="demo-receipt">Показать демо-чек</button><button class="btn btn-ghost" data-action="exit-demo">Выйти из демо</button>',
    }))}`;
  }
  return `${head}
    <label class="dropzone" id="dropzone" for="file-input">
      <span class="dropzone-icon">${icon('upload', 28)}</span>
      <strong>Перетащите фото чека сюда или выберите файл</strong>
      <span class="muted">JPG, PNG или WebP, до ${CONFIG.MAX_FILE_MB} МБ</span>
      <span class="btn btn-primary">Выбрать фото</span>
      <input id="file-input" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" />
    </label>
    <p class="field-error visible-error" id="scan-error" role="alert">${esc(scan.error)}</p>
    <p class="muted center">Нет чека под рукой? <button class="link-btn" data-action="start-demo-scan">Попробуйте демо-чек</button></p>`;
}

/* ================= AI-шеф ================= */
export function chefView() {
  const { items } = view();
  const prior = sortByUrgency(items.filter((i) => i.status !== 'fresh')).slice(0, 6);
  const r = S.recipe;
  let body;
  if (r.status === 'loading') {
    body = Card(LoadingState('Шеф подбирает блюдо из ваших продуктов…') + Skeleton(1, 'sk-recipe'));
  } else if (r.status === 'error') {
    body = Card(ErrorState(r.error, 'generate-recipe'));
  } else if (r.status === 'empty') {
    body = Card(EmptyState({
      emoji: '🥕', title: items.length ? 'Не нашли подходящий рецепт' : 'Нужны продукты для рецепта',
      text: items.length ? 'Из текущих продуктов пока не получается собрать блюдо. Добавьте ещё несколько.' : 'Холодильник пуст. Добавьте продукты, и мы предложим блюдо.',
      actions: '<button class="btn btn-primary" data-action="open-add">Добавить продукт</button>',
    }));
  } else if (r.status === 'ready') {
    body = recipeCard(r.data);
  } else {
    body = Card(EmptyState({ emoji: '👩‍🍳', title: 'Готовы приготовить?', text: 'Нажмите кнопку — шеф начнёт с продуктов, которые портятся первыми.' }));
  }
  return `<div class="page-head"><div><h1>AI Zero-Waste Chef</h1>
      <p class="muted">Рецепты из продуктов с высоким приоритетом использования.</p></div>
      <button class="btn btn-primary btn-lg" data-action="generate-recipe" ${r.status === 'loading' ? 'disabled aria-busy="true"' : ''}>${icon('chef', 18)} Приготовить из моих продуктов</button></div>
    ${prior.length ? `<p class="priority"><span class="muted">В приоритете:</span> ${prior.map((i) => `<span class="pill pill-${i.status}">${esc(i.name)}</span>`).join('')}</p>` : ''}
    ${body}`;
}

function recipeCard(rec) {
  const { items } = view();
  const fridgeUsed = items.filter((i) => rec.fridge_item_ids.includes(i.id));
  const source = {
    local: ['notice-demo', '<strong>Локальный демо-рецепт.</strong> Подобран из подготовленного каталога, а не сгенерирован нейросетью.'],
    ai: ['notice-ok', '<strong>Рецепт сгенерирован AI.</strong>'],
    'server-fallback': ['notice-demo', '<strong>AI-ключ на сервере не настроен.</strong> Это рецепт из встроенного шаблона, а не ответ нейросети.'],
  }[rec.source];
  return `<article class="card recipe">
    <div class="notice ${source[0]}">${source[1]}</div>
    <div class="recipe-head">
      <div class="recipe-art" aria-hidden="true">${rec.emoji}</div>
      <div>
        <h2>${esc(rec.title)}</h2>
        <p class="recipe-meta"><span>${icon('clock', 16)} ${rec.cooking_time_min} мин</span><span>Сложность: ${esc(rec.difficulty)}</span>${rec.rescued_count ? `<span>${icon('leaf', 16)} Спасёт ${rec.rescued_count} ${plural(rec.rescued_count, 'продукт', 'продукта', 'продуктов')}</span>` : ''}</p>
        <div class="pills">${rec.used_ingredients.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="recipe-body">
      <div>
        <h3>Из вашего холодильника</h3>
        ${fridgeUsed.length ? `<ul class="plain-list">${fridgeUsed.map((i) => `<li>${Badge(i.status)} <span>${esc(i.name)}</span><small class="muted">${daysLabel(i.days_left)}</small></li>`).join('')}</ul>` : '<p class="muted">Ингредиенты подобраны по общему списку продуктов.</p>'}
        <div class="saving"><div><span class="muted">Сохраним</span><strong>${fmtTenge(rec.money_saved_tenge || 0)}</strong></div>
          <div><span class="muted">CO₂-экв., оценка</span><strong>${fmtCo2(rec.co2_prevented_kg || 0)} кг</strong></div></div>
      </div>
      <div>
        <h3>Пошаговый рецепт</h3>
        <ol class="steps">${rec.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${rec.eco_tip ? `<p class="tip">${icon('leaf', 16)} ${esc(rec.eco_tip)}</p>` : ''}
      </div>
    </div></article>`;
}

/* ================= Эко-эффект ================= */
function chartSvg(series, metric) {
  const vals = series.map((d) => (metric === 'saved' ? d.saved : d.co2));
  const max = Math.max(...vals, 0);
  if (max === 0) return '';
  const W = 640, H = 240, padB = 30, padT = 22, bw = 54, gap = (W - bw * 7) / 8;
  const bars = series.map((d, i) => {
    const v = vals[i];
    const h = Math.max(v > 0 ? 3 : 0, (v / max) * (H - padB - padT));
    const x = gap + i * (bw + gap), y = H - padB - h;
    const label = metric === 'saved' ? fmtNum(v) : fmtCo2(v);
    return `<g><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="6" class="bar"/>
      ${v > 0 ? `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="bar-val">${label}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="bar-lbl">${esc(d.label)}</text></g>`;
  }).join('');
  const desc = series.map((d, i) => `${d.label}: ${metric === 'saved' ? fmtTenge(vals[i]) : fmtCo2(vals[i]) + ' кг'}`).join('; ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="График за 7 дней. ${esc(desc)}"><line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" class="axis"/>${bars}</svg>`;
}

export const impactState = { metric: 'saved' };

export function chartBlock() {
  const series = impactSeries();
  const svg = chartSvg(series, impactState.metric);
  return svg || EmptyState({ emoji: '📈', title: 'Пока нет данных за неделю', text: 'Отметьте продукты как «Съели» — график появится здесь.', actions: '<a class="btn btn-secondary" href="#/fridge">В холодильник</a>' });
}

export function impactView() {
  const { items, counts, stats } = view();
  const total = items.length;
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const tag = demo() ? '<span class="kpi-tag">демо</span>' : '';
  return `<div class="page-head"><div><h1>Эко-эффект</h1><p class="muted">Сколько вы сохранили и что ещё под риском.</p></div></div>
    <div class="kpis">
      <div class="kpi"><p class="kpi-label">Общая экономия ${tag}</p><p class="kpi-value"><span data-key="i-saved" data-count="${stats.saved_tenge}">0</span>&nbsp;₸</p></div>
      <div class="kpi"><p class="kpi-label">Использовано вовремя ${tag}</p><p class="kpi-value"><span data-key="i-count" data-count="${stats.items_saved_count}">0</span>&nbsp;<small>${plural(stats.items_saved_count, 'продукт', 'продукта', 'продуктов')}</small></p></div>
      <div class="kpi"><p class="kpi-label">CO₂-экв., оценка ${tag}</p><p class="kpi-value"><span data-key="i-co2" data-count="${stats.co2_saved_kg}" data-dec="1">0</span>&nbsp;<small>кг</small></p></div>
    </div>
    <div class="two-col two-col-wide">
      <section class="card">
        <div class="block-head"><h2>Последние 7 дней ${tag}</h2>
          <div class="tabs" role="tablist" aria-label="Показатель графика">
            <button role="tab" class="tab ${impactState.metric === 'saved' ? 'is-active' : ''}" aria-selected="${impactState.metric === 'saved'}" data-action="metric" data-metric="saved">Деньги</button>
            <button role="tab" class="tab ${impactState.metric === 'co2' ? 'is-active' : ''}" aria-selected="${impactState.metric === 'co2'}" data-action="metric" data-metric="co2">CO₂</button>
          </div></div>
        <div id="chart-block">${chartBlock()}</div>
        <p class="field-hint">${demo() ? 'Демонстрационный ряд данных.' : 'График строится по действиям «Съели», сделанным в этом браузере.'}</p>
      </section>
      <section class="card">
        <h2>Продукты сейчас</h2>
        ${total ? `<div class="stackbar" role="img" aria-label="Срочно: ${counts.urgent}, скоро: ${counts.warning}, свежие: ${counts.fresh}">
          <span class="seg seg-urgent" style="width:${pct(counts.urgent)}%"></span><span class="seg seg-warning" style="width:${pct(counts.warning)}%"></span><span class="seg seg-fresh" style="width:${pct(counts.fresh)}%"></span></div>` : '<p class="muted">Холодильник пуст.</p>'}
        <ul class="legend">${['urgent', 'warning', 'fresh'].map((k) => `<li><span class="dot dot-${k}"></span>${STATUS[k].label}<strong>${counts[k]}</strong></li>`).join('')}</ul>
        <p class="muted">Под риском: <strong>${fmtTenge(stats.at_risk_tenge)}</strong></p>
      </section>
    </div>
    <details class="card method">
      <summary>Как мы считаем</summary>
      <ul class="plain-list">
        <li><strong>Деньги:</strong> сумма цен продуктов, отмеченных «Съели».</li>
        <li><strong>CO₂-экв.:</strong> вес продукта × ${CONFIG.CO2_KG_PER_KG_FOOD} кг CO₂-экв. на 1 кг еды. Это усреднённая <em>оценка</em>, а не научно точное значение: реальный след зависит от типа продукта и способа утилизации.</li>
        <li><strong>Под риском:</strong> сумма цен продуктов со статусами «Срочно» и «Скоро».</li>
        <li><strong>Статусы:</strong> ≤ ${CONFIG.URGENT_MAX_DAYS} дн. — срочно, ≤ ${CONFIG.WARNING_MAX_DAYS} дн. — скоро, иначе свежие.</li>
      </ul>
    </details>`;
}

/* ================= О продукте ================= */
export function aboutView() {
  const steps = [
    ['🧾', 'Добавьте продукты', 'Вручную или по фото чека — с ценой, весом и сроком годности.'],
    ['⏳', 'Следите за сроками', 'Цвет и счётчик дней подскажут, что нужно съесть первым.'],
    ['🍳', 'Готовьте без отходов', 'AI-шеф предложит блюдо из продуктов, которые скоро испортятся.'],
    ['🌱', 'Смотрите эффект', 'Экономия в тенге и оценка предотвращённых выбросов CO₂-экв.'],
  ];
  return `<div class="page-head"><div><h1>Как это работает</h1><p class="muted">EcoFridge AI помогает семьям Астаны выбрасывать меньше еды.</p></div></div>
    <ol class="how">${steps.map(([e, t, d], i) => `<li class="card"><span class="how-n">${i + 1}</span><span class="how-emoji" aria-hidden="true">${e}</span><h3>${t}</h3><p class="muted">${d}</p></li>`).join('')}</ol>
    <section class="card plan" id="pricing">
      <div><span class="kpi-tag">Тариф</span><h2>Семейный Pro · 1 499 ₸/мес</h2>
        <ul class="plain-list"><li>До 6 участников семьи</li><li>AI-распознавание чеков</li><li>Рецепты из срочных продуктов</li><li>Статистика экономии и CO₂-экв.</li></ul>
        <p class="field-hint">Оплата в демо-версии не подключена — тариф показан для ознакомления.</p></div>
      <div class="empty-actions left"><button class="btn btn-primary" data-action="start-demo">${icon('play', 18)} Запустить демо</button></div>
    </section>`;
}
