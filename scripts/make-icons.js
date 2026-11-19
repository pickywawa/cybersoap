// Renders build/icon.svg into PNGs + .icns using Electron (run: npx electron scripts/make-icons.js)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const root = path.join(__dirname, '..', 'build');
  const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const full = img.resize({ width: 1024, height: 1024 });
  fs.writeFileSync(path.join(root, 'icon.png'), full.toPNG());
  if (process.platform === 'darwin') {
    const set = path.join(root, 'icon.iconset');
    fs.mkdirSync(set, { recursive: true });
    for (const s of [16, 32, 64, 128, 256, 512]) {
      fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), full.resize({ width: s, height: s, quality: 'best' }).toPNG());
      fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), full.resize({ width: s * 2, height: s * 2, quality: 'best' }).toPNG());
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'icon.icns')]);
    fs.rmSync(set, { recursive: true, force: true });
  }
  console.log('icons generated');
  app.quit();
});
