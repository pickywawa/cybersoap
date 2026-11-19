import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { Field, Toggle } from './ui';

const api = window.api;

export default function RunnerView({ path }) {
  const t = useT();
  const dir = useStore((s) => s.collectionOf(path));
  const name = path.split(/[\\/]/).pop();
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [delay, setDelay] = useState(0);
  const [stopOnFail, setStopOnFail] = useState(false);
  const [total, setTotal] = useState(null);
  const stopRef = useRef(false);

  const run = async () => {
    const s = useStore.getState();
    if (!dir) return;
    await s.loadSchema(dir);
    const files = await api.collectionRequests(path);
    const list = [];
    for (const f of files) {
      const open = s.docs[f];
      const data = open ? open.data : await api.readRequest(f);
      list.push({ path: f, data, status: 'pending', response: null });
    }
    setRows(list);
    setRunning(true);
    setTotal(null);
    stopRef.current = false;
    const started = Date.now();
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      list[i] = { ...list[i], status: 'running' };
      setRows([...list]);
      const { response } = await useStore.getState().executeRequest(list[i].data, dir);
      const failed = !response.ok || (response.assertions || []).some((a) => !a.passed) || (!response.assertions.length && response.status >= 400);
      list[i] = { ...list[i], status: failed ? 'failed' : 'passed', response };
      setRows([...list]);
      useStore.setState((st) => ({ responses: { ...st.responses, [list[i].path]: response } }));
      if (failed && stopOnFail) break;
      if (delay > 0 && i < list.length - 1) await new Promise((r) => setTimeout(r, delay));
    }
    setTotal(Date.now() - started);
    setRunning(false);
  };

  const passed = rows.filter((r) => r.status === 'passed').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const done = passed + failed;

  return (
    <div className="runner-view">
      <div className="col-head">
        <Icon name="play" size={22} className="accent-2" />
        <div>
          <h2 className="col-title">
            {t('run.title')} · {name}
          </h2>
          <span className="dim mono small-text">{path}</span>
        </div>
        <div className="grow" />
        <Field label={t('run.delay')} inline>
          <input className="input mono" type="number" min="0" style={{ width: 90 }} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
        </Field>
        <Toggle label={t('run.stopOnFail')} checked={stopOnFail} onChange={setStopOnFail} />
        {running ? (
          <button className="btn danger" onClick={() => (stopRef.current = true)}>
            <Icon name="stop" size={14} /> {t('run.stop')}
          </button>
        ) : (
          <button className="btn primary" onClick={run}>
            <Icon name="play" size={14} /> {t('run.start')}
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <div className="runner-progress">
          <div className="bar">
            <div className="bar-ok" style={{ width: `${(passed / rows.length) * 100}%` }} />
            <div className="bar-ko" style={{ width: `${(failed / rows.length) * 100}%` }} />
          </div>
          <span className="mono small-text">
            {t('run.summary', { passed, failed, total: rows.length, time: total ?? '…' })} · {done}/{rows.length}
          </span>
        </div>
      )}
      <div className="scroll pad">
        {rows.length === 0 && !running && <p className="empty-hint">{t('run.empty')} — {t('run.start')} ▶</p>}
        <table className="data-table runner-table">
          <tbody>
            {rows.map((r, i) => {
              const res = r.response;
              const failedAsserts = res && res.assertions ? res.assertions.filter((a) => !a.passed) : [];
              return (
                <tr key={r.path} className={`run-${r.status}`} onClick={() => useStore.getState().openRequest(r.path)}>
                  <td className="mono dim">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <span className={`run-state ${r.status}`}>{t(`run.${r.status}`)}</span>
                  </td>
                  <td className="mono">{r.data.name}</td>
                  <td className="mono dim">{res ? (res.ok ? `HTTP ${res.status}` : res.error) : ''}</td>
                  <td className="mono dim">{res ? `${res.time} ms` : ''}</td>
                  <td className="mono small-text">
                    {failedAsserts.map((a) => (
                      <div key={a.id} className="ko-text">
                        ✗ {t(`assert.t.${a.type}`)}: {a.message}
                      </div>
                    ))}
                    {res && res.assertions && res.assertions.length > 0 && !failedAsserts.length && (
                      <span className="ok-text">✓ {res.assertions.length}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
