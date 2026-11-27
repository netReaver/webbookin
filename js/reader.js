import * as api from './api.js?v=20261119';
import { byId, element, formatDate, formatSize, on, show, text } from './dom.js?v=20261119';

let opener = null;

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i;

const dialog = () => byId('articleDialog');
const isOpen = () => !dialog().classList.contains('hidden');

const badge = (name) =>
  element('span', 'file__ext', (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'file').toUpperCase());

function renderFiles(files) {
  const box = byId('readerFilesBox');
  const list = byId('readerFiles');
  list.replaceChildren();
  show(box, files.length > 0);

  for (const file of files) {
    const item = element('li', 'file');
    const download = api.fileUrl(file, { download: true });

    if (IMAGE.test(file.type || '') || IMAGE_EXT.test(file.name)) {
      const view = element('a', 'file__thumb');
      view.href = api.fileUrl(file);
      view.target = '_blank';
      view.rel = 'noopener';
      view.setAttribute('aria-label', `Открыть «${file.name}»`);

      const image = element('img');
      image.src = view.href;
      image.alt = file.name;
      image.loading = 'lazy';
      // не загрузилась — остаётся плашка с расширением, скачать всё равно можно
      image.addEventListener('error', () => view.replaceWith(badge(file.name)), { once: true });
      view.append(image);
      item.append(view);
    } else {
      item.append(badge(file.name));
    }

    item.append(
      element('span', 'file__name', file.name),
      element('span', 'file__size', formatSize(file.size))
    );

    const link = element('a', 'btn btn--small', 'Скачать');
    link.href = download;
    link.download = file.name;
    link.rel = 'noopener';
    item.append(link);

    list.append(item);
  }
}

export function openReader(article, { nodeLabel = null } = {}) {
  opener = document.activeElement;

  text(byId('readerTitle'), article.title);

  const meta = byId('readerMeta');
  meta.replaceChildren();
  const date = formatDate(article.updatedAt);
  if (date) meta.append(element('span', 'reader__date', date));
  if (nodeLabel) meta.append(element('span', 'chip', nodeLabel));

  renderFiles(article.files || []);
  text(byId('readerText'), article.content);

  show(dialog(), true);
  document.documentElement.classList.add('modal-open');
  dialog().querySelector('.modal__box').scrollTop = 0;
  byId('readerClose').focus();
}

export function closeReader() {
  if (!isOpen()) return;

  show(dialog(), false);
  document.documentElement.classList.remove('modal-open');
  opener?.focus?.();
  opener = null;
}

export function bindReader() {
  on(byId('readerClose'), 'click', closeReader);

  on(dialog(), 'click', (event) => {
    if (event.target === dialog()) closeReader();
  });

  on(document, 'keydown', (event) => {
    if (!isOpen()) return;

    if (event.key === 'Escape') {
      closeReader();
      return;
    }

    if (event.key !== 'Tab') return;

    // фокус не должен уходить на страницу под окном
    const items = [...dialog().querySelectorAll('button, a[href]')].filter((el) => !el.closest('.hidden'));
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
