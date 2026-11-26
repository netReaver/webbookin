export const byId = (id) => document.getElementById(id);

export const on = (target, type, handler, options) =>
  target.addEventListener(type, handler, options);

export const show = (element, visible = true) =>
  element?.classList.toggle('hidden', !visible);

export const text = (element, value) => {
  if (element) element.textContent = value;
};

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

/** Строка состояния под формой: ошибки красным, остальное обычным цветом. */
export function setStatus(node, message, { error = false } = {}) {
  node.textContent = message;
  node.classList.toggle('status--error', error && Boolean(message));
}
