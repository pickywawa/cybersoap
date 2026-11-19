import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import XmlEditor, { nextPlaceholder } from './XmlEditor';
import ResponseView from './ResponseView';
import AuthEditor from './AuthEditor';
import { AssertionsEditor, ExtractorsEditor } from './AssertionsEditor';
import Icon from './Icons';
import { Tabs, KeyValueTable, useSplitter, openContextMenu } from './ui';
import { formatXml, minifyXml, xmlError } from '../utils/xml';
import { buildScope, resolveRequest, unresolved } from '../utils/vars';

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export default function RequestView({ path }) {
  const t = useT();
  const doc = useStore((s) => s.docs[path]);
  const dir = useStore((s) => s.collectionOf(path));
  const meta = useStore((s) => (dir ? s.metas[dir] : null));
  const schema = useStore((s) => (dir ? s.schemas[dir] : null));
  const runtime = useStore((s) => (dir ? s.runtime[dir] : null));
  const envsState = useStore((s) => s.envs);
  const activeEnv = useStore((s) => s.settings.activeEnvironment);
  const sending = useStore((s) => !!s.sending[path]);
  const dirty = useStore((s) => s.isDirty(path));
  const response = useStore((s) => s.responses[path]);
  const settings = useStore((s) => s.settings);
  const { updateDoc, saveDoc, send, cancel, toast } = useStore.getState();
  const [tab, setTab] = useState('body');
  const editorRef = useRef(null);
  const container = useRef(null);
  const [split, startSplit, setSplit] = useSplitter(0, { min: 280, max: 4000, storageKey: 'cybersoap.split' });

  const data = doc ? doc.data : null;
  const envs = useMemo(() => useStore.getState().envScope(), [envsState, activeEnv]); // eslint-disable-line
  const scope = useMemo(() => buildScope(meta, runtime, envs), [meta, runtime, envs]);
  const xmlErr = useMemo(() => (data ? xmlError(data.body) : null), [data && data.body]); // eslint-disable-line
  const missing = useMemo(() => (data ? unresolved(`${data.url} ${data.body}`, scope) : []), [data, scope]);

  if (!data) return <div className="loading">{t('common.loading')}</div>;

  const set = (patch) => updateDoc(path, patch);
  const format = () => {
    try {
      set({ body: formatXml(data.body) });
    } catch (_) {
      toast(t('toast.formatError'), 'error');
    }
  };
  const minify = () => {
    try {
      set({ body: minifyXml(data.body) });
    } catch (_) {
      toast(t('toast.formatError'), 'error');
    }
  };
  const save = async () => {
    await saveDoc(path);
    toast(t('req.saved'), 'success');
  };
  const copyCurl = () => {
    const r = resolveRequest(data, meta, runtime, envs);
    const headers = [...r.headers];
    const lower = headers.map((h) => h.key.toLowerCase());
    if (!lower.includes('content-type'))
      headers.push({
        key: 'Content-Type',
        value: r.soapVersion === '1.2' ? `application/soap+xml;charset=UTF-8;action="${r.soapAction}"` : 'text/xml;charset=UTF-8'
      });
    if (r.soapVersion !== '1.2' && !lower.includes('soapaction')) headers.push({ key: 'SOAPAction', value: `"${r.soapAction}"` });
    let cmd = `curl -X POST ${shellQuote(r.url)}`;
    for (const h of headers) cmd += ` \\\n  -H ${shellQuote(`${h.key}: ${h.value}`)}`;
    if (r.auth.type === 'basic') cmd += ` \\\n  -u ${shellQuote(`${r.auth.username}:${r.auth.password}`)}`;
    cmd += ` \\\n  --data-binary ${shellQuote(r.body)}`;
    navigator.clipboard.writeText(cmd);
    toast(t('common.copied'), 'success');
  };

  const headerCount = (data.headers || []).filter((h) => h.enabled !== false && h.key).length;
  const assertCount = (data.assertions || []).filter((a) => a.enabled !== false).length;
  const authActive = data.auth && data.auth.type !== 'inherit' && data.auth.type !== 'none';
  const results = response && response.assertions;
  const failed = results ? results.filter((r) => !r.passed).length : 0;

  const leftStyle = split ? { width: split, flex: 'none' } : {};

  return (
    <div className="request-view">
      <div className="url-bar">
        <select
          className={`version-select v${(data.soapVersion || '1.1').replace('.', '')}`}
          value={data.soapVersion || '1.1'}
          onChange={(e) => set({ soapVersion: e.target.value })}
          title="SOAP version"
        >
          <option value="1.1">SOAP 1.1</option>
          <option value="1.2">SOAP 1.2</option>
        </select>
        <input
          className="url-input mono"
          value={data.url || ''}
          placeholder={t('req.urlPlaceholder')}
          onChange={(e) => set({ url: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(path);
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) send(path);
          }}
          spellCheck={false}
        />
        {dirty && (
          <button className="icon-btn save-btn" title={`${t('common.save')} (⌘S)`} onClick={save}>
            <span className="dirty-dot" />
          </button>
        )}
        <button
          className="icon-btn"
          onClick={(e) =>
            openContextMenu(e, [
              { icon: 'terminal', label: t('req.copyCurl'), onClick: copyCurl },
              { icon: 'export', label: t('menu.exportRequest'), onClick: () => window.api.exportRequest(path) },
              { icon: 'eye', label: t('menu.reveal'), onClick: () => window.api.reveal(path) }
            ])
          }
        >
          <Icon name="dots" />
        </button>
        {sending ? (
          <button className="btn danger send-btn" onClick={() => cancel(path)}>
            <Icon name="stop" size={14} /> {t('req.cancel')}
          </button>
        ) : (
          <button className="btn primary send-btn" onClick={() => send(path)} title="⌘/Ctrl + Enter">
            <Icon name="send" size={14} /> {t('req.send')}
          </button>
        )}
      </div>
      <div className="meta-bar">
        {data.operation && (
          <span className="meta-item">
            <Icon name="bolt" size={12} /> <b>{data.operation}</b>
            {data.binding && <span className="dim"> · {data.binding}</span>}
          </span>
        )}
        <label className="meta-item action-field">
          <span className="dim">{t('req.soapAction')}</span>
          <input className="input mono small" value={data.soapAction || ''} onChange={(e) => set({ soapAction: e.target.value })} spellCheck={false} />
        </label>
        {missing.length > 0 && (
          <span className="meta-item warn" title={missing.join(', ')}>
            <Icon name="info" size={12} /> {t('req.missingVars', { vars: missing.join(', ') })}
          </span>
        )}
      </div>

      <div className="split" ref={container}>
        <section className="pane request-pane" style={leftStyle}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'body', label: t('req.body') },
              { id: 'headers', label: t('req.headers'), badge: headerCount || null },
              { id: 'auth', label: t('req.auth'), badge: authActive ? '●' : null },
              { id: 'assertions', label: t('req.assertions'), badge: assertCount || null, badgeKind: results ? (failed ? 'err' : 'ok') : '' },
              { id: 'vars', label: t('req.vars'), badge: (data.extractors || []).length || null },
              { id: 'docs', label: t('req.docs') }
            ]}
          />
          <div className="pane-body">
            {tab === 'body' && (
              <div className="body-toolbar">
                <span className={`xml-state ${xmlErr ? 'ko' : 'ok'}`} title={xmlErr ? `${xmlErr.line}:${xmlErr.col} ${xmlErr.message}` : ''}>
                  <Icon name={xmlErr ? 'x' : 'check'} size={12} /> {xmlErr ? `${t('req.invalidXml')} — ${xmlErr.line}:${xmlErr.col} ${xmlErr.message}` : t('req.validXml')}
                </span>
                <span className="grow" />
                <button className="btn ghost small" title="F2" onClick={() => editorRef.current && nextPlaceholder(editorRef.current)}>
                  <Icon name="next" size={13} /> {t('req.nextPlaceholder')}
                </button>
                <button className="btn ghost small" title="⇧⌥F" onClick={format}>
                  <Icon name="wand" size={13} /> {t('req.format')}
                </button>
                <button className="btn ghost small" onClick={minify}>
                  <Icon name="code" size={13} /> {t('req.minify')}
                </button>
              </div>
            )}
            {tab === 'body' && (
              <div className="editor-wrap">
                <XmlEditor
                  value={data.body}
                  onChange={(body) => set({ body })}
                  schema={schema}
                  lint
                  wordWrap={settings.wordWrap}
                  onRun={() => send(path)}
                  onSave={save}
                  onFormat={format}
                  getVariables={() => Object.keys(buildScope(useStore.getState().metas[dir], useStore.getState().runtime[dir], useStore.getState().envScope()))}
                  editorRef={editorRef}
                />
              </div>
            )}
            {tab === 'headers' && (
              <div className="scroll pad">
                <KeyValueTable rows={data.headers} onChange={(headers) => set({ headers })} />
                <p className="hint">{t('req.headersHint')}</p>
              </div>
            )}
            {tab === 'auth' && (
              <div className="scroll pad">
                <AuthEditor auth={data.auth} onChange={(auth) => set({ auth })} />
              </div>
            )}
            {tab === 'assertions' && (
              <div className="scroll pad">
                <AssertionsEditor assertions={data.assertions} onChange={(assertions) => set({ assertions })} results={results} />
              </div>
            )}
            {tab === 'vars' && (
              <div className="scroll pad">
                <ExtractorsEditor extractors={data.extractors} onChange={(extractors) => set({ extractors })} dir={dir} />
              </div>
            )}
            {tab === 'docs' && (
              <div className="scroll pad docs-tab">
                <textarea className="input mono docs-area" value={data.docs || ''} placeholder={t('req.docsPlaceholder')} onChange={(e) => set({ docs: e.target.value })} />
              </div>
            )}
          </div>
        </section>
        <div
          className="splitter"
          onMouseDown={(e) => {
            const pane = container.current && container.current.querySelector('.request-pane');
            startSplit(e, pane ? pane.getBoundingClientRect().width : split);
          }}
          onDoubleClick={() => {
            localStorage.removeItem('cybersoap.split');
            setSplit(0);
          }}
        />
        <ResponseView path={path} />
      </div>
    </div>
  );
}
