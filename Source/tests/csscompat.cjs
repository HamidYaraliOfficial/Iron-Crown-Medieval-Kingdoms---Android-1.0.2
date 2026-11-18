// Copyright (c) 2026 Hamid Yarali. All Rights Reserved.
// Needs the Android payload first: node scripts/android_web.mjs
// Compares layout of the real CSS against an "old WebView" simulation (logical props removed, fallbacks forced).
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const www = require('path').resolve(__dirname, '../android/app/src/main/assets/www');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const LOGICAL = /(?:^|[;{\s])(inset|inset-inline|inset-block|inset-inline-start|inset-inline-end|margin-inline-start|margin-inline-end|padding-inline-start|padding-inline-end|border-inline-start(?:-color|-width|-style)?|border-inline-end(?:-color|-width|-style)?)\s*:[^;}]*;?/g;
function oldCss(css) {
  // split at the fallback @supports blocks: strip logical decls only outside them, force the blocks on
  const parts = css.split(/(@supports not \(inset: 0\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\})/);
  return parts.map((p) => p.startsWith('@supports not (inset: 0)') ? p.replace('not (inset: 0)', '(display: block)') : p.replace(LOGICAL, (m) => m[0] === ';' || m[0] === '{' || /\s/.test(m[0]) ? m[0] : '')).join('');
}
async function run(lang, old, w, h) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript((lang) => { try { localStorage.setItem('ic_settings', JSON.stringify({ quality: 'low', fpsLimit: 0, autosave: 0, lang })); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  await ctx.route('https://appassets.androidplatform.net/**', (r) => { const u = new URL(r.request().url()); const f = path.join(www, u.pathname === '/' ? '/index.html' : u.pathname);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f); if (old && f.endsWith('style.css')) body = oldCss(body.toString('utf8'));
    return r.fulfill({ status: 200, headers: { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }, body }); });
  await page.goto('https://appassets.androidplatform.net/index.html');
  await page.waitForFunction(() => window.__app && !document.getElementById('boot'), null, { timeout: 120000 });
  const grab = () => page.evaluate(() => { const o = {}; document.querySelectorAll('#screens *, #hud *').forEach((e, i) => { const r = e.getBoundingClientRect(); if ((!r.width && !r.height) || String(e.className).indexOf('ember') >= 0) return; o[i + ':' + e.tagName + '.' + (e.id || String(e.className).slice(0, 30))] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v)); }); return o; });
  const menu = await grab();
  await page.evaluate(() => window.__app.startGame({ mode: 'skirmish', mapId: 'greenvalley', size: 'small', enemies: 1, difficulty: 'easy', res: 'normal', victory: 'conquest', playerName: 'T', seed: 4242 }));
  await page.waitForFunction(() => window.__app.playing, null, { timeout: 120000 }); await page.waitForTimeout(1500);
  const hud = await grab(); await browser.close(); return { menu, hud };
}
(async () => {
  for (const [lang, w, h] of [['en', 851, 393], ['fa', 851, 393]]) {
    const A = await run(lang, false, w, h), B = await run(lang, true, w, h);
    for (const k of ['menu', 'hud']) {
      const ka = Object.keys(A[k]), diffs = ka.filter((x) => !B[k][x] || A[k][x].some((v, i) => Math.abs(v - B[k][x][i]) > 1));
      console.log(lang, k, 'elements', ka.length, 'differences', diffs.length); diffs.slice(0, 8).forEach((x) => console.log('   ', x, A[k][x], B[k][x]));
    }
  }
})();
