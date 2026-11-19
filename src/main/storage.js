const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const COLLECTION_FILE = 'collection.json';
const SCHEMA_FILE = 'schema.json';
const FOLDER_FILE = 'folder.json';
const REQ_EXT = '.soap.json';
const RESERVED_DIRS = new Set(['wsdl', 'node_modules']);

function safeName(name) {
  return String(name || 'untitled')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'untitled';
}

function uniquePath(dir, base, ext = '') {
  let candidate = path.join(dir, base + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i++;
  }
  return candidate;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function ensureRoot(root) {
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function defaultCollectionMeta(name) {
  return {
    version: 1,
    type: 'cybersoap-collection',
    name,
    description: '',
    soapVersion: '1.1',
    variables: [],
    environments: [],
    activeEnvironment: null,
    headers: [],
    auth: { type: 'inherit' },
    wsdl: null,
    createdAt: new Date().toISOString()
  };
}

function defaultRequest(name) {
  return {
    version: 1,
    type: 'soap-request',
    name,
    seq: Date.now(),
    url: '',
    soapVersion: '1.1',
    soapAction: '',
    operation: '',
    binding: '',
    headers: [],
    auth: { type: 'inherit' },
    body:
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n' +
      '   <soapenv:Header/>\n   <soapenv:Body>\n      \n   </soapenv:Body>\n</soapenv:Envelope>',
    assertions: [],
    extractors: [],
    docs: ''
  };
}

function walk(dir) {
  const items = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return items;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (RESERVED_DIRS.has(e.name)) continue;
      const meta = readJson(path.join(full, FOLDER_FILE), {});
      items.push({
        type: 'folder',
        name: e.name,
        path: full,
        seq: meta.seq || 0,
        children: walk(full)
      });
    } else if (e.name.endsWith(REQ_EXT)) {
      const r = readJson(full, null);
      if (!r) continue;
      items.push({
        type: 'request',
        name: r.name || e.name.slice(0, -REQ_EXT.length),
        path: full,
        seq: r.seq || 0,
        operation: r.operation || '',
        binding: r.binding || '',
        soapVersion: r.soapVersion || '1.1'
      });
    }
  }
  // Alphabetical by default; a manual order (drag & drop) is stored in the parent's meta file
  const order = readOrder(dir);
  const rank = new Map((order || []).map((k, i) => [k, i]));
  const r = (it) => (rank.has(path.basename(it.path)) ? rank.get(path.basename(it.path)) : Infinity);
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const ra = r(a);
    const rb = r(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  return items;
}

function metaFileOf(dir) {
  const col = path.join(dir, COLLECTION_FILE);
  return fs.existsSync(col) ? col : path.join(dir, FOLDER_FILE);
}

function readOrder(dir) {
  const meta = readJson(metaFileOf(dir), null);
  return meta && Array.isArray(meta.order) ? meta.order : null;
}

function writeOrder(dir, order) {
  const file = metaFileOf(dir);
  const meta = readJson(file, {}) || {};
  if (order && order.length) meta.order = order;
  else delete meta.order;
  if (!fs.existsSync(file) && !meta.order) return;
  writeJson(file, meta);
}

/** Rename an entry inside its parent's manual order */
function renameInOrder(dir, oldBase, newBase) {
  const order = readOrder(dir);
  if (!order) return;
  writeOrder(dir, order.map((k) => (k === oldBase ? newBase : k)));
}

/** Put an entry at the end of a directory's manual order (keeps the current visible order) */
function appendToOrder(dir, base) {
  const current = walk(dir).map((it) => path.basename(it.path)).filter((n) => n !== base);
  current.push(base);
  writeOrder(dir, current);
}

/** Place src before/after target (moving it to target's folder if needed). Returns the new path of src. */
function reorderItem(src, target, position = 'before') {
  const destDir = path.dirname(target);
  let cur = src;
  if (path.dirname(src) !== destDir) cur = moveItem(src, destDir);
  const names = walk(destDir).map((it) => path.basename(it.path));
  const base = path.basename(cur);
  const without = names.filter((n) => n !== base);
  let idx = without.indexOf(path.basename(target));
  if (idx < 0) idx = without.length;
  else if (position === 'after') idx += 1;
  without.splice(idx, 0, base);
  writeOrder(destDir, without);
  return cur;
}

/** Reset manual ordering (alphabetical) of a directory, recursively */
function sortAlpha(dir) {
  writeOrder(dir, null);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !RESERVED_DIRS.has(e.name)) sortAlpha(path.join(dir, e.name));
  }
}

const GROUP_FILE = 'group.json';
const SKIP_ROOT_DIRS = new Set(['_environments', 'node_modules']);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

function isCollectionDir(dir) {
  return fs.existsSync(path.join(dir, COLLECTION_FILE));
}

/** true if a plain folder holds collections somewhere below (so it is shown as a group) */
function containsCollection(dir, depth = 0) {
  if (depth > 4) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return false;
  }
  return entries.some((e) => {
    if (!e.isDirectory() || e.name.startsWith('.')) return false;
    const sub = path.join(dir, e.name);
    return isCollectionDir(sub) || containsCollection(sub, depth + 1);
  });
}

/**
 * Collections tree of the working directory.
 * A group is a plain folder (marked with group.json, or holding collections) used to organise collections.
 */
function scanGroup(dir) {
  const groups = [];
  const collections = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP_ROOT_DIRS.has(e.name)) continue;
    const sub = path.join(dir, e.name);
    const meta = readJson(path.join(sub, COLLECTION_FILE), null);
    if (meta) {
      collections.push({ type: 'collection', name: meta.name || e.name, path: sub, meta, children: walk(sub) });
    } else if (fs.existsSync(path.join(sub, GROUP_FILE)) || containsCollection(sub)) {
      const g = readJson(path.join(sub, GROUP_FILE), {}) || {};
      groups.push({ type: 'group', name: g.name || e.name, path: sub, children: scanGroup(sub) });
    }
  }
  groups.sort(byName);
  collections.sort(byName);
  return [...groups, ...collections];
}

function listCollections(root) {
  ensureRoot(root);
  return scanGroup(root);
}

function createGroup(parentDir, name) {
  const dir = uniquePath(parentDir, safeName(name));
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, GROUP_FILE), { name });
  return dir;
}

function createCollection(root, name, meta = {}, parentDir = null) {
  ensureRoot(root);
  const dir = uniquePath(parentDir || root, safeName(name));
  fs.mkdirSync(dir, { recursive: true });
  const full = { ...defaultCollectionMeta(name), ...meta, name };
  writeJson(path.join(dir, COLLECTION_FILE), full);
  return { path: dir, meta: full };
}

function readCollection(dir) {
  return readJson(path.join(dir, COLLECTION_FILE), null);
}

function saveCollection(dir, meta) {
  writeJson(path.join(dir, COLLECTION_FILE), meta);
  return meta;
}

function readSchema(dir) {
  return readJson(path.join(dir, SCHEMA_FILE), null);
}

function writeSchema(dir, schema) {
  writeJson(path.join(dir, SCHEMA_FILE), schema);
}

/** Find the collection directory containing a path (walk up until collection.json) */
function findCollectionDir(p) {
  let cur = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(path.join(cur, COLLECTION_FILE))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function readRequest(file) {
  const r = readJson(file, null);
  if (!r) throw new Error('Cannot read request ' + file);
  return { ...defaultRequest(r.name), ...r };
}

function saveRequest(file, data) {
  writeJson(file, data);
  return data;
}

function createRequest(dir, name, data = {}) {
  const file = uniquePath(dir, safeName(name), REQ_EXT);
  const req = { ...defaultRequest(name), ...data, name };
  writeJson(file, req);
  return { path: file, request: req };
}

function createFolder(parentDir, name) {
  const dir = uniquePath(parentDir, safeName(name));
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, FOLDER_FILE), { name, seq: Date.now() });
  return dir;
}

function renameItem(p, newName) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    const meta = readJson(path.join(p, COLLECTION_FILE), null);
    const target = uniquePath(path.dirname(p), safeName(newName));
    fs.renameSync(p, target);
    if (meta) {
      meta.name = newName;
      writeJson(path.join(target, COLLECTION_FILE), meta);
    } else if (fs.existsSync(path.join(target, GROUP_FILE))) {
      writeJson(path.join(target, GROUP_FILE), { ...(readJson(path.join(target, GROUP_FILE), {}) || {}), name: newName });
    } else {
      renameInOrder(path.dirname(p), path.basename(p), path.basename(target));
    }
    return target;
  }
  const req = readJson(p, {});
  req.name = newName;
  const dir = path.dirname(p);
  let target = path.join(dir, safeName(newName) + REQ_EXT);
  if (target !== p && fs.existsSync(target)) target = uniquePath(dir, safeName(newName), REQ_EXT);
  writeJson(p, req);
  if (target !== p) {
    fs.renameSync(p, target);
    renameInOrder(dir, path.basename(p), path.basename(target));
  }
  return target;
}

function duplicateRequest(file) {
  const req = readRequest(file);
  const name = req.name + ' copy';
  return createRequest(path.dirname(file), name, { ...req, seq: (req.seq || 0) + 1 }).path;
}

async function deleteItem(p) {
  try {
    await shell.trashItem(p);
  } catch (_) {
    fs.rmSync(p, { recursive: true, force: true });
  }
  return true;
}

function moveItem(src, destDir) {
  const base = path.basename(src);
  const isReq = base.endsWith(REQ_EXT);
  const target = isReq
    ? uniquePath(destDir, base.slice(0, -REQ_EXT.length), REQ_EXT)
    : uniquePath(destDir, base);
  if (path.resolve(destDir) === path.resolve(src) || path.resolve(destDir).startsWith(path.resolve(src) + path.sep)) {
    throw new Error('Cannot move a folder into itself');
  }
  const isContainer = !isReq && (isCollectionDir(src) || fs.existsSync(path.join(src, GROUP_FILE)) || containsCollection(src));
  if (isContainer && findCollectionDir(destDir)) throw new Error('A collection or group cannot be moved inside a collection');
  if (!isContainer && !findCollectionDir(destDir)) throw new Error('Requests and folders must stay inside a collection');
  fs.renameSync(src, target);
  return target;
}

/** Collect all request files recursively (ordered like the tree) */
function collectRequests(dir) {
  const out = [];
  const visit = (items) => {
    for (const it of items) {
      if (it.type === 'folder') visit(it.children);
      else out.push(it.path);
    }
  };
  visit(walk(dir));
  return out;
}

/** Serialize a whole collection directory into a portable bundle */
function bundleCollection(dir) {
  const files = [];
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        files.push({ path: rel, content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  visit(dir);
  const meta = readCollection(dir) || {};
  return {
    format: 'cybersoap-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    name: meta.name || path.basename(dir),
    files
  };
}

function unbundleCollection(root, bundle) {
  if (!bundle || bundle.format !== 'cybersoap-bundle' || !Array.isArray(bundle.files)) {
    throw new Error('Invalid CyberSoap bundle');
  }
  ensureRoot(root);
  const dir = uniquePath(root, safeName(bundle.name || 'Imported'));
  for (const f of bundle.files) {
    const rel = String(f.path || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;
    const target = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.content ?? '', 'utf8');
  }
  // make sure the collection has a name matching the folder
  const meta = readCollection(dir);
  if (!meta) {
    saveCollection(dir, defaultCollectionMeta(bundle.name || 'Imported'));
  }
  return dir;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function importFolder(root, src) {
  if (!fs.existsSync(path.join(src, COLLECTION_FILE))) {
    throw new Error('The selected folder is not a CyberSoap collection (collection.json missing)');
  }
  ensureRoot(root);
  const dest = uniquePath(root, path.basename(src));
  copyDir(src, dest);
  return dest;
}

/* ------------------------------------------------------------------ */
/* Global environments (shared by all collections)                      */
/* <root>/_environments/globals.json + <name>.env.json                   */
/* ------------------------------------------------------------------ */
const ENV_DIR = '_environments';
const ENV_EXT = '.env.json';

function readEnvironments(root) {
  const dir = path.join(root, ENV_DIR);
  const globals = (readJson(path.join(dir, 'globals.json'), {}) || {}).variables || [];
  const environments = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(ENV_EXT)) continue;
      const data = readJson(path.join(dir, f), null);
      if (data) environments.push({ name: data.name || f.slice(0, -ENV_EXT.length), variables: data.variables || [] });
    }
  }
  environments.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { globals, environments };
}

function saveEnvironments(root, { globals = [], environments = [] }) {
  const dir = path.join(root, ENV_DIR);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'globals.json'), { variables: globals });
  const keep = new Set();
  for (const env of environments) {
    if (!env.name) continue;
    const file = safeName(env.name) + ENV_EXT;
    keep.add(file);
    writeJson(path.join(dir, file), { name: env.name, variables: env.variables || [] });
  }
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(ENV_EXT) && !keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
  return readEnvironments(root);
}

module.exports = {
  createGroup,
  isCollectionDir,
  readEnvironments,
  saveEnvironments,
  REQ_EXT,
  safeName,
  uniquePath,
  readJson,
  writeJson,
  ensureRoot,
  listCollections,
  createCollection,
  readCollection,
  saveCollection,
  readSchema,
  writeSchema,
  findCollectionDir,
  readRequest,
  saveRequest,
  createRequest,
  createFolder,
  renameItem,
  duplicateRequest,
  deleteItem,
  moveItem,
  reorderItem,
  appendToOrder,
  sortAlpha,
  collectRequests,
  bundleCollection,
  unbundleCollection,
  copyDir,
  importFolder,
  defaultRequest,
  defaultCollectionMeta
};
