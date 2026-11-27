import { SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAIL } from './config.js?v=20261119';

let client = null;

export function connect() {
  if (!window.supabase?.createClient) {
    throw new Error('Не удалось загрузить supabase-js');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

const toNode = (row) => ({
  id: row.id,
  parent: row.parent_id,
  label: row.label,
  info: row.info || '',
});

// запись о файле без имени или пути (ручная правка базы) не должна ронять страницу
const cleanFiles = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((file) => file && typeof file.path === 'string' && file.path && typeof file.name === 'string')
    .map((file) => ({ name: file.name, path: file.path, size: Number(file.size) || 0, type: file.type || '' }));

const toArticle = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content || '',
  updatedAt: row.updated_at,
  nodeId: row.node_id ?? null,
  files: cleanFiles(row.attachments),
});

// Колонки articles.node_id / attachments появляются миграцией. Пока её нет, сайт
// работает как раньше, а при попытке их записать говорит, что делать.
const known = { node_id: null, attachments: null };

function explain(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;

  if (/PGRST204|42703|schema cache|column/i.test(text) && /node_id|attachments|updated_at/.test(text)) {
    return new Error('В базе не хватает колонок. Выполни SQL из папки supabase/migrations (по порядку номеров).');
  }

  return error;
}

export async function fetchNodes() {
  const { data, error } = await client
    .from('nodes')
    .select('id,parent_id,label,info')
    .order('label');

  if (error) throw error;
  return (data || []).map(toNode);
}

export async function fetchArticles() {
  const { data, error } = await client
    .from('articles')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = data || [];
  if (rows.length) {
    known.node_id = 'node_id' in rows[0];
    known.attachments = 'attachments' in rows[0];
  }

  return rows.map(toArticle);
}

export async function fetchSettings() {
  const { data, error } = await client
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// updated_at — версия общих настроек (миграция 03). Без колонки сохраняем как раньше.
export async function saveSettings(settings) {
  const table = client.from('site_settings');
  let { error } = await table.upsert({ id: 1, ...settings, updated_at: new Date().toISOString() });

  if (error && /updated_at/.test(String(error.message))) {
    ({ error } = await client.from('site_settings').upsert({ id: 1, ...settings }));
    if (error) throw error;
    return { stamped: false };
  }

  if (error) throw error;
  return { stamped: true };
}

export async function insertNode({ id, parent, label, info }) {
  const { error } = await client
    .from('nodes')
    .insert({ id, parent_id: parent, label, info });

  if (error) throw error;
}

export async function updateNode(id, { label, info }) {
  const { error } = await client
    .from('nodes')
    .update({ label, info })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteNodes(ids) {
  if (!ids.length) return;
  const { error } = await client.from('nodes').delete().in('id', ids);
  if (error) throw error;
}

// Новые колонки пишем, только если они нужны или точно существуют: так сохранение
// статьи без привязки и без файлов работает и до миграции.
const extraColumns = ({ nodeId, files }) => ({
  ...(nodeId || known.node_id ? { node_id: nodeId || null } : {}),
  ...(files?.length || known.attachments ? { attachments: files || [] } : {}),
});

export async function insertArticle({ id, title, content, nodeId = null, files = [] }) {
  const { error } = await client
    .from('articles')
    .insert({ id, title, content, ...extraColumns({ nodeId, files }) });

  if (error) throw explain(error);
}

export async function updateArticle(id, { title, content, nodeId = null, files = [] }) {
  const { error } = await client
    .from('articles')
    .update({ title, content, ...extraColumns({ nodeId, files }), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw explain(error);
}

/* ---------- файлы статей (Supabase Storage, публичный бакет) ---------- */

const BUCKET = 'article-files';
export const FILE_LIMITS = { count: 10, bytes: 25 * 1024 * 1024 };

function explainStorage(error) {
  const text = `${error?.statusCode || ''} ${error?.message || ''}`;

  if (/bucket not found|not found/i.test(text)) {
    return new Error('Хранилище файлов не создано. Выполни миграцию 02 из папки supabase/migrations.');
  }
  if (/row-level security|policy|unauthorized|not authorized|403/i.test(text)) {
    return new Error('Нет прав на загрузку. Войди как администратор и проверь политики из миграции 02.');
  }

  return error;
}

// Параметр download собираем сами: библиотека не экранирует & и # в имени файла,
// и «a&b #1.zip» превращалось в «a».
export function fileUrl(file, { download = false } = {}) {
  const { data } = client.storage.from(BUCKET).getPublicUrl(file.path);
  return download ? `${data.publicUrl}?download=${encodeURIComponent(file.name)}` : data.publicUrl;
}

export async function uploadFiles(articleId, files) {
  const done = [];

  try {
    for (const [index, file] of files.entries()) {
      // в ключе только латиница и цифры: кириллица и пробелы в путях Storage ломают ссылки
      const ext = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin').toLowerCase();
      const path = `${articleId}/${Date.now()}-${index}.${ext}`;

      const { error } = await client.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

      if (error) throw error;
      done.push({ name: file.name, path, size: file.size, type: file.type || '' });
    }
  } catch (error) {
    await removeFiles(done);
    throw explainStorage(error);
  }

  return done;
}

// Чистка вторична: если не удалось, статья всё равно уже сохранена, поэтому не бросаем.
export async function removeFiles(files) {
  const paths = (files || []).map((file) => file.path).filter(Boolean);
  if (!paths.length) return;

  try {
    await client.storage.from(BUCKET).remove(paths);
  } catch (error) {
    console.warn('Не удалось удалить файлы из хранилища', error);
  }
}

export async function deleteArticle(id) {
  const { error } = await client.from('articles').delete().eq('id', id);
  if (error) throw error;
}

export function isAdminSession(session) {
  const email = session?.user?.email;
  return Boolean(email) && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function currentSession() {
  const { data } = await client.auth.getSession();
  return data?.session ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function watchAuth(handler) {
  return client.auth.onAuthStateChange((_event, session) => handler(session));
}
