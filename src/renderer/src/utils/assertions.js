import { parseXml, evaluateXPath, findSoapFault } from './xml';

export const ASSERTION_TYPES = [
  'notSoapFault',
  'soapFault',
  'status',
  'contains',
  'notContains',
  'regex',
  'xpath',
  'maxTime',
  'validXml'
];

export const NEEDS_VALUE = {
  status: true,
  contains: true,
  notContains: true,
  regex: true,
  xpath: true,
  maxTime: true
};

let seq = 0;
export const newId = (p = 'id') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Evaluate assertions against a response → [{id, type, passed, message}] */
export function runAssertions(assertions, response, nsHints) {
  const results = [];
  const body = (response && response.body) || '';
  let doc = null;
  let docErr = null;
  const getDoc = () => {
    if (doc || docErr) return doc;
    try {
      doc = parseXml(body);
    } catch (e) {
      docErr = e;
    }
    return doc;
  };
  for (const a of assertions || []) {
    if (a.enabled === false) continue;
    let passed = false;
    let message = '';
    try {
      if (!response || !response.ok) {
        passed = false;
        message = response ? response.error : 'No response';
      } else
        switch (a.type) {
          case 'status': {
            const codes = String(a.value || '200').split(/[,\s]+/).filter(Boolean);
            passed = codes.includes(String(response.status));
            message = `HTTP ${response.status}`;
            break;
          }
          case 'contains':
            passed = body.includes(a.value || '');
            message = passed ? 'found' : 'not found';
            break;
          case 'notContains':
            passed = !body.includes(a.value || '');
            message = passed ? 'not present' : 'present';
            break;
          case 'regex': {
            const re = new RegExp(a.value || '', 's');
            passed = re.test(body);
            message = passed ? 'matched' : 'no match';
            break;
          }
          case 'notSoapFault': {
            const f = findSoapFault(body);
            passed = !f;
            message = f ? `${f.code} ${f.message}` : 'no fault';
            break;
          }
          case 'soapFault': {
            const f = findSoapFault(body);
            passed = !!f;
            message = f ? `${f.code} ${f.message}` : 'no fault';
            break;
          }
          case 'maxTime':
            passed = response.time <= Number(a.value || 0);
            message = `${response.time} ms`;
            break;
          case 'validXml':
            passed = !!getDoc();
            message = passed ? 'valid' : docErr && docErr.message.split('\n')[0];
            break;
          case 'xpath': {
            const d = getDoc();
            if (!d) throw new Error('Response is not valid XML');
            const r = evaluateXPath(d, a.value || '', nsHints);
            if (a.expected != null && a.expected !== '') {
              passed = r.value === a.expected;
              message = `"${r.value}"`;
            } else {
              passed = r.exists;
              message = r.exists ? `"${r.value}"` : 'no match';
            }
            break;
          }
          default:
            message = 'unknown assertion';
        }
    } catch (e) {
      passed = false;
      message = e.message;
    }
    results.push({ id: a.id, type: a.type, passed, message });
  }
  return results;
}

/** Run extractors (property transfer) → {name: value} */
export function runExtractors(extractors, response, nsHints) {
  const out = {};
  if (!response || !response.ok || !(extractors || []).length) return out;
  let doc;
  try {
    doc = parseXml(response.body || '');
  } catch (_) {
    return out;
  }
  for (const x of extractors) {
    if (x.enabled === false || !x.name || !x.xpath) continue;
    try {
      const r = evaluateXPath(doc, x.xpath, nsHints);
      if (r.exists) out[x.name] = r.value;
    } catch (_) {
      /* ignore */
    }
  }
  return out;
}
