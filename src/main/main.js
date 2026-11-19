const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');
const storage = require('./storage');
const soap = require('./soap');
const importer = require('./importer');
const updater = require('./updater');

let win = null;
const isMac = process.platform === 'darwin';
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');

function root() {
  return storage.ensureRoot(settings.load().collectionsPath);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#282a36',
    title: 'CyberSoap',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => win && win.webContents.send('menu', 'settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'SOAP 1.1 spec', click: () => shell.openExternal('https://www.w3.org/TR/2000/NOTE-SOAP-20000508/') }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------- IPC ------------------------- */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    userData: app.getPath('userData'),
    defaults: settings.defaults()
  }));

  handle('settings:get', () => settings.load());
  handle('settings:set', async (patch) => {
    const s = settings.save(patch);
    if (['proxyMode', 'proxyUrl', 'proxyBypass', 'rejectUnauthorized', 'followRedirects', 'requestTimeout'].some((k) => k in patch)) {
      await soap.applyNetworkSettings(s);
    }
    if ('collectionsPath' in patch) storage.ensureRoot(s.collectionsPath);
    if ('autoUpdate' in patch) updater.schedule();
    return s;
  });

  handle('dialog:openDirectory', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], ...opts });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:openFile', async (opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], ...opts });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:confirm', async ({ message, detail, ok = 'OK', cancel = 'Cancel' }) => {
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: [ok, cancel], defaultId: 0, cancelId: 1, message, detail });
    return r.response === 0;
  });

  handle('collections:list', () => storage.listCollections(root()));
  handle('env:read', () => storage.readEnvironments(root()));
  handle('env:save', (data) => storage.saveEnvironments(root(), data));
  handle('collection:create', (name, parent) => storage.createCollection(root(), name, {}, parent || null));
  handle('group:create', (parent, name) => storage.createGroup(parent || root(), name));
  handle('collection:read', (dir) => storage.readCollection(dir));
  handle('collection:save', (dir, meta) => storage.saveCollection(dir, meta));
  handle('collection:schema', (dir) => storage.readSchema(dir));
  handle('collection:requests', (dir) => storage.collectRequests(dir));
  handle('collection:of', (p) => storage.findCollectionDir(p));

  handle('request:read', (file) => storage.readRequest(file));
  handle('request:save', (file, data) => storage.saveRequest(file, data));
  handle('request:create', (dir, name, data) => storage.createRequest(dir, name, data));
  handle('folder:create', (dir, name) => storage.createFolder(dir, name));

  handle('item:rename', (p, name) => storage.renameItem(p, name));
  handle('item:delete', (p) => storage.deleteItem(p));
  handle('item:duplicate', (p) => storage.duplicateRequest(p));
  handle('item:move', (src, dest) => storage.moveItem(src, dest));
  handle('item:reorder', (src, target, position) => storage.reorderItem(src, target, position));
  handle('item:sortAlpha', (dir) => storage.sortAlpha(dir));
  handle('item:reveal', (p) => shell.showItemInFolder(p));
  handle('shell:openPath', (p) => shell.openPath(p));
  handle('shell:openExternal', (url) => shell.openExternal(url));

  handle('wsdl:preview', ({ source, auth }) => importer.previewWsdl(source, auth));
  handle('wsdl:import', (opts) => importer.importWsdl(root(), opts));
  handle('wsdl:update', (dir, source, auth) => importer.updateFromWsdl(dir, source, auth));

  handle('update:state', () => updater.getState());
  handle('update:check', () => updater.check(true));
  handle('update:download', () => updater.download());
  handle('update:install', () => updater.install());
  handle('update:openReleases', () => updater.openReleases());

  handle('soap:send', (req) => soap.send(req));
  handle('soap:cancel', (id) => soap.cancel(id));

  handle('export:collection', async (dir) => {
    const bundle = storage.bundleCollection(dir);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${storage.safeName(bundle.name)}.cybersoap.json`,
      filters: [{ name: 'CyberSoap collection', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(bundle, null, 2), 'utf8');
    return r.filePath;
  });
  handle('export:folder', async (dir) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Export here' });
    if (r.canceled) return null;
    const target = storage.uniquePath(r.filePaths[0], path.basename(dir));
    storage.copyDir(dir, target);
    return target;
  });
  handle('export:request', async (file) => {
    const req = storage.readRequest(file);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.basename(file),
      filters: [
        { name: 'CyberSoap request', extensions: ['json'] },
        { name: 'XML envelope', extensions: ['xml'] }
      ]
    });
    if (r.canceled || !r.filePath) return null;
    if (r.filePath.endsWith('.xml')) fs.writeFileSync(r.filePath, req.body || '', 'utf8');
    else fs.writeFileSync(r.filePath, JSON.stringify(req, null, 2), 'utf8');
    return r.filePath;
  });
  handle('import:bundle', async (file) => {
    if (!file) {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'CyberSoap collection', extensions: ['json'] }] });
      if (r.canceled) return null;
      file = r.filePaths[0];
    }
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    return storage.unbundleCollection(root(), bundle);
  });
  handle('import:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled) return null;
    return storage.importFolder(root(), r.filePaths[0]);
  });
  handle('import:soapui', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'SoapUI project', extensions: ['xml'] }] });
    if (r.canceled) return null;
    return importer.importSoapUi(root(), r.filePaths[0]);
  });
  handle('import:request', async (dir) => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Request / XML', extensions: ['json', 'xml'] }]
    });
    if (r.canceled) return null;
    const file = r.filePaths[0];
    const content = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.xml')) {
      return storage.createRequest(dir, path.basename(file, '.xml'), { body: content }).path;
    }
    const data = JSON.parse(content);
    return storage.createRequest(dir, data.name || path.basename(file, '.json'), data).path;
  });
}

app.setName('CyberSoap');
if (process.env.CYBERSOAP_USER_DATA) app.setPath('userData', process.env.CYBERSOAP_USER_DATA);

app.whenReady().then(async () => {
  const s = settings.load();
  storage.ensureRoot(s.collectionsPath);
  nativeTheme.themeSource = 'dark';
  await soap.applyNetworkSettings(s);
  app.on('login', (event, _wc, details, authInfo, callback) => {
    const cur = settings.load();
    if (authInfo.isProxy && cur.proxyUser) {
      event.preventDefault();
      callback(cur.proxyUser, cur.proxyPass || '');
    }
  });
  if (isMac && fs.existsSync(ICON) && app.dock) app.dock.setIcon(ICON);
  registerIpc();
  buildMenu();
  createWindow();
  updater.init((state) => win && !win.isDestroyed() && win.webContents.send('update', state));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
