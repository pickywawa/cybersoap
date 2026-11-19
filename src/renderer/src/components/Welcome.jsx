import React from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Logo from './Logo';
import Icon from './Icons';
import { prompt } from './ui';
import { ShortcutList } from './SettingsModal';

export default function Welcome() {
  const t = useT();
  const setModal = useStore((s) => s.setModal);
  const settings = useStore((s) => s.settings);
  const newCollection = () =>
    prompt({
      title: t('sidebar.newCollection'),
      label: t('prompt.collectionName'),
      onSubmit: (n) => useStore.getState().createCollection(n).catch((e) => useStore.getState().error(e))
    });
  return (
    <div className="welcome">
      <div className="welcome-grid" />
      <div className="welcome-inner">
        <Logo size={140} animated />
        <h1 className="brand-name huge glitch" data-text="CYBERSOAP">
          CYBER<span className="accent">SOAP</span>
        </h1>
        <p className="tagline">{t('welcome.subtitle')}</p>
        <div className="welcome-actions">
          <button className="action-card cyber-frame" onClick={() => setModal({ type: 'import', props: { tab: 'wsdl' } })}>
            <Icon name="globe" size={26} />
            <span>{t('welcome.importWsdl')}</span>
          </button>
          <button className="action-card cyber-frame" onClick={newCollection}>
            <Icon name="plus" size={26} />
            <span>{t('welcome.newCollection')}</span>
          </button>
          <button className="action-card cyber-frame" onClick={() => setModal({ type: 'import', props: { tab: 'bundle' } })}>
            <Icon name="import" size={26} />
            <span>{t('welcome.importCollection')}</span>
          </button>
          <button className="action-card cyber-frame" onClick={() => setModal({ type: 'settings' })}>
            <Icon name="settings" size={26} />
            <span>{t('welcome.openSettings')}</span>
          </button>
        </div>
        <div className="welcome-shortcuts cyber-frame">
          <h4 className="block-title">{t('welcome.shortcuts')}</h4>
          <ShortcutList />
        </div>
        <p className="dim small-text mono">
          {t('welcome.storage')} <span className="accent">{settings.collectionsPath}</span>
        </p>
      </div>
    </div>
  );
}
