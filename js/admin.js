import { ROOT_ID } from './config.js?v=20261119';
import * as api from './api.js?v=20261119';
import { byId, on, setStatus, show, text } from './dom.js?v=20261119';
import { descendantsOf, depthOf } from './layout.js?v=20261119';

export function createAdmin({ graph, reloadTree, navigate, onRole }) {
  let isAdmin = false;
  let editingNode = null;

  /* ---------- доступ ---------- */

  function setAdmin(enabled) {
    isAdmin = enabled;
    document.body.dataset.role = enabled ? 'admin' : 'guest';
    document.body.classList.toggle('admin-mode', enabled);

    show(byId('adminPanel'), enabled);
    show(byId('adminNodeActions'), enabled && graph.selectedId !== ROOT_ID);

    text(byId('menuLogoutButton'), enabled ? 'Выйти из профиля' : 'Войти');

    if (!enabled) resetNodeForm();

    graph.render();
    onRole?.(enabled);
  }

  function openLogin() {
    show(byId('loginDialog'), true);
    setStatus(byId('loginStatus'), '');
    byId('emailInput').value = '';
    byId('passwordInput').value = '';
    byId('emailInput').focus();
  }

  function closeLogin() {
    show(byId('loginDialog'), false);
    byId('loginForm').reset();
    setStatus(byId('loginStatus'), '');
  }

  async function handleLogin(event) {
    event.preventDefault();

    const button = byId('loginForm').querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(byId('loginStatus'), '');

    try {
      const session = await api.signIn(byId('emailInput').value.trim(), byId('passwordInput').value);

      if (!api.isAdminSession(session)) {
        await api.signOut();
        setStatus(byId('loginStatus'), 'У этой учётной записи нет прав администратора.', { error: true });
        return;
      }

      closeLogin();
      setAdmin(true);
    } catch (error) {
      setStatus(byId('loginStatus'), error.message, { error: true });
    } finally {
      button.disabled = false;
    }
  }

  async function handleLogout() {
    try {
      await api.signOut();
      setAdmin(false);
      setStatus(byId('adminStatus'), '');
    } catch (error) {
      setStatus(byId('adminStatus'), error.message, { error: true });
    }
  }

  /* ---------- узлы ---------- */

  function resetNodeForm() {
    editingNode = null;
    byId('nodeForm').reset();
    text(byId('nodeFormTitle'), 'Новый узел');
    text(byId('saveNodeButton'), 'Добавить');
    show(byId('cancelNodeButton'), false);
  }

  async function submitNode(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const label = byId('nodeLabel').value.trim();
    const info = byId('nodeInfo').value.trim();
    const button = byId('saveNodeButton');

    if (!label) {
      setStatus(byId('adminStatus'), 'Нужно название.', { error: true });
      return;
    }

    button.disabled = true;
    let savedId = editingNode;

    try {
      if (editingNode) {
        await api.updateNode(editingNode, { label, info });
      } else {
        savedId = `node-${crypto.randomUUID()}`;
        const parent = graph.index.byId.has(graph.selectedId) ? graph.selectedId : ROOT_ID;
        await api.insertNode({ id: savedId, parent, label, info });
      }

      resetNodeForm();
      await reloadTree();
      if (savedId) graph.select(savedId);
      setStatus(byId('adminStatus'), 'Сохранено.');
    } catch (error) {
      setStatus(byId('adminStatus'), error.message, { error: true });
    } finally {
      button.disabled = false;
    }
  }

  function startEditNode() {
    const node = graph.index.byId.get(graph.selectedId);
    if (!isAdmin || !node || node.id === ROOT_ID) return;

    editingNode = node.id;
    byId('nodeLabel').value = node.label;
    byId('nodeInfo').value = node.info || '';
    text(byId('nodeFormTitle'), 'Правка узла');
    text(byId('saveNodeButton'), 'Сохранить');
    show(byId('cancelNodeButton'), true);
    byId('nodeLabel').focus();
  }

  async function removeBranch() {
    const node = graph.index.byId.get(graph.selectedId);
    if (!isAdmin || !node || node.id === ROOT_ID) return;
    if (!confirm(`Удалить «${node.label}» вместе с вложенными узлами?`)) return;

    const ids = [...descendantsOf(node.id, graph.index)];
    const ordered = ids.sort((a, b) => {
      const first = graph.index.byId.get(a);
      const second = graph.index.byId.get(b);
      return depthOf(second || { id: b }, graph.index) - depthOf(first || { id: a }, graph.index);
    });

    try {
      for (const id of ordered) {
        await api.deleteNodes([id]);
        graph.expanded.delete(id);
      }

      graph.selectedId = ROOT_ID;
      await reloadTree();
      graph.select(ROOT_ID);
      setStatus(byId('adminStatus'), 'Ветка удалена.');
    } catch (error) {
      setStatus(byId('adminStatus'), error.message, { error: true });
    }
  }

  /* ---------- связка ---------- */

  on(byId('loginForm'), 'submit', handleLogin);
  on(byId('closeLoginButton'), 'click', closeLogin);
  on(byId('loginDialog'), 'click', (event) => {
    if (event.target === byId('loginDialog')) closeLogin();
  });

  on(byId('nodeForm'), 'submit', submitNode);
  on(byId('cancelNodeButton'), 'click', resetNodeForm);
  on(byId('editNodeButton'), 'click', startEditNode);
  on(byId('deleteNodeButton'), 'click', removeBranch);

  document.querySelectorAll('[data-back]').forEach((button) => {
    on(button, 'click', () => navigate('tree'));
  });

  return {
    setAdmin,
    openLogin,
    logout: handleLogout,
    isAdmin: () => isAdmin,
  };
}
