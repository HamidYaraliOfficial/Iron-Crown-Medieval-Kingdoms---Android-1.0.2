// Copyright (c) 2026 Hamid Yarali. All Rights Reserved.
// Needs the Android payload first: node scripts/android_web.mjs
// Simulates an engine that lacks newer APIs; WITH_BOOT=0 serves the page without boot.js (negative control).
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const www = require('path').resolve(__dirname, '../android/app/src/main/assets/www');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const WITH = process.env.WITH_BOOT !== '0';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 851, height: 393 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 9; SM-J730F Build/PPR1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36' });
  await ctx.addInitScript(() => {
    const del = (o, k) => { try { delete o[k]; } catch (e) {} };
    del(Object, 'fromEntries'); del(Array.prototype, 'flat'); del(Array.prototype, 'flatMap'); del(Array.prototype, 'at'); del(String.prototype, 'at'); del(String.prototype, 'replaceAll');
    del(Element.prototype, 'replaceChildren'); del(window, 'WeakRef'); del(window, 'FinalizationRegistry'); del(window, 'OffscreenCanvas'); del(window, 'structuredClone'); del(Promise, 'allSettled'); del(window, 'globalThis'); // note: Playwright itself needs globalThis, so the negative control (WITH_BOOT=0) can only be judged by the screen text
    try { localStorage.setItem('ic_settings', JSON.stringify({ quality: 'low', fpsLimit: 0, autosave: 0, lang: 'en' })); } catch (e) {}
  });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await ctx.route('https://appassets.androidplatform.net/**', (r) => { const u = new URL(r.request().url()); const f = path.join(www, u.pathname === '/' ? '/index.html' : u.pathname);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f); if (!WITH && f.endsWith('index.html')) body = Buffer.from(body.toString().replace('<script src="boot.js"></script>', ''));
    return r.fulfill({ status: 200, headers: { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }, body }); });
  await page.goto('https://appassets.androidplatform.net/index.html');
  const ok = await page.waitForFunction(() => window.__app && !document.getElementById('boot'), null, { timeout: 40000 }).then(() => true, () => false);
  console.log('WITH_BOOT', WITH, 'reached menu:', ok);
  if (ok) {
    await page.evaluate(() => window.__app.startGame({ mode: 'skirmish', mapId: 'greenvalley', size: 'small', enemies: 1, difficulty: 'easy', res: 'normal', victory: 'conquest', playerName: 'T', seed: 4242 }));
    const g = await page.waitForFunction(() => window.__app.playing, null, { timeout: 90000 }).then(() => true, () => false); await page.waitForTimeout(1500);
    console.log('game started:', g);
  } else console.log('boot text:', String(await page.evaluate(() => document.getElementById('boot') ? document.getElementById('boot').innerText : 'NO #boot')).replace(/\n/g, ' | '));
  console.log('page errors:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
