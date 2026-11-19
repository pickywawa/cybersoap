import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { openContextMenu } from './ui';

function TabItem({ tab, active }) {
  const t = useT();
  const title = useStore((s) => {
    if (tab.kind === 'request') return (s.docs[tab.path] && s.docs[tab.path].data.name) || '…';
    const meta = s.metas[tab.path];
    const name = meta ? meta.name : tab.path.split(/[\\/]/).pop();
    return name;
  });
  const version = useStore((s) => (tab.kind === 'request' && s.docs[tab.path] ? s.docs[tab.path].data.soapVersion : null));
  const dirty = useStore((s) => tab.kind === 'request' && s.isDirty(tab.path));
  const sending = useStore((s) => !!s.sending[tab.path]);
  const { setActiveTab, closeTab, closeTabs, moveTab } = useStore.getState();
  const [over, setOver] = useState(false);

  const menu = (e) =>
    openContextMenu(e, [
      { label: t('tabs.close'), icon: 'close', onClick: () => closeTab(tab.id) },
      { label: t('tabs.closeOthers'), onClick: () => closeTabs(useStore.getState().tabs.filter((x) => x.id !== tab.id).map((x) => x.id)) },
      { label: t('tabs.closeAll'), onClick: () => closeTabs(useStore.getState().tabs.map((x) => x.id)) }
    ]);

  return (
    <div
      className={`tab ${active ? 'active' : ''} ${over ? 'drag-over' : ''}`}
      onClick={() => setActiveTab(tab.id)}
      onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
      onContextMenu={menu}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/cybersoap-tab', tab.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/cybersoap-tab')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData('text/cybersoap-tab');
        if (from) moveTab(from, tab.id);
      }}
      title={tab.path}
    >
      {tab.kind === 'request' && <Icon name="file" size={13} className="req-icon" />}
      {tab.kind === 'collection' && <Icon name="settings" size={13} className="accent" />}
      {tab.kind === 'runner' && <Icon name="play" size={13} className="accent-2" />}
      <span className="tab-title">{title}</span>
      {version === '1.2' && <span className="v12-tag">1.2</span>}
      {sending && <span className="pulse-dot" />}
      <button
        className={`tab-close ${dirty ? 'dirty' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.id);
        }}
      >
        {dirty ? <span className="dirty-dot" /> : null}
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  if (!tabs.length) return null;
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} active={tab.id === activeTab} />
      ))}
    </div>
  );
}
