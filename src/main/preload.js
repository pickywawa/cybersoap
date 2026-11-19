const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

contextBridge.exposeInMainWorld('api', {
  appInfo: () => call('app:info'),
  getSettings: () => call('settings:get'),
  setSettings: (patch) => call('settings:set', patch),

  openDirectory: (opts) => call('dialog:openDirectory', opts),
  openFile: (opts) => call('dialog:openFile', opts),
  confirm: (opts) => call('dialog:confirm', opts),

  listCollections: () => call('collections:list'),
  readEnvironments: () => call('env:read'),
  saveEnvironments: (data) => call('env:save', data),
  createCollection: (name, parent) => call('collection:create', name, parent),
  createGroup: (parent, name) => call('group:create', parent, name),
  readCollection: (dir) => call('collection:read', dir),
  saveCollection: (dir, meta) => call('collection:save', dir, meta),
  readSchema: (dir) => call('collection:schema', dir),
  collectionRequests: (dir) => call('collection:requests', dir),
  collectionOf: (p) => call('collection:of', p),

  readRequest: (file) => call('request:read', file),
  saveRequest: (file, data) => call('request:save', file, data),
  createRequest: (dir, name, data) => call('request:create', dir, name, data),
  createFolder: (dir, name) => call('folder:create', dir, name),

  rename: (p, name) => call('item:rename', p, name),
  remove: (p) => call('item:delete', p),
  duplicate: (p) => call('item:duplicate', p),
  move: (src, dest) => call('item:move', src, dest),
  reorder: (src, target, position) => call('item:reorder', src, target, position),
  sortAlpha: (dir) => call('item:sortAlpha', dir),
  reveal: (p) => call('item:reveal', p),
  openPath: (p) => call('shell:openPath', p),
  openExternal: (url) => call('shell:openExternal', url),

  previewWsdl: (opts) => call('wsdl:preview', opts),
  importWsdl: (opts) => call('wsdl:import', opts),
  updateFromWsdl: (dir, source, auth) => call('wsdl:update', dir, source, auth),
  listOperations: (dir) => call('operations:list', dir),
  createFromOperations: (dir, ids) => call('operations:create', dir, ids),

  send: (req) => call('soap:send', req),
  cancel: (id) => call('soap:cancel', id),

  exportCollection: (dir) => call('export:collection', dir),
  exportFolder: (dir) => call('export:folder', dir),
  exportRequest: (file) => call('export:request', file),
  importBundle: (file) => call('import:bundle', file),
  importFolder: () => call('import:folder'),
  importSoapUi: () => call('import:soapui'),
  importRequest: (dir) => call('import:request', dir),

  updateState: () => call('update:state'),
  checkForUpdates: () => call('update:check'),
  downloadUpdate: () => call('update:download'),
  installUpdate: () => call('update:install'),
  openReleases: () => call('update:openReleases'),
  onUpdate: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('update', listener);
    return () => ipcRenderer.removeListener('update', listener);
  },

  onMenu: (cb) => {
    const listener = (_e, action) => cb(action);
    ipcRenderer.on('menu', listener);
    return () => ipcRenderer.removeListener('menu', listener);
  }
});
