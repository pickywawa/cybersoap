import React from 'react';
import { useStore, isUnder } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { Modal } from './ui';

/** Move a collection or a group to the root or into another group */
export default function MoveModal({ item, onClose }) {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const root = useStore((s) => s.settings.collectionsPath);
  const parent = item.path.slice(0, Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\')));

  const targets = [{ path: root, name: t('move.root'), depth: 0, root: true }];
  const visit = (items, depth) => {
    for (const it of items) {
      if (it.type !== 'group') continue;
      if (it.path === item.path || isUnder(it.path, item.path)) continue; // not into itself
      targets.push({ path: it.path, name: it.name, depth });
      visit(it.children, depth + 1);
    }
  };
  visit(tree, 1);

  const move = async (dest) => {
    await useStore.getState().moveItem(item.path, dest);
    useStore.getState().toggleExpanded(dest, true);
    onClose();
  };

  return (
    <Modal title={t('move.title', { name: item.name })} onClose={onClose} width={460}>
      <div className="move-list">
        {targets.map((d) => {
          const current = d.path === parent;
          return (
            <button key={d.path} className={`move-target ${current ? 'current' : ''}`} disabled={current} style={{ paddingLeft: 12 + d.depth * 18 }} onClick={() => move(d.path)}>
              <Icon name={d.root ? 'database' : 'folder'} size={14} className={d.root ? 'accent' : 'group-icon'} />
              <span className="grow ellipsis">{d.name}</span>
              {current && <span className="dim small-text">{t('move.current')}</span>}
            </button>
          );
        })}
        {targets.length === 1 && <p className="hint">{t('move.noGroup')}</p>}
      </div>
    </Modal>
  );
}
