import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from './Icons';
import { Modal, KeyValueTable } from './ui';

/** Global environments shared by every collection (+ always-on global variables) */
export default function EnvironmentsModal({ onClose }) {
  const t = useT();
  const envs = useStore((s) => s.envs);
  const active = useStore((s) => s.settings.activeEnvironment);
  const { saveEnvironments, setActiveEnvironment, toast, error } = useStore.getState();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(envs)));
  const [sel, setSel] = useState(active ? draft.environments.findIndex((e) => e.name === active) : -1); // -1 = globals
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(envs);
  const env = sel >= 0 ? draft.environments[sel] : null;
  const names = draft.environments.map((e) => e.name.trim());
  const invalid = names.some((n) => !n) || new Set(names).size !== names.length;

  const setEnv = (patch) =>
    setDraft({ ...draft, environments: draft.environments.map((e, i) => (i === sel ? { ...e, ...patch } : e)) });

  const add = (base) => {
    let name = base ? `${base.name} copy` : `env-${draft.environments.length + 1}`;
    while (draft.environments.some((e) => e.name === name)) name += '+';
    const environments = [...draft.environments, { name, variables: base ? JSON.parse(JSON.stringify(base.variables)) : [] }];
    setDraft({ ...draft, environments });
    setSel(environments.length - 1);
  };

  const remove = () => {
    setDraft({ ...draft, environments: draft.environments.filter((_, i) => i !== sel) });
    setSel(-1);
  };

  const save = async () => {
    setBusy(true);
    try {
      const prev = active ? envs.environments.findIndex((e) => e.name === active) : -1;
      await saveEnvironments(draft);
      // keep the active environment selected if it was renamed
      if (prev >= 0 && draft.environments[prev] && draft.environments[prev].name !== active) {
        await setActiveEnvironment(draft.environments[prev].name);
      }
      toast(t('env.saved'), 'success');
      onClose();
    } catch (e) {
      error(e);
    }
    setBusy(false);
  };

  return (
    <Modal
      title={t('env.title')}
      onClose={onClose}
      width={880}
      className="settings-modal"
      footer={
        <>
          {invalid && <span className="ko-text small-text grow">{t('env.invalidNames')}</span>}
          <button className="btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!dirty || invalid || busy} onClick={save}>
            <Icon name="check" size={14} /> {t('common.save')}
          </button>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          <button className={`settings-nav-item ${sel === -1 ? 'active' : ''}`} onClick={() => setSel(-1)}>
            <Icon name="globe" size={15} /> {t('env.globals')}
          </button>
          <div className="nav-sep">{t('env.environments')}</div>
          {draft.environments.map((e, i) => (
            <button key={i} className={`settings-nav-item ${sel === i ? 'active' : ''}`} onClick={() => setSel(i)}>
              <Icon name="layers" size={15} />
              <span className="grow ellipsis">{e.name || '—'}</span>
              {e.name === active && <span className="chip ok tiny">{t('col.envActive')}</span>}
            </button>
          ))}
          <button className="btn ghost small add-env" onClick={() => add()}>
            <Icon name="plus" size={14} /> {t('col.envAdd')}
          </button>
        </nav>
        <div className="settings-content">
          {sel === -1 ? (
            <>
              <h4 className="block-title">{t('env.globals')}</h4>
              <p className="hint">{t('env.globalsHint')}</p>
              <KeyValueTable rows={draft.globals} onChange={(globals) => setDraft({ ...draft, globals })} />
            </>
          ) : (
            env && (
              <>
                <div className="input-row env-head">
                  <label className="field">
                    <span className="field-label">{t('col.envName')}</span>
                    <input className="input" value={env.name} onChange={(e) => setEnv({ name: e.target.value })} />
                  </label>
                  <button className="btn ghost" title={t('common.duplicate')} onClick={() => add(env)}>
                    <Icon name="copy" size={14} />
                  </button>
                  <button className="btn danger ghost" title={t('common.delete')} onClick={remove}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <p className="hint">{t('env.envHint')}</p>
                <KeyValueTable rows={env.variables} onChange={(variables) => setEnv({ variables })} />
              </>
            )
          )}
          <p className="hint mono env-path">{t('env.storedIn')}</p>
        </div>
      </div>
    </Modal>
  );
}
