/**
 * WSDL 1.1 + XML Schema parser and SOAP sample request generator.
 * Inspired by SoapUI behaviour: generates ready-to-run envelopes with "?" placeholders
 * and Optional / repetition comments, plus an autocompletion schema for the XML editor.
 */
const { DOMParser } = require('@xmldom/xmldom');
const path = require('path');

const NS = {
  WSDL: 'http://schemas.xmlsoap.org/wsdl/',
  SOAP11B: 'http://schemas.xmlsoap.org/wsdl/soap/',
  SOAP12B: 'http://schemas.xmlsoap.org/wsdl/soap12/',
  XSD: 'http://www.w3.org/2001/XMLSchema',
  SOAPENC: 'http://schemas.xmlsoap.org/soap/encoding/',
  SOAP11ENV: 'http://schemas.xmlsoap.org/soap/envelope/',
  SOAP12ENV: 'http://www.w3.org/2003/05/soap-envelope',
  WSDL2: 'http://www.w3.org/ns/wsdl'
};

const MAX_DEPTH = 14;

const key = (ns, local) => `{${ns || ''}}${local}`;

function childElements(node, local, ns) {
  const out = [];
  if (!node) return out;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1) continue;
    if (local && c.localName !== local) continue;
    if (ns && c.namespaceURI !== ns) continue;
    out.push(c);
  }
  return out;
}
const firstChild = (node, local, ns) => childElements(node, local, ns)[0] || null;
const attr = (node, name) => (node && node.hasAttribute && node.hasAttribute(name) ? node.getAttribute(name) : null);

function lookupNs(node, prefix) {
  if (prefix === 'xml') return 'http://www.w3.org/XML/1998/namespace';
  const attrName = prefix ? `xmlns:${prefix}` : 'xmlns';
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    if (n.hasAttribute(attrName)) return n.getAttribute(attrName);
  }
  return prefix ? null : '';
}

function documentation(node) {
  const d = firstChild(node, 'documentation');
  return d ? (d.textContent || '').trim() : '';
}

function resolveLocation(base, loc) {
  if (/^[a-z]+:\/\//i.test(loc)) return loc;
  if (/^https?:\/\//i.test(base)) return new URL(loc, base).toString();
  if (/^file:\/\//i.test(base)) return new URL(loc, base).toString();
  return path.resolve(path.dirname(base), loc);
}

class WsdlModel {
  constructor(fetcher) {
    this.fetcher = fetcher;
    this.loaded = new Set();
    this.documents = []; // {location, text}
    this.elements = new Map();
    this.types = new Map();
    this.groups = new Map();
    this.attributeGroups = new Map();
    this.attributes = new Map();
    this.messages = new Map();
    this.portTypes = new Map();
    this.bindings = new Map();
    this.services = [];
    this.namespaces = new Set();
    this.targetNamespace = '';
    this.name = '';
    this.warnings = [];
  }

  async load(location, chameleonTns) {
    const loadKey = location + '|' + (chameleonTns || '');
    if (this.loaded.has(loadKey)) return;
    this.loaded.add(loadKey);
    let text;
    try {
      text = await this.fetcher(location);
    } catch (e) {
      if (this.documents.length === 0) throw e;
      this.warnings.push(`Cannot load ${location}: ${e.message}`);
      return;
    }
    this.documents.push({ location, text });
    const errors = [];
    const snippet = () => String(text || '').trim().slice(0, 300).replace(/\s+/g, ' ');
    if (/^\s*(<!doctype html|<html)/i.test(text || '')) {
      throw new Error(`Expected a WSDL/XSD document but received an HTML page from ${location}:\n${snippet()}`);
    }
    let doc;
    try {
      doc = new DOMParser({
        onError: (level, msg) => {
          if (level === 'fatalError' || level === 'error') errors.push(msg);
        }
      }).parseFromString(text, 'text/xml');
    } catch (e) {
      throw new Error(`Invalid XML in ${location}: ${e.message}\n${snippet()}`);
    }
    const root = doc && doc.documentElement;
    if (!root) throw new Error(`Invalid XML document: ${location}\n${errors.join('\n')}`);
    if (root.namespaceURI === NS.WSDL2) {
      throw new Error('WSDL 2.0 is not supported (only WSDL 1.1)');
    }
    if (root.localName === 'definitions' && root.namespaceURI === NS.WSDL) {
      await this.processDefinitions(root, location);
    } else if (root.localName === 'schema' && root.namespaceURI === NS.XSD) {
      await this.processSchema(root, location, chameleonTns);
    } else if (this.documents.length === 1) {
      throw new Error(`Not a WSDL document (root element <${root.nodeName}>)`);
    }
  }

  async processDefinitions(root, location) {
    const tns = attr(root, 'targetNamespace') || '';
    if (!this.targetNamespace) {
      this.targetNamespace = tns;
      this.name = attr(root, 'name') || '';
    }
    if (tns) this.namespaces.add(tns);

    for (const imp of childElements(root, 'import', NS.WSDL)) {
      const loc = attr(imp, 'location');
      if (loc) await this.load(resolveLocation(location, loc));
    }
    for (const types of childElements(root, 'types', NS.WSDL)) {
      for (const schema of childElements(types, 'schema', NS.XSD)) {
        await this.processSchema(schema, location);
      }
    }
    for (const msg of childElements(root, 'message', NS.WSDL)) {
      const parts = childElements(msg, 'part', NS.WSDL).map((p) => ({
        name: attr(p, 'name'),
        element: attr(p, 'element') ? this.qname(p, attr(p, 'element')) : null,
        type: attr(p, 'type') ? this.qname(p, attr(p, 'type')) : null
      }));
      this.messages.set(key(tns, attr(msg, 'name')), { name: attr(msg, 'name'), parts });
    }
    for (const pt of childElements(root, 'portType', NS.WSDL)) {
      const ops = new Map();
      for (const op of childElements(pt, 'operation', NS.WSDL)) {
        const input = firstChild(op, 'input', NS.WSDL);
        const output = firstChild(op, 'output', NS.WSDL);
        ops.set(attr(op, 'name'), {
          name: attr(op, 'name'),
          doc: documentation(op),
          input: input && attr(input, 'message') ? this.qname(input, attr(input, 'message')) : null,
          output: output && attr(output, 'message') ? this.qname(output, attr(output, 'message')) : null
        });
      }
      this.portTypes.set(key(tns, attr(pt, 'name')), { name: attr(pt, 'name'), operations: ops });
    }
    for (const b of childElements(root, 'binding', NS.WSDL)) {
      const soap11 = firstChild(b, 'binding', NS.SOAP11B);
      const soap12 = firstChild(b, 'binding', NS.SOAP12B);
      const sb = soap11 || soap12;
      if (!sb) continue; // HTTP binding etc.
      const soapNs = soap11 ? NS.SOAP11B : NS.SOAP12B;
      const binding = {
        name: attr(b, 'name'),
        tns,
        soapVersion: soap11 ? '1.1' : '1.2',
        style: attr(sb, 'style') || 'document',
        type: this.qname(b, attr(b, 'type')),
        operations: []
      };
      for (const op of childElements(b, 'operation', NS.WSDL)) {
        const soapOp = firstChild(op, 'operation', soapNs);
        const input = firstChild(op, 'input', NS.WSDL);
        const body = input ? firstChild(input, 'body', soapNs) : null;
        const headers = input
          ? childElements(input, 'header', soapNs).map((h) => ({
              message: attr(h, 'message') ? this.qname(h, attr(h, 'message')) : null,
              part: attr(h, 'part')
            }))
          : [];
        binding.operations.push({
          name: attr(op, 'name'),
          soapAction: soapOp ? attr(soapOp, 'soapAction') || '' : '',
          style: (soapOp && attr(soapOp, 'style')) || binding.style,
          bodyParts: body && attr(body, 'parts') ? attr(body, 'parts').split(/\s+/).filter(Boolean) : null,
          bodyNamespace: body ? attr(body, 'namespace') : null,
          use: body ? attr(body, 'use') || 'literal' : 'literal',
          headers
        });
      }
      this.bindings.set(key(tns, binding.name), binding);
    }
    for (const svc of childElements(root, 'service', NS.WSDL)) {
      for (const port of childElements(svc, 'port', NS.WSDL)) {
        const addr = firstChild(port, 'address', NS.SOAP11B) || firstChild(port, 'address', NS.SOAP12B);
        this.services.push({
          service: attr(svc, 'name'),
          port: attr(port, 'name'),
          binding: this.qname(port, attr(port, 'binding')),
          location: addr ? attr(addr, 'location') : null
        });
      }
    }
  }

  async processSchema(node, location, chameleonTns) {
    const tns = attr(node, 'targetNamespace') || chameleonTns || '';
    const schema = {
      tns,
      chameleon: !attr(node, 'targetNamespace') && !!chameleonTns,
      elementFormDefault: attr(node, 'elementFormDefault') || 'unqualified',
      attributeFormDefault: attr(node, 'attributeFormDefault') || 'unqualified'
    };
    if (tns) this.namespaces.add(tns);
    for (const c of childElements(node, null, NS.XSD)) {
      const name = attr(c, 'name');
      switch (c.localName) {
        case 'import':
        case 'include':
        case 'redefine': {
          const loc = attr(c, 'schemaLocation');
          if (loc) {
            await this.load(resolveLocation(location, loc), c.localName === 'import' ? undefined : tns);
          }
          if (c.localName === 'redefine') await this.registerSchemaChildren(c, schema);
          break;
        }
        default:
          if (name) this.registerDecl(c, schema);
      }
    }
  }

  async registerSchemaChildren(node, schema) {
    for (const c of childElements(node, null, NS.XSD)) if (attr(c, 'name')) this.registerDecl(c, schema);
  }

  registerDecl(c, schema) {
    const k = key(schema.tns, attr(c, 'name'));
    const entry = { node: c, schema };
    switch (c.localName) {
      case 'element':
        this.elements.set(k, entry);
        break;
      case 'complexType':
      case 'simpleType':
        this.types.set(k, entry);
        break;
      case 'group':
        this.groups.set(k, entry);
        break;
      case 'attributeGroup':
        this.attributeGroups.set(k, entry);
        break;
      case 'attribute':
        this.attributes.set(k, entry);
        break;
    }
  }

  qname(node, value, schema) {
    if (!value) return null;
    const idx = value.indexOf(':');
    const prefix = idx >= 0 ? value.slice(0, idx) : '';
    const local = idx >= 0 ? value.slice(idx + 1) : value;
    let ns = lookupNs(node, prefix);
    if (ns == null) ns = '';
    if (!ns && schema && schema.chameleon) ns = schema.tns;
    return { ns, local, key: key(ns, local) };
  }
}

/* ------------------------------------------------------------------ */
/* Prefix allocation                                                    */
/* ------------------------------------------------------------------ */

const RESERVED_PREFIXES = new Set(['xml', 'xmlns', 'soap', 'soapenv', 'xsi', 'xs', 'xsd', 'wsse', 'wsu']);

function buildPrefixMap(namespaces) {
  const map = new Map();
  const used = new Set(RESERVED_PREFIXES);
  for (const ns of namespaces) {
    if (!ns || map.has(ns)) continue;
    let base = '';
    const m = ns.match(/^[a-z]+:\/\/(?:www\.)?([^/]+)/i);
    if (m) base = m[1];
    else if (/^urn:/i.test(ns)) base = ns.split(':').pop() || 'urn';
    else base = ns;
    base = (base.replace(/[^a-zA-Z]/g, '').slice(0, 3) || 'ns').toLowerCase();
    if (/^xml/i.test(base)) base = 'ns';
    let p = base;
    let i = 1;
    while (used.has(p)) p = base + i++;
    used.add(p);
    map.set(ns, p);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Sample generator                                                     */
/* ------------------------------------------------------------------ */

class SampleBuilder {
  constructor(model, prefixes) {
    this.model = model;
    this.prefixes = prefixes;
    this.usedNs = new Set();
    this.completion = new Map(); // elementName -> {children:Set, attributes:Map(name->Set values)}
    this.enums = new Map();
    this.docs = new Map();
  }

  prefixFor(ns) {
    if (!ns) return '';
    if (!this.prefixes.has(ns)) {
      const extra = buildPrefixMap([...this.prefixes.keys(), ns]);
      this.prefixes.set(ns, extra.get(ns));
    }
    return this.prefixes.get(ns);
  }

  el(local, ns) {
    if (ns) this.usedNs.add(ns);
    const p = this.prefixFor(ns);
    return { kind: 'el', name: p ? `${p}:${local}` : local, children: [], attrs: [], text: null };
  }

  record(parent, child) {
    if (!parent) return;
    const entry = this.entry(parent.name);
    entry.children.add(child.name);
    this.entry(child.name);
  }

  entry(name) {
    if (!this.completion.has(name)) this.completion.set(name, { children: new Set(), attributes: new Map() });
    return this.completion.get(name);
  }

  occursComment(node) {
    const min = attr(node, 'minOccurs');
    const max = attr(node, 'maxOccurs');
    const minN = min == null ? 1 : parseInt(min, 10);
    const many = max === 'unbounded' || (max != null && parseInt(max, 10) > 1);
    if (many) return minN === 0 ? 'Zero or more repetitions:' : `${minN} or more repetitions:`;
    if (minN === 0) return 'Optional:';
    return null;
  }

  /** Generate an element declaration (local or global) and append to parent */
  element(declNode, schema, parent, depth, stack, isGlobal = false, occursNode = null) {
    const comment = this.occursComment(occursNode || declNode);
    const ref = attr(declNode, 'ref');
    if (ref) {
      const q = this.model.qname(declNode, ref, schema);
      const target = this.model.elements.get(q.key);
      if (!target) {
        if (comment) parent.children.push({ kind: 'comment', text: comment });
        const e = this.el(q.local, q.ns);
        e.text = '?';
        parent.children.push(e);
        this.record(parent, e);
        return;
      }
      return this.element(target.node, target.schema, parent, depth, stack, true, declNode);
    }
    if (attr(declNode, 'abstract') === 'true') {
      parent.children.push({ kind: 'comment', text: `abstract element ${attr(declNode, 'name')}` });
      return;
    }
    const name = attr(declNode, 'name');
    const form = attr(declNode, 'form');
    const qualified = isGlobal || form === 'qualified' || (form !== 'unqualified' && schema.elementFormDefault === 'qualified');
    const e = this.el(name, qualified ? schema.tns : '');
    if (comment) parent.children.push({ kind: 'comment', text: comment });
    parent.children.push(e);
    this.record(parent, e);
    const doc = documentation(firstChild(declNode, 'annotation', NS.XSD));
    if (doc && !this.docs.has(e.name)) this.docs.set(e.name, doc);

    if (depth > MAX_DEPTH) return;
    const typeAttr = attr(declNode, 'type');
    if (typeAttr) {
      const q = this.model.qname(declNode, typeAttr, schema);
      this.typeRef(q, e, depth, stack);
      return;
    }
    const inlineComplex = firstChild(declNode, 'complexType', NS.XSD);
    const inlineSimple = firstChild(declNode, 'simpleType', NS.XSD);
    if (inlineComplex) this.complexType(inlineComplex, schema, e, depth, stack);
    else if (inlineSimple) this.simpleType(inlineSimple, schema, e);
    else e.text = attr(declNode, 'fixed') || attr(declNode, 'default') || '?';
  }

  isBuiltin(q) {
    return q.ns === NS.XSD || q.ns === NS.SOAPENC;
  }

  typeRef(q, e, depth, stack) {
    if (this.isBuiltin(q) || !this.model.types.has(q.key)) {
      if (q.local !== 'anyType' || q.ns !== NS.XSD) e.text = '?';
      else e.text = '?';
      return;
    }
    const occurrences = stack.filter((k) => k === q.key).length;
    if (occurrences >= 1 && depth > 2) {
      e.recursive = true;
      return;
    }
    const t = this.model.types.get(q.key);
    const next = [...stack, q.key];
    if (t.node.localName === 'simpleType') this.simpleType(t.node, t.schema, e);
    else this.complexType(t.node, t.schema, e, depth, next);
  }

  simpleType(node, schema, e) {
    const values = this.enumValues(node, schema, 0);
    if (values.length) {
      this.enums.set(e.name, values);
    }
    e.text = '?';
  }

  enumValues(node, schema, depth) {
    if (!node || depth > 8) return [];
    const r = firstChild(node, 'restriction', NS.XSD);
    if (!r) return [];
    const vals = childElements(r, 'enumeration', NS.XSD).map((n) => attr(n, 'value'));
    if (vals.length) return vals;
    const base = attr(r, 'base');
    if (base) {
      const q = this.model.qname(r, base, schema);
      const t = this.model.types.get(q.key);
      if (t && t.node.localName === 'simpleType') return this.enumValues(t.node, t.schema, depth + 1);
    }
    const inline = firstChild(r, 'simpleType', NS.XSD);
    return inline ? this.enumValues(inline, schema, depth + 1) : [];
  }

  complexType(node, schema, e, depth, stack) {
    for (const c of childElements(node, null, NS.XSD)) {
      switch (c.localName) {
        case 'sequence':
        case 'all':
        case 'choice':
          this.particle(c, schema, e, depth, stack);
          break;
        case 'group':
          this.groupRef(c, schema, e, depth, stack);
          break;
        case 'attribute':
        case 'attributeGroup':
          this.attribute(c, schema, e, 0);
          break;
        case 'complexContent':
          this.complexContent(c, schema, e, depth, stack);
          break;
        case 'simpleContent':
          this.simpleContent(c, schema, e);
          break;
      }
    }
  }

  complexContent(node, schema, e, depth, stack) {
    const ext = firstChild(node, 'extension', NS.XSD);
    const res = firstChild(node, 'restriction', NS.XSD);
    const d = ext || res;
    if (!d) return;
    const base = attr(d, 'base');
    if (ext && base) {
      const q = this.model.qname(d, base, schema);
      const t = this.model.types.get(q.key);
      if (t && t.node.localName === 'complexType' && !stack.includes(q.key)) {
        this.complexType(t.node, t.schema, e, depth, [...stack, q.key]);
      }
    } else if (base) {
      const q = this.model.qname(d, base, schema);
      if (q.local === 'Array' && q.ns === NS.SOAPENC) {
        e.children.push({ kind: 'comment', text: 'SOAP-ENC Array: repeat items here' });
      }
    }
    this.complexType(d, schema, e, depth, stack);
  }

  simpleContent(node, schema, e) {
    const d = firstChild(node, 'extension', NS.XSD) || firstChild(node, 'restriction', NS.XSD);
    e.text = '?';
    if (!d) return;
    const base = attr(d, 'base');
    if (base) {
      const q = this.model.qname(d, base, schema);
      const t = this.model.types.get(q.key);
      if (t && t.node.localName === 'simpleType') {
        const vals = this.enumValues(t.node, t.schema, 0);
        if (vals.length) this.enums.set(e.name, vals);
      } else if (t && t.node.localName === 'complexType') {
        // inherit attributes of base complex type with simple content
        for (const c of childElements(t.node, null, NS.XSD)) {
          if (c.localName === 'simpleContent') this.simpleContent(c, t.schema, e);
          if (c.localName === 'attribute' || c.localName === 'attributeGroup') this.attribute(c, t.schema, e, 0);
        }
        e.text = '?';
      }
    }
    const vals = childElements(d, 'enumeration', NS.XSD).map((n) => attr(n, 'value'));
    if (vals.length) this.enums.set(e.name, vals);
    for (const c of childElements(d, null, NS.XSD)) {
      if (c.localName === 'attribute' || c.localName === 'attributeGroup') this.attribute(c, schema, e, 0);
    }
  }

  particle(node, schema, e, depth, stack) {
    const kids = childElements(node, null, NS.XSD).filter((c) => c.localName !== 'annotation');
    if (node.localName === 'choice' && kids.length > 1) {
      e.children.push({ kind: 'comment', text: `You have a CHOICE of the next ${kids.length} items at this level` });
    }
    const optional = attr(node, 'minOccurs') === '0';
    for (const c of kids) {
      switch (c.localName) {
        case 'element':
          this.element(c, schema, e, depth + 1, stack, false, optional && !attr(c, 'minOccurs') ? node : null);
          break;
        case 'sequence':
        case 'choice':
        case 'all':
          this.particle(c, schema, e, depth, stack);
          break;
        case 'group':
          this.groupRef(c, schema, e, depth, stack);
          break;
        case 'any':
          e.children.push({ kind: 'comment', text: 'You may enter ANY elements at this point' });
          break;
      }
    }
  }

  groupRef(node, schema, e, depth, stack) {
    const ref = attr(node, 'ref');
    if (!ref) return this.complexType(node, schema, e, depth, stack);
    const q = this.model.qname(node, ref, schema);
    const g = this.model.groups.get(q.key);
    if (!g || stack.includes('group:' + q.key)) return;
    this.complexType(g.node, g.schema, e, depth, [...stack, 'group:' + q.key]);
  }

  attribute(node, schema, e, depth) {
    if (depth > 10) return;
    if (node.localName === 'attributeGroup') {
      const ref = attr(node, 'ref');
      if (ref) {
        const q = this.model.qname(node, ref, schema);
        const g = this.model.attributeGroups.get(q.key);
        if (g) for (const c of childElements(g.node, null, NS.XSD)) this.attribute(c, g.schema, e, depth + 1);
      } else {
        for (const c of childElements(node, null, NS.XSD)) this.attribute(c, schema, e, depth + 1);
      }
      return;
    }
    if (node.localName !== 'attribute') return;
    let decl = node;
    let declSchema = schema;
    let isGlobal = false;
    const ref = attr(node, 'ref');
    if (ref) {
      const q = this.model.qname(node, ref, schema);
      const a = this.model.attributes.get(q.key);
      if (!a) return;
      decl = a.node;
      declSchema = a.schema;
      isGlobal = true;
    }
    const use = attr(node, 'use') || 'optional';
    if (use === 'prohibited') return;
    const name = attr(decl, 'name');
    const form = attr(decl, 'form');
    const qualified = isGlobal || form === 'qualified' || (form !== 'unqualified' && declSchema.attributeFormDefault === 'qualified');
    const ns = qualified ? declSchema.tns : '';
    if (ns) this.usedNs.add(ns);
    const p = this.prefixFor(ns);
    const aname = p ? `${p}:${name}` : name;
    let values = [];
    const inline = firstChild(decl, 'simpleType', NS.XSD);
    if (inline) values = this.enumValues(inline, declSchema, 0);
    else if (attr(decl, 'type')) {
      const q = this.model.qname(decl, attr(decl, 'type'), declSchema);
      const t = this.model.types.get(q.key);
      if (t && t.node.localName === 'simpleType') values = this.enumValues(t.node, t.schema, 0);
      if (q.ns === NS.XSD && q.local === 'boolean') values = ['true', 'false'];
    }
    this.entry(e.name).attributes.set(aname, values);
    if (use === 'required') {
      e.attrs.push({ name: aname, value: attr(decl, 'fixed') || attr(decl, 'default') || '?' });
    }
  }

  /** Part of a message -> appended to parent */
  part(part, parent, rpc) {
    if (part.element) {
      const decl = this.model.elements.get(part.element.key);
      if (decl) return this.element(decl.node, decl.schema, parent, 1, [], true);
      const e = this.el(part.element.local, part.element.ns);
      e.text = '?';
      parent.children.push(e);
      this.record(parent, e);
      return;
    }
    const e = this.el(part.name, '');
    parent.children.push(e);
    this.record(parent, e);
    if (part.type) this.typeRef(part.type, e, 1, []);
    else e.text = '?';
    void rpc;
  }
}

/* ------------------------------------------------------------------ */
/* Serializer                                                           */
/* ------------------------------------------------------------------ */

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serialize(node, indent, level, nsDecls) {
  const pad = indent.repeat(level);
  if (node.kind === 'comment') return `${pad}<!--${node.text}-->`;
  let attrs = '';
  if (nsDecls) for (const [p, ns] of nsDecls) attrs += ` xmlns:${p}="${escapeXml(ns)}"`;
  for (const a of node.attrs) attrs += ` ${a.name}="${escapeXml(a.value)}"`;
  const hasEl = node.children.some((c) => c.kind === 'el');
  if (!node.children.length) {
    if (node.text != null) return `${pad}<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`;
    return `${pad}<${node.name}${attrs}/>`;
  }
  if (!hasEl && node.text != null) {
    // only comments + text (unlikely)
    return `${pad}<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`;
  }
  const inner = node.children.map((c) => serialize(c, indent, level + 1)).join('\n');
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

function envelopeInfo(version) {
  return version === '1.2'
    ? { prefix: 'soap', ns: NS.SOAP12ENV }
    : { prefix: 'soapenv', ns: NS.SOAP11ENV };
}

function buildOperationEnvelope(model, prefixes, binding, op, recorder) {
  const builder = recorder || new SampleBuilder(model, prefixes);
  builder.usedNs = new Set();
  const env = envelopeInfo(binding.soapVersion);
  const envelope = { kind: 'el', name: `${env.prefix}:Envelope`, children: [], attrs: [], text: null };
  const header = { kind: 'el', name: `${env.prefix}:Header`, children: [], attrs: [], text: null };
  const body = { kind: 'el', name: `${env.prefix}:Body`, children: [], attrs: [], text: null };
  envelope.children.push(header, body);

  const pt = model.portTypes.get(binding.type && binding.type.key);
  const ptOp = pt ? pt.operations.get(op.name) : null;
  const msg = ptOp && ptOp.input ? model.messages.get(ptOp.input.key) : null;

  // headers
  for (const h of op.headers || []) {
    const hm = h.message ? model.messages.get(h.message.key) : null;
    const part = hm ? hm.parts.find((p) => p.name === h.part) : null;
    if (part) builder.part(part, header, false);
  }

  if (msg) {
    let parts = msg.parts;
    if (op.bodyParts) parts = parts.filter((p) => op.bodyParts.includes(p.name));
    if (op.style === 'rpc') {
      const ns = op.bodyNamespace || binding.tns;
      const wrapper = builder.el(op.name, ns);
      body.children.push(wrapper);
      builder.record(body, wrapper);
      for (const p of parts) builder.part(p, wrapper, true);
    } else {
      for (const p of parts) builder.part(p, body, false);
    }
  }
  const nsDecls = [[env.prefix, env.ns]];
  for (const ns of builder.usedNs) nsDecls.push([builder.prefixFor(ns), ns]);
  const xml = serialize(envelope, '   ', 0, nsDecls);
  return { xml, doc: ptOp ? ptOp.doc : '' };
}

function completionSchema(builder, versions) {
  const elements = [];
  const envNames = [];
  for (const v of versions) {
    const env = envelopeInfo(v);
    envNames.push(env);
  }
  for (const env of envNames) {
    elements.push({ name: `${env.prefix}:Envelope`, top: true, children: [`${env.prefix}:Header`, `${env.prefix}:Body`] });
    const headerEntry = builder.completion.get(`${env.prefix}:Header`);
    const bodyEntry = builder.completion.get(`${env.prefix}:Body`);
    elements.push({ name: `${env.prefix}:Header`, children: headerEntry ? [...headerEntry.children] : [] });
    elements.push({ name: `${env.prefix}:Body`, children: bodyEntry ? [...bodyEntry.children] : [] });
  }
  const skip = new Set(elements.map((e) => e.name));
  for (const [name, entry] of builder.completion) {
    if (skip.has(name)) continue;
    elements.push({
      name,
      children: [...entry.children],
      attributes: [...entry.attributes].map(([n, values]) => (values.length ? { name: n, values } : n))
    });
  }
  return {
    elements,
    enums: Object.fromEntries(builder.enums),
    docs: Object.fromEntries(builder.docs),
    namespaces: Object.fromEntries([...builder.prefixes].map(([ns, p]) => [p, ns]))
  };
}

/**
 * Parse a WSDL from a location and build interfaces / operations / sample envelopes.
 * @param {string} location URL or file path
 * @param {(loc:string)=>Promise<string>} fetcher
 */
async function parseWsdl(location, fetcher) {
  const model = new WsdlModel(fetcher);
  await model.load(location);
  if (!model.bindings.size) {
    throw new Error('No SOAP binding found in this WSDL');
  }
  const prefixes = buildPrefixMap([...model.namespaces]);
  const recorder = new SampleBuilder(model, prefixes);
  const interfaces = [];
  const versions = new Set();

  for (const binding of model.bindings.values()) {
    const ports = model.services.filter((s) => s.binding && s.binding.local === binding.name);
    const endpoints = ports.map((p) => p.location).filter(Boolean);
    versions.add(binding.soapVersion);
    const operations = binding.operations.map((op) => {
      const { xml, doc } = buildOperationEnvelope(model, prefixes, binding, op, recorder);
      return { name: op.name, soapAction: op.soapAction, style: op.style, body: xml, doc };
    });
    interfaces.push({
      name: binding.name,
      soapVersion: binding.soapVersion,
      endpoint: endpoints[0] || '',
      endpoints,
      service: ports[0] ? ports[0].service : '',
      operations
    });
  }
  const svcName = (model.services[0] && model.services[0].service) || model.name || 'Service';
  return {
    name: svcName,
    targetNamespace: model.targetNamespace,
    interfaces,
    documents: model.documents,
    warnings: model.warnings,
    schema: completionSchema(recorder, versions.size ? [...versions] : ['1.1'])
  };
}

module.exports = { parseWsdl, NS };
