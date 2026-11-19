import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import AuthEditor from './AuthEditor';
import { Tabs, KeyValueTable, Field } from './ui';

function countRequests(items) {
  let n = 0;
  for (const it of items || []) n += it.type === 'request' ? 1 : countRequests(it.children);
  return n;
}

export default function CollectionView({ dir }) {
  const t = useT();
  const meta = useStore((s) => s.metas[dir]);
  const collection = useStore((s) => s.collections.find((c) => c.path === dir));
  const { saveMeta, toast, updateFromWsdl, openRunner } = useStore.getState();
  const [draft, setDraft] = useState(meta);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(meta), [meta]);
  if (!draft) return <div className="loading">…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(meta);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const save = async () => {
    await saveMeta(dir, draft);
    toast(t('col.saved'), 'success');
  };

  return (
    <div className="collection-view">
      <div className="col-head">
        <Icon name="database" size={22} className="accent" />
        <div>
          <h2 className="col-title">{draft.name}</h2>
          <span className="dim mono small-text">{dir}</span>
        </div>
        <div className="grow" />
        <button className="btn ghost" onClick={() => openRunner(dir)}>
          <Icon name="play" size={14} /> {t('menu.runCollection')}
        </button>
        <button className="btn primary" disabled={!dirty} onClick={save}>
          <Icon name="check" size={14} /> {t('common.save')}
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: t('col.overview') },
          { id: 'variables', label: t('col.variables'), badge: (draft.variables || []).length || null },
          { id: 'headers', label: t('col.headers'), badge: (draft.headers || []).length || null },
          { id: 'auth', label: t('col.auth') },
          { id: 'wsdl', label: t('col.wsdl') }
        ]}
      />
      <div className="scroll pad col-body">
        {tab === 'overview' && (
          <div className="form-grid narrow">
            <div className="stats-row">
              <div className="stat cyber-frame">
                <span className="stat-value">{countRequests(collection && collection.children)}</span>
                <span className="stat-label">{t('col.requests')}</span>
              </div>
              <div className="stat cyber-frame">
                <span className="stat-value">{(draft.variables || []).length}</span>
                <span className="stat-label">{t('col.variables')}</span>
              </div>
            </div>
            <Field label={t('common.description')}>
              <textarea className="input" rows={4} value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="SOAP">
              <select className="input" value={draft.soapVersion || '1.1'} onChange={(e) => set({ soapVersion: e.target.value })}>
                <option value="1.1">SOAP 1.1</option>
                <option value="1.2">SOAP 1.2</option>
              </select>
            </Field>
            <Field label={t('col.path')}>
              <div className="input-row">
                <input className="input mono" readOnly value={dir} />
                <button className="btn ghost" onClick={() => window.api.openPath(dir)}>
                  <Icon name="folderOpen" size={14} />
                </button>
              </div>
            </Field>
          </div>
        )}
        {tab === 'variables' && (
          <>
            <p className="hint">{t('col.varsHint')}</p>
            <KeyValueTable rows={draft.variables} onChange={(variables) => set({ variables })} />
          </>
        )}
        {tab === 'headers' && (
          <>
            <p className="hint">{t('col.headersHint')}</p>
            <KeyValueTable rows={draft.headers} onChange={(headers) => set({ headers })} />
          </>
        )}
        {tab === 'auth' && <AuthEditor auth={draft.auth && draft.auth.type !== 'inherit' ? draft.auth : { type: 'none' }} allowInherit={false} onChange={(auth) => set({ auth })} />}
        {tab === 'wsdl' && (
          <div className="form-grid narrow">
            {!draft.wsdl ? (
              <p className="empty-hint">{t('col.noWsdl')}</p>
            ) : (
              <>
                <Field label={t('col.wsdlSource')}>
                  <input
                    className="input mono"
                    value={draft.wsdl.source || ''}
                    onChange={(e) => set({ wsdl: { ...draft.wsdl, source: e.target.value } })}
                  />
                </Field>
                {draft.wsdl.targetNamespace && (
                  <Field label="targetNamespace">
                    <input className="input mono" readOnly value={draft.wsdl.targetNamespace} />
                  </Field>
                )}
                <h4 className="block-title">{t('col.wsdlInterfaces')}</h4>
                <table className="data-table">
                  <tbody>
                    {(draft.wsdl.interfaces || []).map((i) => (
                      <tr key={i.name}>
                        <td className="mono accent">{i.name}</td>
                        <td>
                          <span className={`soap-badge v${i.soapVersion.replace('.', '')}`}>SOAP {i.soapVersion}</span>
                        </td>
                        <td className="mono dim">{(i.endpoints || []).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      if (dirty) await saveMeta(dir, draft);
                      await updateFromWsdl(dir);
                      setBusy(false);
                    }}
                  >
                    <Icon name="refresh" size={14} /> {busy ? t('common.loading') : t('col.wsdlUpdate')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
