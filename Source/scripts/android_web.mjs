// Builds the web payload that the Android app serves from its assets:
//   android/app/src/main/assets/www/{index.html, style.css, game.js, fonts/*.woff2}
// Used by both Android build paths (Gradle / GitHub Actions and the offline apktool builder).
// Copyright (c) 2026 Hamid Yarali. All Rights Reserved.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

// Android System WebView 64+ (Chromium 64, 2018) is the target: newer JavaScript syntax is down-levelled by esbuild, the few newer
// APIs the game calls are polyfilled in UI/boot.js, and newer CSS (logical properties, inset) gets physical fallbacks below.
await build({
  entryPoints: [path.join(root, 'src', 'main.js')], bundle: true, format: 'iife', minify: true, legalComments: 'none',
  target: ['chrome61'], outfile: path.join(out, 'game.js'), logLevel: 'warning',
});

const html = fs.readFileSync(path.join(root, 'UI', 'index.html'), 'utf8').replace('../dist/game.js', 'game.js');
if (!html.includes('src="game.js"')) throw new Error('index.html: script tag not rewritten');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(root, 'UI', 'boot.js'), path.join(out, 'boot.js'));
const cssSrc = fs.readFileSync(path.join(root, 'UI', 'style.css'), 'utf8').replace(/\.\.\/assets\/fonts\//g, 'fonts/');
if (cssSrc.includes('../assets')) throw new Error('style.css: font paths not rewritten');
// Fallbacks for WebView < 87, which ignores CSS logical properties and `inset`: after every rule that uses them we add
// physical-property copies (left-to-right, plus html[dir=rtl] for Persian) inside @supports not (inset: 0), so new engines are unaffected.
const sides = (v) => { const a = v.trim().split(/\s+(?![^(]*\))/); return a.length === 1 ? [a[0], a[0], a[0], a[0]] : a.length === 2 ? [a[0], a[1], a[0], a[1]] : a.length === 3 ? [a[0], a[1], a[2], a[1]] : a; }; // top right bottom left
const LOG = (rtl) => ({
  'inset-inline-start': [rtl ? 'right' : 'left'], 'inset-inline-end': [rtl ? 'left' : 'right'],
  'margin-inline-start': [rtl ? 'margin-right' : 'margin-left'], 'margin-inline-end': [rtl ? 'margin-left' : 'margin-right'],
  'padding-inline-start': [rtl ? 'padding-right' : 'padding-left'], 'padding-inline-end': [rtl ? 'padding-left' : 'padding-right'],
  'border-inline-start': [rtl ? 'border-right' : 'border-left'], 'border-inline-end': [rtl ? 'border-left' : 'border-right'],
  'border-inline-start-color': [rtl ? 'border-right-color' : 'border-left-color'], 'border-inline-end-color': [rtl ? 'border-left-color' : 'border-right-color'],
  'border-inline-start-width': [rtl ? 'border-right-width' : 'border-left-width'], 'border-inline-end-width': [rtl ? 'border-left-width' : 'border-right-width'],
  'border-inline-start-style': [rtl ? 'border-right-style' : 'border-left-style'], 'border-inline-end-style': [rtl ? 'border-left-style' : 'border-right-style'],
});
const physical = (decl, rtl) => { // -> array of [prop, value] or null when the declaration needs no fallback
  const p = decl.prop, v = decl.value;
  if (p === 'inset') { const [t, r, b, l] = sides(v); return [['top', t], ['right', r], ['bottom', b], ['left', l]]; }
  if (p === 'inset-inline') { const a = v.trim().split(/\s+/); const [st, en] = a.length === 1 ? [a[0], a[0]] : a; return rtl ? [['right', st], ['left', en]] : [['left', st], ['right', en]]; }
  if (p === 'inset-block') { const a = v.trim().split(/\s+/); return [['top', a[0]], ['bottom', a[1] || a[0]]]; }
  const m = LOG(rtl)[p]; return m ? [[m[0], v]] : null;
};
const compat = {
  postcssPlugin: 'ic-old-webview',
  Once(root, { AtRule, Rule, Declaration }) {
    const todo = [];
    root.walkRules((rule) => { if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return; if (rule.nodes.some((n) => n.type === 'decl' && physical(n, false))) todo.push(rule); });
    const indep = (n) => n.prop === 'inset' || n.prop === 'inset-block'; // direction-independent
    const lead = (s, to) => (/^(html|:root)\b/.test(s) ? s.replace(/^(html|:root)/, to) : to + ' ' + s);
    for (const rule of todo) {
      const sup = new AtRule({ name: 'supports', params: 'not (inset: 0)' });
      const add = (selector, nodes, rtl) => { if (!nodes.length) return; const r = new Rule({ selector }); for (const d of nodes) for (const [prop, value] of physical(d, rtl)) r.append(new Declaration({ prop, value, important: d.important })); sup.append(r); };
      const all = rule.nodes.filter((n) => n.type === 'decl' && physical(n, false));
      add(rule.selector, all.filter(indep), false);
      add(rule.selectors.map((s) => lead(s, 'html:not([dir=rtl])')).join(', '), all.filter((n) => !indep(n)), false);
      add(rule.selectors.map((s) => lead(s, 'html[dir=rtl]')).join(', '), all.filter((n) => !indep(n)), true);
      rule.parent.insertAfter(rule, sup);
    }
  },
};
const css = (await postcss([compat]).process(cssSrc, { from: undefined })).css;
fs.writeFileSync(path.join(out, 'style.css'), css);
for (const f of fs.readdirSync(path.join(root, 'assets', 'fonts'))) fs.copyFileSync(path.join(root, 'assets', 'fonts', f), path.join(out, 'fonts', f));

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0);
console.log(`[android-web] ${out}`);
console.log(`[android-web] game.js ${size(path.join(out, 'game.js'))} KB, style.css ${size(path.join(out, 'style.css'))} KB, ${fs.readdirSync(path.join(out, 'fonts')).length} font files`);
