import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  placeholder as placeholderExt,
  MatchDecorator,
  ViewPlugin,
  Decoration
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  foldGutter,
  foldKeymap,
  indentOnInput,
  bracketMatching,
  syntaxHighlighting,
  HighlightStyle,
  codeFolding
} from '@codemirror/language';
import { xml } from '@codemirror/lang-xml';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { xmlError } from '../utils/xml';
import { DYNAMIC_VARS } from '../utils/vars';

const highlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--syn-tag)' },
  { tag: tags.namespace, color: 'var(--syn-ns)' },
  { tag: tags.attributeName, color: 'var(--syn-attr)' },
  { tag: tags.attributeValue, color: 'var(--syn-string)' },
  { tag: tags.string, color: 'var(--syn-string)' },
  { tag: tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [tags.angleBracket, tags.definitionOperator, tags.punctuation], color: 'var(--syn-punct)' },
  { tag: tags.processingInstruction, color: 'var(--syn-comment)' },
  { tag: tags.character, color: 'var(--syn-entity)' },
  { tag: tags.content, color: 'var(--syn-text)' },
  { tag: tags.invalid, color: 'var(--danger)', textDecoration: 'underline wavy' },
  { tag: tags.documentMeta, color: 'var(--syn-comment)' }
]);

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--editor-font-size)',
    backgroundColor: 'transparent',
    color: 'var(--syn-text)'
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-mute)',
    border: 'none',
    borderRight: '1px solid var(--border)'
  },
  '.cm-activeLine': { backgroundColor: 'var(--line-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--line-active)', color: 'var(--accent)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--elev)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    padding: '0 6px'
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'var(--selection)',
    outline: '1px solid var(--accent)'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255,184,108,0.25)', outline: '1px solid var(--warning)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255,184,108,0.5)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--elev)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text)',
    boxShadow: '0 0 18px var(--glow)'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-contrast)'
  },
  '.cm-tooltip-autocomplete ul li': { fontFamily: 'var(--font-mono)' },
  '.cm-completionDetail': { color: 'var(--text-mute)', fontStyle: 'normal', marginLeft: '1em' },
  '.cm-panels': { backgroundColor: 'var(--elev)', color: 'var(--text)', borderTop: '1px solid var(--border)' },
  '.cm-panels input, .cm-panels button': {
    backgroundColor: 'var(--bg-deep)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '3px'
  },
  '.cm-panel.cm-search label': { color: 'var(--text-dim)' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--danger)'
  },
  '.cm-lint-marker-error': { content: 'none' },
  '.cm-diagnostic-error': { borderLeft: '3px solid var(--danger)' },
  '.cm-var': {
    color: 'var(--accent-3)',
    backgroundColor: 'var(--selection)',
    borderRadius: '3px',
    fontWeight: '600'
  },
  '.cm-placeholder-q': {
    color: 'var(--warning)',
    fontWeight: '700',
    textShadow: '0 0 6px var(--warning)'
  }
});

/* {{variable}} and "?" placeholder decorations */
const varMatcher = new MatchDecorator({
  regexp: /\{\{\s*[$\w.-]+\s*\}\}/g,
  decoration: Decoration.mark({ class: 'cm-var' })
});
const qMatcher = new MatchDecorator({
  regexp: />(\?)</g,
  decorate: (add, from, to) => add(from + 1, to - 1, Decoration.mark({ class: 'cm-placeholder-q' }))
});
const makeDecoPlugin = (matcher) =>
  ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = matcher.createDeco(view);
      }
      update(u) {
        this.decorations = matcher.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations }
  );

const xmlLinter = linter(
  (view) => {
    const text = view.state.doc.toString();
    const err = xmlError(text);
    if (!err) return [];
    const lineNo = Math.min(Math.max(err.line, 1), view.state.doc.lines);
    const line = view.state.doc.line(lineNo);
    const from = Math.min(line.from + Math.max(err.col - 1, 0), line.to);
    return [{ from: Math.max(line.from, from - 1), to: Math.max(from, Math.min(line.to, from + 1)), severity: 'error', message: err.message }];
  },
  { delay: 400 }
);

/** Select the next "?" placeholder after the cursor */
export function nextPlaceholder(view) {
  const text = view.state.doc.toString();
  const pos = view.state.selection.main.to;
  const re = />\?</g;
  re.lastIndex = pos;
  let m = re.exec(text);
  if (!m) {
    re.lastIndex = 0;
    m = re.exec(text);
  }
  if (!m) return false;
  const from = m.index + 1;
  view.dispatch({ selection: EditorSelection.single(from, from + 1), scrollIntoView: true });
  view.focus();
  return true;
}

/** Completion of {{variables}} */
function variableCompletion(getVars) {
  return (ctx) => {
    const m = ctx.matchBefore(/\{\{[$\w.-]*/);
    if (!m) return null;
    const vars = [...(getVars() || []), ...DYNAMIC_VARS];
    return {
      from: m.from + 2,
      options: vars.map((v) => ({ label: v, type: v.startsWith('$') ? 'function' : 'variable', apply: `${v}}}` })),
      validFor: /^[$\w.-]*$/
    };
  };
}

function schemaToSpec(schema) {
  if (!schema || !Array.isArray(schema.elements)) return {};
  const enums = schema.enums || {};
  const docs = schema.docs || {};
  const elements = schema.elements.map((e) => {
    const spec = { name: e.name, children: e.children || [], top: !!e.top };
    if (e.attributes && e.attributes.length) spec.attributes = e.attributes;
    if (enums[e.name]) spec.textContent = enums[e.name];
    if (docs[e.name]) spec.completion = { info: docs[e.name] };
    return spec;
  });
  return { elements };
}

export default function XmlEditor({
  value,
  onChange,
  readOnly = false,
  schema = null,
  wordWrap = false,
  lint = false,
  placeholder = '',
  onRun,
  onSave,
  onFormat,
  getVariables,
  editorRef
}) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onChange, onRun, onSave, onFormat, getVariables };
  const comps = useRef({ lang: new Compartment(), ro: new Compartment(), wrap: new Compartment(), lint: new Compartment() });

  useEffect(() => {
    const c = comps.current;
    const keys = keymap.of([
      { key: 'Mod-Enter', run: () => (handlers.current.onRun ? (handlers.current.onRun(), true) : false) },
      { key: 'Mod-s', run: () => (handlers.current.onSave ? (handlers.current.onSave(), true) : false), preventDefault: true },
      { key: 'Shift-Alt-f', run: () => (handlers.current.onFormat ? (handlers.current.onFormat(), true) : false) },
      { key: 'Mod-Shift-f', run: () => (handlers.current.onFormat ? (handlers.current.onFormat(), true) : false) },
      { key: 'F2', run: nextPlaceholder },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab
    ]);
    const state = EditorState.create({
      doc: value || '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        codeFolding(),
        foldGutter({
          markerDOM: (open) => {
            const s = document.createElement('span');
            s.className = 'cm-fold-marker';
            s.textContent = open ? '▾' : '▸';
            return s;
          }
        }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(highlight),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        c.lang.of(xml(schemaToSpec(schema))),
        autocompletion({ activateOnTyping: true, maxRenderedOptions: 200 }),
        EditorState.languageData.of(() => [{ autocomplete: variableCompletion(() => handlers.current.getVariables && handlers.current.getVariables()) }]),
        makeDecoPlugin(varMatcher),
        makeDecoPlugin(qMatcher),
        c.lint.of(lint ? [xmlLinter, lintGutter()] : []),
        c.ro.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        c.wrap.of(wordWrap ? EditorView.lineWrapping : []),
        placeholder ? placeholderExt(placeholder) : [],
        baseTheme,
        keys,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && handlers.current.onChange) handlers.current.onChange(u.state.doc.toString());
        })
      ]
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    if (editorRef) editorRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value != null && value !== cur) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch({ effects: comps.current.lang.reconfigure(xml(schemaToSpec(schema))) });
  }, [schema]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch({ effects: comps.current.wrap.reconfigure(wordWrap ? EditorView.lineWrapping : []) });
  }, [wordWrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (view)
      view.dispatch({
        effects: comps.current.ro.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])
      });
  }, [readOnly]);

  return <div className="xml-editor" ref={host} />;
}
