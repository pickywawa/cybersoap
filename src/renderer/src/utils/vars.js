/** Variable resolution: {{name}} placeholders, dynamic {{$uuid}} etc. */

const dynamic = {
  $uuid: () => crypto.randomUUID(),
  $guid: () => crypto.randomUUID(),
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $timestampMs: () => String(Date.now()),
  $isoTimestamp: () => new Date().toISOString(),
  $date: () => new Date().toISOString().slice(0, 10),
  $randomInt: () => String(Math.floor(Math.random() * 1000)),
  $randomString: () => Math.random().toString(36).slice(2, 10)
};

export const DYNAMIC_VARS = Object.keys(dynamic);

/**
 * Variable precedence (lowest → highest):
 * global variables < collection variables < active global environment < runtime (extracted) values
 * @param meta collection meta
 * @param runtime runtime vars of the collection
 * @param envs {globals: [], active: {name, variables} | null}
 */
export function buildScope(meta, runtime, envs) {
  const scope = {};
  const add = (vars) => {
    for (const v of vars || []) if (v.enabled !== false && v.key) scope[v.key] = v.value ?? '';
  };
  add(envs && envs.globals);
  add(meta && meta.variables);
  add(envs && envs.active && envs.active.variables);
  Object.assign(scope, runtime || {});
  return scope;
}

export function interpolate(text, scope, depth = 0) {
  if (text == null) return text;
  return String(text).replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (m, name) => {
    if (name in dynamic) return dynamic[name]();
    if (scope && name in scope) {
      const v = scope[name];
      return depth < 5 ? interpolate(v, scope, depth + 1) : v;
    }
    return m;
  });
}

export function unresolved(text, scope) {
  const out = new Set();
  String(text || '').replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (m, name) => {
    if (!(name in dynamic) && !(scope && name in scope)) out.add(name);
    return m;
  });
  return [...out];
}

/** Build the final request payload ready to be sent by the main process */
export function resolveRequest(req, meta, runtime, envs) {
  const scope = buildScope(meta, runtime, envs);
  const headers = [...((meta && meta.headers) || []), ...(req.headers || [])]
    .filter((h) => h.enabled !== false && h.key)
    .map((h) => ({ key: interpolate(h.key, scope), value: interpolate(h.value, scope), enabled: true }));
  let auth = req.auth && req.auth.type !== 'inherit' ? req.auth : (meta && meta.auth) || { type: 'none' };
  if (!auth || auth.type === 'inherit') auth = { type: 'none' };
  const rAuth = {};
  for (const [k, v] of Object.entries(auth)) rAuth[k] = typeof v === 'string' ? interpolate(v, scope) : v;
  return {
    url: interpolate((req.url || '').trim(), scope),
    soapVersion: req.soapVersion || '1.1',
    soapAction: interpolate(req.soapAction || '', scope),
    headers,
    auth: rAuth,
    body: interpolate(req.body || '', scope),
    timeout: req.timeout || undefined,
    missing: [...new Set([...unresolved(req.url, scope), ...unresolved(req.body, scope)])]
  };
}
