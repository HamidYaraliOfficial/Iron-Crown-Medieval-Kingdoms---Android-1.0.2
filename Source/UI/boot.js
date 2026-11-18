// Copyright (c) 2026 Hamid Yarali. All Rights Reserved.
// Loaded before the game. (1) tiny polyfills so older Android WebViews can run it, (2) shows what the game is doing on the
// start screen and, if the start fails or hangs, WHY (error text, engine version, WebGL support) instead of a silent screen.
// ES5 only, on purpose: this file must still run on very old engines.
(function () {
  'use strict';
  var w = window, d = document, t0 = Date.now(), errs = [], gl2 = null, timer = 0;

  // ---------- polyfills (only what the game uses and older engines lack) ----------
  function def(proto, name, fn) { try { if (!proto[name]) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true }); } catch (e) { /* ignore */ } }
  if (!w.globalThis) w.globalThis = w;
  if (!Object.fromEntries) Object.fromEntries = function (it) { var o = {}, a = Array.from(it), i; for (i = 0; i < a.length; i++) o[a[i][0]] = a[i][1]; return o; };
  def(Array.prototype, 'flat', function (depth) {
    var out = [], dp = depth === undefined ? 1 : Number(depth);
    (function f(a, n) { for (var i = 0; i < a.length; i++) { if (Array.isArray(a[i]) && n > 0) f(a[i], n - 1); else out.push(a[i]); } })(this, dp);
    return out;
  });
  def(Array.prototype, 'flatMap', function (fn, th) { return Array.prototype.flat.call(Array.prototype.map.call(this, fn, th), 1); });
  def(Array.prototype, 'at', function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; });
  def(String.prototype, 'at', function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n >= 0 && n < this.length ? this.charAt(n) : undefined; });
  def(String.prototype, 'replaceAll', function (a, b) { return this.replace(a instanceof RegExp ? a : new RegExp(String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), b); });
  def(Element.prototype, 'replaceChildren', function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < arguments.length; i++) { var n = arguments[i]; this.appendChild(n && n.nodeType ? n : d.createTextNode(String(n))); }
  });
  // WebView < 84 has neither; three.js only uses them to release GPU objects early, so a strong reference / no-op is safe.
  if (!w.WeakRef) w.WeakRef = function WeakRef(t) { this._t = t; }, w.WeakRef.prototype.deref = function () { return this._t; };
  if (!w.FinalizationRegistry) { w.FinalizationRegistry = function FinalizationRegistry() {}; w.FinalizationRegistry.prototype.register = function () {}; w.FinalizationRegistry.prototype.unregister = function () { return false; }; }
  if (w.Promise && !Promise.allSettled) Promise.allSettled = function (ps) { return Promise.all(Array.from(ps).map(function (p) { return Promise.resolve(p).then(function (v) { return { status: 'fulfilled', value: v }; }, function (r) { return { status: 'rejected', reason: r }; }); })); };

  // ---------- start-up status / error display ----------
  function chrome() { var m = /Chrome\/(\d+)/.exec(navigator.userAgent); return m ? +m[1] : 0; }
  function webgl2() {
    if (gl2 !== null) return gl2;
    try { var c = d.createElement('canvas'); var g = c.getContext('webgl2'); gl2 = !!g; if (g) { var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } } catch (e) { gl2 = false; }
    return gl2;
  }
  function add(m) { m = String(m).slice(0, 240); if (errs.length < 6 && errs.indexOf(m) < 0) errs.push(m); render(); }
  w.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== w && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) add('Could not load ' + (t.src || t.href));
    else add((e.message || 'error') + (e.filename ? '  (' + String(e.filename).split('/').pop() + ':' + e.lineno + ':' + e.colno + ')' : ''));
  }, true);
  w.addEventListener('unhandledrejection', function (e) { var r = e.reason; add('Promise: ' + (r && r.message ? r.message : r)); });
  if (w.console && console.error) { var ce = console.error; console.error = function () { try { if (!w.__icReady) add('console: ' + Array.prototype.join.call(arguments, ' ')); } catch (x) { /* ignore */ } return ce.apply(console, arguments); }; }

  function render() {
    var boot = d.getElementById('boot');
    if (w.__icReady || w.__icFatal || !boot) { if (timer) { clearInterval(timer); timer = 0; } return; }
    var pre = d.getElementById('bootinfo');
    if (!pre) {
      pre = d.createElement('pre'); pre.id = 'bootinfo';
      pre.style.cssText = 'max-width:92%;margin:0;font:12px/1.5 monospace;letter-spacing:0;text-align:left;direction:ltr;white-space:pre-wrap;word-break:break-word;color:#d9c9a0;opacity:.9';
      boot.appendChild(pre);
    }
    var sec = Math.round((Date.now() - t0) / 1000), cv = chrome(), lines = [];
    lines.push('Loading... ' + sec + 's' + (w.__icStep ? '  [' + w.__icStep + ']' : ''));
    if (cv && cv < 64) lines.push('Your Android System WebView (Chrome ' + cv + ') is too old. Update "Android System WebView" and Chrome from the store.\nنسخهٔ WebView گوشی (Chrome ' + cv + ') خیلی قدیمی است؛ «Android System WebView» و Chrome را به‌روزرسانی کنید.');
    if (errs.length || sec >= 12) {
      lines.push('--');
      lines.push('Chrome ' + (cv || '?') + '  WebGL2: ' + (webgl2() ? 'yes' : 'NO') + '  ' + w.innerWidth + 'x' + w.innerHeight + ' @' + w.devicePixelRatio);
      for (var i = 0; i < errs.length; i++) lines.push('! ' + errs[i]);
      if (errs.length) lines.push('Take a screenshot of this screen and send it to the developer.\nاز این صفحه اسکرین‌شات بگیرید و برای سازنده بفرستید.');
    }
    pre.textContent = lines.join('\n');
  }
  timer = setInterval(render, 1000);
  w.__icBoot = { errors: errs };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', render); else render();
})();
