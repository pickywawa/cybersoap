import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import AuthEditor from './AuthEditor';
import XmlEditor from './XmlEditor';
import { Tabs, KeyValueTable, Field } from './ui';

const api = window.api;

function collectRequests(items, out = []) {
  for (const it of items || []) {
    if (it.type === 'request') out.push(it);
    else collectRequests(it.children, out);
  }
  return out;
}

/** Operations offered by the WSDL: list on the left, detail on the right, created on demand */
function OperationsPanel({ dir, collection, hasWsdl, onUpdateWsdl, busy }) {
  const t = useT();
  const catalogVersion = useStore((s) => s.catalogVersion);
  const schema = useStore((s) => s.schemas[dir]);
  const wordWrap = useStore((s) => s.settings.wordWrap);
  const [ops, setOps] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listOperations(dir)
      .then((list) => alive && setOps(list))
      .catch(() => alive && setOps([]));
    useStore.getState().loadSchema(dir);
    return () => {
      alive = false;
    };
  }, [dir, catalogVersion]);

  // how many requests were already created from each operation
  const createdCount = useMemo(() => {
    const m = {};
    for (const r of collectRequests(collection && collection.children)) {
      const k = `${r.binding}#${r.operation}`;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [collection]);

  if (ops === null) return <div className="loading">{t('common.loading')}</div>;

  if (!ops.length) {
    return (
      <div className="ops-empty">
        <Icon name="bolt" size={34} strokeWidth={1.3} />
        <p>{hasWsdl ? t('ops.emptyWsdl') : t('ops.empty')}</p>
        {hasWsdl && (
          <button className="btn primary" disabled={busy} onClick={onUpdateWsdl}>
            <Icon name="refresh" size={14} /> {busy ? t('common.loading') : t('col.wsdlUpdate')}
          </button>
        )}
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const visible = ops.filter((o) => !f || o.name.toLowerCase().includes(f));
  const bindings = [...new Set(ops.map((o) => o.binding))];
  const multi = bindings.length > 1;
  const current = ops.find((o) => o.id === selected) || null;

  const create = async (ids, open) => {
    setCreating(true);
    await useStore.getState().createFromOperations(dir, ids, open);
    setCreating(false);
  };

  const row = (o) => {
    const n = createdCount[`${o.binding}#${o.name}`] || 0;
    return (
      <div key={o.id} className={`op-row ${selected === o.id ? 'active' : ''}`} onClick={() => setSelected(o.id)} title={o.doc || o.name}>
        <Icon name="bolt" size={12} className="op-icon" />
        <span className="op-name">{o.name}</span>
        {o.soapVersion === '1.2' && <span className="v12-tag">1.2</span>}
        {n > 0 && (
          <span className="op-created" title={t('ops.created', { n })}>
            ✓{n > 1 ? n : ''}
          </span>
        )}
        <button
          className="icon-btn op-add"
          title={t('ops.create')}
          disabled={creating}
          onClick={(e) => {
            e.stopPropagation();
            create([o.id], true);
          }}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="ops-layout">
      <aside className="ops-list">
        <div className="ops-list-head">
          <button className="btn primary small ops-create-all" disabled={creating} onClick={() => create(visible.map((o) => o.id), false)}>
            <Icon name="plus" size={13} /> {f ? t('ops.createFiltered', { n: visible.length }) : t('ops.createAll', { n: ops.length })}
          </button>
          <div className="sidebar-search ops-search">
            <Icon name="search" size={13} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('ops.filter')} />
          </div>
        </div>
        <div className="ops-rows">
          {multi
            ? bindings.map((b) => {
                const list = visible.filter((o) => o.binding === b);
                if (!list.length) return null;
                const v = list[0].soapVersion;
                return (
                  <div key={b}>
                    <div className="ops-group">
                      <span className="ellipsis">{b}</span>
                      <span className={`soap-badge v${v.replace('.', '')}`}>SOAP {v}</span>
                    </div>
                    {list.map(row)}
                  </div>
                );
              })
            : visible.map(row)}
        </div>
      </aside>
      <section className="ops-detail">
        {!current ? (
          <div className="ops-empty">
            <Icon name="file" size={34} strokeWidth={1.3} />
            <p>{t('ops.select')}</p>
          </div>
        ) : (
          <>
            <div className="ops-detail-head">
              <div className="grow">
                <h3 className="op-title">
                  <Icon name="bolt" size={15} className="accent" /> {current.name}
                </h3>
                <div className="op-meta">
                  <span className={`soap-badge v${current.soapVersion.replace('.', '')}`}>SOAP {current.soapVersion}</span>
                  <span className="dim mono">{current.binding}</span>
                  {(createdCount[`${current.binding}#${current.name}`] || 0) > 0 && (
                    <span className="chip ok tiny">{t('ops.created', { n: createdCount[`${current.binding}#${current.name}`] })}</span>
                  )}
                </div>
              </div>
              <button className="btn primary" disabled={creating} onClick={() => create([current.id], true)}>
                <Icon name="plus" size={14} /> {t('ops.create')}
              </button>
            </div>
            <div className="op-fields">
              <div className="op-field">
                <span className="field-label">Endpoint</span>
                <span className="mono">{current.endpoint || '—'}</span>
              </div>
              <div className="op-field">
                <span className="field-label">SOAPAction</span>
                <span className="mono">{current.soapAction || '—'}</span>
              </div>
              {current.doc && (
                <div className="op-field">
                  <span className="field-label">{t('req.docs')}</span>
                  <span>{current.doc}</span>
                </div>
              )}
            </div>
            <div className="editor-wrap op-body">
              <XmlEditor key={current.id} value={current.body} readOnly schema={schema} wordWrap={wordWrap} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function CollectionView({ dir }) {
  const t = useT();
  const meta = useStore((s) => s.metas[dir]);
  const collection = useStore((s) => s.collections.find((c) => c.path === dir));
  const { saveMeta, toast, updateFromWsdl, openRunner } = useStore.getState();
  const [draft, setDraft] = useState(meta);
  const [tab, setTab] = useState('operations');
  const [busy, setBusy] = useState(false);
  const lastMeta = useRef(JSON.stringify(meta));

  // reset the draft only when the saved meta really changed
  useEffect(() => {
    const json = JSON.stringify(meta);
    if (json !== lastMeta.current) {
      lastMeta.current = json;
      setDraft(meta);
    }
  }, [meta]);
  if (!draft) return <div className="loading">…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(meta);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const save = async () => {
    await saveMeta(dir, draft);
    toast(t('col.saved'), 'success');
  };
  const runUpdate = async () => {
    setBusy(true);
    if (dirty) await saveMeta(dir, draft);
    await updateFromWsdl(dir);
    setBusy(false);
  };
  const requestCount = collectRequests(collection && collection.children).length;
  const hasWsdl = !!(draft.wsdl && draft.wsdl.source);

  return (
    <div className="collection-view">
      <div className="col-head compact">
        <Icon name="database" size={20} className="accent" />
        <div className="col-head-main">
          <div className="col-head-line">
            <h2 className="col-title">{draft.name}</h2>
            <span className="chip">{t('col.requestsCount', { n: requestCount })}</span>
            <span className="chip">{t('col.varsCount', { n: (draft.variables || []).length })}</span>
            <select className="input small soap-select" value={draft.soapVersion || '1.1'} onChange={(e) => set({ soapVersion: e.target.value })} title="SOAP">
              <option value="1.1">SOAP 1.1</option>
              <option value="1.2">SOAP 1.2</option>
            </select>
          </div>
          <div className="col-head-line">
            <input
              className="input small col-desc"
              value={draft.description || ''}
              placeholder={t('col.descPlaceholder')}
              onChange={(e) => set({ description: e.target.value })}
            />
            <button className="link-btn mono col-path" title={t('settings.openFolder')} onClick={() => api.openPath(dir)}>
              <Icon name="folderOpen" size={12} /> {dir}
            </button>
          </div>
        </div>
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
          { id: 'operations', label: t('ops.title') },
          { id: 'variables', label: t('col.variables'), badge: (draft.variables || []).length || null },
          { id: 'headers', label: t('col.headers'), badge: (draft.headers || []).length || null },
          { id: 'auth', label: t('col.auth') },
          { id: 'wsdl', label: t('col.wsdl') }
        ]}
      />
      {tab === 'operations' ? (
        <OperationsPanel dir={dir} collection={collection} hasWsdl={hasWsdl} onUpdateWsdl={runUpdate} busy={busy} />
      ) : (
        <div className="scroll pad col-body">
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
          {tab === 'auth' && (
            <AuthEditor auth={draft.auth && draft.auth.type !== 'inherit' ? draft.auth : { type: 'none' }} allowInherit={false} onChange={(auth) => set({ auth })} />
          )}
          {tab === 'wsdl' && (
            <div className="form-grid narrow">
              {!draft.wsdl ? (
                <p className="empty-hint">{t('col.noWsdl')}</p>
              ) : (
                <>
                  <Field label={t('col.wsdlSource')}>
                    <input className="input mono" value={draft.wsdl.source || ''} onChange={(e) => set({ wsdl: { ...draft.wsdl, source: e.target.value } })} />
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
                  <p className="hint">{t('col.wsdlUpdateHint')}</p>
                  <div>
                    <button className="btn primary" disabled={busy} onClick={runUpdate}>
                      <Icon name="refresh" size={14} /> {busy ? t('common.loading') : t('col.wsdlUpdate')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
