import React, { useState } from 'react';
import { useStore } from '../store';
import { useT, LANGUAGES } from '../i18n';
import { THEMES } from '../themes';
import Icon from './Icons';
import Logo from './Logo';
import { Modal, Field, Toggle } from './ui';

const api = window.api;

export default function SettingsModal({ onClose, section: initialSection = 'general' }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const appInfo = useStore((s) => s.appInfo);
  const updateSettings = useStore((s) => s.updateSettings);
  const [section, setSection] = useState(initialSection);
  const [pathDraft, setPathDraft] = useState(settings.collectionsPath);

  const set = (patch) => updateSettings(patch).catch((e) => useStore.getState().error(e));

  const sections = [
    ['general', 'settings', t('settings.general')],
    ['appearance', 'eye', t('settings.appearance')],
    ['editor', 'code', t('settings.editor')],
    ['network', 'globe', t('settings.network')],
    ['updates', 'refresh', t('update.title')],
    ['about', 'info', t('settings.about')]
  ];

  return (
    <Modal title={t('settings.title')} onClose={onClose} width={860} className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map(([id, icon, label]) => (
            <button key={id} className={`settings-nav-item ${section === id ? 'active' : ''}`} onClick={() => setSection(id)}>
              <Icon name={icon} size={15} /> {label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'general' && (
            <div className="form-grid">
              <Field label={t('settings.collectionsPath')} hint={t('settings.collectionsPathHint')}>
                <div className="input-row">
                  <input
                    className="input mono"
                    value={pathDraft}
                    onChange={(e) => setPathDraft(e.target.value)}
                    onBlur={() => pathDraft && pathDraft !== settings.collectionsPath && set({ collectionsPath: pathDraft })}
                  />
                  <button
                    className="btn ghost"
                    onClick={async () => {
                      const p = await api.openDirectory({ defaultPath: settings.collectionsPath });
                      if (p) {
                        setPathDraft(p);
                        set({ collectionsPath: p });
                      }
                    }}
                  >
                    <Icon name="folderOpen" size={14} /> {t('common.browse')}
                  </button>
                  <button className="btn ghost" title={t('settings.openFolder')} onClick={() => api.openPath(settings.collectionsPath)}>
                    <Icon name="eye" size={14} />
                  </button>
                  <button
                    className="btn ghost"
                    title={t('settings.restoreDefault')}
                    onClick={() => {
                      const p = appInfo.defaults.collectionsPath;
                      setPathDraft(p);
                      set({ collectionsPath: p });
                    }}
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                </div>
              </Field>
              <Field label={t('settings.language')}>
                <div className="segmented">
                  {LANGUAGES.map((l) => (
                    <button key={l.id} className={settings.language === l.id ? 'active' : ''} onClick={() => set({ language: l.id })}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle label={t('settings.autoSave')} checked={settings.autoSave} onChange={(v) => set({ autoSave: v })} />
            </div>
          )}

          {section === 'appearance' && (
            <div className="form-grid">
              <Field label={t('settings.theme')}>
                <div className="theme-grid">
                  {Object.entries(THEMES).map(([id, th]) => (
                    <button
                      key={id}
                      className={`theme-card ${settings.theme === id ? 'active' : ''}`}
                      onClick={() => set({ theme: id })}
                      style={{ background: th.vars.bg, color: th.vars.text, borderColor: settings.theme === id ? th.vars.accent : th.vars.border }}
                    >
                      <div className="theme-preview" style={{ background: th.vars['bg-deep'] }}>
                        <span style={{ color: th.vars['syn-punct'] }}>&lt;</span>
                        <span style={{ color: th.vars['syn-ns'] }}>soap</span>
                        <span style={{ color: th.vars['syn-punct'] }}>:</span>
                        <span style={{ color: th.vars['syn-tag'] }}>Body</span>
                        <span style={{ color: th.vars['syn-attr'] }}> id</span>
                        <span style={{ color: th.vars['syn-punct'] }}>=</span>
                        <span style={{ color: th.vars['syn-string'] }}>"42"</span>
                        <span style={{ color: th.vars['syn-punct'] }}>&gt;</span>
                      </div>
                      <div className="theme-swatches">
                        {['accent', 'accent-2', 'accent-3', 'success', 'danger'].map((k) => (
                          <i key={k} style={{ background: th.vars[k], boxShadow: `0 0 6px ${th.vars[k]}` }} />
                        ))}
                      </div>
                      <span className="theme-name">{th.label}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle label={t('settings.scanlines')} checked={settings.scanlines} onChange={(v) => set({ scanlines: v })} />
              <Toggle label={t('settings.glow')} checked={settings.glow} onChange={(v) => set({ glow: v })} />
              <Field label={`${t('settings.uiFontSize')} — ${settings.uiFontSize}px`}>
                <input type="range" min="11" max="17" value={settings.uiFontSize} onChange={(e) => set({ uiFontSize: Number(e.target.value) })} />
              </Field>
            </div>
          )}

          {section === 'editor' && (
            <div className="form-grid">
              <Field label={`${t('settings.editorFontSize')} — ${settings.editorFontSize}px`}>
                <input type="range" min="10" max="20" value={settings.editorFontSize} onChange={(e) => set({ editorFontSize: Number(e.target.value) })} />
              </Field>
              <Toggle label={t('settings.wordWrap')} checked={settings.wordWrap} onChange={(v) => set({ wordWrap: v })} />
              <Toggle label={t('settings.autoFormat')} checked={settings.autoFormatResponse} onChange={(v) => set({ autoFormatResponse: v })} />
              <div className="shortcuts">
                <h4 className="block-title">{t('welcome.shortcuts')}</h4>
                <ShortcutList />
              </div>
            </div>
          )}

          {section === 'network' && (
            <div className="form-grid">
              <Field label={t('settings.timeout')}>
                <input
                  className="input mono"
                  type="number"
                  min="1000"
                  step="1000"
                  value={settings.requestTimeout}
                  onChange={(e) => set({ requestTimeout: Number(e.target.value) })}
                />
              </Field>
              <Toggle label={t('settings.ssl')} checked={settings.rejectUnauthorized} onChange={(v) => set({ rejectUnauthorized: v })} />
              <Toggle label={t('settings.redirects')} checked={settings.followRedirects} onChange={(v) => set({ followRedirects: v })} />
              <Field label={t('settings.proxy')}>
                <div className="segmented">
                  {[
                    ['system', t('settings.proxySystem')],
                    ['none', t('settings.proxyNone')],
                    ['custom', t('settings.proxyCustom')]
                  ].map(([id, label]) => (
                    <button key={id} className={settings.proxyMode === id ? 'active' : ''} onClick={() => set({ proxyMode: id })}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {settings.proxyMode === 'custom' && (
                <>
                  <Field label={t('settings.proxyUrl')}>
                    <DeferredInput value={settings.proxyUrl} onCommit={(v) => set({ proxyUrl: v })} placeholder="http://proxy:8080" />
                  </Field>
                  <Field label={t('settings.proxyBypass')}>
                    <DeferredInput value={settings.proxyBypass} onCommit={(v) => set({ proxyBypass: v })} />
                  </Field>
                </>
              )}
              {settings.proxyMode !== 'none' && (
                <div className="input-row">
                  <Field label={t('settings.proxyUser')}>
                    <DeferredInput value={settings.proxyUser || ''} onCommit={(v) => set({ proxyUser: v })} />
                  </Field>
                  <Field label={t('settings.proxyPass')}>
                    <DeferredInput type="password" value={settings.proxyPass || ''} onCommit={(v) => set({ proxyPass: v })} />
                  </Field>
                </div>
              )}
            </div>
          )}

          {section === 'updates' && <UpdatesSection settings={settings} set={set} appInfo={appInfo} />}

          {section === 'about' && (
            <div className="about">
              <Logo size={120} animated />
              <h2 className="brand-name big">
                CYBER<span className="accent">SOAP</span>
              </h2>
              <p className="dim">{t('app.tagline')}</p>
              <p className="mono">
                {t('settings.version')} {appInfo && appInfo.version} · Electron {appInfo && appInfo.electron}
              </p>
              <p className="mono dim small-text">{appInfo && appInfo.userData}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DeferredInput({ value, onCommit, type = 'text', placeholder }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="input mono"
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && v !== value && onCommit(v)}
    />
  );
}

export function ShortcutList() {
  const t = useT();
  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
  const list = [
    [`${mod} + Enter`, t('welcome.sc.send')],
    [`${mod} + S`, t('welcome.sc.save')],
    ['⇧ + Alt + F', t('welcome.sc.format')],
    [`${mod} + W`, t('welcome.sc.close')],
    ['F2', t('welcome.sc.next')],
    ['Ctrl + Space', t('welcome.sc.complete')],
    [`${mod} + F`, t('welcome.sc.search')]
  ];
  return (
    <div className="shortcut-list">
      {list.map(([k, label]) => (
        <div key={k} className="shortcut">
          <kbd>{k}</kbd>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function UpdatesSection({ settings, set, appInfo }) {
  const t = useT();
  const update = useStore((s) => s.update);
  const [busy, setBusy] = useState(false);
  const st = (update && update.state) || 'idle';
  const isMac = appInfo && appInfo.platform === 'darwin';
  const check = async () => {
    setBusy(true);
    try {
      await api.checkForUpdates();
    } catch (e) {
      useStore.getState().error(e);
    }
    setBusy(false);
  };
  return (
    <div className="form-grid">
      <div className="update-card cyber-frame">
        <div className="update-head">
          <Logo size={44} />
          <div className="grow">
            <div className="mono">
              {t('settings.version')} <b className="accent">{appInfo && appInfo.version}</b>
            </div>
            <div className={`small-text update-state ${st}`}>
              {st === 'checking' && t('update.checking')}
              {st === 'not-available' && t('update.upToDate')}
              {st === 'available' && t('update.available', { v: update.version })}
              {st === 'downloading' && t('update.downloading', { pct: Math.round(update.percent || 0) })}
              {st === 'downloaded' && t('update.ready', { v: update.version })}
              {st === 'error' && `${t('update.error')} ${update.error || ''}`}
              {st === 'idle' && (settings.lastUpdateCheck ? t('update.lastCheck', { d: new Date(settings.lastUpdateCheck).toLocaleString() }) : '')}
            </div>
          </div>
          <button className="btn ghost" disabled={busy || st === 'checking' || st === 'downloading'} onClick={check}>
            <Icon name="refresh" size={14} /> {t('update.check')}
          </button>
        </div>
        {st === 'downloading' && (
          <div className="bar">
            <div className="bar-ok" style={{ width: `${update.percent || 0}%` }} />
          </div>
        )}
        {(st === 'available' || st === 'downloaded') && (
          <div className="update-actions">
            {st === 'available' && (
              <button className="btn primary" onClick={() => api.downloadUpdate()}>
                <Icon name="import" size={14} /> {update.canInstall ? t('update.download') : t('update.downloadManual')}
              </button>
            )}
            {st === 'downloaded' && (
              <button className="btn primary" onClick={() => api.installUpdate()}>
                <Icon name="bolt" size={14} /> {t('update.install')}
              </button>
            )}
            <button className="btn ghost" onClick={() => api.openReleases()}>
              <Icon name="globe" size={14} /> {t('update.notes')}
            </button>
          </div>
        )}
        {st === 'available' && !update.canInstall && <p className="hint">{isMac ? t('update.macHint') : t('update.manualHint')}</p>}
      </div>
      <Toggle label={t('update.auto')} checked={settings.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
      {!isMac && (
        <Toggle label={t('update.autoDownload')} checked={settings.autoDownloadUpdates} onChange={(v) => set({ autoDownloadUpdates: v })} />
      )}
      <Toggle label={t('update.prerelease')} checked={settings.allowPrerelease} onChange={(v) => set({ allowPrerelease: v })} />
    </div>
  );
}
