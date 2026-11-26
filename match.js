/**
 * Поиск статей и связь «узел → статьи». Чистые функции, без DOM:
 * так их проще проверять отдельно от страницы.
 */

const NON_WORD = /[^\p{L}\p{N}]+/u;

export const norm = (value) =>
  String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е');

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ранжирование для поиска по мере набора:
 * 4 — заголовок начинается с запроса (по первой букве — именно этот случай),
 * 3 — с запроса начинается любое слово заголовка,
 * 2 — запрос внутри заголовка (от 2 букв), 1 — запрос в тексте (от 3 букв).
 * Одна буква — это строго первая буква заголовка; слова изнутри и текст не берём,
 * иначе в выдаче окажется вся база.
 */
export function rankArticles(list, query) {
  const q = norm(query).trim();
  if (!q) return [];

  const scored = [];

  for (const article of list) {
    const title = norm(article.title);
    let score = 0;

    if (title.startsWith(q)) score = 4;
    else if (q.length >= 2 && title.split(NON_WORD).some((word) => word.startsWith(q))) score = 3;
    else if (q.length >= 2 && title.includes(q)) score = 2;
    else if (q.length >= 3 && norm(article.content).includes(q)) score = 1;

    if (score) scored.push({ article, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, 'ru')
  );

  return scored.map((item) => item.article);
}

/**
 * Статьи узла: сначала привязанные явно (articles.node_id), затем те, у кого
 * название узла встречается в заголовке. Основа слова режется на последнюю
 * букву, чтобы «Осинт» находил «Азбуку осинта», а «Работа» — «Работу удалённо».
 */
export function relatedTo(node, list) {
  if (!node) return [];

  const linked = list.filter((article) => article.nodeId === node.id);
  const label = norm(node.label).trim();
  if (label.length < 3) return linked;

  const stem = label.length >= 5 ? label.slice(0, -1) : label;
  const tail = label.length >= 5 ? '' : '(?:$|[^\\p{L}\\p{N}])';
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(stem)}${tail}`, 'u');

  const linkedIds = new Set(linked.map((article) => article.id));
  const mentioned = list.filter(
    (article) => !linkedIds.has(article.id) && pattern.test(norm(article.title))
  );

  return [...linked, ...mentioned];
}
