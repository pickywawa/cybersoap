import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import { useStore } from '../store';
import { useT } from '../i18n';

export function Modal({ title, onClose, children, footer, width = 560, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={`modal cyber-frame ${className}`} style={{ width }}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Simple text prompt modal */
export function PromptModal({ title, label, initial = '', onSubmit, onClose, okLabel }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    ref.current && ref.current.focus();
    ref.current && ref.current.select();
  }, []);
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={submit}>
            {okLabel || t('common.create')}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input ref={ref} className="input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </label>
    </Modal>
  );
}

export function prompt(opts) {
  useStore.getState().setModal({ type: 'prompt', props: opts });
}

export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!menu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu, setContextMenu]);
  useEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8)
    });
  }, [menu]);
  if (!menu) return null;
  return (
    <div className="context-menu cyber-frame" ref={ref} style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
      {menu.items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="cm-sep" />
        ) : (
          <button
            key={i}
            className={`cm-item ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              setContextMenu(null);
              it.onClick();
            }}
          >
            {it.icon && <Icon name={it.icon} size={14} />}
            <span>{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  );
}

export function openContextMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  useStore.getState().setContextMenu({ x: e.clientX, y: e.clientY, items: items.filter(Boolean) });
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'x' : t.kind === 'success' ? 'check' : 'info'} size={14} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, right }) {
  return (
    <div className="subtabs">
      {tabs.map((tab) => (
        <button key={tab.id} className={`subtab ${value === tab.id ? 'active' : ''}`} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.badge != null && tab.badge !== 0 && <span className={`badge ${tab.badgeKind || ''}`}>{tab.badge}</span>}
        </button>
      ))}
      <div className="subtabs-right">{right}</div>
    </div>
  );
}

/** Editable key/value table with enable toggles */
export function KeyValueTable({ rows, onChange, keyPlaceholder, valuePlaceholder, secretKeys = false }) {
  const t = useT();
  const list = rows || [];
  const update = (i, patch) => onChange(list.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const add = () => onChange([...list, { key: '', value: '', enabled: true }]);
  return (
    <div className="kv-table">
      <div className="kv-row kv-head">
        <span />
        <span>{keyPlaceholder || t('common.key')}</span>
        <span>{valuePlaceholder || t('common.value')}</span>
        <span />
      </div>
      {list.map((r, i) => (
        <div className={`kv-row ${r.enabled === false ? 'disabled' : ''}`} key={i}>
          <input type="checkbox" className="check" checked={r.enabled !== false} onChange={(e) => update(i, { enabled: e.target.checked })} />
          <input className="input mono" value={r.key} placeholder={keyPlaceholder || t('common.key')} onChange={(e) => update(i, { key: e.target.value })} />
          <input
            className="input mono"
            type={secretKeys && r.secret ? 'password' : 'text'}
            value={r.value}
            placeholder={valuePlaceholder || t('common.value')}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button className="icon-btn danger" onClick={() => remove(i)} title={t('common.delete')}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <button className="btn ghost small add-row" onClick={add}>
        <Icon name="plus" size={14} /> {t('common.add')}
      </button>
    </div>
  );
}

export function Field({ label, hint, children, inline }) {
  return (
    <label className={`field ${inline ? 'inline' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

/** Draggable splitter: calls onResize(deltaPx) while dragging */
export function useSplitter(initial, { min = 200, max = 2000, axis = 'x', storageKey } = {}) {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      const v = Number(localStorage.getItem(storageKey));
      if (v) return v;
    }
    return initial;
  });
  const startDrag = (e, currentSize) => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const startSize = currentSize ?? size;
    document.body.classList.add('resizing');
    const onMove = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const next = Math.max(min, Math.min(max, startSize + d));
      setSize(next);
      if (storageKey) localStorage.setItem(storageKey, String(next));
    };
    const onUp = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return [size, startDrag, setSize];
}
