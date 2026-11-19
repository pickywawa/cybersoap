import React, { useState } from 'react';
import { useStore, isUnder } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { openContextMenu, prompt } from './ui';

const api = window.api;

function matchFilter(item, f) {
  if (!f) return true;
  if (item.type === 'request') return item.name.toLowerCase().includes(f) || (item.operation || '').toLowerCase().includes(f);
  return item.name.toLowerCase().includes(f) || (item.children || []).some((c) => matchFilter(c, f));
}

function useItemMenu() {
  const t = useT();
  const s = useStore.getState;
  const newRequest = (dir) =>
    prompt({ title: t('menu.newRequest'), label: t('prompt.requestName'), onSubmit: (n) => s().createRequest(dir, n).catch((e) => s().error(e)) });
  const newFolder = (dir) =>
    prompt({ title: t('menu.newFolder'), label: t('prompt.folderName'), onSubmit: (n) => s().createFolder(dir, n).catch((e) => s().error(e)) });
  const rename = (item) =>
    prompt({ title: t('common.rename'), label: t('prompt.newName'), initial: item.name, okLabel: t('common.rename'), onSubmit: (n) => s().renameItem(item.path, n) });
  const importRequest = async (dir) => {
    try {
      const p = await api.importRequest(dir);
      if (p) {
        await s().refresh();
        await s().openRequest(p);
      }
    } catch (e) {
      s().error(e);
    }
  };
  const exportBundle = async (dir) => {
    try {
      const p = await api.exportCollection(dir);
      if (p) s().toast(t('toast.exported', { path: p }), 'success');
    } catch (e) {
      s().error(e);
    }
  };
  const exportFolder = async (dir) => {
    try {
      const p = await api.exportFolder(dir);
      if (p) s().toast(t('toast.exported', { path: p }), 'success');
    } catch (e) {
      s().error(e);
    }
  };

  return (e, item) => {
    if (item.type === 'collection') {
      const hasWsdl = !!(item.meta && item.meta.wsdl && item.meta.wsdl.source);
      openContextMenu(e, [
        { icon: 'file', label: t('menu.newRequest'), onClick: () => newRequest(item.path) },
        { icon: 'folder', label: t('menu.newFolder'), onClick: () => newFolder(item.path) },
        { icon: 'import', label: t('menu.importRequest'), onClick: () => importRequest(item.path) },
        '-',
        { icon: 'play', label: t('menu.runCollection'), onClick: () => s().openRunner(item.path) },
        { icon: 'settings', label: t('menu.settings'), onClick: () => s().openCollectionSettings(item.path) },
        hasWsdl && { icon: 'refresh', label: t('menu.updateWsdl'), onClick: () => s().updateFromWsdl(item.path) },
        { icon: 'list', label: t('menu.sortAlpha'), onClick: () => s().sortAlpha(item.path) },
        '-',
        { icon: 'export', label: t('menu.exportBundle'), onClick: () => exportBundle(item.path) },
        { icon: 'export', label: t('menu.exportFolder'), onClick: () => exportFolder(item.path) },
        { icon: 'eye', label: t('menu.reveal'), onClick: () => api.reveal(item.path) },
        '-',
        { icon: 'edit', label: t('common.rename'), onClick: () => rename(item) },
        { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => s().deleteItem(item.path, item.name) }
      ]);
    } else if (item.type === 'folder') {
      openContextMenu(e, [
        { icon: 'file', label: t('menu.newRequest'), onClick: () => newRequest(item.path) },
        { icon: 'folder', label: t('menu.newFolder'), onClick: () => newFolder(item.path) },
        { icon: 'import', label: t('menu.importRequest'), onClick: () => importRequest(item.path) },
        { icon: 'play', label: t('menu.runFolder'), onClick: () => s().openRunner(item.path) },
        { icon: 'list', label: t('menu.sortAlpha'), onClick: () => s().sortAlpha(item.path) },
        '-',
        { icon: 'eye', label: t('menu.reveal'), onClick: () => api.reveal(item.path) },
        { icon: 'edit', label: t('common.rename'), onClick: () => rename(item) },
        { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => s().deleteItem(item.path, item.name) }
      ]);
    } else {
      openContextMenu(e, [
        { icon: 'file', label: t('common.open'), onClick: () => s().openRequest(item.path) },
        { icon: 'send', label: t('req.send'), onClick: async () => { await s().openRequest(item.path); s().send(item.path); } },
        '-',
        { icon: 'edit', label: t('common.rename'), onClick: () => rename(item) },
        { icon: 'copy', label: t('common.duplicate'), onClick: () => s().duplicateItem(item.path) },
        { icon: 'export', label: t('menu.exportRequest'), onClick: () => api.exportRequest(item.path).then((p) => p && s().toast(t('toast.exported', { path: p }), 'success')) },
        { icon: 'eye', label: t('menu.reveal'), onClick: () => api.reveal(item.path) },
        '-',
        { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => s().deleteItem(item.path, item.name) }
      ]);
    }
  };
}

function TreeItem({ item, depth, filter, menu }) {
  const expanded = useStore((s) => s.expanded[item.path]);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const openRequest = useStore((s) => s.openRequest);
  const activeTab = useStore((s) => s.activeTab);
  const dirty = useStore((s) => item.type === 'request' && s.isDirty(item.path));
  const sending = useStore((s) => !!s.sending[item.path]);
  const [drop, setDrop] = useState(null); // 'before' | 'after' | 'into'

  if (!matchFilter(item, filter)) return null;
  const isOpen = filter ? true : expanded;
  const isContainer = item.type !== 'request';
  const active = activeTab === `req:${item.path}` || activeTab === `col:${item.path}`;
  const s = useStore.getState;

  const onClick = () => {
    if (item.type === 'collection') {
      // a click opens the collection (expand + settings tab); only the chevron collapses it
      toggleExpanded(item.path, true);
      s().openCollectionSettings(item.path);
    } else if (item.type === 'folder') toggleExpanded(item.path);
    else openRequest(item.path).catch((e) => s().error(e));
  };

  const zone = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (item.type === 'collection') return 'into';
    if (item.type === 'folder') return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
    return y < 0.5 ? 'before' : 'after';
  };

  const dnd = {
    draggable: item.type !== 'collection',
    onDragStart: (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/cybersoap-path', item.path);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes('text/cybersoap-path')) return;
      e.preventDefault();
      const z = zone(e);
      if (z !== drop) setDrop(z);
    },
    onDragLeave: () => setDrop(null),
    onDrop: (e) => {
      const z = drop || zone(e);
      setDrop(null);
      const src = e.dataTransfer.getData('text/cybersoap-path');
      if (!src || src === item.path || isUnder(item.path, src)) return;
      e.preventDefault();
      if (z === 'into') {
        s().moveItem(src, item.path);
        toggleExpanded(item.path, true);
      } else s().reorderItem(src, item.path, z);
    }
  };

  const chevron = (
    <span
      className="chev-btn"
      onClick={(e) => {
        e.stopPropagation();
        toggleExpanded(item.path);
      }}
    >
      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="chev" />
    </span>
  );

  return (
    <>
      <div
        className={`tree-row ${item.type} ${active ? 'active' : ''} ${drop ? `drop-${drop}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={onClick}
        onContextMenu={(e) => menu(e, item)}
        title={item.type === 'request' && item.operation ? `${item.operation}` : item.name}
        {...dnd}
      >
        {isContainer ? chevron : <Icon name="file" size={13} className="row-icon req-icon" />}
        {item.type === 'collection' && <Icon name="database" size={14} className="row-icon accent" />}
        {item.type === 'folder' && <Icon name={isOpen ? 'folderOpen' : 'folder'} size={14} className="row-icon" />}
        <span className="tree-name">{item.name}</span>
        {item.type === 'request' && item.soapVersion === '1.2' && <span className="v12-tag">1.2</span>}
        {sending && <span className="pulse-dot" />}
        {dirty && <span className="dirty-dot" />}
        <button
          className="icon-btn row-menu"
          onClick={(e) => {
            e.stopPropagation();
            menu(e, item);
          }}
        >
          <Icon name="dots" size={14} />
        </button>
      </div>
      {isContainer &&
        isOpen &&
        (item.children || []).map((c) => <TreeItem key={c.path} item={c} depth={depth + 1} filter={filter} menu={menu} />)}
    </>
  );
}

export default function Sidebar({ width }) {
  const t = useT();
  const collections = useStore((s) => s.collections);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const refresh = useStore((s) => s.refresh);
  const setModal = useStore((s) => s.setModal);
  const menu = useItemMenu();
  const f = filter.trim().toLowerCase();

  const newCollection = () =>
    prompt({
      title: t('sidebar.newCollection'),
      label: t('prompt.collectionName'),
      onSubmit: (n) => useStore.getState().createCollection(n).catch((e) => useStore.getState().error(e))
    });

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head">
        <span className="section-title">{t('sidebar.collections')}</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title={t('sidebar.newCollection')} onClick={newCollection}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" title={t('sidebar.import')} onClick={() => setModal({ type: 'import' })}>
            <Icon name="import" />
          </button>
          <button className="icon-btn" title={t('sidebar.refresh')} onClick={() => refresh()}>
            <Icon name="refresh" />
          </button>
        </div>
      </div>
      <div className="sidebar-search">
        <Icon name="search" size={13} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('sidebar.filter')} />
        {filter && (
          <button className="icon-btn" onClick={() => setFilter('')}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="tree">
        {collections.length === 0 && (
          <div className="sidebar-empty">
            <p>{t('sidebar.empty')}</p>
            <p className="dim">{t('sidebar.emptyHint')}</p>
            <button className="btn primary small" onClick={() => setModal({ type: 'import', props: { tab: 'wsdl' } })}>
              <Icon name="import" size={14} /> {t('welcome.importWsdl')}
            </button>
          </div>
        )}
        {collections.map((c) => (
          <TreeItem key={c.path} item={c} depth={0} filter={f} menu={menu} />
        ))}
      </div>
    </aside>
  );
}
