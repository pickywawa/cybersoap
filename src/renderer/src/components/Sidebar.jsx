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
  const newCollection = (parent) =>
    prompt({ title: t('sidebar.newCollection'), label: t('prompt.collectionName'), onSubmit: (n) => s().createCollection(n, parent).catch((e) => s().error(e)) });
  const newGroup = (parent) =>
    prompt({ title: t('sidebar.newGroup'), label: t('prompt.folderName'), onSubmit: (n) => s().createGroup(parent, n).catch((e) => s().error(e)) });
  const moveTo = (item) => s().setModal({ type: 'move', props: { item } });
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

  const menu = (e, item) => {
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
        { icon: 'layers', label: t('menu.moveTo'), onClick: () => moveTo(item) },
        { icon: 'eye', label: t('menu.reveal'), onClick: () => api.reveal(item.path) },
        '-',
        { icon: 'edit', label: t('common.rename'), onClick: () => rename(item) },
        { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => s().deleteItem(item.path, item.name) }
      ]);
    } else if (item.type === 'group') {
      openContextMenu(e, [
        { icon: 'database', label: t('sidebar.newCollection'), onClick: () => newCollection(item.path) },
        { icon: 'folder', label: t('sidebar.newGroup'), onClick: () => newGroup(item.path) },
        '-',
        { icon: 'layers', label: t('menu.moveTo'), onClick: () => moveTo(item) },
        { icon: 'eye', label: t('menu.reveal'), onClick: () => api.reveal(item.path) },
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
  menu.newCollection = newCollection;
  menu.newGroup = newGroup;
  return menu;
}

const CONTAINER_TYPE = 'application/x-cybersoap-container';
const parentOf = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));

function TreeItem({ item, depth, filter, menu }) {
  const expanded = useStore((s) => s.expanded[item.path]);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const openRequest = useStore((s) => s.openRequest);
  const activeTab = useStore((s) => s.activeTab);
  const dirty = useStore((s) => item.type === 'request' && s.isDirty(item.path));
  const sending = useStore((s) => !!s.sending[item.path]);
  const [drop, setDrop] = useState(null); // 'before' | 'after' | 'into'

  if (!matchFilter(item, filter)) return null;
  // groups are open by default, collections and folders closed
  const isOpen = filter ? true : expanded ?? item.type === 'group';
  const isContainer = item.type !== 'request';
  const active = activeTab === `req:${item.path}` || activeTab === `col:${item.path}`;
  const s = useStore.getState;

  const onClick = () => {
    if (item.type === 'collection') {
      // a click opens the collection (expand + settings tab); only the chevron collapses it
      toggleExpanded(item.path, true);
      s().openCollectionSettings(item.path);
    } else if (item.type === 'folder' || item.type === 'group') toggleExpanded(item.path, !isOpen);
    else openRequest(item.path).catch((e) => s().error(e));
  };

  const zone = (e) => {
    const container = e.dataTransfer.types.includes(CONTAINER_TYPE);
    if (container) {
      // collections and groups: into a group, or next to a collection (= into its parent)
      if (item.type === 'group') return 'into';
      if (item.type === 'collection') return 'beside';
      return null;
    }
    if (item.type === 'group') return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (item.type === 'collection') return 'into';
    if (item.type === 'folder') return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
    return y < 0.5 ? 'before' : 'after';
  };

  const dnd = {
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/cybersoap-path', item.path);
      if (item.type === 'collection' || item.type === 'group') e.dataTransfer.setData(CONTAINER_TYPE, '1');
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes('text/cybersoap-path')) return;
      e.stopPropagation();
      const z = zone(e);
      if (!z) {
        if (drop) setDrop(null);
        return;
      }
      e.preventDefault();
      if (z !== drop) setDrop(z);
    },
    onDragLeave: () => setDrop(null),
    onDrop: (e) => {
      e.stopPropagation();
      const z = drop || zone(e);
      setDrop(null);
      const src = e.dataTransfer.getData('text/cybersoap-path');
      if (!z || !src || src === item.path || isUnder(item.path, src)) return;
      e.preventDefault();
      if (z === 'into') {
        s().moveItem(src, item.path);
        toggleExpanded(item.path, true);
      } else if (z === 'beside') s().moveItem(src, parentOf(item.path));
      else s().reorderItem(src, item.path, z);
    }
  };

  const chevron = (
    <span
      className="chev-btn"
      onClick={(e) => {
        e.stopPropagation();
        toggleExpanded(item.path, !isOpen);
      }}
    >
      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="chev" />
    </span>
  );

  return (
    <>
      <div
        className={`tree-row ${item.type} ${active ? 'active' : ''} ${drop ? `drop-${drop === 'beside' ? 'before' : drop}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={onClick}
        onContextMenu={(e) => menu(e, item)}
        title={item.type === 'request' && item.operation ? `${item.operation}` : item.name}
        {...dnd}
      >
        {isContainer ? chevron : <Icon name="file" size={13} className="row-icon req-icon" />}
        {item.type === 'group' && <Icon name={isOpen ? 'folderOpen' : 'folder'} size={14} className="row-icon group-icon" />}
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
  const tree = useStore((s) => s.tree);
  const root = useStore((s) => s.settings.collectionsPath);
  const [rootDrop, setRootDrop] = useState(false);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const refresh = useStore((s) => s.refresh);
  const setModal = useStore((s) => s.setModal);
  const menu = useItemMenu();
  const f = filter.trim().toLowerCase();

  // dropping a collection or a group on the empty area moves it back to the root
  const rootDnd = {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(CONTAINER_TYPE)) return;
      e.preventDefault();
      setRootDrop(true);
    },
    onDragLeave: () => setRootDrop(false),
    onDrop: (e) => {
      setRootDrop(false);
      const src = e.dataTransfer.getData('text/cybersoap-path');
      if (src && root) {
        e.preventDefault();
        useStore.getState().moveItem(src, root);
      }
    }
  };

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head">
        <span className="section-title">{t('sidebar.collections')}</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title={t('sidebar.newCollection')} onClick={() => menu.newCollection(null)}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" title={t('sidebar.newGroup')} onClick={() => menu.newGroup(null)}>
            <Icon name="folderPlus" />
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
      <div className={`tree ${rootDrop ? 'root-drop' : ''}`} {...rootDnd}>
        {tree.length === 0 && (
          <div className="sidebar-empty">
            <p>{t('sidebar.empty')}</p>
            <p className="dim">{t('sidebar.emptyHint')}</p>
            <button className="btn primary small" onClick={() => setModal({ type: 'import', props: { tab: 'wsdl' } })}>
              <Icon name="import" size={14} /> {t('welcome.importWsdl')}
            </button>
          </div>
        )}
        {tree.map((c) => (
          <TreeItem key={c.path} item={c} depth={0} filter={f} menu={menu} />
        ))}
        {rootDrop && <div className="root-drop-hint">{t('sidebar.dropRoot')}</div>}
      </div>
    </aside>
  );
}
