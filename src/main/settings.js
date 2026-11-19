const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

function defaultLanguage() {
  const loc = (app.getLocale() || 'en').toLowerCase();
  return loc.startsWith('fr') ? 'fr' : 'en';
}

function defaults() {
  return {
    collectionsPath: path.join(os.homedir(), 'CyberSoap', 'collections'),
    language: defaultLanguage(),
    theme: 'dracula',
    editorFontSize: 13,
    uiFontSize: 13,
    wordWrap: false,
    requestTimeout: 30000,
    rejectUnauthorized: true,
    followRedirects: true,
    proxyMode: 'system', // system | none | custom
    proxyUrl: '',
    proxyBypass: 'localhost,127.0.0.1',
    autoFormatResponse: true,
    autoSave: false,
    scanlines: true,
    glow: true,
    sidebarWidth: 280,
    autoUpdate: true,
    autoDownloadUpdates: true,
    allowPrerelease: false,
    lastUpdateCheck: null,
    activeEnvironment: null,
    openTabs: [],
    activeTab: null
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
  } catch (_) {
    data = {};
  }
  cache = { ...defaults(), ...data };
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

module.exports = { load, save, defaults };
