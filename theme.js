import { byId, clamp } from './dom.js?v=20261119';

/** 25 цветов акцента: 24 оттенка по кругу и белый. */
export const PALETTE = [
  { hex: '#ff2929', name: 'Красный' },
  { hex: '#ff4000', name: 'Алый' },
  { hex: '#ff8000', name: 'Оранжевый' },
  { hex: '#ffbf00', name: 'Янтарный' },
  { hex: '#ffff00', name: 'Жёлтый' },
  { hex: '#bfff00', name: 'Лаймовый' },
  { hex: '#80ff00', name: 'Кислотный' },
  { hex: '#40ff00', name: 'Травяной' },
  { hex: '#00ff00', name: 'Зелёный' },
  { hex: '#00ff40', name: 'Изумрудный' },
  { hex: '#00ff80', name: 'Мятный' },
  { hex: '#00ffbf', name: 'Бирюзовый' },
  { hex: '#00ffff', name: 'Циан' },
  { hex: '#33ccff', name: 'Лазурный' },
  { hex: '#3399ff', name: 'Голубой' },
  { hex: '#3366ff', name: 'Синий' },
  { hex: '#5252ff', name: 'Индиго' },
  { hex: '#7d52ff', name: 'Ультрафиолет' },
  { hex: '#a852ff', name: 'Фиолетовый' },
  { hex: '#d452ff', name: 'Пурпурный' },
  { hex: '#ff52ff', name: 'Маджента' },
  { hex: '#ff29c9', name: 'Фуксия' },
  { hex: '#ff2994', name: 'Розовый' },
  { hex: '#ff295e', name: 'Малиновый' },
  { hex: '#ffffff', name: 'Белый' },
];

export const DEFAULTS = {
  accent_color: PALETTE[0].hex,
  theme: 'standard',
  page_scale: 100,
  brightness: 100,
  animations_enabled: true,
};

const HEX = /^#[0-9a-f]{6}$/i;
const number = (value, min, max, fallback) =>
  Number.isFinite(Number(value)) && value !== null && value !== '' ? clamp(Number(value), min, max) : fallback;

/** Что бы ни пришло из базы или localStorage, на страницу попадают только валидные значения. */
export function normalize(raw) {
  const source = raw || {};

  return {
    accent_color: HEX.test(source.accent_color) ? source.accent_color.toLowerCase() : DEFAULTS.accent_color,
    theme: source.theme === 'gothic' ? 'gothic' : 'standard',
    page_scale: number(source.page_scale, 80, 120, DEFAULTS.page_scale),
    brightness: number(source.brightness, 50, 120, DEFAULTS.brightness),
    animations_enabled: source.animations_enabled !== false,
  };
}

const rgbOf = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
};

function paintAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-rgb', rgbOf(hex));
}

export function applySettings(raw) {
  const settings = normalize(raw);
  const root = document.documentElement;

  paintAccent(settings.accent_color);
  root.style.setProperty('--brightness', String(settings.brightness / 100));
  root.style.setProperty('--page-scale', String(settings.page_scale / 100));

  document.body.classList.toggle('theme-gothic', settings.theme === 'gothic');
  document.body.classList.toggle('animations-off', !settings.animations_enabled);
}

/* ---------- выбор цвета ---------- */

function swatchList() {
  return [...byId('swatches').querySelectorAll('.swatch')];
}

function chooseSwatch(hex, { focus = false } = {}) {
  const value = hex.toLowerCase();
  const all = swatchList();
  const match = all.find((swatch) => swatch.dataset.hex === value);

  for (const swatch of all) {
    const active = swatch === match;
    swatch.setAttribute('aria-checked', String(active));
    // в группе радиокнопок в Tab попадает выбранная плитка, а если выбрана «своя» — первая
    swatch.tabIndex = active || (!match && swatch === all[0]) ? 0 : -1;
  }

  byId('accentColor').value = value;

  // цвет из базы может быть не из палитры: плиток всё равно ровно 25, свой цвет — подписью
  byId('accentName').textContent = match
    ? match.dataset.name
    : `Задан свой цвет ${value}, он вне палитры. Выбери один из 25.`;

  if (focus && match) match.focus();
}

function swatchTile({ hex, name }) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'swatch';
  tile.setAttribute('role', 'radio');
  tile.setAttribute('aria-label', name);
  tile.title = name;
  tile.dataset.hex = hex;
  tile.dataset.name = name;
  tile.style.setProperty('--c', hex);
  return tile;
}

export function mountSwatches({ onPreview = () => {} } = {}) {
  const box = byId('swatches');
  box.replaceChildren(...PALETTE.map(swatchTile));

  const pick = (swatch, options) => {
    chooseSwatch(swatch.dataset.hex, options);
    paintAccent(swatch.dataset.hex);
    onPreview();
  };

  box.addEventListener('click', (event) => {
    const swatch = event.target.closest('.swatch');
    if (swatch) pick(swatch);
  });

  // стрелки двигают выбор, как в обычной группе радиокнопок
  box.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;

    event.preventDefault();
    const all = swatchList();
    const index = all.findIndex((swatch) => swatch.getAttribute('aria-checked') === 'true');
    const next = index < 0 ? (step > 0 ? 0 : all.length - 1) : (index + step + all.length) % all.length;
    pick(all[next], { focus: true });
  });
}

/* ---------- форма ---------- */

export function settingsIntoForm(raw) {
  const settings = normalize(raw);

  chooseSwatch(settings.accent_color);
  byId('themeSelect').value = settings.theme;
  byId('pageScale').value = settings.page_scale;
  byId('pageScaleOutput').value = `${settings.page_scale}%`;
  byId('brightness').value = settings.brightness;
  byId('brightnessOutput').value = `${settings.brightness}%`;
  byId('animationsEnabled').checked = settings.animations_enabled;
}

export function settingsFromForm() {
  return normalize({
    accent_color: byId('accentColor').value,
    theme: byId('themeSelect').value,
    page_scale: byId('pageScale').value,
    brightness: byId('brightness').value,
    animations_enabled: byId('animationsEnabled').checked,
  });
}

/** Предпросмотр на лету; сохраняется только по кнопке. */
export function bindPreview({ onPreview = () => {} } = {}) {
  const root = document.documentElement;

  byId('pageScale').addEventListener('input', (event) => {
    byId('pageScaleOutput').value = `${event.target.value}%`;
    root.style.setProperty('--page-scale', Number(event.target.value) / 100);
    onPreview();
  });

  byId('brightness').addEventListener('input', (event) => {
    byId('brightnessOutput').value = `${event.target.value}%`;
    root.style.setProperty('--brightness', Number(event.target.value) / 100);
    onPreview();
  });

  byId('themeSelect').addEventListener('change', (event) => {
    document.body.classList.toggle('theme-gothic', event.target.value === 'gothic');
    onPreview();
  });

  byId('animationsEnabled').addEventListener('change', (event) => {
    document.body.classList.toggle('animations-off', !event.target.checked);
    onPreview();
  });
}
