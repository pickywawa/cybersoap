import React from 'react';
import { useT } from '../i18n';
import { Field, Toggle } from './ui';

export default function AuthEditor({ auth, onChange, allowInherit = true }) {
  const t = useT();
  const a = auth || { type: allowInherit ? 'inherit' : 'none' };
  const set = (patch) => onChange({ ...a, ...patch });
  return (
    <div className="form-grid auth-editor">
      <Field label={t('auth.type')}>
        <select className="input" value={a.type} onChange={(e) => set({ type: e.target.value })}>
          {allowInherit && <option value="inherit">{t('auth.inherit')}</option>}
          <option value="none">{t('auth.none')}</option>
          <option value="basic">{t('auth.basic')}</option>
          <option value="wsse">{t('auth.wsse')}</option>
          <option value="bearer">{t('auth.bearer')}</option>
        </select>
      </Field>
      {a.type === 'inherit' && <p className="hint">{t('auth.inheritHint')}</p>}
      {(a.type === 'basic' || a.type === 'wsse') && (
        <>
          <Field label={t('auth.username')}>
            <input className="input mono" value={a.username || ''} onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label={t('auth.password')}>
            <input className="input mono" type="password" value={a.password || ''} onChange={(e) => set({ password: e.target.value })} />
          </Field>
        </>
      )}
      {a.type === 'wsse' && (
        <>
          <Field label={t('auth.passwordType')}>
            <select className="input" value={a.passwordType || 'PasswordText'} onChange={(e) => set({ passwordType: e.target.value })}>
              <option value="PasswordText">PasswordText</option>
              <option value="PasswordDigest">PasswordDigest</option>
            </select>
          </Field>
          <Field label={t('auth.ttl')}>
            <input className="input mono" type="number" min="0" value={a.ttl ?? 0} onChange={(e) => set({ ttl: Number(e.target.value) })} />
          </Field>
          <Toggle label={t('auth.mustUnderstand')} checked={a.mustUnderstand !== false} onChange={(v) => set({ mustUnderstand: v })} />
        </>
      )}
      {a.type === 'bearer' && (
        <Field label={t('auth.token')}>
          <input className="input mono" value={a.token || ''} onChange={(e) => set({ token: e.target.value })} />
        </Field>
      )}
    </div>
  );
}
