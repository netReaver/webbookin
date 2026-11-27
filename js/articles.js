import * as api from './api.js?v=20261119';
import { ROOT_ID } from './config.js?v=20261119';
import { byId, element, formatDate, formatSize, on, setStatus, show, text } from './dom.js?v=20261119';
import { relatedTo, rankArticles } from './match.js?v=20261119';
import { bindReader, openReader } from './reader.js?v=20261119';

const RESULT_LIMIT = 10;
const RELATED_LIMIT = 8;

const snippet = (value, max = 150) => {
  const flat = String(value).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export function createArticles({ graph, isAdmin, navigate }) {
  let list = [];
  let loaded = false;
  let failure = '';
  let query = '';
  let editing = null;
  let shownNode = null;

  // файлы в редакторе: уже прикреплённые (kept), новые (pending), убранные (removed)
  let kept = [];
  let pending = [];
  let removed = [];

  const nodeLabel = (id) => (id ? graph.index.byId.get(id)?.label ?? null : null);
  const open = (article) => openReader(article, { nodeLabel: nodeLabel(article.nodeId) });

  /* ---------- привязка к узлу (выпадающий список в редакторе) ---------- */

  function syncNodes() {
    const select = byId('articleNode');
    const keep = select.value;
    const seen = new Set();

    select.replaceChildren(new Option('Без привязки', ''));

    const walk = (node, depth) => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      select.append(new Option(`${'— '.repeat(depth)}${node.label}`, node.id));
      for (const child of graph.index.children.get(node.id) || []) walk(child, depth + 1);
    };

    const root = graph.index.byId.get(ROOT_ID);
    if (root) walk(root, 0);

    select.value = [...select.options].some((option) => option.value === keep) ? keep : '';
  }

  /* ---------- статьи узла (под деревом) ---------- */

  function showRelated(node) {
    shownNode = node || null;

    const box = byId('relatedList');
    box.replaceChildren();

    if (failure) {
      box.append(element('p', 'related__empty', `Статьи не загрузились: ${failure}`));
      return;
    }

    if (!loaded) {
      box.append(element('p', 'related__empty', 'Загружаю статьи…'));
      return;
    }

    const items = relatedTo(shownNode, list);

    if (!items.length) {
      box.append(element('p', 'related__empty', 'К этому узлу статей пока нет.'));
      return;
    }

    for (const article of items.slice(0, RELATED_LIMIT)) {
      const row = element('button', 'related__item');
      row.type = 'button';
      row.append(
        element('span', 'related__title', article.title),
        element('span', 'related__date', formatDate(article.updatedAt)),
        element('span', 'related__snippet', snippet(article.content))
      );
      row.addEventListener('click', () => open(article));
      box.append(row);
    }

    if (items.length > RELATED_LIMIT) {
      const more = element('button', 'btn btn--small related__all', `Ещё ${items.length - RELATED_LIMIT} — в каталоге`);
      more.type = 'button';
      more.addEventListener('click', () => navigate('articles'));
      box.append(more);
    }
  }

  /* ---------- каталог ---------- */

  function card(article) {
    const item = element('article', 'article');
    item.append(element('h2', 'article__title', article.title));

    const meta = element('p', 'article__meta');
    const date = formatDate(article.updatedAt);
    if (date) meta.append(element('span', 'article__date', date));
    const linked = nodeLabel(article.nodeId);
    if (linked) meta.append(element('span', 'chip', linked));
    if (article.files.length) meta.append(element('span', 'chip', `Файлов: ${article.files.length}`));
    if (meta.childElementCount) item.append(meta);

    item.append(element('p', 'article__text article__text--preview', article.content));

    const actions = element('div', 'article__actions');

    const more = element('button', 'btn btn--small', 'Открыть полностью');
    more.type = 'button';
    more.addEventListener('click', () => open(article));
    actions.append(more);

    if (isAdmin()) {
      const edit = element('button', 'btn btn--small', 'Изменить');
      edit.type = 'button';
      edit.addEventListener('click', () => startEdit(article));

      const remove = element('button', 'btn btn--small btn--danger', 'Удалить');
      remove.type = 'button';
      remove.addEventListener('click', () => removeArticle(article));

      actions.append(edit, remove);
    }

    item.append(actions);
    return item;
  }

  function renderCatalog() {
    const box = byId('articlesList');
    const count = byId('articleCount');
    box.replaceChildren();
    text(count, '');

    if (failure) {
      box.append(element('p', 'article__empty', `Ошибка загрузки: ${failure}`));
      return;
    }

    if (!loaded) {
      box.append(element('p', 'article__empty', 'Загружаю статьи…'));
      return;
    }

    if (!list.length) {
      box.append(element('p', 'article__empty', 'Статей пока нет.'));
      return;
    }

    const term = query.trim();
    let items = list;

    if (term) {
      const found = rankArticles(list, term);
      items = found.slice(0, RESULT_LIMIT);

      if (!found.length) {
        box.append(element('p', 'article__empty', 'Ничего не нашлось. Попробуй другую букву.'));
        return;
      }

      text(
        count,
        found.length > RESULT_LIMIT
          ? `Показаны первые ${RESULT_LIMIT} из ${found.length}. Допиши ещё букву, чтобы сузить.`
          : `Найдено: ${found.length}`
      );
    }

    for (const article of items) box.append(card(article));
  }

  async function load() {
    try {
      list = await api.fetchArticles();
      failure = '';
      loaded = true;
    } catch (error) {
      failure = error.message;
    }

    syncNodes();
    renderCatalog();
    showRelated(shownNode);
  }

  /* ---------- редактор (только админ) ---------- */

  function resetForm() {
    editing = null;
    kept = [];
    pending = [];
    removed = [];
    byId('articleForm').reset();
    renderFiles();
    text(byId('articleFormHeading'), 'Новая статья');
    text(byId('saveArticleButton'), 'Опубликовать');
    show(byId('cancelArticleButton'), false);
  }

  function startEdit(article) {
    editing = article.id;
    kept = [...article.files];
    pending = [];
    removed = [];
    byId('articleTitle').value = article.title;
    byId('articleContent').value = article.content;
    byId('articleNode').value = article.nodeId && graph.index.byId.has(article.nodeId) ? article.nodeId : '';
    renderFiles();
    text(byId('articleFormHeading'), 'Правка статьи');
    text(byId('saveArticleButton'), 'Сохранить');
    show(byId('cancelArticleButton'), true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- файлы в редакторе ---------- */

  function renderFiles() {
    const box = byId('articleFilesList');
    box.replaceChildren();

    const row = (name, size, label, onRemove) => {
      const item = element('li', 'file file--edit');
      item.append(
        element('span', 'file__ext', (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'file').toUpperCase()),
        element('span', 'file__name', name),
        element('span', 'file__size', `${formatSize(size)}${label ? `, ${label}` : ''}`)
      );

      const button = element('button', 'btn btn--ghost btn--small', 'Убрать');
      button.type = 'button';
      button.addEventListener('click', onRemove);
      item.append(button);
      return item;
    };

    for (const file of kept) {
      box.append(row(file.name, file.size, '', () => {
        kept = kept.filter((entry) => entry !== file);
        removed.push(file);
        renderFiles();
      }));
    }

    for (const file of pending) {
      box.append(row(file.name, file.size, 'новый', () => {
        pending = pending.filter((entry) => entry !== file);
        renderFiles();
      }));
    }
  }

  function pickFiles(event) {
    const status = byId('articleStatus');
    setStatus(status, '');

    for (const file of event.target.files) {
      if (kept.length + pending.length >= api.FILE_LIMITS.count) {
        setStatus(status, `Не больше ${api.FILE_LIMITS.count} файлов на статью.`, { error: true });
        break;
      }
      if (file.size > api.FILE_LIMITS.bytes) {
        setStatus(status, `«${file.name}» весит ${formatSize(file.size)}, лимит — ${formatSize(api.FILE_LIMITS.bytes)}.`, { error: true });
        continue;
      }
      if (pending.some((entry) => entry.name === file.name && entry.size === file.size)) continue;

      pending.push(file);
    }

    event.target.value = '';
    renderFiles();
  }

  async function removeArticle(article) {
    if (!confirm(`Удалить «${article.title}»?`)) return;

    try {
      await api.deleteArticle(article.id);
      await api.removeFiles(article.files);
      await load();
    } catch (error) {
      setStatus(byId('articleStatus'), error.message, { error: true });
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const title = byId('articleTitle').value.trim();
    const content = byId('articleContent').value.trim();
    const nodeId = byId('articleNode').value || null;

    if (!title || !content) {
      setStatus(byId('articleStatus'), 'Нужны заголовок и текст.', { error: true });
      return;
    }

    const button = byId('saveArticleButton');
    button.disabled = true;
    setStatus(byId('articleStatus'), pending.length ? 'Загружаю файлы…' : '');

    let uploaded = [];

    try {
      const id = editing || `article-${crypto.randomUUID()}`;
      uploaded = await api.uploadFiles(id, pending);
      const files = [...kept, ...uploaded];

      if (editing) {
        await api.updateArticle(id, { title, content, nodeId, files });
      } else {
        await api.insertArticle({ id, title, content, nodeId, files });
      }

      // убранные файлы удаляем из хранилища только после того, как статья сохранилась
      await api.removeFiles(removed);

      resetForm();
      setStatus(byId('articleStatus'), 'Статья сохранена.');
      await load();
    } catch (error) {
      await api.removeFiles(uploaded);
      setStatus(byId('articleStatus'), error.message, { error: true });
    } finally {
      button.disabled = false;
    }
  }

  function refreshRole() {
    const admin = isAdmin();
    show(byId('articleEditor'), admin);
    if (!admin) resetForm();
    renderCatalog();
  }

  /* ---------- связка ---------- */

  bindReader();

  on(byId('articleSearch'), 'input', (event) => {
    query = event.target.value;
    renderCatalog();
  });

  on(byId('articleFiles'), 'change', pickFiles);
  on(byId('articleForm'), 'submit', submit);
  on(byId('cancelArticleButton'), 'click', resetForm);

  return { load, showRelated, syncNodes, refreshRole };
}
