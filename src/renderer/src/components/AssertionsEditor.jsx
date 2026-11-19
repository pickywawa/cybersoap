import React from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import Icon from './Icons';
import { ASSERTION_TYPES, NEEDS_VALUE, newId } from '../utils/assertions';

export function AssertionsEditor({ assertions, onChange, results }) {
  const t = useT();
  const list = assertions || [];
  const update = (i, patch) => onChange(list.map((a, j) => (i === j ? { ...a, ...patch } : a)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const add = () => onChange([...list, { id: newId('a'), type: 'contains', value: '', enabled: true }]);
  const resultOf = (id) => (results || []).find((r) => r.id === id);
  return (
    <div className="assertions">
      {list.length === 0 && <p className="empty-hint">{t('assert.empty')}</p>}
      {list.map((a, i) => {
        const r = resultOf(a.id);
        return (
          <div key={a.id || i} className={`assert-row ${a.enabled === false ? 'disabled' : ''}`}>
            <input type="checkbox" className="check" checked={a.enabled !== false} onChange={(e) => update(i, { enabled: e.target.checked })} />
            <select className="input" value={a.type} onChange={(e) => update(i, { type: e.target.value })}>
              {ASSERTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`assert.t.${type}`)}
                </option>
              ))}
            </select>
            {NEEDS_VALUE[a.type] ? (
              <input
                className="input mono grow"
                value={a.value || ''}
                placeholder={a.type === 'xpath' ? '//tem:AddResult' : a.type === 'status' ? '200' : ''}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            ) : (
              <span className="grow" />
            )}
            {a.type === 'xpath' && (
              <input
                className="input mono"
                style={{ width: 140 }}
                value={a.expected || ''}
                placeholder={t('assert.expectedHint')}
                title={t('assert.expected')}
                onChange={(e) => update(i, { expected: e.target.value })}
              />
            )}
            {r && (
              <span className={`assert-state ${r.passed ? 'ok' : 'ko'}`} title={r.message}>
                <Icon name={r.passed ? 'check' : 'x'} size={13} />
              </span>
            )}
            <button className="icon-btn danger" onClick={() => remove(i)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        );
      })}
      <div className="row-actions">
        <button className="btn ghost small" onClick={add}>
          <Icon name="plus" size={14} /> {t('assert.add')}
        </button>
      </div>
      <p className="hint">{t('assert.xpathHint')}</p>
    </div>
  );
}

const EMPTY = {};

export function ExtractorsEditor({ extractors, onChange, dir }) {
  const t = useT();
  const runtime = useStore((s) => s.runtime[dir] || EMPTY);
  const clearRuntime = useStore((s) => s.clearRuntime);
  const list = extractors || [];
  const update = (i, patch) => onChange(list.map((a, j) => (i === j ? { ...a, ...patch } : a)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const add = () => onChange([...list, { id: newId('x'), name: '', xpath: '', enabled: true }]);
  return (
    <div className="assertions">
      <h4 className="block-title">{t('extract.title')}</h4>
      <p className="hint">{t('extract.hint')}</p>
      {list.map((x, i) => (
        <div key={x.id || i} className={`assert-row ${x.enabled === false ? 'disabled' : ''}`}>
          <input type="checkbox" className="check" checked={x.enabled !== false} onChange={(e) => update(i, { enabled: e.target.checked })} />
          <input className="input mono" style={{ width: 160 }} placeholder={t('extract.var')} value={x.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input className="input mono grow" placeholder="//*[local-name()='SessionId']" value={x.xpath} onChange={(e) => update(i, { xpath: e.target.value })} />
          <button className="icon-btn danger" onClick={() => remove(i)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <div className="row-actions">
        <button className="btn ghost small" onClick={add}>
          <Icon name="plus" size={14} /> {t('extract.add')}
        </button>
      </div>
      <h4 className="block-title">{t('extract.runtime')}</h4>
      {Object.keys(runtime).length === 0 ? (
        <p className="hint">—</p>
      ) : (
        <>
          <table className="data-table">
            <tbody>
              {Object.entries(runtime).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono accent">{`{{${k}}}`}</td>
                  <td className="mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost small" onClick={() => clearRuntime(dir)}>
            <Icon name="trash" size={14} /> {t('extract.clear')}
          </button>
        </>
      )}
    </div>
  );
}
