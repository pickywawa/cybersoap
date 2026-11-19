import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { Modal, Field } from './ui';

const api = window.api;

export default function ImportModal({ onClose, tab: initialTab = 'wsdl' }) {
  const t = useT();
  const [tab, setTab] = useState(initialTab);
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [auth, setAuth] = useState({ username: '', password: '' });
  const s = useStore.getState;

  const authOpt = showAuth && auth.username ? auth : undefined;

  const analyze = async () => {
    if (!source.trim()) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const p = await api.previewWsdl({ source: source.trim(), auth: authOpt });
      setPreview(p);
      if (!name) setName(p.name);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.importWsdl({ source: source.trim(), name: name.trim() || undefined, auth: authOpt });
      await s().refresh();
      s().toggleExpanded(r.path, true);
      s().toast(t('import.done', { name: r.meta.name, n: r.count }), 'success');
      s().openCollectionSettings(r.path);
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const pickFile = async () => {
    const f = await api.openFile({ filters: [{ name: 'WSDL', extensions: ['wsdl', 'xml', 'svc', 'asmx'] }, { name: '*', extensions: ['*'] }] });
    if (f) {
      setSource(f);
      setPreview(null);
    }
  };

  const simpleImport = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      if (r) {
        await s().refresh();
        const p = typeof r === 'string' ? r : r.path;
        s().toggleExpanded(p, true);
        s().toast(t('import.imported'), 'success');
        onClose();
      }
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const opCount = preview ? preview.interfaces.reduce((n, i) => n + i.operations.length, 0) : 0;

  return (
    <Modal
      title={t('import.title')}
      onClose={onClose}
      width={720}
      footer={
        tab === 'wsdl' ? (
          <>
            <button className="btn ghost" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn ghost" disabled={busy || !source.trim()} onClick={analyze}>
              <Icon name="search" size={14} /> {t('import.preview')}
            </button>
            <button className="btn primary" disabled={busy || !source.trim()} onClick={generate}>
              <Icon name="bolt" size={14} /> {t('import.go')}
            </button>
          </>
        ) : null
      }
    >
      <div className="import-tabs">
        {[
          ['wsdl', 'globe', t('import.wsdl')],
          ['bundle', 'file', t('import.bundle')],
          ['folder', 'folder', t('import.folder')],
          ['soapui', 'layers', t('import.soapui')]
        ].map(([id, icon, label]) => (
          <button key={id} className={`import-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'wsdl' && (
        <div className="form-grid">
          <Field label={t('import.wsdlSource')}>
            <div className="input-row">
              <input
                className="input mono"
                autoFocus
                value={source}
                placeholder={t('import.wsdlPlaceholder')}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPreview(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && analyze()}
              />
              <button className="btn ghost" onClick={pickFile}>
                <Icon name="folderOpen" size={14} /> {t('import.pickFile')}
              </button>
            </div>
          </Field>
          <button className="link-btn" onClick={() => setShowAuth(!showAuth)}>
            <Icon name={showAuth ? 'chevronDown' : 'chevronRight'} size={12} /> <Icon name="key" size={12} /> {t('import.authHint')}
          </button>
          {showAuth && (
            <div className="input-row">
              <input className="input" placeholder={t('auth.username')} value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} />
              <input className="input" type="password" placeholder={t('auth.password')} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />
            </div>
          )}
          <Field label={t('import.collectionName')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={preview ? preview.name : ''} />
          </Field>
          {busy && (
            <div className="res-loading inline">
              <div className="radar small" />
              <span>{t('common.loading')}</span>
            </div>
          )}
          {preview && (
            <div className="wsdl-preview cyber-frame">
              <div className="preview-head">
                <b>{preview.name}</b>
                <span className="dim mono">{preview.targetNamespace}</span>
                <span className="chip ok">{t('import.operations', { n: opCount })}</span>
              </div>
              {preview.interfaces.map((i) => (
                <div key={i.name} className="preview-iface">
                  <div className="preview-iface-head">
                    <span className={`soap-badge v${i.soapVersion.replace('.', '')}`}>SOAP {i.soapVersion}</span>
                    <b className="mono">{i.name}</b>
                    <span className="dim mono small-text">{i.endpoint}</span>
                  </div>
                  <div className="preview-ops">
                    {i.operations.map((o) => (
                      <span key={o} className="op-chip mono">
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {preview.warnings && preview.warnings.length > 0 && <pre className="warn-text">{preview.warnings.join('\n')}</pre>}
            </div>
          )}
        </div>
      )}

      {tab === 'bundle' && (
        <div className="import-simple">
          <p>{t('import.bundleHint')}</p>
          <button className="btn primary" disabled={busy} onClick={() => simpleImport(() => api.importBundle())}>
            <Icon name="file" size={14} /> {t('common.browse')}
          </button>
        </div>
      )}
      {tab === 'folder' && (
        <div className="import-simple">
          <p>{t('import.folderHint')}</p>
          <button className="btn primary" disabled={busy} onClick={() => simpleImport(() => api.importFolder())}>
            <Icon name="folder" size={14} /> {t('common.browse')}
          </button>
        </div>
      )}
      {tab === 'soapui' && (
        <div className="import-simple">
          <p>{t('import.soapuiHint')}</p>
          <button className="btn primary" disabled={busy} onClick={() => simpleImport(() => api.importSoapUi())}>
            <Icon name="layers" size={14} /> {t('common.browse')}
          </button>
        </div>
      )}
      {error && (
        <div className="error-box">
          <Icon name="x" size={14} /> <pre>{error}</pre>
        </div>
      )}
    </Modal>
  );
}
