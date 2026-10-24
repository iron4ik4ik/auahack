import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

const listeners = new Set();
/** Подписка на изменение статуса связи: callback(true|false). */
export const onConnection = (fn) => { listeners.add(fn); };
const emit = (ok) => listeners.forEach((fn) => fn(ok));

async function request(path, { method = 'GET', json, form } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  const init = { method, headers: {}, signal: ctrl.signal };
  if (json !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;

  let res;
  try {
    res = await fetch(path, init);
  } catch (e) {
    emit(false);
    throw new ApiError(e.name === 'AbortError' ? 'Сервер отвечает слишком долго' : 'Нет связи с сервером', { network: true });
  } finally {
    clearTimeout(timer);
  }
  emit(true);

  if (!res.ok) {
    let msg = `Ошибка сервера (${res.status})`;
    try {
      const d = await res.json();
      if (typeof d.detail === 'string') msg = d.detail;
      else if (res.status === 422) msg = 'Сервер не принял введённые данные';
    } catch { /* тело не JSON */ }
    if (res.status === 405 || (res.status === 404 && method === 'DELETE')) msg = 'Эта операция не поддерживается сервером';
    throw new ApiError(msg, { status: res.status });
  }
  return res.json();
}

export const api = {
  getState: () => request('/api/state'),
  addItem: (item) => request('/api/items', { method: 'POST', json: item }),
  consume: (id) => request(`/api/consume/${encodeURIComponent(id)}`, { method: 'POST' }),
  donate: (id) => request(`/api/donate/${encodeURIComponent(id)}`, { method: 'POST' }),
  remove: (id) => request(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  scanFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/scan-receipt', { method: 'POST', form });
  },
  generateRecipe: () => request('/api/generate-recipe', { method: 'POST' }),
};
