/**
 * Auto-update.
 * - Windows (NSIS) and Linux (AppImage): electron-updater downloads and installs from GitHub Releases.
 * - macOS: builds are not signed, so Squirrel.Mac cannot install them. We check GitHub Releases
 *   and offer to open the release page / download the .dmg instead.
 * - Development (not packaged): GitHub API check only.
 */
const { app, shell } = require('electron');
const settings = require('./settings');
const soap = require('./soap');

const OWNER = 'pickywawa';
const REPO = 'cybersoap';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

let send = () => {};
let state = { state: 'idle', current: app.getVersion() };
let autoUpdater = null;
let timer = null;

const native = () =>
  app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE));

function emit(patch) {
  state = { ...state, ...patch, current: app.getVersion() };
  send(state);
}

function cmpVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => (isNaN(+x) ? x : +x));
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => (isNaN(+x) ? x : +x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

function assetForPlatform(assets) {
  const arch = process.arch;
  const pick = (re) => assets.find((a) => re.test(a.name));
  if (process.platform === 'darwin') {
    return pick(new RegExp(`${arch}\\.dmg$`)) || pick(/\.dmg$/);
  }
  if (process.platform === 'win32') return pick(/\.exe$/);
  return pick(/\.AppImage$/);
}

async function githubCheck(manual) {
  const s = settings.load();
  const url = s.allowPrerelease
    ? `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=10`
    : `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  const res = await soap.getSession().fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CyberSoap' } });
  if (res.status === 404) {
    emit({ state: 'not-available', manual });
    return state;
  }
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
  let rel = await res.json();
  if (Array.isArray(rel)) rel = rel.find((r) => !r.draft) || null;
  if (!rel) {
    emit({ state: 'not-available', manual });
    return state;
  }
  const version = rel.tag_name.replace(/^v/, '');
  if (cmpVersions(version, app.getVersion()) > 0) {
    const asset = assetForPlatform(rel.assets || []);
    emit({
      state: 'available',
      version,
      notes: rel.body || '',
      releaseUrl: rel.html_url,
      downloadUrl: asset ? asset.browser_download_url : rel.html_url,
      canInstall: false,
      manual
    });
  } else emit({ state: 'not-available', manual });
  return state;
}

function setupNative() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    emit({
      state: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
      canInstall: true
    })
  );
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) => emit({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', version: info.version, canInstall: true }));
  autoUpdater.on('error', (err) => emit({ state: 'error', error: err ? err.message : 'Update error' }));
  return autoUpdater;
}

async function check(manual = false) {
  const s = settings.load();
  settings.save({ lastUpdateCheck: new Date().toISOString() });
  try {
    if (native()) {
      const u = setupNative();
      u.autoDownload = s.autoDownloadUpdates !== false;
      u.allowPrerelease = !!s.allowPrerelease;
      emit({ state: 'checking', manual });
      await u.checkForUpdates();
      return state;
    }
    emit({ state: 'checking', manual });
    return await githubCheck(manual);
  } catch (e) {
    emit({ state: 'error', error: e.message, manual });
    return state;
  }
}

async function download() {
  if (native() && state.canInstall) {
    emit({ state: 'downloading', percent: 0 });
    await setupNative().downloadUpdate();
  } else if (state.downloadUrl || state.releaseUrl) {
    await shell.openExternal(state.downloadUrl || state.releaseUrl);
  }
  return state;
}

function install() {
  if (native() && state.state === 'downloaded') {
    setImmediate(() => setupNative().quitAndInstall(false, true));
    return true;
  }
  return false;
}

function schedule() {
  clearInterval(timer);
  const s = settings.load();
  if (!s.autoUpdate || !app.isPackaged) return;
  setTimeout(() => check(false), 8000);
  timer = setInterval(() => check(false), CHECK_INTERVAL);
}

function init(sender) {
  send = sender;
  schedule();
}

module.exports = {
  init,
  check,
  download,
  install,
  schedule,
  getState: () => state,
  openReleases: () => shell.openExternal(state.releaseUrl || RELEASES_URL),
  RELEASES_URL
};
