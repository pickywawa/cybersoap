import xmlFormatter from 'xml-formatter';

export function formatXml(text, indent = '   ') {
  if (!text || !text.trim()) return text;
  return xmlFormatter(text.trim(), {
    indentation: indent,
    collapseContent: true,
    lineSeparator: '\n',
    whiteSpaceAtEndOfSelfclosingTag: false,
    throwOnFailure: true
  });
}

export function minifyXml(text) {
  return xmlFormatter.minify(text.trim(), { collapseContent: true, throwOnFailure: true });
}

export function tryFormatXml(text) {
  try {
    return formatXml(text);
  } catch (_) {
    return text;
  }
}

export function looksLikeXml(text) {
  return /^\s*</.test(text || '');
}

export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    const e = new Error(err.textContent || 'XML parse error');
    e.parserError = err.textContent;
    throw e;
  }
  return doc;
}

/** Returns {line, col, message} or null */
export function xmlError(text) {
  if (!text || !text.trim()) return null;
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return null;
  const msg = err.textContent || '';
  const m = msg.match(/line (\d+) at column (\d+):\s*(.*)/i);
  if (m) return { line: +m[1], col: +m[2], message: m[3].split('\n')[0] };
  return { line: 1, col: 1, message: msg.split('\n')[0] };
}

export function collectNamespaces(doc) {
  const ns = {};
  const walk = (el) => {
    for (const a of el.attributes) {
      if (a.name.startsWith('xmlns:')) {
        const p = a.name.slice(6);
        if (!(p in ns)) ns[p] = a.value;
      } else if (a.name === 'xmlns' && !('default' in ns)) ns.default = a.value;
    }
    for (const c of el.children) walk(c);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return ns;
}

export function evaluateXPath(doc, expr, extraNs = {}) {
  const ns = { ...extraNs, ...collectNamespaces(doc) };
  const resolver = (prefix) => ns[prefix] || null;
  const result = doc.evaluate(expr, doc, resolver, XPathResult.ANY_TYPE, null);
  switch (result.resultType) {
    case XPathResult.NUMBER_TYPE:
      return { value: String(result.numberValue), exists: true };
    case XPathResult.STRING_TYPE:
      return { value: result.stringValue, exists: result.stringValue !== '' };
    case XPathResult.BOOLEAN_TYPE:
      return { value: String(result.booleanValue), exists: result.booleanValue };
    default: {
      const nodes = [];
      let n;
      while ((n = result.iterateNext())) nodes.push(n);
      return { value: nodes.length ? nodes[0].textContent : '', exists: nodes.length > 0, count: nodes.length };
    }
  }
}

export function findSoapFault(text) {
  try {
    const doc = parseXml(text);
    const faults = doc.getElementsByTagNameNS('*', 'Fault');
    if (!faults.length) return null;
    const f = faults[0];
    const get = (...names) => {
      for (const name of names) {
        const el = f.getElementsByTagNameNS('*', name)[0] || f.getElementsByTagName(name)[0];
        if (el) return el.textContent.trim();
      }
      return '';
    };
    return { code: get('faultcode', 'Code'), message: get('faultstring', 'Reason', 'Text') };
  } catch (_) {
    return null;
  }
}

export function prettySize(bytes) {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
