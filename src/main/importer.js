const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const storage = require('./storage');
const { parseWsdl } = require('./wsdl');
const soap = require('./soap');

function nameFromSource(source) {
  const clean = source.split('?')[0].replace(/[\\/]+$/, '');
  const base = clean.split(/[\\/]/).pop() || 'Service';
  return base.replace(/\.(wsdl|xml|xsd|asmx|svc)$/i, '') || 'Service';
}

function saveWsdlDocuments(dir, documents) {
  const wsdlDir = path.join(dir, 'wsdl');
  fs.mkdirSync(wsdlDir, { recursive: true });
  const index = [];
  documents.forEach((d, i) => {
    let base = storage.safeName(nameFromSource(d.location)) || `doc${i}`;
    const ext = i === 0 || /wsdl/i.test(d.location) ? '.wsdl' : '.xsd';
    const file = storage.uniquePath(wsdlDir, base, ext);
    fs.writeFileSync(file, d.text, 'utf8');
    index.push({ location: d.location, file: path.relative(dir, file).split(path.sep).join('/') });
  });
  fs.writeFileSync(path.join(wsdlDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

function defaultAssertions() {
  return [
    { id: 'a1', type: 'notSoapFault', value: '', enabled: true },
    { id: 'a2', type: 'status', value: '200', enabled: true }
  ];
}

const OPERATIONS_FILE = 'operations.json';

/** Catalog of the operations a WSDL offers: kept in the collection, requests are created on demand */
function buildCatalog(parsed) {
  const operations = [];
  for (const iface of parsed.interfaces) {
    for (const op of iface.operations) {
      operations.push({
        id: `${iface.name}#${op.name}`,
        name: op.name,
        binding: iface.name,
        soapVersion: iface.soapVersion,
        endpoint: iface.endpoint,
        soapAction: op.soapAction || '',
        style: op.style,
        doc: op.doc || '',
        body: op.body
      });
    }
  }
  return { version: 1, generatedAt: new Date().toISOString(), operations };
}

function readOperations(dir) {
  const data = storage.readJson(path.join(dir, OPERATIONS_FILE), null);
  return data && Array.isArray(data.operations) ? data.operations : [];
}

/** Import a WSDL into a brand new collection (operations catalog only, no request is created) */
async function importWsdl(root, { source, name, auth }) {
  const parsed = await parseWsdl(source, (loc) => soap.fetchText(loc, auth));
  const colName = name || parsed.name || nameFromSource(source);
  const { path: dir, meta } = storage.createCollection(root, colName, {
    soapVersion: parsed.interfaces[0] ? parsed.interfaces[0].soapVersion : '1.1',
    wsdl: {
      source,
      targetNamespace: parsed.targetNamespace,
      importedAt: new Date().toISOString(),
      interfaces: parsed.interfaces.map((i) => ({ name: i.name, soapVersion: i.soapVersion, endpoints: i.endpoints }))
    }
  });
  saveWsdlDocuments(dir, parsed.documents);
  storage.writeSchema(dir, parsed.schema);
  const catalog = buildCatalog(parsed);
  storage.writeJson(path.join(dir, OPERATIONS_FILE), catalog);
  return { path: dir, meta, count: catalog.operations.length, warnings: parsed.warnings };
}

function requestFromOperation(op) {
  return {
    url: op.endpoint || '',
    soapVersion: op.soapVersion,
    soapAction: op.soapAction || '',
    operation: op.name,
    binding: op.binding,
    body: op.body,
    docs: op.doc || '',
    assertions: defaultAssertions()
  };
}

/**
 * Create request files from catalog operations, at the end of the collection (manual order),
 * numbering the name when a request with the same name already exists. Returns the new paths.
 */
function createFromOperations(dir, ids) {
  const ops = readOperations(dir);
  const created = [];
  for (const id of ids) {
    const op = ops.find((o) => o.id === id);
    if (!op) continue;
    let name = op.name;
    let i = 2;
    while (fs.existsSync(path.join(dir, storage.safeName(name) + storage.REQ_EXT))) name = `${op.name} (${i++})`;
    const { path: file } = storage.createRequest(dir, name, requestFromOperation(op));
    storage.appendToOrder(dir, path.basename(file));
    created.push(file);
  }
  return created;
}

/** Re-read the WSDL of an existing collection: refresh the operations catalog, schema and WSDL copy */
async function updateFromWsdl(dir, sourceOverride, auth) {
  const meta = storage.readCollection(dir);
  const source = sourceOverride || (meta && meta.wsdl && meta.wsdl.source);
  if (!source) throw new Error('This collection has no WSDL source');
  const parsed = await parseWsdl(source, (loc) => soap.fetchText(loc, auth));
  storage.writeSchema(dir, parsed.schema);
  fs.rmSync(path.join(dir, 'wsdl'), { recursive: true, force: true });
  saveWsdlDocuments(dir, parsed.documents);
  const before = new Set(readOperations(dir).map((o) => o.id));
  const catalog = buildCatalog(parsed);
  storage.writeJson(path.join(dir, OPERATIONS_FILE), catalog);
  meta.wsdl = {
    ...(meta.wsdl || {}),
    source,
    targetNamespace: parsed.targetNamespace,
    updatedAt: new Date().toISOString(),
    interfaces: parsed.interfaces.map((i) => ({ name: i.name, soapVersion: i.soapVersion, endpoints: i.endpoints }))
  };
  storage.saveCollection(dir, meta);
  return {
    total: catalog.operations.length,
    added: catalog.operations.filter((o) => !before.has(o.id)).length,
    warnings: parsed.warnings
  };
}

/** Preview the operations of a WSDL without creating anything */
async function previewWsdl(source, auth) {
  const parsed = await parseWsdl(source, (loc) => soap.fetchText(loc, auth));
  return {
    name: parsed.name,
    targetNamespace: parsed.targetNamespace,
    warnings: parsed.warnings,
    interfaces: parsed.interfaces.map((i) => ({
      name: i.name,
      soapVersion: i.soapVersion,
      endpoint: i.endpoint,
      operations: i.operations.map((o) => o.name)
    }))
  };
}

/* ---------------- SoapUI project import ---------------- */

function textOf(node) {
  return node ? node.textContent || '' : '';
}

function children(node, local) {
  const out = [];
  for (let c = node && node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1 && c.localName === local) out.push(c);
  }
  return out;
}

async function importSoapUi(root, file) {
  const xml = fs.readFileSync(file, 'utf8');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const project = doc.documentElement;
  if (!project || project.localName !== 'soapui-project') throw new Error('Not a SoapUI project file');
  const name = project.getAttribute('name') || path.basename(file, '.xml');
  const ifaces = children(project, 'interface');
  const { path: dir } = storage.createCollection(root, name, {
    description: `Imported from SoapUI project ${path.basename(file)}`
  });
  let count = 0;
  let wsdlSource = null;
  for (const iface of ifaces) {
    const ifName = iface.getAttribute('name') || 'Interface';
    const version = (iface.getAttribute('soapVersion') || '1_1').replace('_', '.');
    const definition = iface.getAttribute('definition');
    if (definition && !wsdlSource) wsdlSource = definition;
    const target = ifaces.length > 1 ? storage.createFolder(dir, ifName) : dir;
    let seq = 1;
    for (const op of children(iface, 'operation')) {
      const opName = op.getAttribute('name');
      const action = op.getAttribute('action') || '';
      for (const call of children(op, 'call')) {
        const endpoint = textOf(children(call, 'endpoint')[0]).trim();
        const body = textOf(children(call, 'request')[0]).trim();
        const credentials = children(call, 'credentials')[0];
        let auth = { type: 'inherit' };
        if (credentials) {
          const user = textOf(children(credentials, 'username')[0]);
          const pass = textOf(children(credentials, 'password')[0]);
          if (user) auth = { type: 'basic', username: user, password: pass };
        }
        const callName = call.getAttribute('name') || opName;
        storage.createRequest(target, callName === 'Request 1' ? opName : `${opName} - ${callName}`, {
          seq: seq++,
          url: endpoint,
          soapVersion: version,
          soapAction: action,
          operation: opName,
          binding: ifName,
          body,
          auth,
          assertions: defaultAssertions()
        });
        count++;
      }
    }
  }
  // Try to build the autocompletion schema from the WSDL definition (best effort)
  if (wsdlSource) {
    try {
      const parsed = await parseWsdl(wsdlSource, (loc) => soap.fetchText(loc));
      storage.writeSchema(dir, parsed.schema);
      saveWsdlDocuments(dir, parsed.documents);
      storage.writeJson(path.join(dir, OPERATIONS_FILE), buildCatalog(parsed));
      const meta = storage.readCollection(dir);
      meta.wsdl = { source: wsdlSource, importedAt: new Date().toISOString() };
      storage.saveCollection(dir, meta);
    } catch (_) {
      /* ignore: WSDL not reachable */
    }
  }
  return { path: dir, count };
}

module.exports = { importWsdl, updateFromWsdl, previewWsdl, importSoapUi, readOperations, createFromOperations };
