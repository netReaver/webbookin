import * as api from './api.js?v=20261119';
import { byId, on, setStatus, show, text } from './dom.js?v=20261119';
import {
  applySettings,
  bindPreview,
  mountSwatches,
  normalize,
  settingsFromForm,
  settingsIntoForm,
} from './theme.js?v=20261119';

const KEY = 'emode1k:settings';

/*
 * Два слоя настроек.
 * Общие лежат в Supabase (site_settings) и видны всем. Свои сохраняются в этом
 * браузере вместе с отметкой basedOn — какую версию общих они перекрывают.
 * Когда админ применяет настройки всем, версия общих меняется, отметка не
 * совпадает, и чужие личные настройки сбрасываются сами, без сравнения часов.
 */

function readLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    return data && typeof data === 'object' && data.settings ? data : null;
  } catch {
    return null;
  }
}

function writeLocal(settings, basedOn) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings, basedOn }));
    return true;
  } catch {
    return false;
  }
}

function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно — убирать нечего */
  }
}

export function createSettings({ isAdmin }) {
  let shared = null;      // строка site_settings или null, если её ещё нет
  let sharedKnown = false; // удалось ли вообще получить общие настройки
  let personal = false;    // сейчас применены свои настройки
  let previewing = false;  // на странице показан несохранённый предпросмотр

  const status = (message, error = false) => setStatus(byId('settingsStatus'), message, { error });
  const version = () => shared?.updated_at ?? null;

  function current() {
    const local = readLocal();

    if (local && (!sharedKnown || local.basedOn === version())) {
      return { settings: normalize(local.settings), personal: true };
    }

    if (local) clearLocal(); // общие обновили после того, как свои были сохранены
    return { settings: normalize(shared), personal: false };
  }

  function renderNote() {
    const admin = isAdmin();

    text(
      byId('settingsNote'),
      admin
        ? personal
          ? 'Сейчас у тебя свои настройки, остальные видят общие. «Применить всем» заменит общие.'
          : 'Сейчас общие настройки сайта. «Применить всем» заменит их для всех посетителей.'
        : personal
          ? 'Сейчас твои настройки. Они хранятся только на этом устройстве.'
          : 'Сейчас общие настройки сайта. Свои сохраняются только на этом устройстве.'
    );

    show(byId('saveAllButton'), admin);
    show(byId('resetLocalButton'), personal);
  }

  function apply() {
    const view = current();
    personal = view.personal;
    previewing = false;
    applySettings(view.settings);
    settingsIntoForm(view.settings);
    renderNote();
  }

  async function load() {
    try {
      shared = await api.fetchSettings();
      sharedKnown = true;
      status('');
    } catch (error) {
      status(`Общие настройки не загрузились: ${error.message}`, true);
    }

    apply();
  }

  function saveLocal() {
    const settings = settingsFromForm();

    if (!writeLocal(settings, version())) {
      status('Браузер не дал сохранить настройки (возможно, закрытый режим).', true);
      return;
    }

    personal = true;
    previewing = false;
    applySettings(settings);
    renderNote();
    status('Сохранено на этом устройстве. Остальные посетители видят общие настройки.');
  }

  function resetLocal() {
    clearLocal();
    apply();
    status('Вернул общие настройки.');
  }

  async function saveForAll() {
    if (!isAdmin()) return;

    const button = byId('saveAllButton');
    button.disabled = true;

    try {
      const { stamped } = await api.saveSettings(settingsFromForm());

      clearLocal();
      shared = await api.fetchSettings();
      sharedKnown = true;
      apply();

      status(
        stamped
          ? 'Применено для всех посетителей. Личные настройки у них сброшены.'
          : 'Применено для всех. Миграция 03 не выполнена, поэтому те, кто уже сохранил свои настройки, их сохранят.'
      );
    } catch (error) {
      status(`Ошибка сохранения: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  const onPreview = () => {
    previewing = true;
  };

  mountSwatches({ onPreview });
  bindPreview({ onPreview });

  on(byId('settingsForm'), 'submit', (event) => {
    event.preventDefault();
    saveLocal();
  });
  on(byId('saveAllButton'), 'click', saveForAll);
  on(byId('resetLocalButton'), 'click', resetLocal);

  // ушли со страницы, не сохранив: возвращаем то, что действует на самом деле
  function revert() {
    if (previewing) apply();
  }

  return { load, revert, refreshRole: renderNote };
}
