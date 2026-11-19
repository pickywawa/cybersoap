import React from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Logo from './Logo';
import Icon from './Icons';

export default function TopBar() {
  const t = useT();
  const setModal = useStore((s) => s.setModal);
  const environments = useStore((s) => s.envs.environments);
  const active = useStore((s) => s.settings.activeEnvironment);
  const setActiveEnvironment = useStore((s) => s.setActiveEnvironment);
  const platform = useStore((s) => s.appInfo && s.appInfo.platform);
  const update = useStore((s) => s.update);

  return (
    <header className={`topbar ${platform === 'darwin' ? 'mac' : ''}`}>
      <div className="brand">
        <Logo size={26} animated />
        <span className="brand-name">
          CYBER<span className="accent">SOAP</span>
        </span>
      </div>
      <div className="topbar-spacer" />
      {update && (update.state === 'available' || update.state === 'downloaded' || update.state === 'downloading') && (
        <button className="update-pill no-drag" onClick={() => setModal({ type: 'settings', props: { section: 'updates' } })}>
          <Icon name="bolt" size={13} />
          {update.state === 'downloading'
            ? t('update.downloading', { pct: Math.round(update.percent || 0) })
            : update.state === 'downloaded'
              ? t('update.ready', { v: update.version })
              : t('update.available', { v: update.version })}
        </button>
      )}
      <div className={`env-select no-drag ${active ? 'on' : ''}`} title={t('top.environment')}>
        <Icon name="layers" size={13} />
        <select value={active || ''} onChange={(e) => setActiveEnvironment(e.target.value)}>
          <option value="">{t('top.noEnvironment')}</option>
          {environments.map((e) => (
            <option key={e.name} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title={t('env.manage')} onClick={() => setModal({ type: 'environments' })}>
          <Icon name="settings" size={14} />
        </button>
      </div>
      <button className="icon-btn no-drag" title={t('sidebar.import')} onClick={() => setModal({ type: 'import' })}>
        <Icon name="import" />
      </button>
      <button className="icon-btn no-drag" title={t('top.settings')} onClick={() => setModal({ type: 'settings' })}>
        <Icon name="settings" />
      </button>
    </header>
  );
}
