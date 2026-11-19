import { create } from 'zustand';
import { applyTheme } from './themes';
import { resolveRequest, buildScope, interpolate } from './utils/vars';
import { runAssertions, runExtractors, newId } from './utils/assertions';
import { translate } from './i18n';

const api = window.api;

const sepOf = (p) => (p && p.includes('\\') && !p.includes('/') ? '\\' : '/');
export const isUnder = (p, dir) => p === dir || (p && p.startsWith(dir + sepOf(dir)));
const basename = (p) => p.split(/[\\/]/).pop();

function loadExpanded() {
  try {
    return JSON.parse(localStorage.getItem('cybersoap.expanded') || '{}');
  } catch (_) {
    return {};
  }
}

let persistTimer = null;

export const useStore = create((set, get) => ({
  ready: false,
  settings: { language: 'en', theme: 'dracula' },
  appInfo: null,
  collections: [],
  tree: [],
  catalogVersion: 0,
  tabs: [],
  activeTab: null,
  docs: {},
  responses: {},
  sending: {},
  metas: {},
  schemas: {},
  runtime: {},
  envs: { globals: [], environments: [] },
  update: null,
  toasts: [],
  modal: null,
  contextMenu: null,
  expanded: loadExpanded(),
  filter: '',

  t(key, params) {
    return translate(get().settings.language, key, params);
  },

  /* ------------------------------------------------------------ init */
  async init() {
    const [settings, appInfo] = await Promise.all([api.getSettings(), api.appInfo()]);
    set({ settings, appInfo });
    applyTheme(settings.theme, settings);
    await get().refresh();
    // restore tabs
    const restore = settings.openTabs || [];
    for (const tab of restore) {
      try {
        if (tab.kind === 'request') await get().openRequest(tab.path, { silent: true });
        else if (tab.kind === 'collection' && get().collections.some((c) => c.path === tab.path)) get().openCollectionSettings(tab.path);
      } catch (_) {
        /* file vanished */
      }
    }
    if (settings.activeTab && get().tabs.some((t) => t.id === settings.activeTab)) set({ activeTab: settings.activeTab });
    set({ ready: true });
  },

  async loadEnvironments() {
    const envs = await api.readEnvironments().catch(() => ({ globals: [], environments: [] }));
    set({ envs });
  },

  async saveEnvironments(envs) {
    const saved = await api.saveEnvironments(envs);
    set({ envs: saved });
    const active = get().settings.activeEnvironment;
    if (active && !saved.environments.some((e) => e.name === active)) await get().updateSettings({ activeEnvironment: null });
    return saved;
  },

  async setActiveEnvironment(name) {
    await get().updateSettings({ activeEnvironment: name || null });
  },

  /** Global variables + active environment, as consumed by buildScope */
  envScope() {
    const { envs, settings } = get();
    return { globals: envs.globals, active: envs.environments.find((e) => e.name === settings.activeEnvironment) || null };
  },

  async refresh() {
    get().loadEnvironments();
    const tree = await api.listCollections();
    // flat list of every collection, whatever group it lives in
    const collections = [];
    const visit = (items) => {
      for (const it of items) {
        if (it.type === 'collection') collections.push(it);
        else if (it.type === 'group') visit(it.children);
      }
    };
    visit(tree);
    const metas = {};
    for (const c of collections) metas[c.path] = c.meta;
    set({ tree, collections, metas });
  },

  async updateSettings(patch) {
    const settings = await api.setSettings(patch);
    set({ settings });
    applyTheme(settings.theme, settings);
    if ('collectionsPath' in patch) {
      set({ tabs: [], activeTab: null, docs: {}, responses: {}, metas: {}, schemas: {}, runtime: {} });
      await get().refresh();
    }
    return settings;
  },

  persistTabs() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const { tabs, activeTab } = get();
      const openTabs = tabs.filter((t) => t.kind !== 'runner').map((t) => ({ kind: t.kind, path: t.path }));
      api.setSettings({ openTabs, activeTab }).catch(() => {});
    }, 400);
  },

  /* ------------------------------------------------------------ helpers */
  collectionOf(p) {
    if (!p) return null;
    const c = get().collections.find((c) => isUnder(p, c.path));
    return c ? c.path : null;
  },

  activeCollection() {
    const { tabs, activeTab } = get();
    const tab = tabs.find((t) => t.id === activeTab);
    return tab ? get().collectionOf(tab.path) : null;
  },

  isDirty(path) {
    const d = get().docs[path];
    return !!d && JSON.stringify(d.data) !== d.original;
  },

  toast(message, kind = 'info') {
    const id = newId('t');
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), kind === 'error' ? 6000 : 3000);
  },

  error(e) {
    get().toast(get().t('toast.error', { msg: e && e.message ? e.message : String(e) }), 'error');
  },

  setModal(modal) {
    set({ modal });
  },

  setContextMenu(contextMenu) {
    set({ contextMenu });
  },

  setFilter(filter) {
    set({ filter });
  },

  toggleExpanded(path, value) {
    const expanded = { ...get().expanded, [path]: value ?? !get().expanded[path] };
    set({ expanded });
    try {
      localStorage.setItem('cybersoap.expanded', JSON.stringify(expanded));
    } catch (_) {
      /* ignore */
    }
  },

  /* ------------------------------------------------------------ tabs */
  async loadSchema(dir) {
    if (!dir || dir in get().schemas) return;
    const schema = await api.readSchema(dir).catch(() => null);
    set((s) => ({ schemas: { ...s.schemas, [dir]: schema } }));
  },

  async openRequest(path, { silent } = {}) {
    const id = `req:${path}`;
    if (!get().docs[path]) {
      const data = await api.readRequest(path);
      set((s) => ({ docs: { ...s.docs, [path]: { data, original: JSON.stringify(data) } } }));
    }
    if (!get().tabs.some((t) => t.id === id)) {
      set((s) => ({ tabs: [...s.tabs, { id, kind: 'request', path }] }));
    }
    set({ activeTab: id });
    const dir = get().collectionOf(path);
    if (dir) {
      get().loadSchema(dir);
      // reveal in tree
      let cur = path;
      const ex = { ...get().expanded };
      for (let i = 0; i < 20; i++) {
        const parent = cur.slice(0, cur.lastIndexOf(sepOf(cur)));
        if (!parent || parent === cur) break;
        ex[parent] = true;
        if (parent === dir) break;
        cur = parent;
      }
      set({ expanded: ex });
    }
    if (!silent) get().persistTabs();
  },

  openCollectionSettings(dir) {
    const id = `col:${dir}`;
    if (!get().tabs.some((t) => t.id === id)) set((s) => ({ tabs: [...s.tabs, { id, kind: 'collection', path: dir }] }));
    set({ activeTab: id });
    get().persistTabs();
  },

  openRunner(path) {
    const id = `run:${path}`;
    if (!get().tabs.some((t) => t.id === id)) set((s) => ({ tabs: [...s.tabs, { id, kind: 'runner', path }] }));
    set({ activeTab: id });
  },

  setActiveTab(id) {
    set({ activeTab: id });
    get().persistTabs();
  },

  moveTab(fromId, toId) {
    const tabs = [...get().tabs];
    const from = tabs.findIndex((t) => t.id === fromId);
    const to = tabs.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [tab] = tabs.splice(from, 1);
    tabs.splice(to, 0, tab);
    set({ tabs });
    get().persistTabs();
  },

  async closeTab(id, force = false) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (!force && tab.kind === 'request' && get().isDirty(tab.path)) {
      const name = get().docs[tab.path].data.name;
      const ok = await api.confirm({
        message: get().t('confirm.unsaved', { name }),
        ok: get().t('confirm.closeAnyway'),
        cancel: get().t('common.cancel')
      });
      if (!ok) return;
    }
    const tabs = get().tabs;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    let activeTab = get().activeTab;
    if (activeTab === id) activeTab = next.length ? next[Math.min(idx, next.length - 1)].id : null;
    const docs = { ...get().docs };
    if (tab.kind === 'request' && !next.some((t) => t.path === tab.path && t.kind === 'request')) delete docs[tab.path];
    set({ tabs: next, activeTab, docs });
    get().persistTabs();
  },

  async closeTabs(ids) {
    for (const id of ids) await get().closeTab(id);
  },

  /* ------------------------------------------------------------ documents */
  updateDoc(path, patch) {
    const d = get().docs[path];
    if (!d) return;
    set((s) => ({ docs: { ...s.docs, [path]: { ...d, data: { ...d.data, ...patch } } } }));
  },

  async saveDoc(path) {
    const d = get().docs[path];
    if (!d) return;
    try {
      await api.saveRequest(path, d.data);
      set((s) => ({ docs: { ...s.docs, [path]: { ...s.docs[path], original: JSON.stringify(d.data) } } }));
    } catch (e) {
      get().error(e);
    }
  },

  async saveActive() {
    const tab = get().tabs.find((t) => t.id === get().activeTab);
    if (tab && tab.kind === 'request') {
      await get().saveDoc(tab.path);
      get().toast(get().t('toast.saved'), 'success');
    }
  },

  /* ------------------------------------------------------------ sending */
  async executeRequest(data, dir, onStart) {
    const meta = get().metas[dir] || null;
    const runtime = get().runtime[dir];
    const envs = get().envScope();
    const resolved = resolveRequest(data, meta, runtime, envs);
    const scope = buildScope(meta, runtime, envs);
    const id = newId('req');
    if (onStart) onStart(id);
    const response = await api.send({ ...resolved, id, timeout: get().settings.requestTimeout });
    const nsHints = (get().schemas[dir] && get().schemas[dir].namespaces) || {};
    const assertions = (data.assertions || []).map((a) => ({
      ...a,
      value: interpolate(a.value, scope),
      expected: a.expected != null ? interpolate(a.expected, scope) : a.expected
    }));
    response.assertions = runAssertions(assertions, response, nsHints);
    const extracted = runExtractors(data.extractors, response, nsHints);
    if (Object.keys(extracted).length) {
      set((s) => ({ runtime: { ...s.runtime, [dir]: { ...(s.runtime[dir] || {}), ...extracted } } }));
      response.extracted = extracted;
    }
    response.missing = resolved.missing;
    return { response, id };
  },

  async send(path) {
    const d = get().docs[path];
    if (!d || get().sending[path]) return;
    if (get().settings.autoSave && get().isDirty(path)) await get().saveDoc(path);
    const dir = get().collectionOf(path);
    set((s) => ({ sending: { ...s.sending, [path]: 'pending' } }));
    try {
      const { response } = await get().executeRequest(d.data, dir, (id) =>
        set((s) => ({ sending: { ...s.sending, [path]: id } }))
      );
      set((s) => ({ responses: { ...s.responses, [path]: response } }));
    } catch (e) {
      set((s) => ({ responses: { ...s.responses, [path]: { ok: false, error: e.message, time: 0 } } }));
    } finally {
      set((s) => {
        const sending = { ...s.sending };
        delete sending[path];
        return { sending };
      });
    }
  },

  async cancel(path) {
    const id = get().sending[path];
    if (id) await api.cancel(id);
  },

  clearRuntime(dir) {
    set((s) => ({ runtime: { ...s.runtime, [dir]: {} } }));
  },

  /* ------------------------------------------------------------ collections & files */
  async createCollection(name, parent) {
    const { path } = await api.createCollection(name, parent || null);
    if (parent) get().toggleExpanded(parent, true);
    await get().refresh();
    get().toggleExpanded(path, true);
    return path;
  },

  async createGroup(parent, name) {
    const path = await api.createGroup(parent || null, name);
    if (parent) get().toggleExpanded(parent, true);
    await get().refresh();
    return path;
  },

  async createRequest(dir, name) {
    const colDir = get().collectionOf(dir) || dir;
    const meta = get().metas[colDir] || {};
    const v = meta.soapVersion || '1.1';
    const env = v === '1.2' ? ['soap', 'http://www.w3.org/2003/05/soap-envelope'] : ['soapenv', 'http://schemas.xmlsoap.org/soap/envelope/'];
    const { path } = await api.createRequest(dir, name, {
      soapVersion: v,
      url: (meta.wsdl && meta.wsdl.interfaces && meta.wsdl.interfaces[0] && meta.wsdl.interfaces[0].endpoints[0]) || '',
      body: `<${env[0]}:Envelope xmlns:${env[0]}="${env[1]}">\n   <${env[0]}:Header/>\n   <${env[0]}:Body>\n      \n   </${env[0]}:Body>\n</${env[0]}:Envelope>`,
      assertions: [{ id: newId('a'), type: 'notSoapFault', value: '', enabled: true }]
    });
    get().toggleExpanded(dir, true);
    await get().refresh();
    await get().openRequest(path);
    return path;
  },

  async createFolder(dir, name) {
    const path = await api.createFolder(dir, name);
    get().toggleExpanded(dir, true);
    await get().refresh();
    return path;
  },

  rekey(oldP, newP) {
    const map = (p) => (isUnder(p, oldP) ? newP + p.slice(oldP.length) : p);
    const remapObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [map(k), v]));
    const tabs = get().tabs.map((t) => {
      const path = map(t.path);
      return { ...t, path, id: `${t.id.split(':')[0]}:${path}` };
    });
    const at = get().activeTab;
    let activeTab = at;
    if (at) {
      const [kind, ...rest] = at.split(':');
      activeTab = `${kind}:${map(rest.join(':'))}`;
    }
    set((s) => ({
      tabs,
      activeTab,
      docs: remapObj(s.docs),
      responses: remapObj(s.responses),
      metas: remapObj(s.metas),
      schemas: remapObj(s.schemas),
      runtime: remapObj(s.runtime)
    }));
    get().persistTabs();
  },

  async renameItem(path, name) {
    try {
      const newPath = await api.rename(path, name);
      const doc = get().docs[path];
      if (doc) {
        // keep name in sync in the open document
        const data = { ...doc.data, name };
        const original = JSON.stringify({ ...JSON.parse(doc.original), name });
        set((s) => ({ docs: { ...s.docs, [path]: { data, original } } }));
      }
      get().rekey(path, newPath);
      await get().refresh();
      return newPath;
    } catch (e) {
      get().error(e);
    }
  },

  async deleteItem(path, name) {
    const ok = await api.confirm({
      message: get().t('confirm.delete', { name: name || basename(path) }),
      detail: get().t('confirm.deleteDetail'),
      ok: get().t('common.delete'),
      cancel: get().t('common.cancel')
    });
    if (!ok) return;
    try {
      await api.remove(path);
      const ids = get().tabs.filter((t) => isUnder(t.path, path)).map((t) => t.id);
      for (const id of ids) await get().closeTab(id, true);
      await get().refresh();
    } catch (e) {
      get().error(e);
    }
  },

  async duplicateItem(path) {
    try {
      const p = await api.duplicate(path);
      await get().refresh();
      await get().openRequest(p);
    } catch (e) {
      get().error(e);
    }
  },

  async moveItem(src, destDir) {
    try {
      if (isUnder(destDir, src)) return;
      const parent = src.slice(0, src.lastIndexOf(sepOf(src)));
      if (parent === destDir) return;
      const newPath = await api.move(src, destDir);
      get().rekey(src, newPath);
      await get().refresh();
    } catch (e) {
      get().error(e);
    }
  },

  async reorderItem(src, target, position) {
    try {
      const newPath = await api.reorder(src, target, position);
      if (newPath !== src) get().rekey(src, newPath);
      await get().refresh();
    } catch (e) {
      get().error(e);
    }
  },

  async sortAlpha(dir) {
    try {
      await api.sortAlpha(dir);
      await get().refresh();
    } catch (e) {
      get().error(e);
    }
  },

  async saveMeta(dir, meta) {
    await api.saveCollection(dir, meta);
    set((s) => ({ metas: { ...s.metas, [dir]: meta } }));
    await get().refresh();
  },

  async reloadSchema(dir) {
    const schema = await api.readSchema(dir).catch(() => null);
    set((s) => ({ schemas: { ...s.schemas, [dir]: schema } }));
  },

  async updateFromWsdl(dir) {
    try {
      const r = await api.updateFromWsdl(dir);
      await get().reloadSchema(dir);
      await get().refresh();
      set((s) => ({ catalogVersion: s.catalogVersion + 1 }));
      get().toast(get().t('col.wsdlUpdated', { n: r.total, added: r.added }), 'success');
    } catch (e) {
      get().error(e);
    }
  },

  /** Create request files from WSDL operations (appended at the end of the collection) */
  async createFromOperations(dir, ids, open) {
    try {
      const paths = await api.createFromOperations(dir, ids);
      get().toggleExpanded(dir, true);
      await get().refresh();
      if (open && paths.length === 1) await get().openRequest(paths[0]);
      else if (paths.length) get().toast(get().t('ops.createdToast', { n: paths.length }), 'success');
      return paths;
    } catch (e) {
      get().error(e);
      return [];
    }
  }
}));
