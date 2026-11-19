import React, { useEffect } from 'react';
import { useStore } from './store';
import { useT } from './i18n';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import RequestView from './components/RequestView';
import CollectionView from './components/CollectionView';
import RunnerView from './components/RunnerView';
import Welcome from './components/Welcome';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';
import EnvironmentsModal from './components/EnvironmentsModal';
import Logo from './components/Logo';
import { ContextMenu, Toasts, PromptModal, useSplitter } from './components/ui';

function ActiveView() {
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  const tab = tabs.find((t) => t.id === activeTab);
  if (!tab) return <Welcome />;
  if (tab.kind === 'request') return <RequestView key={tab.id} path={tab.path} />;
  if (tab.kind === 'collection') return <CollectionView key={tab.id} dir={tab.path} />;
  if (tab.kind === 'runner') return <RunnerView key={tab.id} path={tab.path} />;
  return null;
}

function Modals() {
  const modal = useStore((s) => s.modal);
  const setModal = useStore((s) => s.setModal);
  if (!modal) return null;
  const close = () => setModal(null);
  if (modal.type === 'import') return <ImportModal onClose={close} {...(modal.props || {})} />;
  if (modal.type === 'settings') return <SettingsModal onClose={close} {...(modal.props || {})} />;
  if (modal.type === 'environments') return <EnvironmentsModal onClose={close} />;
  if (modal.type === 'prompt') return <PromptModal onClose={close} {...modal.props} />;
  return null;
}

function StatusBar() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const count = useStore((s) => s.collections.length);
  const appInfo = useStore((s) => s.appInfo);
  const sending = useStore((s) => Object.keys(s.sending).length);
  return (
    <footer className="statusbar">
      <span className={`status-led ${sending ? 'busy' : ''}`} />
      <span className="mono">{sending ? t('res.sending') : 'ONLINE'}</span>
      <span className="sep">│</span>
      <span className="mono clickable" onClick={() => window.api.openPath(settings.collectionsPath)} title={settings.collectionsPath}>
        {settings.collectionsPath}
      </span>
      <span className="sep">│</span>
      <span className="mono">
        {count} {t('sidebar.collections').toLowerCase()}
      </span>
      <span className="grow" />
      <span className="mono">proxy:{settings.proxyMode}</span>
      <span className="sep">│</span>
      <span className="mono">{(settings.theme || '').toUpperCase()}</span>
      <span className="sep">│</span>
      <span className="mono">v{appInfo && appInfo.version}</span>
    </footer>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const [sidebarWidth, startResize] = useSplitter(280, { min: 200, max: 560, storageKey: 'cybersoap.sidebar' });

  useEffect(() => {
    init().catch((e) => {
      console.error(e);
      useStore.setState({ ready: true });
    });
    window.api.updateState().then((update) => useStore.setState({ update })).catch(() => {});
    const offUpdate = window.api.onUpdate((update) => {
      const prev = useStore.getState().update;
      useStore.setState({ update });
      const s = useStore.getState();
      if (update.state === 'available' && (!prev || prev.state !== 'available') && !update.manual)
        s.toast(s.t('update.available', { v: update.version }), 'info');
      if (update.state === 'downloaded' && (!prev || prev.state !== 'downloaded')) s.toast(s.t('update.ready', { v: update.version }), 'success');
    });
    const off = window.api.onMenu((action) => {
      if (action === 'settings') useStore.getState().setModal({ type: 'settings' });
    });
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useStore.getState();
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.saveActive();
      } else if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (s.activeTab) s.closeTab(s.activeTab);
      } else if (mod && e.key === 'Enter') {
        const tab = s.tabs.find((t) => t.id === s.activeTab);
        if (tab && tab.kind === 'request') {
          e.preventDefault();
          s.send(tab.path);
        }
      } else if (mod && e.key === ',') {
        e.preventDefault();
        s.setModal({ type: 'settings' });
      } else if (mod && e.key === 'Tab') {
        e.preventDefault();
        const idx = s.tabs.findIndex((t) => t.id === s.activeTab);
        if (s.tabs.length) {
          const next = s.tabs[(idx + (e.shiftKey ? -1 : 1) + s.tabs.length) % s.tabs.length];
          s.setActiveTab(next.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      offUpdate();
      window.removeEventListener('keydown', onKey);
    };
  }, [init]);

  if (!ready) {
    return (
      <div className="boot">
        <Logo size={96} animated />
        <div className="boot-text glitch" data-text="BOOTING CYBERSOAP…">
          BOOTING CYBERSOAP…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar width={sidebarWidth} />
        <div className="sidebar-resizer" onMouseDown={startResize} />
        <main className="main">
          <TabBar />
          <div className="view">
            <ActiveView />
          </div>
        </main>
      </div>
      <StatusBar />
      <Modals />
      <ContextMenu />
      <Toasts />
      <div className="scanlines" />
    </div>
  );
}
