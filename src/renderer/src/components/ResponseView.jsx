import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import XmlEditor from './XmlEditor';
import Icon from './Icons';
import { Tabs } from './ui';
import { tryFormatXml, looksLikeXml, prettySize, findSoapFault } from '../utils/xml';

function statusClass(status) {
  if (!status) return 'err';
  if (status < 300) return 'ok';
  if (status < 400) return 'warn';
  return 'err';
}

export default function ResponseView({ path }) {
  const t = useT();
  const response = useStore((s) => s.responses[path]);
  const sending = useStore((s) => !!s.sending[path]);
  const settings = useStore((s) => s.settings);
  const [tab, setTab] = useState('body');

  const body = useMemo(() => {
    if (!response || !response.ok) return '';
    return settings.autoFormatResponse && looksLikeXml(response.body) ? tryFormatXml(response.body) : response.body;
  }, [response, settings.autoFormatResponse]);

  const fault = useMemo(() => (response && response.ok ? findSoapFault(response.body) : null), [response]);
  const results = (response && response.assertions) || [];
  const failed = results.filter((r) => !r.passed).length;
  const passed = results.length - failed;

  const copy = () => {
    navigator.clipboard.writeText(response && response.ok ? response.body : '');
    useStore.getState().toast(t('common.copied'), 'success');
  };

  return (
    <section className="pane response-pane">
      <div className="pane-head">
        <span className="pane-title">{t('res.title')}</span>
        {response && response.ok && (
          <div className="res-stats">
            <span className={`chip status ${statusClass(response.status)}`}>
              {response.status} {response.statusText}
            </span>
            {fault && <span className="chip err glow">{t('res.fault')}</span>}
            <span className="chip">
              <Icon name="clock" size={12} /> {response.time} ms
            </span>
            <span className="chip">
              <Icon name="database" size={12} /> {prettySize(response.size)}
            </span>
            {results.length > 0 && (
              <span className={`chip ${failed ? 'err' : 'ok'}`} onClick={() => setTab('assertions')} style={{ cursor: 'pointer' }}>
                <Icon name={failed ? 'x' : 'check'} size={12} /> {passed}/{results.length}
              </span>
            )}
          </div>
        )}
        {response && !response.ok && !sending && <span className="chip err">{response.cancelled ? 'Cancelled' : t('res.error')}</span>}
      </div>

      {sending && (
        <div className="res-loading">
          <div className="radar" />
          <span className="glitch" data-text={t('res.sending')}>
            {t('res.sending')}
          </span>
          <button className="btn ghost small" onClick={() => useStore.getState().cancel(path)}>
            <Icon name="stop" size={12} /> {t('req.cancel')}
          </button>
        </div>
      )}

      {!sending && !response && (
        <div className="res-empty">
          <Icon name="send" size={42} strokeWidth={1.2} />
          <p>{t('res.empty')}</p>
          <kbd>⌘/Ctrl + Enter</kbd>
        </div>
      )}

      {!sending && response && !response.ok && (
        <div className="res-error">
          <Icon name="x" size={28} />
          <h3>{t('res.error')}</h3>
          <pre>{response.error}</pre>
          {response.request && <p className="dim mono">POST {response.request.url}</p>}
        </div>
      )}

      {!sending && response && response.ok && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'body', label: t('res.body') },
              { id: 'headers', label: t('res.headers'), badge: response.headers.length },
              { id: 'raw', label: t('res.raw') },
              { id: 'assertions', label: t('res.assertions'), badge: results.length ? `${passed}/${results.length}` : null, badgeKind: failed ? 'err' : 'ok' }
            ]}
            right={
              tab === 'body' && (
                <button className="icon-btn" title={t('res.copy')} onClick={copy}>
                  <Icon name="copy" size={14} />
                </button>
              )
            }
          />
          <div className="pane-body">
            {response.missing && response.missing.length > 0 && (
              <div className="warn-bar">{t('req.missingVars', { vars: response.missing.join(', ') })}</div>
            )}
            {tab === 'body' && (
              <div className="editor-wrap">
                <XmlEditor value={body} readOnly wordWrap={settings.wordWrap} />
              </div>
            )}
            {tab === 'headers' && (
              <div className="scroll pad">
                <table className="data-table">
                  <tbody>
                    {response.headers.map((h, i) => (
                      <tr key={i}>
                        <td className="mono accent">{h.key}</td>
                        <td className="mono">{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === 'raw' && (
              <div className="scroll pad raw">
                <h4 className="block-title">{t('res.request')}</h4>
                <pre className="raw-block">
                  {`POST ${response.request.url}\n`}
                  {Object.entries(response.request.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n')}
                  {`\n\n${response.request.body}`}
                </pre>
                <h4 className="block-title">{t('res.response')}</h4>
                <pre className="raw-block">
                  {`HTTP ${response.status} ${response.statusText}\n`}
                  {response.headers.map((h) => `${h.key}: ${h.value}`).join('\n')}
                  {`\n\n${response.body}`}
                </pre>
              </div>
            )}
            {tab === 'assertions' && (
              <div className="scroll pad">
                {results.length === 0 && <p className="empty-hint">{t('res.noAssertions')}</p>}
                {results.map((r, i) => (
                  <div key={i} className={`assert-result ${r.passed ? 'ok' : 'ko'}`}>
                    <Icon name={r.passed ? 'check' : 'x'} size={14} />
                    <span className="assert-name">{t(`assert.t.${r.type}`)}</span>
                    <span className="mono dim">{r.message}</span>
                  </div>
                ))}
                {response.extracted && (
                  <>
                    <h4 className="block-title">{t('extract.runtime')}</h4>
                    <table className="data-table">
                      <tbody>
                        {Object.entries(response.extracted).map(([k, v]) => (
                          <tr key={k}>
                            <td className="mono accent">{`{{${k}}}`}</td>
                            <td className="mono">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
