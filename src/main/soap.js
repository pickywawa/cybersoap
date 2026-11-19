const { session } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const { fileURLToPath } = require('url');

let netSession = null;
let currentSettings = {};
const inflight = new Map();

function cancel(id) {
  const c = inflight.get(id);
  if (c) c();
  return !!c;
}

function getSession() {
  if (!netSession) netSession = session.fromPartition('persist:cybersoap-net');
  return netSession;
}

// Private / local networks never go through a proxy (internal SOAP services)
const PRIVATE_BYPASS = ['<local>', 'localhost', '127.0.0.1/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '*.local', '[::1]'];

function bypassList(...lists) {
  const items = [...PRIVATE_BYPASS];
  for (const l of lists) {
    for (const x of String(l || '').split(/[,;\s]+/)) {
      const v = x.trim();
      if (!v) continue;
      // "no_proxy" style ".domain" → "*.domain"
      items.push(v.startsWith('.') ? `*${v}` : v);
    }
  }
  return [...new Set(items)].join(';');
}

async function applyNetworkSettings(settings) {
  currentSettings = settings;
  const ses = getSession();
  if (settings.proxyMode === 'none') {
    await ses.setProxy({ mode: 'direct' });
  } else if (settings.proxyMode === 'custom' && settings.proxyUrl) {
    await ses.setProxy({ proxyRules: settings.proxyUrl, proxyBypassRules: bypassList(settings.proxyBypass) });
  } else {
    // "system": honour HTTP(S)_PROXY env vars when present (like CLI tools), else OS settings / PAC
    const env = process.env;
    const envProxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
    if (envProxy) {
      const bypass = bypassList(env.NO_PROXY, env.no_proxy, settings.proxyBypass);
      await ses.setProxy({ proxyRules: envProxy.replace(/^https?:\/\//, ''), proxyBypassRules: bypass });
    } else {
      await ses.setProxy({ mode: 'system' });
    }
  }
  ses.setCertificateVerifyProc((req, cb) => {
    cb(currentSettings.rejectUnauthorized === false ? 0 : -3);
  });
}

function basic(user, pass) {
  return 'Basic ' + Buffer.from(`${user || ''}:${pass || ''}`, 'utf8').toString('base64');
}

async function fetchText(location, auth) {
  if (/^https?:\/\//i.test(location)) {
    const headers = {};
    if (auth && auth.username) headers.Authorization = basic(auth.username, auth.password);
    const res = await getSession().fetch(location, { headers, bypassCustomProtocolHandlers: true });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} while loading ${location}`);
    return await res.text();
  }
  const file = /^file:\/\//i.test(location) ? fileURLToPath(location) : location;
  return fs.readFileSync(file, 'utf8');
}

/** Inject a WS-Security UsernameToken header into the envelope */
function addWsSecurity(xml, auth) {
  const m = xml.match(/<([\w.-]+):Envelope\b/);
  if (!m) return xml;
  const p = m[1];
  const created = new Date().toISOString();
  const nonceBytes = crypto.randomBytes(16);
  const nonce = nonceBytes.toString('base64');
  const digest = auth.passwordType === 'PasswordDigest';
  const password = digest
    ? crypto
        .createHash('sha1')
        .update(Buffer.concat([nonceBytes, Buffer.from(created, 'utf8'), Buffer.from(auth.password || '', 'utf8')]))
        .digest('base64')
    : auth.password || '';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pwType = digest
    ? 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest'
    : 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';
  const ttl = Number(auth.ttl) > 0 ? Number(auth.ttl) : 0;
  const timestamp = ttl
    ? `<wsu:Timestamp wsu:Id="TS-${crypto.randomUUID()}"><wsu:Created>${created}</wsu:Created><wsu:Expires>${new Date(
        Date.now() + ttl * 1000
      ).toISOString()}</wsu:Expires></wsu:Timestamp>`
    : '';
  const sec =
    `<wsse:Security ${p}:mustUnderstand="${auth.mustUnderstand === false ? '0' : '1'}" ` +
    `xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" ` +
    `xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">` +
    timestamp +
    `<wsse:UsernameToken wsu:Id="UsernameToken-${crypto.randomUUID()}">` +
    `<wsse:Username>${esc(auth.username || '')}</wsse:Username>` +
    `<wsse:Password Type="${pwType}">${esc(password)}</wsse:Password>` +
    `<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce}</wsse:Nonce>` +
    `<wsu:Created>${created}</wsu:Created>` +
    `</wsse:UsernameToken></wsse:Security>`;

  const emptyHeader = new RegExp(`<${p}:Header\\s*/>`);
  if (emptyHeader.test(xml)) return xml.replace(emptyHeader, `<${p}:Header>${sec}</${p}:Header>`);
  const openHeader = new RegExp(`<${p}:Header(\\s[^>]*)?>`);
  if (openHeader.test(xml)) return xml.replace(openHeader, (h) => h + sec);
  return xml.replace(new RegExp(`<${p}:Body\\b`), `<${p}:Header>${sec}</${p}:Header><${p}:Body`);
}

/**
 * Send a SOAP request.
 * @param {{url, soapVersion, soapAction, headers:[{key,value,enabled}], body, auth, timeout}} req
 */
async function send(req) {
  const started = Date.now();
  const timeout = Number(req.timeout || currentSettings.requestTimeout || 30000);
  const headers = {};
  for (const h of req.headers || []) {
    if (h.enabled === false || !h.key) continue;
    headers[h.key] = h.value ?? '';
  }
  const lower = Object.fromEntries(Object.keys(headers).map((k) => [k.toLowerCase(), k]));
  const action = req.soapAction || '';
  if (!lower['content-type']) {
    headers['Content-Type'] =
      req.soapVersion === '1.2'
        ? `application/soap+xml;charset=UTF-8${action ? `;action="${action}"` : ''}`
        : 'text/xml;charset=UTF-8';
  }
  if (req.soapVersion !== '1.2' && !lower['soapaction']) headers.SOAPAction = `"${action}"`;
  if (!lower['accept-encoding']) headers['Accept-Encoding'] = 'gzip,deflate';
  if (!lower['user-agent']) headers['User-Agent'] = 'CyberSoap/1.0';

  let body = req.body || '';
  const auth = req.auth || {};
  if (auth.type === 'basic') {
    headers.Authorization = basic(auth.username, auth.password);
  } else if (auth.type === 'bearer') {
    headers.Authorization = `Bearer ${auth.token || ''}`;
  } else if (auth.type === 'wsse') {
    body = addWsSecurity(body, auth);
  }

  const controller = new AbortController();
  let cancelled = false;
  if (req.id) inflight.set(req.id, () => { cancelled = true; controller.abort(); });
  const timer = setTimeout(() => controller.abort(), timeout);
  const requestInfo = { url: req.url, method: 'POST', headers, body };
  try {
    if (!/^https?:\/\//i.test(req.url || '')) throw new Error(`Invalid URL: "${req.url || ''}"`);
    const res = await getSession().fetch(req.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      redirect: currentSettings.followRedirects === false ? 'manual' : 'follow',
      bypassCustomProtocolHandlers: true
    });
    const ttfb = Date.now() - started;
    const buf = Buffer.from(await res.arrayBuffer());
    const time = Date.now() - started;
    const resHeaders = [];
    res.headers.forEach((value, k) => resHeaders.push({ key: k, value }));
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body: buf.toString('utf8'),
      size: buf.length,
      time,
      ttfb,
      url: res.url,
      request: requestInfo,
      date: new Date().toISOString()
    };
  } catch (e) {
    const aborted = e.name === 'AbortError';
    return {
      ok: false,
      cancelled,
      error: cancelled ? 'Cancelled' : aborted ? `Timeout after ${timeout} ms` : e.message || String(e),
      time: Date.now() - started,
      request: requestInfo,
      date: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
    if (req.id) inflight.delete(req.id);
  }
}

module.exports = { send, cancel, fetchText, applyNetworkSettings, getSession };
