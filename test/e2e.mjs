// Draws a world in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// On a phone-sized screen: the starting world has realms, towns and rivers, switching tools leaves the map where it
// is, and the whole map fits beside the zoom buttons with a small scale bar; a blank ocean takes a sketched island,
// a mountain range (without flooding the valleys beside it) and a hand-drawn river; new realms fill the island; a
// town's page rolls a rumor into its notes, and Undo leaves notes alone; the world, rivers and borders included,
// survives a reload and saves to a file. Then the usual checks: no errors, nothing loaded from elsewhere, no
// sideways scrolling, installable, and it loads offline. On a laptop-sized screen: the Codex, sea names, world
// files that are damaged or from a newer version, keyboard focus and shortcuts, and the dark theme Claude's viewer
// can stamp. Then what the map says about itself: a lake's elevation, rivers drawn out of lakes (one with a wide
// valley) that leave the lakes be, a coast named after the sea it is on, a coast drawn smooth that comes out
// smooth, sea names clear of the scale bar, no latitudes the climate doesn't match, frozen land no wetter than the rest, and places the sea rises over; and
// the README's count of the kinds of land. Last, a phone held sideways, the map clear of a touch screen's sides, a
// Back mid-sketch taken for a slip, a browser that won't keep the autosave, and saved worlds the page can't read or
// that a newer version wrote, kept aside and given back by Download the old save. Five seeds that must keep growing the
// same worlds, and a world file from an earlier build that must keep opening. Rivers that keep their names through an
// edit, an Undo and a reload, never two of one name, and a drawn river named in its toast; a place's River line, which
// says where its river goes and links to its mouth; a river renamed from it; and a drawn river named on the map, and
// taken away by Erase where it starts. Then nothing lost and nothing undone by
// surprise: a pinch that paints nothing (one finger off the map too), a drag a pinch cuts short (and a wobble it
// doesn't keep), a town dragged into the sea, a page left mid-stroke, an autosave mid-stroke, Undo mid-stroke, a
// toast's Undo, Undo naming the places it takes (and the rumor rolled for one), Found new realms and Clear naming the
// notes they take, a label cleared of its text, a refused file, and two tabs on one world. And sketches that keep
// what's on the map: rivers drawn into and beside lakes, a range across a lake's way out, a river line across an inlet,
// figure-8s and loops drawn twice round, a drawn river's source going under the sea, edits that change nothing saying
// so, and each brush, with its ring under a finger, Raise held still building a dome, and Raise over a river keeping it a
// channel. The single-file copy for
// Claude's viewer, from a file and over http.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
const problems = [];
const loaded = new Set();
function watch(page) {
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) problems.push('failed: ' + r.url()); });
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base)) loaded.add(new URL(u).pathname.slice(1) || './');
    else if (!u.startsWith('data:') && !u.startsWith('blob:')) problems.push('left the site: ' + u);
  });
  return page;
}
const page = watch(await ctx.newPage());

const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.terra.state());
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ok  ' + msg); };
// Run in the page: a spot on the open world's biggest river, 30 to 45 cells from its mouth as the crow flies (or as far
// as it reaches), and the river's name; and from there, where a short river drawn 20 cells long would start on higher,
// dry ground and run down into it.
const bigRiverSpot = () => {
  const r = window.terra.rivers()[0]; let best = null, bd = -Infinity;
  for (let y = 0; y < 300; y++) for (let x = 0; x < 480; x++) {
    if (!window.terra.cell(x + 0.5, y + 0.5).river || window.terra.riverAt(x + 0.5, y + 0.5) !== r.name) continue;
    const d = Math.hypot(x - r.x, y - r.y), score = d <= 45 ? d : 90 - d;
    if (score > bd) { bd = score; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  const here = window.terra.cell(best.x, best.y);
  for (let a = 0; a < 16; a++) {
    const x = best.x + Math.cos(a / 8 * Math.PI + Math.PI / 4) * 20, y = best.y + Math.sin(a / 8 * Math.PI + Math.PI / 4) * 20, c = window.terra.cell(x, y);
    if (c.h >= 0 && !c.lake && !window.terra.riverNear(x, y, 3) && c.elev > here.elev + 50) return { ...best, name: r.name, from: { x, y } };
  }
  return { ...best, name: r.name, from: null };
};

// Drags along a path given in map cells (the map is 480 x 300 cells).
async function drag(points, steps = 6, pg = page) {
  // Picking a tool option can change the toolbar's height and so the map's place on the page; let it settle first.
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const b = await pg.locator('#map').boundingBox();
  const pts = [];
  for (const [x, y] of points) { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); pts.push([b.x + p.x, b.y + p.y]); }
  await pg.mouse.move(...pts[0]); await pg.mouse.down();
  for (let k = 1; k < pts.length; k++) for (let s = 1; s <= steps; s++) {
    await pg.mouse.move(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / steps, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / steps);
  }
  await pg.mouse.up();
  await pg.waitForTimeout(250);
}

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
ok(await S(() => document.fonts.check('16px "IM Fell English"') && document.fonts.check('14px "Instrument Sans"')), 'the fonts load from fonts/');

// The first visit opens on a finished world.
let st = await state();
ok(st.realms >= 2 && st.places >= 20 && st.rivers > 200 && st.labels >= 2, `the starting world has realms, towns, rivers and labels (${st.realms} realms, ${st.places} places)`);
// Growing a world takes seconds on a slow phone, so Generate says so first and lets the screen show it before the work:
// the page froze with no sign of life.
const growing = await S(() => { document.getElementById('wSeed').value = '48213'; document.getElementById('wGen').click(); return [document.querySelector('#toast span').textContent, window.terra.state().seed]; });
await page.waitForFunction(() => !window.terra.busy());
const grown = await S(() => [document.querySelector('#toast span').textContent, window.terra.state().seed]);
ok(growing[0] === 'Generating world 48213…' && growing[1] === 20417 && grown[1] === 48213 && grown[0].startsWith('Generated world 48213.'), `Generate says "${growing[0]}" before it grows the world, then "${grown[0].split('.')[0]}."`);
await S(() => document.getElementById('btnUndo').click());
await page.waitForFunction(() => window.terra.state().seed === 20417);
ok(await page.locator('#pane-inspect .welcome').isVisible(), 'the gazetteer greets you');
const names = (await S(() => window.terra.places())).map((p) => p.name);
ok(new Set(names).size === names.length, 'no two places share a name');

// Switching tools never moves the map on a phone: each tool's options sit under it.
const mapTop = () => S(() => Math.round(document.getElementById('map').getBoundingClientRect().top + scrollY));
const tops = new Set();
for (const t of ['select', 'sketch', 'raise', 'settle', 'landmark', 'label', 'erase']) { await page.click(`.tool[data-tool="${t}"]`); tops.add(await mapTop()); }
await page.click('.tool[data-tool="sketch"]');
for (const m of ['sea', 'range', 'river', 'land']) { await page.click(`.chip[data-v="${m}"]`); tops.add(await mapTop()); }
await page.click('.tool[data-tool="select"]');
ok(tops.size === 1, `switching tools leaves the map where it is on a phone (${[...tops].join(', ')} px down the page)`);
// Each brush that reshapes the ground says what it does first. They all said the same thing, so Smooth went unexplained.
const brushHints = [];
for (const t of ['raise', 'lower', 'smooth']) { await page.click(`.tool[data-tool="${t}"]`); brushHints.push(await page.textContent('#toolOpts .hint')); }
await page.click('.tool[data-tool="select"]');
ok(brushHints[0].startsWith('Builds the ground up under the brush. Hold and drag.') && brushHints[1].startsWith('Wears it down. Hold and drag.') && brushHints[2].startsWith('Softens peaks and fills dips. Hold and drag.'), `Raise, Lower and Smooth each say what they do (${brushHints.map((h) => '"' + h.split('.')[0] + '"').join(', ')})`);

// The whole map on a phone: the scale bar keeps to its corner, and the zoom buttons stay off the map. They used to cover
// the starting world's eastern capital, and the scale bar took half the map's width. They are a row under the map's
// corner, so the whole map takes the frame's width (it took 274 of 342 px, beside a column of them).
const fitted = await S(() => {
  window.terra.fitView();
  const { scale } = window.terra.boxes(), a = window.terra.toScreen(0, 0), b = window.terra.toScreen(480, 300);
  const wrap = document.getElementById('mapwrap').getBoundingClientRect(), zoom = document.querySelector('.zoom').getBoundingClientRect();
  return { share: (scale[2] - scale[0]) / (b.x - a.x), mapBottom: wrap.top + b.y, zoomTop: zoom.top, fill: (b.x - a.x) / wrap.width, w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) };
});
ok(fitted.share < 0.4 && fitted.mapBottom <= fitted.zoomTop + 0.5, `on a phone the scale bar takes ${Math.round(fitted.share * 100)}% of the map's width, and the zoom buttons stay off the map`);
ok(fitted.fill >= 0.9, `on a phone the whole map fills the frame's width (${fitted.w} x ${fitted.h} px, ${Math.round(fitted.fill * 100)}% of the frame)`);
// And the toolbar wraps a group at a time: no tool sits on a row away from the rest of its group, here or on narrower
// phones. (Drier sat alone on the second row at 390 px, and Erase alone on a third at 320.)
const toolRows = async (pg) => pg.evaluate(() => {
  const rowOf = (b) => Math.round(b.getBoundingClientRect().top);
  const groups = [...document.querySelectorAll('#tools .tool-group')].map((g) => [...g.querySelectorAll('.tool')].map(rowOf));
  return { split: groups.filter((g) => new Set(g).size > 1).length, rows: new Set(groups.flat()).size };
});
const wrapped = [await toolRows(page)];
for (const w of [360, 320]) {
  const c = await browser.newContext({ viewport: { width: w, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await c.newPage();
  await p.goto(base); wrapped.push(await toolRows(p)); await c.close();
}
ok(wrapped.every((r) => r.split === 0 && r.rows === 2), `on a phone each group of tools keeps to one row, in two rows at 390, 360 and 320 px (${wrapped.map((r) => r.rows).join(', ')})`);
// On a phone held upright and 700 px tall or more, the map stays at the top of the screen while the World tab scrolls
// under it, so the sea slider changes a map in view; on a shorter one it scrolls away with the page as before.
const pinned = async (pg) => pg.evaluate(async () => {
  document.getElementById('tab-world').click();
  document.getElementById('wSea').scrollIntoView({ block: 'end' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const m = document.getElementById('mapwrap').getBoundingClientRect(), sea = document.getElementById('wSea').getBoundingClientRect();
  const out = { top: Math.round(m.top), bottom: Math.round(m.bottom), sea: Math.round(sea.top), scrolled: Math.round(scrollY) };
  document.getElementById('tab-inspect').click(); scrollTo(0, 0);
  return out;
});
const pinTall = await pinned(page);
const shortCtx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), shortPage = await shortCtx.newPage();
await shortPage.goto(base); const pinShort = await pinned(shortPage); await shortCtx.close();
ok(pinTall.scrolled > 400 && pinTall.top === 0 && pinTall.bottom <= pinTall.sea && pinTall.bottom < 300 && pinShort.bottom < 0,
  `on a tall upright phone the map stays at the top (0 to ${pinTall.bottom} px) above the sea slider (${pinTall.sea} px) with the page scrolled ${pinTall.scrolled} px; on a 568 px tall one it scrolls away (bottom at ${pinShort.bottom} px)`);
// Zoomed in, it keeps to about a third of the screen: it was sized by the whole map's width, and covered over half of
// it. (A little over a third when the shortest step that fits under its own length is twice the one before.)
const zoomShares = [];
for (let k = 0; k < 8; k++) {
  await page.click('#zIn'); await page.waitForTimeout(150);
  zoomShares.push(await S(() => { const { scale } = window.terra.boxes(); return (scale[2] - scale[0]) / document.getElementById('map').getBoundingClientRect().width; }));
}
await S(() => window.terra.fitView());
ok(zoomShares.every((x) => x <= 0.35), `zoomed in on a phone, the scale bar takes about a third of the screen at most (${zoomShares.map((x) => Math.round(x * 100) + '%').join(', ')})`);

// Borders come from the land, the capitals and their towns, so a reload brings back the same realms.
const realmRows = () => S(() => {
  document.getElementById('tab-codex').click();
  const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')].map((r) => `${r.querySelector('.nm').textContent} ${r.querySelector('.meta.mono').textContent}`);
  document.getElementById('tab-inspect').click();
  return rows;
});
const firstRealms = await realmRows();
await page.reload();
await page.waitForTimeout(400);
ok(JSON.stringify(await realmRows()) === JSON.stringify(firstRealms), `the realms are the same size after a reload (${firstRealms[0]})`);

// A long realm name wraps in the Codex rather than running into its area.
const crowded = await S(() => {
  document.getElementById('tab-codex').click();
  const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')];
  const bad = rows.filter((row) => {
    const text = document.createRange(); text.selectNodeContents(row.querySelector('.nm'));
    return Math.max(...[...text.getClientRects()].map((r) => r.right)) > row.querySelector('.meta.mono').getBoundingClientRect().left;
  }).map((row) => row.querySelector('.nm').textContent);
  document.getElementById('tab-inspect').click();
  return bad;
});
ok(crowded.length === 0, 'realm names in the Codex stay clear of their areas' + (crowded.length ? ': ' + crowded.join(', ') : ''));

// Start from blank ocean through the New world menu, which closes if the page scrolls away from it.
await page.click('#btnNew');
ok(await S(() => !document.getElementById('newMenu').hidden), 'New world opens a menu');
await S(() => window.scrollBy(0, 200));
await page.waitForTimeout(100);
ok(await S(() => document.getElementById('newMenu').hidden), 'the menu closes when the page scrolls');
await S(() => window.scrollTo(0, 0));
await page.click('#btnNew');
await page.click('#mnBlank');
await page.waitForTimeout(300);
st = await state();
ok(st.land === 0 && st.places === 0 && st.shape === 'blank', 'blank ocean has no land and no places');
ok(await S(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool === 'sketch'), 'the sketch tool is ready');
// The tools are a row above the map on a phone and a column beside it on a laptop, so the tip doesn't say where.
const tip = await page.textContent('#pane-inspect .tips li');
ok(tip.includes('Sketch') && !/on the (left|right)|above|below/.test(tip), `the first tip on open water names Sketch without saying which side it is on ("${tip.slice(0, 40)}...")`);
const lastTip = () => S(() => [...document.querySelectorAll('#pane-inspect .tips li')].pop().textContent);
ok((await lastTip()) === 'The World tab keeps it: Save map image makes a picture to show someone, and Save world file a copy that lasts.', 'the welcome ends on how to keep the world: a picture, and a file');

// The Codex on open water says why it is empty and offers Sketch, which picks the tool. It told you to use 'the settle
// tool', which isn't a tool's name, on a map with no land to found a place on.
await page.click('#tab-codex');
await page.keyboard.press('v');
const codexEmpty = () => S(() => { const n = document.querySelector('#codexList .note'); return [n.textContent, [...n.querySelectorAll('button')].map((b) => b.dataset.tool || b.dataset.act)]; });
const [blankCodex, blankLinks] = await codexEmpty();
await page.click('#codexList .note [data-tool="sketch"]');
ok(blankCodex === 'No land yet, so no places. Sketch a coast first.' && blankLinks.join() === 'sketch' && await S(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool === 'sketch'), `the Codex on open water says to sketch a coast, and its Sketch picks the tool ("${blankCodex}")`);
// On open water there are no realms to found and nothing to flood, so nothing changes and it says so.
await page.click('#tab-world');
await page.click('#wPopulate');
ok((await page.textContent('#toast')).startsWith('New realms need dry land') && (await state()).undo === st.undo, 'Found new realms on open water says it needs land');
// On a touch screen a tapped text box doesn't zoom the page (iOS Safari zooms in on one under 16 px), and the controls
// are big enough for a finger: 44 px where there's room. (The zoom buttons are at least their laptop size, 34 by 32,
// and that toast keeps clear of them: on a phone it sits at the bottom of the screen, wherever the page is scrolled.)
const touchSizes = await S(() => {
  const fs = ['#codexQ', '#wSeed', '#wShape'].map((q) => [q, parseFloat(getComputedStyle(document.querySelector(q)).fontSize)]);
  const box = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return [q, Math.round(r.width), Math.round(r.height)]; };
  return { fs, boxes: ['.tool', '#btnUndo', '.seg', '#btnNew', '.tab', '#wGen', '.chip', '.checks label', '.zoom button'].map(box) };
});
ok(touchSizes.fs.every(([, f]) => f >= 16), `text boxes on a touch screen are 16 px or more (${touchSizes.fs.map(([q, f]) => q + ' ' + f).join(', ')})`);
const tooSmall = touchSizes.boxes.filter(([q, w, h]) => h < ({ '.chip': 38, '#wGen': 40 }[q] || 44) || (['.tool', '#btnUndo', '.zoom button'].includes(q) && w < 44));
ok(tooSmall.length === 0, 'controls on a touch screen are big enough for a finger' + (tooSmall.length ? ': ' + JSON.stringify(tooSmall) : ''));
// So are the sliders: they were 16 px tall, and a tap meant for the sea slider's thumb jumped the sea up. The tool's
// own sliders are wider, and the sea slider says which end is which.
const sliders = await S(() => [document.getElementById('wSea'), document.querySelector('.opt input[type=range]')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).concat([[...document.querySelectorAll('#pane-world .ends span')].map((e) => e.textContent).join(' | ')]));
ok(sliders[0][1] >= 44 && sliders[1][1] >= 44 && sliders[1][0] >= 140 && sliders[2] === 'Less sea | More sea', `sliders on a touch screen are a finger's height (sea ${sliders[0].join(' x ')}, tool ${sliders[1].join(' x ')} px), and the sea slider's ends say Less sea and More sea`);
// A link button on a line of its own (Download the old save, Remove this place) is a finger's height too.
ok(await S(() => { const l = document.createElement('button'); l.className = 'link'; l.textContent = 'x'; document.getElementById('pane-world').append(l); const h = l.getBoundingClientRect().height; l.remove(); return h >= 36; }), 'a link button on its own line is tall enough to tap');
const toastClearOfZoom = () => S(() => {
  const z = document.querySelector('.zoom').getBoundingClientRect(), t = document.getElementById('toast'), r = t.getBoundingClientRect();
  return !t.hidden && r.top >= 0 && r.bottom <= innerHeight && (r.right < z.left || r.left > z.right || r.bottom < z.top || r.top > z.bottom);
});
const toastClearHere = await toastClearOfZoom();
await S(() => window.scrollTo(0, 0));
const [zoomSizes, toastClear] = await S(() => [[...document.querySelectorAll('.zoom button')].map((b) => [b.offsetWidth, b.offsetHeight])]).then(async ([z]) => [z, toastClearHere && await toastClearOfZoom()]);
ok(zoomSizes.every(([w, h]) => w >= 34 && h >= 32) && toastClear, `the zoom buttons are full size on a phone (${zoomSizes[0].join(' x ')}), and a toast keeps clear of them`);
await page.click('.chip[data-v="sea"]');
await drag([[300, 100], [360, 100], [360, 160], [300, 160], [300, 100]], 5);
ok((await page.textContent('#toast')).startsWith('Nothing to flood') && (await state()).undo === st.undo, 'a sea loop on open water says there is nothing to flood');
await page.click('.chip[data-v="land"]');

// A loop raises land.
await drag([[150, 80], [260, 66], [345, 96], [355, 170], [300, 232], [200, 238], [128, 192], [118, 120], [150, 80]], 5);
st = await state();
ok(st.land > 15000, `a sketched loop becomes land (${st.land} cells)`);
// The first land out of open sea is named as such, with its area and rivers, and what to do next; there are no borders
// to redraw yet. It used to say 'Land raised. Rivers and borders have been redrawn.'
const firstLand = await page.textContent('#toast span');
const firstLandSays = firstLand.match(/^Land rises from the sea: ([\d,]+) km², with (\d+) rivers\. Found new realms in the World tab fills it with towns\.$/);
ok(firstLandSays && +firstLandSays[1].replace(/,/g, '') === st.land * 100 && +firstLandSays[2] > 1, `the first land out of the sea says how big it is and how many rivers it has ("${firstLand}")`);
// The island is a tenth of the world, so the view frames it, eased there; the fit button then shows the whole map, and
// on a second press the island again. (The view stayed on the whole ocean, the island a patch in it.)
const settled = () => page.waitForFunction(() => !window.terra.view().moving);
await settled();
const framedView = await S(() => window.terra.view());
const holds = (v) => v.sees[0] <= 118 && v.sees[1] <= 66 && v.sees[2] >= 355 && v.sees[3] >= 238;
await page.click('#zFit'); await settled(); const wholeView = await S(() => window.terra.view());
await page.click('#zFit'); await settled(); const againView = await S(() => window.terra.view());
ok(framedView.zoom > 1.15 && holds(framedView) && Math.abs(wholeView.zoom - 1) < 1e-6 && Math.abs(againView.zoom - framedView.zoom) < 1e-6 && holds(againView),
  `the first island on open sea is framed (${framedView.zoom.toFixed(2)} times the whole map), and the fit button shows the whole map, then the island again`);
// With land and no places, the Codex offers Found new realms, or Found a settlement to found one yourself.
await page.click('#tab-codex');
const [landCodex, landLinks] = await codexEmpty();
ok(landCodex === 'No places yet. Found new realms fills the land, or pick Found a settlement to found one yourself.' && landLinks.join() === 'populate,settle', `the Codex on land with no places offers Found new realms and Found a settlement ("${landCodex}")`);

// A sea loop across its coast floods some of it.
await page.click('.chip[data-v="sea"]');
await drag([[335, 115], [372, 115], [372, 148], [335, 148], [335, 115]], 5);
const bitten = await state();
ok(bitten.land < st.land, `a sea loop across the coast floods land (${st.land - bitten.land} cells)`);
// Undo and Redo say which step they would take back or bring back, when hovered and to a screen reader.
const undoSays = () => S(() => ['btnUndo', 'btnRedo'].map((id) => [document.getElementById(id).title, document.getElementById(id).getAttribute('aria-label')].join(' / ')));
const saysSea = await undoSays();
await page.click('#btnUndo');
const saysUndone = await undoSays();
await page.click('#btnRedo');
ok(saysSea.join(' | ') === 'Undo: Sketch sea (Ctrl+Z) / Undo: Sketch sea | Redo (Ctrl+Shift+Z) / Redo' && saysUndone.join(' | ') === 'Undo: Sketch land (Ctrl+Z) / Undo: Sketch land | Redo: Sketch sea (Ctrl+Shift+Z) / Redo: Sketch sea'
  && (await state()).land === bitten.land, `Undo and Redo name their steps (${saysSea.join(' | ')}; after an Undo, ${saysUndone.join(' | ')})`);
// A phone has no hover: holding Undo says what it would take back, and letting go doesn't take it.
const heldUndo = await S(async () => {
  const b = document.getElementById('btnUndo'), n = window.terra.state().undo;
  b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, isPrimary: true }));
  await new Promise((r) => setTimeout(r, 700));
  b.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true, isPrimary: true })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  return [document.querySelector('#toast span').textContent, window.terra.state().undo === n];
});
ok(heldUndo[0] === 'Undo: Sketch sea' && heldUndo[1], `holding Undo on a phone says what it would undo, and doesn't undo it ("${heldUndo[0]}", kept ${heldUndo[1]})`);
// A hold let go of off the button leaves no tap waiting to be swallowed: a key's press on Undo after it still undoes.
const keyAfterHold = await S(async () => {
  const b = document.getElementById('btnUndo'), n = window.terra.state().undo;
  b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, isPrimary: true }));
  await new Promise((r) => setTimeout(r, 700));
  b.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', bubbles: true, isPrimary: true })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  return n - window.terra.state().undo;
});
await page.click('#btnRedo');
ok(keyAfterHold === 1 && (await state()).land === bitten.land, `a key's press on Undo after a hold let go of elsewhere still undoes (${keyAfterHold} step)`);

// A mountain range, without a lake in the valleys it blocks.
await page.click('.chip[data-v="range"]');
await page.click('.chip[data-v="high"]');
await drag([[170, 120], [235, 112], [300, 138]], 8);
await drag([[175, 185], [240, 192], [305, 178]], 8);
const afterRange = await state();
ok(afterRange.lakes < afterRange.land * 0.004, `two tall ranges leave no valley flooded (${afterRange.lakes} lake cells)`);
// The range's toast is short enough for a phone, and its hint says how high the peaks go, what happens to a valley
// they block, and how wide the range is, in km. One drawn over open water says it made islands.
const rangeSaid = await page.textContent('#toast span'), rangeHint = await page.textContent('#toolOpts .hint'), rangeWidth = await page.textContent('#optWidthOut');
await drag([[40, 30], [90, 26], [140, 34]], 8);
const chainSaid = await page.textContent('#toast span');
await page.click('#btnUndo'); await page.waitForTimeout(300);
ok(rangeSaid === 'Mountains raised.' && rangeHint.startsWith('Draw along the ridge line. Peaks rise to about 4,000 m. A valley they block drains through a gorge at the lowest pass.') && rangeWidth === '180 km' && chainSaid === 'Mountains rose out of the sea as an island chain.' && (await state()).land === afterRange.land,
  `a range says it was raised, or rose out of the sea as islands, and its hint gives the peaks' height and its width in km ("${rangeHint}", Width ${rangeWidth})`);

// A river drawn from inland out to sea.
await page.click('.chip[data-v="river"]');
const riverHint = await page.textContent('#toolOpts .hint'), valleyWidth = await page.textContent('#optValleyOut');
ok(riverHint.startsWith('Draw from the source toward the sea. A valley forms so the water follows your line, and it gathers tributaries as rain drains into the valley.') && valleyWidth === '80 km', `the River hint says what a drawn river does, and its Valley is in km (${valleyWidth})`);
const riversBefore = (await state()).rivers;
const line = [[255, 150], [232, 165], [262, 182], [262, 215], [250, 262]];
await drag(line, 8);
st = await state();
// Every point along the line, from the source to just short of the coast, should have river water beside it.
const along = [];
for (let k = 0; k < line.length - 1; k++) for (let t = 0; t < 1; t += 0.1) along.push([line[k][0] + (line[k + 1][0] - line[k][0]) * t, line[k][1] + (line[k + 1][1] - line[k][1]) * t]);
const inland = along.filter(([, y]) => y < 225);
const wet = (await Promise.all(inland.map((p) => S(([x, y]) => window.terra.riverNear(x, y), p)))).filter(Boolean).length;
ok(wet >= inland.length * 0.9, `a drawn river runs where it was drawn (${wet} of ${inland.length} points)`);
// Undo brings back the rivers from before. (Not always fewer: a drawn valley can gather streams that ran apart.)
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
ok((await state()).rivers === riversBefore, 'undo takes the river back out');
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(300);
ok((await state()).rivers === st.rivers, 'redo puts it back');

// More land with rivers but no realms yet says the rivers have been redrawn, and nothing about borders.
await page.click('.chip[data-v="land"]');
await drag([[395, 220], [425, 215], [430, 245], [400, 250], [395, 220]], 5);
const islet = await page.textContent('#toast span');
await page.click('#btnUndo'); await page.waitForTimeout(300);
ok(islet === 'Land raised. Rivers have been redrawn.' && (await state()).land === st.land, `a second Land loop before there are realms says the rivers have been redrawn ("${islet}")`);

// New realms fill the island, from the welcome's own Found new realms, which does what the World tab's button does and
// brings the map back up on a phone. It was bold text pointing to a button four sections down the World tab.
await page.click('#tab-inspect');
const realmsLink = page.locator('#pane-inspect .welcome button[data-act="populate"]');
ok(await realmsLink.isVisible() && (await realmsLink.textContent()).trim() === 'Found new realms', 'on land with no places the welcome offers Found new realms as a button');
await S(() => window.scrollTo(0, document.documentElement.scrollHeight));
await realmsLink.click();
await page.waitForTimeout(800);
st = await state();
ok(st.realms >= 1 && st.places >= 8, `new realms fill the island (${st.realms} realms, ${st.places} places)`);
const mapShown = await S(() => { const r = document.getElementById('mapwrap').getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; });
ok(mapShown && await S(() => document.activeElement && document.activeElement.matches('#pane-inspect [data-goto]')), 'and the map comes up to show them, with focus on the capital the welcome offers next');
const foundedSaid = await page.textContent('#toast span'), islandRealms = (await realmRows()).map((r) => r.replace(/ [\d,]+ km²$/, '').replace(/^The /, 'the '));
ok(st.realms > 3 || (foundedSaid.startsWith('Founded the ') && islandRealms.every((r) => foundedSaid.includes(r)) && foundedSaid.endsWith(` settlements.`)), `and the toast names them ("${foundedSaid}")`);
ok((await page.textContent('#pane-inspect .tips li')).includes('The Codex lists every place by realm, with a search.') && (await lastTip()).startsWith('The World tab keeps it'), 'the welcome on a world with places says what the Codex is, and still ends on keeping the world');

// Open a town's page and roll a rumor into its notes.
await page.keyboard.press('v');
const town = (await S(() => window.terra.places())).find((p) => p.kind === 'capital');
await S((p) => { window.terra.select({ type: 'place', id: p.id }); }, town);
await page.waitForSelector('#pName');
ok((await page.inputValue('#pName')) === town.name, `${town.name} opens its page`);
// A few rumors are about a neighbour or the realm rather than the town itself, so roll again until one names it.
let rumor = '';
for (let k = 0; k < 20 && !rumor.includes(town.name); k++) {
  await page.click('#pRumor');
  rumor = (await page.textContent('#draftBox')).trim();
}
ok(rumor.length > 30 && rumor.includes(town.name), 'a rumor names the town');
await page.click('#dKeep');
ok((await page.inputValue('#pLore')).includes(rumor), 'keeping the rumor adds it to the notes');
ok(await page.locator('#pWrite').isHidden(), 'the Claude history button stays hidden outside Claude');
ok(!(await page.getAttribute('#pLore', 'placeholder')).includes('Claude'), 'and the notes box does not promise Claude either');
ok((await page.locator('[data-color]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).every((l) => /^[A-Z][a-z]+$/.test(l)), 'the realm colors are named for screen readers');

// Undo steps back through edits on the page, the notes among them: one step for the visit, so Undo puts the name and
// the notes back as they were when the page opened, not letter by letter. (Notes used to be left out of Undo, so the
// next Undo took the place away, notes and all.) Keeping the rumor was a step of its own.
const undoBefore = (await state()).undo;
const keptNotes = await page.inputValue('#pLore');
await page.fill('#pName', 'Saltgate');
ok((await state()).undo === undoBefore + 1, 'typing a new name is one undo step');
ok((await page.textContent('#pDelete')) === 'Remove Saltgate', 'the Remove link follows the new name');
await page.locator('#pLore').press('Control+End');
await page.keyboard.type(' The mayor is a retired smuggler.');
ok((await state()).undo === undoBefore + 1, 'and typing in the notes on the same visit is part of that step');
await page.click('#btnUndo');
await page.waitForTimeout(300);
ok((await page.inputValue('#pName')) === town.name, 'Undo puts the old name back');
ok((await page.inputValue('#pLore')) === keptNotes, 'and the notes as they were when the page opened');
await page.click('#btnUndo');
await page.waitForTimeout(300);
ok((await page.inputValue('#pLore')) === '' && (await S((id) => window.terra.places().some((p) => p.id === id), town.id)), 'the next Undo takes back the kept rumor, and leaves the town');
await page.click('#btnRedo'); await page.click('#btnRedo');
await page.waitForTimeout(300);
ok((await page.inputValue('#pLore')).endsWith('The mayor is a retired smuggler.') && (await page.inputValue('#pName')) === 'Saltgate', 'Redo brings the notes and the name back');

// It survives a reload, and the map that comes back is the same one: rivers, lakes and borders included.
// Leaving the page saves at once, so notes typed just before it are kept without waiting for the autosave.
await page.locator('#pLore').press('Control+End');
await page.keyboard.type(' Ships unload salt at dawn.');
const before = await state(), beforeRealms = await realmRows();
await page.reload();
await page.waitForTimeout(400);
st = await state();
ok(st.name === before.name && st.places === before.places && st.land === before.land, 'the world is still there after a reload');
ok(st.rivers === before.rivers && st.lakes === before.lakes, `its rivers and lakes are where they were (${before.rivers} river cells before, ${st.rivers} after)`);
ok(JSON.stringify(await realmRows()) === JSON.stringify(beforeRealms), 'its borders are where they were');
const notesAfter = await S((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }, town.id);
ok(notesAfter.endsWith('Ships unload salt at dawn.'), 'notes typed just before leaving are still there');

// Save world file downloads it. Until then Keep your world says the world, with notes in it now, has never been saved
// to a file; once saved, nothing, until there is newer work in it.
await page.click('#tab-world');
const dueBefore = await page.evaluate(() => [document.getElementById('wFileNote').hidden, document.getElementById('wFileNote').textContent]);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#wSaveFile')]);
await page.waitForTimeout(200);
const dueSaved = await page.evaluate(() => document.getElementById('wFileNote').hidden);
await page.waitForTimeout(1100);
await page.evaluate(() => { const n = document.getElementById('worldName'); n.dispatchEvent(new Event('focus')); n.value = n.value + ' '; n.dispatchEvent(new Event('input')); n.value = n.value.trim(); n.dispatchEvent(new Event('input')); });
await page.waitForTimeout(1100);
const dueAfter = await page.evaluate(() => [document.getElementById('wFileNote').hidden, document.getElementById('wFileNote').textContent]);
ok(!dueBefore[0] && dueBefore[1] === 'Not saved to a file yet.' && dueSaved && !dueAfter[0] && /^Not saved to a file since .+\.$/.test(dueAfter[1]), `Keep your world says when the world was last saved to a file, once there is newer work ("${dueBefore[1]}", then "${dueAfter[1]}")`);
const saved = JSON.parse(await readFile(await dl.path(), 'utf8'));
ok(dl.suggestedFilename().endsWith('.json') && saved.format === 'terra-incognita' && saved.places.length === st.places, 'Save world file downloads the world');
ok(await page.locator('#pane-world .jd-foot').isVisible(), 'the World tab links back to the drawer');

// Save map image downloads a picture of the whole map: 4 pixels a cell and a 30-pixel margin, in colour.
const [pngDl] = await Promise.all([page.waitForEvent('download'), page.click('#wSavePng')]);
const png = await readFile(await pngDl.path());
const pngColours = await S((b64) => new Promise((done) => {
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); done(seen.size); };
  img.src = 'data:image/png;base64,' + b64;
}), png.toString('base64'));
ok(pngDl.suggestedFilename() === st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png' && png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1980 && png.readUInt32BE(20) === 1260 && pngColours > 3,
  `Save map image downloads the map as ${pngDl.suggestedFilename()}, ${png.readUInt32BE(16)} x ${png.readUInt32BE(20)}, in ${pngColours} colours or more`);

// Nothing scrolls sideways on a phone.
ok(await S(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing scrolls sideways at 390px');
// And a swipe sideways is nobody's, so it can't run on into Chrome's swipe to go Back or Forward: the page doesn't
// overscroll, and the map takes every touch.
ok(JSON.stringify(await S(() => [document.documentElement, document.body, document.getElementById('map')].map((e) => [getComputedStyle(e).overscrollBehaviorX, getComputedStyle(e).touchAction])))
  === JSON.stringify([['none', 'auto'], ['none', 'auto'], ['auto', 'none']]), 'nothing overscrolls sideways, and the map takes every touch');

// Installable: Chromium finds no problems with the manifest and icons.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
ok(installabilityErrors.length === 0, 'Chromium says it can be installed' + (installabilityErrors.length ? ': ' + JSON.stringify(installabilityErrors) : ''));

// A link to it previews with a picture: the four properties the Open Graph protocol requires of every page (ogp.me,
// Basic Metadata: og:title, og:type, og:image, og:url), the picture's size as og.png has it, and words for the picture.
const og = await S(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')].map((m) => [m.getAttribute('property') || m.name, m.content])));
const ogPng = await readFile(join(root, 'og.png'));
ok(og['og:title'] && og['og:type'] === 'website' && og['og:image'] && og['og:url'] && +og['og:image:width'] === ogPng.readUInt32BE(16) && +og['og:image:height'] === ogPng.readUInt32BE(20) && og['og:image:alt'] && og['twitter:image:alt'] === og['og:image:alt'],
  `a link to it previews with og:title, og:type, og:image and og:url, the picture's size (${og['og:image:width']} x ${og['og:image:height']}) and its alt text`);

// Every file the page loads is in the offline copy, and every file in it exists.
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const f of shell) assert.ok(f === './' || existsSync(join(root, f)), `sw.js lists ${f}, which exists`);
const missing = [...loaded].filter((f) => !shell.includes(f) && f !== 'sw.js');
ok(missing.length === 0, 'sw.js keeps every file the page loads' + (missing.length ? ': missing ' + missing.join(', ') : ''));

// It loads with the network off.
await S(() => navigator.serviceWorker.ready);
// Under the icon on a home screen it is Terra (iPhones read their own tag), and it is one installed app by a fixed id
// rather than by wherever its start page is.
const appManifest = await cdp.send('Page.getAppManifest');
const mf = JSON.parse(appManifest.data);
ok(mf.name === 'Terra Incognita' && mf.short_name === 'Terra' && new URL(mf.id, appManifest.url).href === new URL(mf.start_url, appManifest.url).href && appManifest.errors.length === 0
  && await S(() => document.querySelector('meta[name="apple-mobile-web-app-title"]').content) === 'Terra',
  `the home-screen name is Terra, with a fixed id (${mf.id})` + (appManifest.errors.length ? ': ' + JSON.stringify(appManifest.errors) : ''));
// Chrome on a phone shows its larger install window, with pictures, once the manifest has a screenshot for a narrow
// screen (developer.chrome.com/blog/richer-pwa-installation). Each is a picture of the app at its real size, with words
// for it, within what Chrome takes (web.dev/articles/add-manifest, under screenshots): 320 to 3,840 px a side, the long
// side no more than 2.3 times the short, and the same shape for each screen.
const shots = (mf.screenshots || []).map((sh) => { const png = readFileSync(join(root, sh.src)); return { ...sh, real: `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` }; });
const shapes = new Map(); for (const sh of shots) { const [w, h] = sh.real.split('x').map(Number); (shapes.get(sh.form_factor) || shapes.set(sh.form_factor, new Set()).get(sh.form_factor)).add((w / h).toFixed(3)); }
ok(shots.some((sh) => sh.form_factor === 'narrow') && shots.some((sh) => sh.form_factor === 'wide') && shots.every((sh) => sh.sizes === sh.real && sh.type === 'image/png' && sh.label && sh.real.split('x').every((v) => v >= 320 && v <= 3840)
  && Math.max(...sh.real.split('x')) <= 2.3 * Math.min(...sh.real.split('x'))) && [...shapes.values()].every((s) => s.size === 1),
  `the manifest shows the app installing with pictures, for a phone and a laptop (${shots.map((sh) => `${sh.form_factor} ${sh.real}`).join(', ')})`);
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(500);
ok((await page.title()) === 'Terra Incognita' && (await state()).places > 0, 'it opens offline, with the world');
await ctx.setOffline(false);

// On a laptop-sized screen.
const desk = watch(await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage());
await desk.goto(base);
await desk.click('#tab-codex');
ok(await desk.evaluate(() => document.getElementById('codexQ').getBoundingClientRect().height) >= 33, 'the Codex search box keeps its height beside a long list');
// With a mouse, the controls keep their laptop sizes.
ok(JSON.stringify(await desk.evaluate(() => ['.tool', '#btnUndo', '.chip', '.zoom button', '#codexQ'].map((q) => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().height) : null; })))
  === JSON.stringify([38, 34, null, 32, 34]) && await desk.evaluate(() => getComputedStyle(document.getElementById('codexQ')).fontSize) === '14px', 'with a mouse the tools, buttons and boxes keep their sizes');
// On a capital's page the realm's colour sits on the same line as the start of its name, beside Show on map, even
// when the name wraps in the narrow panel.
const eyebrowLine = await desk.evaluate(() => {
  const cap = window.terra.places().find((p) => p.kind === 'capital'); window.terra.select({ type: 'place', id: cap.id });
  const sw = document.querySelector('#pane-inspect .eyebrow .swatch'), r = document.createRange(), t = sw.nextSibling.firstChild || sw.nextSibling; r.setStart(t, 0); r.setEnd(t, 1);
  const a = sw.getBoundingClientRect(), b = r.getBoundingClientRect(), show = document.getElementById('showOnMap').getBoundingClientRect();
  window.terra.select(null);
  return { swatch: Math.round(a.top + a.height / 2), name: Math.round(b.top + b.height / 2), showTop: Math.round(show.top), eyebrowTop: Math.round(document.querySelector('#pane-inspect .eyebrow').getBoundingClientRect().top) };
});
ok(Math.abs(eyebrowLine.swatch - eyebrowLine.name) <= 4 && eyebrowLine.showTop - eyebrowLine.eyebrowTop < 12, `a realm's colour stays beside its name on a capital's page (${JSON.stringify(eyebrowLine)})`);

// The Codex finds the names on the map as well as places, and words in a place's notes: a sea (by the word that names
// it: 'Lainho', from the Sea of Lainho), a range ('pol teeth', from the Pol Teeth) and a word typed in a note each turn
// up, the note with its words around the match and a pen beside the place's name. A label found there opens its page.
{
  const named = await desk.evaluate(() => window.terra.labels());
  const seaName = named.find((l) => l.kind === 'sea').text, rangeName = named.find((l) => l.kind === 'range').text;
  const seaWord = seaName.split(' ').filter((w) => !/^(The|Sea|of|Ocean|Gulf|Sound|Bay)$/.test(w))[0];
  const rangeWords = rangeName.replace(/^The /, '').toLowerCase();
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const codexRows = (q) => desk.evaluate((q) => { const i = document.getElementById('codexQ'); i.value = q; i.dispatchEvent(new Event('input')); return [...document.querySelectorAll('#codexList .crow')].map((r) => r.textContent); }, q);
  const noted = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'village');
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), noted.id);
  await desk.fill('#pLore', 'Market on Thursdays. The dragon Vorthax sleeps beneath the hill, and the village keeps its secret.');
  await desk.click('#tab-codex');
  const sea = await codexRows(seaWord), range = await codexRows(rangeWords), lore = await codexRows('vorthax'), nothing = await codexRows('zzqx');
  const pen = await desk.evaluate(() => { const i = document.getElementById('codexQ'); i.value = ''; i.dispatchEvent(new Event('input')); return [...document.querySelectorAll('#codexList .crow')].filter((r) => r.querySelector('.noted')).map((r) => r.querySelector('.nm').textContent); });
  ok(sea.some((t) => new RegExp(`${esc(seaName)}\\s*Sea or water`).test(t)) && range.some((t) => new RegExp(`${esc(rangeName)}\\s*Mountains`).test(t)) && lore.length === 1 && lore[0].includes(noted.name) && lore[0].includes('dragon Vorthax sleeps')
    && nothing.length === 0 && await desk.textContent('#codexList') !== '' && pen.length === 1 && pen[0] === `${noted.name}, has notes` && await desk.getAttribute('#codexQ', 'placeholder') === 'Search places, waters and notes',
    `the Codex finds seas, ranges and notes (${JSON.stringify([sea[0], range[0], lore[0], pen[0]])})`);
  await codexRows(seaWord);
  await desk.click('#codexList .crow[data-label]');
  ok(await desk.inputValue('#lText') === seaName, `and a sea found there opens its label (${seaName})`);
  // Enter in the search opens the one entry found, and with more than one puts the keyboard away (it did nothing, and
  // a phone's keyboard stayed up over half the results).
  await desk.click('#tab-codex');
  await desk.fill('#codexQ', noted.name); await desk.press('#codexQ', 'Enter');
  const enterOne = await desk.evaluate(() => document.getElementById('pName')?.value);
  await desk.click('#tab-codex');
  await desk.fill('#codexQ', 'a'); await desk.press('#codexQ', 'Enter');
  const enterMany = await desk.evaluate(() => [document.querySelectorAll('#codexList .crow').length, document.activeElement.id, !document.getElementById('pane-codex').hidden]);
  ok(enterOne === noted.name && enterMany[0] > 1 && enterMany[1] !== 'codexQ' && enterMany[2] && await desk.getAttribute('#codexQ', 'enterkeyhint') === 'search', `Enter in the Codex search opens the one place found (${enterOne}), and with ${enterMany[0]} found leaves the box and the list in view`);
  await desk.evaluate(() => { const i = document.getElementById('codexQ'); i.value = ''; i.dispatchEvent(new Event('input')); window.terra.select(null); window.terra.fitView(); });
}

// A town's Realm row goes to its capital's page, where the realm's population is given to two figures, not to the
// person. On the capital itself the realm's name is plain text.
{
  const town = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'town' && p.landTongue);
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), town.id);
  const realmRow = () => desk.evaluate(() => { const dt = [...document.querySelectorAll('#pane-inspect .facts dt')].find((d) => d.textContent === 'Realm'); return dt.nextElementSibling.querySelector('button.link') ? 'link' : 'text'; });
  const onTown = await realmRow();
  await desk.click('#pane-inspect .facts button.link:has([data-realm])');
  const there = await desk.evaluate(() => ({ kind: document.querySelector('#pKind').value, note: document.querySelector('#pane-inspect .section .note').textContent }));
  const people = +there.note.match(/about ([\d,]+) people/)[1].replace(/,/g, '');
  ok(onTown === 'link' && there.kind === 'capital' && await realmRow() === 'text' && String(people).replace(/0+$/, '').length <= 2, `a town's realm links to its capital, whose page rounds the realm's people ("${there.note.match(/about [\d,]+ people/)}")`);
  // Going to the capital centred the map on it; put the whole map back in view for the tests that click on it.
  await desk.evaluate(() => { window.terra.select(null); window.terra.fitView(); });
}

// A place by a sea labelled "Gulf of ..." is on the coast of the Gulf of ...
const settingOf = (id) => desk.evaluate((id) => {
  window.terra.select({ type: 'place', id });
  const dd = [...document.querySelectorAll('#pane-inspect .facts dd')].find((d) => d.previousElementSibling.textContent === 'Setting');
  return dd ? dd.textContent : '';
}, id);
let coastal = null;
for (const p of (await desk.evaluate(() => window.terra.places())).sort((a, b) => a.y - b.y)) if ((await settingOf(p.id)).startsWith('On the coast of')) { coastal = p; break; }
await desk.keyboard.press('t');
await desk.click('.chip[data-g="label"][data-v="sea"]');
await desk.fill('#optLabelText', 'Gulf of Testing');
const mapBox = await desk.locator('#map').boundingBox(), at = await desk.evaluate(([x, y]) => window.terra.toScreen(x, y), [coastal.x + 3, coastal.y]);
await desk.mouse.click(mapBox.x + at.x, mapBox.y + at.y);
const setting = await settingOf(coastal.id);
ok(setting.startsWith('On the coast of the Gulf of Testing'), `a sea's name reads as it should in a sentence (${coastal.name}: "${setting}")`);

// A landmark's name reads right in the middle of a sentence ('the Tower of Ithigwial', 'the Veol Deep'), in rumors
// and in the Nearest row, and a landmark has rumors of its own, not a town's well, woodcutters or tax collectors.
const midBreak = /(?<![Tt]he)(?<=[a-z,]) (?:The [A-Z]|(?:Ruins|Tower|Temple|Shrine|Hollow|Field|Plain|Pillar) of )/;
const rolled = await desk.evaluate(() => {
  const out = [];
  for (const p of window.terra.places()) {
    window.terra.select({ type: 'place', id: p.id });
    for (let k = 0; k < 8; k++) { document.getElementById('pRumor').click(); out.push([p.kind, document.getElementById('draftBox').textContent]); }
    const dt = [...document.querySelectorAll('#pane-inspect .facts dt')].find((d) => d.textContent === 'Nearest');
    if (dt) out.push(['nearest', dt.nextElementSibling.textContent]);
  }
  window.terra.select(null);
  return out;
});
const midBroken = rolled.filter(([, t]) => midBreak.test(t)), townish = rolled.filter(([k, t]) => k === 'landmark' && /oldest well|Woodcutters|A stranger in|toll|caravan/.test(t));
ok(rolled.length > 300 && !midBroken.length && !townish.length, `landmarks read right mid-sentence and have rumors of their own (${rolled.length} lines${midBroken.length ? '; broken: ' + midBroken[0][1] : ''}${townish.length ? '; a town\'s rumor on a landmark: ' + townish[0][1] : ''})`);
// The Nearest row gives km beside its leagues (a league is 4.8 km), which it never explained.
const nearest = rolled.filter(([k]) => k === 'nearest').map(([, t]) => t), badNear = nearest.filter((t) => { const m = t.match(/^(\d+) leagues? \(([\d,]+) km\) (north|south)?(east|west)? of /); return !m || Math.abs(+m[2].replace(/,/g, '') - m[1] * 4.8) > Math.max(5, m[1] * 4.8 * 0.08); });
ok(nearest.length > 20 && !badNear.length, `a place's Nearest row gives km beside its leagues ("${nearest[0]}"${badNear.length ? '; not: ' + badNear[0] : ''})`);

// Rumors that read right: envoys hunt for maps of the range nearest the place (or "the high country" with none
// within about 800 km), a toll is never on "river trade", Roll a rumor never gives the same one twice running.
const rangeOk = await desk.evaluate(() => {
  const ranges = window.terra.labels().filter((l) => l.kind === 'range'), bad = []; let envoys = 0, repeats = 0, tolls = 0;
  for (const p of window.terra.places().filter((q) => q.kind !== 'landmark')) {
    let best = null, bd = 80 * 80; for (const l of ranges) { const d = (l.x - p.x) ** 2 + (l.y - p.y) ** 2; if (d < bd) { bd = d; best = l; } }
    const want = best ? best.text.replace(/^The /, 'the ') : 'the high country';
    window.terra.select({ type: 'place', id: p.id }); let last = '';
    for (let k = 0; k < 12; k++) {
      document.getElementById('pRumor').click(); const t = document.getElementById('draftBox').textContent;
      if (t === last) repeats++; last = t;
      if (/^Envoys/.test(t)) { envoys++; if (!t.includes(`every map of ${want} they`)) bad.push(t + ' (wanted ' + want + ')'); }
      if (/toll on/.test(t)) { tolls++; if (/toll on river trade/.test(t)) bad.push(t); }
    }
  }
  window.terra.select(null);
  return { envoys, tolls, repeats, bad };
});
ok(rangeOk.envoys > 10 && rangeOk.tolls > 10 && !rangeOk.repeats && !rangeOk.bad.length, `envoys look for the nearest range, tolls are on goods, and no rumor comes twice running (${JSON.stringify({ ...rangeOk, bad: rangeOk.bad.slice(0, 2) })})`);
// A realm called the Free Cities takes "the" and a plural verb, and its capital's rumors give it a First Consul and a
// council, not an heir and a palace.
{
  const cap = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  await desk.selectOption('#rTitle', 'Free Cities');
  const said = await desk.evaluate(() => { const out = []; for (let k = 0; k < 60; k++) { document.getElementById('pRumor').click(); out.push(document.getElementById('draftBox').textContent); } return [document.querySelector('#pane-inspect .eyebrow [data-realm]').textContent, out]; });
  const free = said[1].filter((t) => /Free Cities/.test(t));
  ok(/^The Free Cities of /.test(said[0]) && free.some((t) => /Free Cities of \w+ have doubled|First Consul of the Free Cities of/.test(t)) && !said[1].some((t) => /(?<![Tt]he )Free Cities of|Free Cities of \w+ has doubled|heir of the Free Cities/.test(t)),
    `the Free Cities read as plural, with a First Consul ("${said[0]}"; "${free[0]}")`);
  await desk.click('#btnUndo');
}
// A town founded a few kilometres from another is 1 league from it, not "1 leagues".
{
  const town = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'town');
  await desk.evaluate((t) => window.terra.select({ type: 'loc', x: t.x + 0.4, y: t.y }), town);
  await desk.click('#locTown');
  const lines = await desk.evaluate(() => { const out = []; for (let k = 0; k < 80; k++) { document.getElementById('pRumor').click(); out.push(document.getElementById('draftBox').textContent); } return out; });
  const caravan = lines.find((t) => /caravan/.test(t));
  ok(caravan && /found 1 league out/.test(caravan), `one league is singular ("${caravan}")`);
  await desk.click('#btnUndo');
}

// A town beside a lake is on its shore, not inland. A tapped lake gives its surface's height, with no Land or Setting
// row, and can be named from its own page, as the open sea can; the town on its shore then reads the name.
{
  const facts = () => desk.evaluate(() => Object.fromEntries([...document.querySelectorAll('#pane-inspect .facts dt')].map((d) => [d.textContent, d.nextElementSibling.textContent])));
  let shore = null, wet = null;
  for (const p of await desk.evaluate(() => window.terra.places())) {
    await desk.evaluate((id) => window.terra.select({ type: 'place', id }), p.id);
    if (!/^On a lake shore/.test((await facts()).Setting || '')) continue;
    wet = await desk.evaluate((p) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (window.terra.cell(p.x + dx, p.y + dy).lake) return { x: Math.floor(p.x + dx) + 0.5, y: Math.floor(p.y + dy) + 0.5 }; return null; }, p);
    if (wet) { shore = p; break; }
  }
  await desk.evaluate((w) => window.terra.select({ type: 'loc', x: w.x, y: w.y }), wet);
  const lake = await facts(), lakeTitle = await desk.textContent('#pane-inspect h2');
  ok(lakeTitle === 'Lake' && 'Surface' in lake && !('Land' in lake) && !('Setting' in lake) && !('Elevation' in lake) && 'Waters of' in lake && await desk.locator('#locWater').textContent() === 'Name this water',
    `a tapped lake reads as water (${JSON.stringify(lake)})`);
  await desk.click('#locWater');
  const name = await desk.inputValue('#lText');
  await desk.evaluate((w) => window.terra.select({ type: 'loc', x: w.x, y: w.y }), wet);
  const titled = [await desk.textContent('#pane-inspect h2'), await desk.locator('#locWater').textContent()];
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), shore.id);
  const setting = (await facts()).Setting;
  ok(setting.startsWith(`On the shore of ${name.replace(/^The /, 'the ')}`) && titled[0] === name && titled[1] === 'Rename this water', `naming the lake from its page names ${shore.name}'s shore ("${setting}")`);
  await desk.click('#btnUndo');
  // The ocean in the corner has a name on seed 20417, so its page opens that label to rename it.
  const sea = await desk.evaluate(() => { window.terra.select({ type: 'loc', x: 2.5, y: 2.5 }); return [document.querySelector('#pane-inspect h2').textContent, document.getElementById('locWater').textContent]; });
  await desk.click('#locWater');
  const seaLabel = await desk.inputValue('#lText');
  ok(sea[0] !== 'Open sea' && sea[1] === 'Rename this water' && seaLabel === sea[0], `a named sea's page opens its label to rename it ("${sea[0]}")`);
}

// Random seed grows a world from a new seed, as Generate from seed does: the map, the seed box and the saved seed
// agree, and the toast's Undo brings the old world back. It used to type a number in the box and change nothing else.
{
  await desk.click('#tab-world');
  const before = await desk.evaluate(() => window.terra.state());
  await desk.click('#wDice'); await desk.waitForFunction(() => !window.terra.busy());
  const rolled = await desk.evaluate(() => [window.terra.state(), document.getElementById('wSeed').value, document.getElementById('toast').textContent]);
  await desk.click('#toast button:has-text("Undo")');
  const back = await desk.evaluate(() => window.terra.state());
  ok(rolled[0].seed !== before.seed && String(rolled[0].seed) === rolled[1] && rolled[2].includes(`Generated world ${rolled[0].seed}.`) && back.seed === before.seed && back.places === before.places && back.name === before.name,
    `Random seed grows a new world, and Undo brings ${before.name} back (${before.seed} to ${rolled[0].seed} and back to ${back.seed})`);
  // Undo and Redo of a whole world say which world it is now. They said nothing, though the map and its name changed.
  const toastSays = () => desk.evaluate(() => [...document.getElementById('toast').children].map((e) => e.textContent).join(' | '));
  const backSaid = await toastSays();
  await desk.click('#toast button:has-text("Redo")');
  const againSaid = await toastSays();
  await desk.click('#toast button:has-text("Undo")');
  ok(backSaid === `Back to ${before.name}. | Redo` && againSaid === `${rolled[0].name} again. | Undo` && (await desk.evaluate(() => window.terra.state())).seed === before.seed, `Undo and Redo of a new world name the world they bring ("${backSaid}", "${againSaid}")`);
  await desk.click('#tab-inspect');
}

// Blank ocean isn't a shape to generate: Start from blank ocean is the button beside Generate. After it, the World tab
// shows the shape generated last (Continent at first), so Generate and Random seed grow land. They made another empty
// ocean and said "Generated world N."
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.click('#tab-world');
  const shapes = await pg.evaluate(() => [...document.querySelectorAll('#wShape option')].map((o) => o.textContent));
  await pg.selectOption('#wShape', 'archipelago');
  await pg.click('#wDice'); await pg.waitForFunction(() => !window.terra.busy());
  await pg.click('#wBlank');
  await pg.click('#tab-world');
  const shown = await pg.inputValue('#wShape');
  await pg.click('#wDice'); await pg.waitForFunction(() => !window.terra.busy());
  const st = await pg.evaluate(() => window.terra.state());
  ok(!shapes.includes('Blank ocean') && shown === 'archipelago' && st.shape === 'archipelago' && st.land > 10000, `after Start from blank ocean, the World tab shows the shape generated last, and Random seed grows land in it (${shapes.join(', ')}; ${st.shape}, ${st.land} land cells)`);
  await c.close();
}

// A rumor that wasn't kept stays with its place while other places are looked at (it went as soon as another place
// was tapped), but not with whatever has its id in a new world.
const firstCap = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
await desk.evaluate((id) => window.terra.select({ type: 'place', id }), firstCap.id);
await desk.click('#pRumor');
const rolledRumor = await desk.textContent('#draftBox');
const otherPlace = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'town');
await desk.evaluate((id) => window.terra.select({ type: 'place', id }), otherPlace.id);
const otherBox = await desk.evaluate(() => document.getElementById('draftBox').hidden);
const cameBack = await desk.evaluate((id) => { window.terra.select({ type: 'place', id }); return [document.getElementById('draftBox').textContent, document.getElementById('draftActions').hidden]; }, firstCap.id);
ok(otherBox && cameBack[0] === rolledRumor && !cameBack[1], 'an unkept rumor waits on its own place\'s page while another place is open');
// A settlement's population can be typed in. Its realm's total counts it, a change of kind keeps it, the world file
// keeps it, and Undo takes it back, by name.
{
  const town = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'town' && p.capital);
  const num = (t) => +t.replace(/,/g, '');
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), town.capital);
  const realmWas = num(await desk.textContent('#rPop'));
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), town.id);
  const popField = () => desk.evaluate(() => [document.getElementById('pPop').value, document.getElementById('pPopAbout').hidden]);
  const rolled = await popField();
  await desk.fill('#pPop', '250,000'); await desk.press('#pPop', 'Tab');
  const typed = await popField(), popStep = await desk.getAttribute('#btnUndo', 'aria-label');
  await desk.selectOption('#pKind', 'village');
  const kept = await desk.evaluate((id) => [window.terra.places().find((p) => p.id === id).pop, document.getElementById('pPop').value, JSON.parse(window.terra.worldText()).places.find((p) => p.id === id).ownPop], town.id);
  await desk.fill('#pPop', ''); await desk.press('#pPop', 'Tab');
  const cleared = (await popField())[0];
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), town.capital);
  const realmNow = num(await desk.textContent('#rPop'));
  await desk.click('#btnUndo'); await desk.click('#btnUndo');
  const back = (await desk.evaluate(() => window.terra.places())).find((p) => p.id === town.id);
  ok(rolled[0] === town.pop.toLocaleString('en-US') && !rolled[1] && typed[0] === '250,000' && typed[1] && popStep === `Undo: Population of ${town.name}`
    && kept.join() === '250000,250,000,250000' && cleared === '250,000' && Math.abs(realmNow - realmWas - (250000 - town.pop)) < realmNow * 0.06
    && back.pop === town.pop && back.kind === 'town',
    `a town's population can be typed in (~${rolled[0]} to ${typed[0]}), a change of kind and the world file keep it, an empty box puts it back, its realm counts it (${realmWas} to ${realmNow}), and Undo ("${popStep}") takes it back`);
}
// A name typed letter by letter is one step, named for the place as it was called before.
{
  const town = (await desk.evaluate(() => window.terra.places())).find((p) => p.kind === 'town');
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), town.id);
  const n = (await desk.evaluate(() => window.terra.state())).undo;
  await desk.click('#pName'); await desk.keyboard.press('End'); await desk.keyboard.type('ford');
  const said = await desk.getAttribute('#btnUndo', 'aria-label'), steps = (await desk.evaluate(() => window.terra.state())).undo - n;
  await desk.click('#btnUndo');
  ok(said === `Undo: Rename ${town.name}` && steps === 1 && (await desk.evaluate((id) => window.terra.places().find((p) => p.id === id).name, town.id)) === town.name,
    `a rename typed letter by letter is one step, named for the old name ("${said}", ${steps} step)`);
}
// Measure from here, on a place's page: the next click on the map, on another place, measures the straight line to it
// in leagues and km and how many days that is on foot (8 leagues a day), or says it crosses the sea. Nothing is saved,
// the page stays open, and the next click on the map takes the line away.
{
  const all = await desk.evaluate(() => window.terra.places());
  const from = all.find((p) => p.kind === 'capital'), mb = await desk.locator('#map').boundingBox();
  const at = async (p) => { const s = await desk.evaluate(([x, y]) => window.terra.toScreen(x, y), [p.x, p.y]); return [mb.x + s.x, mb.y + s.y]; };
  const to = all.find((p) => p.kind === 'city' && p.id !== from.id && Math.hypot(p.x - from.x, p.y - from.y) > 30);
  const toolWas = await desk.evaluate(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool);
  await desk.evaluate(() => window.terra.setTool('select'));
  await desk.evaluate((id) => window.terra.select({ type: 'place', id }), from.id);
  const undoWas = (await desk.evaluate(() => window.terra.state())).undo;
  await desk.click('#pMeasure');
  const waiting = await desk.evaluate(() => [document.getElementById('pMeasure').textContent, document.getElementById('pMeasure').getAttribute('aria-pressed'), document.querySelector('#toast span').textContent]);
  await desk.keyboard.press('Escape');
  const stopped = await desk.textContent('#pMeasure');
  await desk.click('#pMeasure');
  await desk.mouse.click(...await at(to));
  const said = await desk.textContent('#toast span'), out = await desk.textContent('#pMeasureOut'), still = await desk.evaluate(() => document.getElementById('pTitle').textContent);
  const km = Math.hypot(to.x - from.x, to.y - from.y) * 10, lg = Math.round(km / 4.8);
  const wet = await desk.evaluate(([a, b]) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2); for (let k = 0; k <= n; k++) if (window.terra.cell(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n).h < 0) return true; return false; }, [from, to]);
  const days = Math.round(km / 38.4), foot = wet ? 'across the sea' : `about ${days} day${days === 1 ? '' : 's'} on foot`;
  const m = said.match(/^(.+) to (.+): (\d+) leagues \(([\d,]+) km\) as the crow flies, (.+)\.$/);
  const undoNow = (await desk.evaluate(() => window.terra.state())).undo;
  await desk.mouse.click(...await at(to));
  const cleared = await desk.evaluate(() => [document.getElementById('pMeasureOut') ? document.getElementById('pMeasureOut').hidden : true, document.getElementById('pTitle') && document.getElementById('pTitle').textContent]);
  ok(waiting[0] === 'Stop measuring' && waiting[1] === 'true' && waiting[2] === `Click another place or any spot on the map to measure from ${from.name}.` && stopped === 'Measure from here'
    && m && m[1] === from.name && m[2] === to.name && +m[3] === lg && Math.abs(+m[4].replace(/,/g, '') - km) <= km * 0.05 && m[5] === foot && out === said && still === from.name && undoNow === undoWas
    && cleared[0] && cleared[1] === to.name,
    `Measure from here measures to the next place clicked ("${said}"), keeps the page open, saves nothing, and the next click goes on as usual (to ${cleared[1]})`);
  await desk.evaluate((t) => window.terra.setTool(t), toolWas);
}
// A sea, a region or a range has a notes box on its page, and the world has one on its welcome page. The Codex finds
// words in them, the world file keeps them, and Found new realms keeps a label with notes, without naming its water a
// second time.
{
  const sea = (await desk.evaluate(() => window.terra.labels())).find((l) => l.kind === 'sea');
  await desk.evaluate((id) => window.terra.select({ type: 'label', id }), sea.id);
  await desk.fill('#lLore', 'Salt pirates winter in its coves.');
  const seaStep = await desk.getAttribute('#btnUndo', 'aria-label');
  await desk.evaluate(() => window.terra.select(null));
  await desk.fill('#wNotes', 'The Sundering came in the year of two moons.');
  const worldStep = await desk.getAttribute('#btnUndo', 'aria-label');
  const search = async (q) => { await desk.click('#tab-codex'); await desk.fill('#codexQ', q); return desk.evaluate(() => [...document.querySelectorAll('#codexList .crow')].map((b) => [b.dataset.label ? 'label' : b.dataset.world ? 'world' : 'place', b.textContent])); };
  const bySea = await search('pirates'), byWorld = await search('sundering');
  await desk.click('#codexList .crow[data-world]');
  const opened = await desk.evaluate(() => [document.getElementById('pane-inspect').hidden, document.activeElement.id]);
  await desk.evaluate(() => { document.getElementById('codexQ').value = ''; });
  const filed = JSON.parse(await desk.evaluate(() => window.terra.worldText()));
  const filedSea = filed.labels.find((l) => l.id === sea.id);
  await desk.click('#tab-world'); await desk.click('#wPopulate');
  const foundSaid = await desk.textContent('#toast span'), after = await desk.evaluate(() => window.terra.labels());
  const keptSea = after.find((l) => l.id === sea.id), keptLore = JSON.parse(await desk.evaluate(() => window.terra.worldText())).labels.find((l) => l.id === sea.id);
  const twice = await desk.evaluate((k) => window.terra.labels().filter((l) => l.kind === 'sea' && l.id !== k.id && window.terra.water(l.x, l.y) && window.terra.water(k.x, k.y) && !window.terra.water(k.x, k.y).lake && Math.hypot(l.x - k.x, l.y - k.y) < 80 && JSON.stringify(window.terra.water(l.x, l.y)) === JSON.stringify(window.terra.water(k.x, k.y))).length, sea);
  await desk.click('#btnUndo');
  ok(seaStep === `Undo: Notes on ${sea.text}` && worldStep === 'Undo: Notes on this world'
    && bySea.length === 1 && bySea[0][0] === 'label' && bySea[0][1].includes('Salt pirates winter') && byWorld.length === 1 && byWorld[0][0] === 'world' && byWorld[0][1].includes('two moons')
    && !opened[0] && opened[1] === 'wNotes' && filedSea.lore === 'Salt pirates winter in its coves.' && filed.notes === 'The Sundering came in the year of two moons.'
    && keptSea && keptSea.text === sea.text && keptLore.lore === filedSea.lore && foundSaid.includes(`The label ${sea.text} keeps its notes.`) && twice === 0,
    `a sea's page and the world's welcome page keep notes ("${seaStep}", "${worldStep}"), the Codex finds them (${bySea.length} for pirates, ${byWorld.length} for sundering), the world file keeps them, and Found new realms keeps the sea's name and notes ("${foundSaid}", ${twice} other names for that water)`);
}
await desk.click('#btnNew');
await desk.click('#mnRandom'); await desk.waitForFunction(() => !window.terra.busy());
await desk.waitForTimeout(300);
ok(await desk.evaluate((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('draftBox').hidden; }, firstCap.id), 'an unkept rumor stays behind in the old world');

// A world file that was cut short is refused, not opened as a black map. One with a realm missing its color still
// opens, leaving out a place that has no position.
await desk.click('#tab-world');
const openFile = async (o) => {
  await desk.setInputFiles('#wFile', { name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(o)) });
  await desk.waitForTimeout(400);
  return desk.evaluate(() => [document.getElementById('toast').textContent, window.terra.state()]);
};
const nameBefore = (await desk.evaluate(() => window.terra.state())).name;
const [cutToast, cutState] = await openFile({ ...saved, h: saved.h.slice(0, 4000) });
ok(cutToast.startsWith('That world file is damaged or cut short') && cutState.name === nameBefore, 'a world file that was cut short is refused, and called damaged');
const damaged = JSON.parse(JSON.stringify(saved));
delete damaged.places.find((p) => p.kind === 'capital').realm.color;
delete damaged.places.find((p) => p.kind !== 'capital').x;
const [damagedToast, damagedState] = await openFile(damaged);
ok(damagedToast.startsWith('Opened') && damagedState.places === saved.places.length - 1, 'a world file with a realm missing its color opens');
// One from a newer version of the page isn't opened: saving it again here would lose whatever is new in it.
const [newerToast, newerState] = await openFile({ ...saved, version: 2, name: 'A future world' });
ok(newerToast.startsWith('That world file needs a newer') && newerState.name === damagedState.name, 'a world file from a newer version is not opened');

// Keyboard focus on a zoom button is drawn inside it, where the button group can't clip it away.
await desk.evaluate(() => document.activeElement.blur());
let onZoom = false;
for (let k = 0; k < 80 && !onZoom; k++) { await desk.keyboard.press('Tab'); onZoom = await desk.evaluate(() => document.activeElement.id === 'zIn'); }
ok(onZoom && await desk.evaluate(() => {
  const el = document.activeElement, cs = getComputedStyle(el);
  return el.matches(':focus-visible') && parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) <= 0;
}), 'keyboard focus shows on the zoom buttons');

// The toast's Undo stays readable in the dark theme that Claude's viewer can stamp on the page.
await desk.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await desk.click('#btnNew');
await desk.click('#mnRandom'); await desk.waitForFunction(() => !window.terra.busy());
const undoContrast = await desk.evaluate(() => {
  const lum = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(getComputedStyle(document.querySelector('#toast button')).color), b = lum(getComputedStyle(document.getElementById('toast')).backgroundColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});
ok(undoContrast >= 4.5, `the toast's Undo is readable in the dark theme (${undoContrast.toFixed(1)}:1)`);
await desk.evaluate(() => document.documentElement.removeAttribute('data-theme'));

// A toast fades in with a small rise, and out again; one that takes the place of another rises again, so the change
// shows. It used to snap on and off: [hidden] hid it outright, so its fade never ran. As far as anything that asks is
// concerned it is gone at once, and its buttons can't be pressed while it fades. With reduced motion it just appears.
for (const reducedMotion of ['no-preference', 'reduce']) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const look = () => pg.evaluate(() => { const t = document.getElementById('toast'), cs = getComputedStyle(t); return { hidden: t.hidden, op: +cs.opacity, vis: cs.visibility, moving: t.getAnimations().length > 0 }; });
  const shown = await pg.evaluate(() => { document.getElementById('wClear').click(); const t = document.getElementById('toast'); return { op: +getComputedStyle(t).opacity, moving: t.getAnimations().length > 0 }; });
  await pg.waitForTimeout(400);
  const up = await look();
  const again = await pg.evaluate(() => { document.getElementById('wClear').click(); return +getComputedStyle(document.getElementById('toast')).opacity; });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => document.getElementById('wPopulate').click());
  await pg.waitForTimeout(400);
  // A new step (here, typing in the world's name) takes away the toast and its Undo.
  await pg.evaluate(() => { const n = document.getElementById('worldName'); n.value += 'x'; n.dispatchEvent(new Event('input')); });
  const going = await look(), pressable = await pg.evaluate(() => getComputedStyle(document.querySelector('#toast button')).pointerEvents !== 'none');
  await pg.waitForTimeout(400);
  const gone = await look();
  if (reducedMotion === 'reduce') ok(shown.op === 1 && !shown.moving && up.op === 1 && going.hidden && going.vis === 'hidden' && !going.moving && gone.vis === 'hidden', 'with reduced motion a toast just appears and goes, with no fade');
  else ok(shown.op < 1 && shown.moving && up.op === 1 && up.vis === 'visible' && again < 1 && going.hidden && going.moving && going.vis === 'visible' && !pressable && gone.vis === 'hidden' && gone.op === 0, 'a toast fades in and out, rises again when another takes its place, and is gone at once to anything that asks');
  await c.close();
}

// Enter in Seed generates that world, as Generate from seed does, with its Undo.
await desk.click('#tab-world');
const seedWas = (await desk.evaluate(() => window.terra.state())).seed;
await desk.fill('#wSeed', '4242'); await desk.press('#wSeed', 'Enter');
const seedSaid = await desk.textContent('#toast span');
const genUndo = await desk.getAttribute('#btnUndo', 'aria-label');
ok((await desk.evaluate(() => window.terra.state())).seed === 4242 && seedSaid.startsWith('Generated world 4242.') && await desk.locator('#toast button', { hasText: 'Undo' }).isVisible() && await desk.getAttribute('#wSeed', 'enterkeyhint') === 'go', `Enter in Seed generates world 4242, with Undo ("${seedSaid}")`);
await desk.click('#toast button:has-text("Undo")');
ok((await desk.evaluate(() => window.terra.state())).seed === seedWas, 'and Undo brings back the world before');
// Going back and forth between worlds, the buttons name the step too.
const genRedo = await desk.getAttribute('#btnRedo', 'aria-label');
ok(genUndo === 'Undo: Generate world 4242' && genRedo === 'Redo: Generate world 4242', `Undo and Redo name a world generated ("${genUndo}", "${genRedo}")`);
// Shortcuts still work straight after using a slider: Ctrl+Z takes back the sea level it set.
const landBefore = (await desk.evaluate(() => window.terra.state())).land;
const seaBox = await desk.locator('#wSea').boundingBox();
await desk.locator('#wSea').click({ position: { x: seaBox.width * 0.15, y: seaBox.height / 2 } });
const landMoved = (await desk.evaluate(() => window.terra.state())).land;
await desk.keyboard.press('Control+z');
ok(landMoved !== landBefore && (await desk.evaluate(() => window.terra.state())).land === landBefore, 'Ctrl+Z works straight after using a slider');
// Ctrl+S saves the world file and Ctrl+O asks for one to open. Ctrl+S used to open the browser's Save page as, which
// keeps the app without the world in it. In a text box both are left to the browser, as Ctrl+Z is.
const [keyDl] = await Promise.all([desk.waitForEvent('download'), desk.keyboard.press('Control+s')]);
const keySaved = JSON.parse(await readFile(await keyDl.path(), 'utf8'));
const [chooser] = await Promise.all([desk.waitForEvent('filechooser'), desk.keyboard.press('Control+o')]);
let typedDl = 0; const countDl = () => typedDl++;
desk.on('download', countDl);
await desk.focus('#worldName'); await desk.keyboard.press('Control+s'); await desk.waitForTimeout(600);
desk.off('download', countDl); await desk.locator('#worldName').blur();
ok(keyDl.suggestedFilename().endsWith('.json') && keySaved.format === 'terra-incognita' && chooser.element() && !typedDl, `Ctrl+S saves the world file (${keyDl.suggestedFilename()}) and Ctrl+O asks for one, but not from a text box`);

// Space and drag pans with any tool, even straight after clicking the tool's button...
await desk.click('.tool[data-tool="raise"]');
const mb = await desk.locator('#map').boundingBox();
const from = await desk.evaluate(() => [window.terra.toScreen(0, 0), window.terra.state().undo]);
await desk.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
await desk.keyboard.down(' ');
await desk.mouse.down();
for (let k = 1; k <= 6; k++) await desk.mouse.move(mb.x + mb.width / 2 - k * 6, mb.y + mb.height / 2 - k * 4);
await desk.mouse.up();
await desk.keyboard.up(' ');
const to = await desk.evaluate(() => [window.terra.toScreen(0, 0), window.terra.state().undo]);
ok((to[0].x !== from[0].x || to[0].y !== from[0].y) && to[1] === from[1], 'Space and drag pans straight after clicking a tool');
// ...while a button reached with Tab still takes Space.
await desk.evaluate(() => window.terra.setStyle('terrain'));
await desk.focus('#styleTerrain');
await desk.keyboard.press('Tab');
await desk.keyboard.press(' ');
ok(await desk.evaluate(() => document.getElementById('styleAtlas').getAttribute('aria-pressed') === 'true'), 'Space still presses a button reached with Tab');
await desk.evaluate(() => window.terra.setStyle('terrain'));

// The New world menu opens from the keyboard and closes when Tab moves on past it.
await desk.focus('#btnNew');
await desk.keyboard.press('Enter');
const menuFocus = await desk.evaluate(() => document.activeElement.id);
await desk.keyboard.press('Tab');
await desk.keyboard.press('Tab');
ok(menuFocus === 'mnRandom' && await desk.evaluate(() => document.getElementById('newMenu').hidden), 'tabbing on past the New world menu closes it');

// The arrow keys move through the New world menu and along the panel tabs, which are one stop for Tab.
await desk.focus('#btnNew');
await desk.keyboard.press('Enter');
await desk.keyboard.press('ArrowDown');
const menuNext = await desk.evaluate(() => document.activeElement.id);
await desk.keyboard.press('Escape');
await desk.click('#tab-inspect');
await desk.keyboard.press('ArrowRight');
const tabNow = await desk.evaluate(() => [document.activeElement.id, document.getElementById('tab-codex').getAttribute('aria-selected'), [...document.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).length]);
ok(menuNext === 'mnBlank' && tabNow[0] === 'tab-codex' && tabNow[1] === 'true' && tabNow[2] === 1, 'the arrow keys move through the menu and along the tabs');

// What the map says about itself, on a laptop-sized screen.
const map = watch(await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage());
await map.goto(base);
await map.evaluate(() => document.fonts.ready);
const M = (fn, arg) => map.evaluate(fn, arg);
const clickMap = async (x, y) => {
  const b = await map.locator('#map').boundingBox(), p = await M(([x, y]) => window.terra.toScreen(x, y), [x, y]);
  await map.mouse.click(b.x + p.x, b.y + p.y);
};
const row = (name) => M((name) => { const dd = [...document.querySelectorAll('#pane-inspect .facts dd')].find((d) => d.previousElementSibling.textContent === name); return dd ? dd.textContent : ''; }, name);
const readAt = async (x, y, name) => { await M(([x, y]) => window.terra.select({ type: 'loc', x, y }), [x, y]); return row(name); };

// World 96298 has a lake at 401-411 across, 157-166 down. Every part of it reads as the water's surface, level with its
// shore, rather than the lake bed under it.
await M(() => window.terra.newWorld(96298, 'continent'));
ok(await M(() => window.terra.cell(403.5, 160.5).lake && window.terra.cell(408.5, 162.5).lake && !window.terra.cell(400.5, 159.5).lake), 'world 96298 has its lake, with dry shore to its west');
// On the lake the row is called Surface.
const heights = []; for (const [x, y, name] of [[403.5, 160.5, 'Surface'], [408.5, 162.5, 'Surface'], [400.5, 159.5, 'Elevation']]) heights.push(parseInt((await readAt(x, y, name)).replace(/,/g, ''), 10));
const [lakeA, lakeB, shore] = heights;
ok(lakeA === lakeB && Math.abs(lakeA - shore) <= 15, `a lake reads as its surface, level with the shore (${lakeA} m and ${lakeB} m out on it, ${shore} m on the shore)`);

// A river drawn from out on that lake to the sea leaves the lake as it was, and runs where it was drawn.
const lakeCells = () => M(() => { let n = 0; for (let y = 152; y <= 170; y++) for (let x = 396; x <= 416; x++) if (window.terra.cell(x + 0.5, y + 0.5).lake) n++; return n; });
const lakeBefore = await lakeCells();
await map.keyboard.press('Escape');
await map.keyboard.press('p');
await map.click('.chip[data-v="river"]');
const outflow = [[406, 161], [409, 160], [412, 159.5], [418, 159.5], [426, 159.5], [434, 159.5], [440, 159.5]];
ok(await M(() => window.terra.cell(440, 159.5).h < 0), 'and the sea a few leagues east of it');
await drag(outflow, 6, map);
const lakeAfter = await lakeCells();
const alongOut = []; for (let x = 413; x <= 430; x++) alongOut.push(await M((x) => window.terra.riverNear(x, 159.5), x));
ok(lakeAfter >= lakeBefore * 0.95, `a river drawn out of a lake leaves the lake (${lakeBefore} lake cells before, ${lakeAfter} after)`);
ok(alongOut.filter(Boolean).length >= alongOut.length * 0.9, `and runs where it was drawn (${alongOut.filter(Boolean).length} of ${alongOut.length} points)`);

// So does one with a wide valley out of world 950281's big, ragged lake. The valley's banks leave hollows beside the
// lake, and the gorges that drain them used to cut through its shore: it kept 298 of its 851 cells.
await M(() => window.terra.newWorld(950281, 'inland'));
const bigLake = () => M(() => { let n = 0; for (let y = 108; y <= 151; y++) for (let x = 348; x <= 385; x++) if (window.terra.cell(x + 0.5, y + 0.5).lake) n++; return n; });
const bigBefore = await bigLake();
await M(() => { const r = document.getElementById('optValley'); r.value = '12'; r.dispatchEvent(new Event('input')); });
await drag([[365.5, 136.5], [337.9, 120]], 30, map);
const bigAfter = await bigLake();
ok(bigBefore > 800 && bigAfter >= bigBefore * 0.95, `a wide valley drawn out of a big lake leaves the lake too (${bigBefore} lake cells before, ${bigAfter} after)`);

// A lake reads one height from end to end. World 857490's lake read 1,036 m at one end and 1,037 m at the other.
await M(() => window.terra.newWorld(857490, 'twin'));
const ends = []; for (const [x, y] of [[372.5, 184.5], [368.5, 189.5]]) ends.push(await M(([x, y]) => window.terra.cell(x, y).lake, [x, y]) && parseInt((await readAt(x, y, 'Surface')).replace(/,/g, ''), 10));
ok(ends[0] > 0 && ends[0] === ends[1], `a lake reads one height from end to end (${ends[0]} m and ${ends[1]} m)`);

// Walrus ivory and whale oil come from the sea, so only a cold coast lists them: tundra and ice sheet far from the sea
// offered them too. And a coastal town a few metres above the sea says it is at sea level rather than '0 m'.
await M(() => window.terra.newWorld(20417, 'continent'));
const cold = await M(() => {
  const out = { inland: [], coast: [] }, sea = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (window.terra.cell(x + dx, y + dy).h < 0) return true; return false; };
  for (let y = 2.5; y < 298; y += 3) for (let x = 2.5; x < 478; x += 3) {
    const c = window.terra.cell(x, y); if (c.h < 0 || c.lake || (c.kind !== 'Tundra' && c.kind !== 'Ice sheet')) continue;
    const near = sea(x, y), far = !near && !sea(x - 3, y) && !sea(x + 3, y);
    if (far && out.inland.length < 40) out.inland.push([x, y]); else if (near && out.coast.length < 40) out.coast.push([x, y]);
  }
  return out;
});
const goodsAt = async (list) => { const g = []; for (const [x, y] of list) { const s = await readAt(x, y, 'Setting'), gd = await readAt(x, y, 'Goods'); g.push([s, gd]); } return g; };
const inlandGoods = await goodsAt(cold.inland), coastGoods = await goodsAt(cold.coast);
ok(cold.inland.length >= 10 && inlandGoods.every(([s, g]) => (s.startsWith('Inland') || s.startsWith('On a lake shore')) && !/walrus|whale/.test(g)), `tundra and ice sheet inland list no walrus ivory or whale oil (${cold.inland.length} spots: ${[...new Set(inlandGoods.flatMap(([, g]) => g.split(', ')))].join(', ')})`);
ok(coastGoods.some(([s, g]) => s.startsWith('On the coast') && /walrus|whale/.test(g)) && coastGoods.every(([, g]) => !/pearls/.test(g)), 'a cold coast can list them, and no pearls');
const lowSpot = await M(() => { for (let y = 10.5; y < 290; y++) for (let x = 10.5; x < 470; x++) { const c = window.terra.cell(x, y); if (c.h >= 0 && !c.lake && c.elev > 0.5 && c.elev < 4) return { x, y, elev: c.elev }; } return null; });
await M((w) => window.terra.select({ type: 'loc', x: w.x, y: w.y }), lowSpot);
ok(await row('Elevation') === 'At sea level', `a spot on the coast a few metres up reads At sea level (${lowSpot.elev.toFixed(1)} m: "${await row('Elevation')}")`);

// An island with a sea inside it: a town on the inner sea is on the coast of that sea, not the ocean outside, even
// when the ocean's name is the only one on the map.
await M(() => window.terra.startBlank());
await M(() => { const r = document.getElementById('optRough'); r.value = '0'; r.dispatchEvent(new Event('input')); });
await drag([[140, 70], [340, 70], [360, 150], [340, 230], [140, 230], [120, 150], [140, 70]], 6, map);
await map.click('.chip[data-v="sea"]');
await drag([[200, 120], [280, 120], [290, 150], [280, 180], [200, 180], [190, 150], [200, 120]], 6, map);
ok(await M(() => window.terra.cell(240.5, 150.5).h < 0 && window.terra.cell(160.5, 150.5).h >= 0 && window.terra.cell(100.5, 150.5).h < 0), 'a sketched island holds an inland sea');
await map.keyboard.press('t');
await map.click('.chip[data-g="label"][data-v="sea"]');
await map.fill('#optLabelText', 'The Outer Ocean');
await clickMap(100.5, 150.5);
await map.keyboard.press('c');
await clickMap(188.5, 150.5);
const shoreTown = (await M(() => window.terra.places()))[0];
const onlyOcean = await row('Setting');
await M(() => window.terra.select({ type: 'loc', x: 250.5, y: 160.5 }));
const unnamedWater = await map.textContent('#pane-inspect h2');
// Out at sea the temperature is the climate's, as on land, not the water's: open sea can't be as cold as -8 °C.
const [seaClimate, seaWater] = [await row('Climate'), await row('Water')];
ok(seaClimate.endsWith('°C mean') && !seaWater, `the sea's temperature reads as its climate ("${seaClimate}")`);
await map.keyboard.press('t');
await map.fill('#optLabelText', 'The Inner Sea');
await clickMap(240.5, 150.5);
await M((id) => window.terra.select({ type: 'place', id }), shoreTown.id);
const named = await row('Setting');
ok(onlyOcean.startsWith('On the coast of the sea') && named.startsWith('On the coast of the Inner Sea'), `a town on an inland sea is on its coast, not the ocean's ("${onlyOcean}", then "${named}")`);
await M(() => window.terra.select({ type: 'loc', x: 250.5, y: 160.5 }));
const namedWater = await map.textContent('#pane-inspect h2');
ok(unnamedWater === 'Open sea' && namedWater === 'The Inner Sea', `and its water goes by its own name, or none ("${unnamedWater}", then "${namedWater}")`);

// That island was drawn with a smooth coast: its straight east side, from (340, 70) to (360, 150), comes out straight
// rather than as a staircase of cells. Where the ground crosses sea level along each row, against a straight line.
const fit = await M(() => {
  const xs = [], ys = [];
  for (let y = 78; y <= 142; y++) {
    const along = 340 + (y + 0.5 - 70) / 4;
    for (let x = Math.floor(along) - 4; x < Math.floor(along) + 4; x++) {
      const a = window.terra.cell(x + 0.5, y + 0.5).h, b = window.terra.cell(x + 1.5, y + 0.5).h;
      if (a >= 0 && b < 0) { xs.push(x + 0.5 + a / (a - b)); ys.push(y + 0.5); break; }
    }
  }
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, syy = 0; for (let k = 0; k < n; k++) { sxy += (ys[k] - my) * (xs[k] - mx); syy += (ys[k] - my) ** 2; }
  let rss = 0; for (let k = 0; k < n; k++) rss += (xs[k] - mx - sxy / syy * (ys[k] - my)) ** 2;
  return { n, rms: Math.sqrt(rss / n) };
});
ok(fit.n > 50 && fit.rms < 0.1, `a straight coast drawn smooth comes out straight (${fit.rms.toFixed(3)} cells off a straight line, over ${fit.n} rows)`);

// Sea names stay clear of the scale bar in the bottom-left corner. The first three worlds had one under it.
const covered = [];
for (const [seed, shape] of [[645278, 'inland'], [793904, 'twin'], [543439, 'twin'], [487097, 'continent'], [368654, 'twin']]) {
  const under = await M(([seed, shape]) => {
    window.terra.newWorld(seed, shape);
    const { scale, seas } = window.terra.boxes(), hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    return seas.some((a) => hit(a, scale));
  }, [seed, shape]);
  if (under) covered.push(seed);
}
ok(covered.length === 0, 'sea names stay clear of the scale bar' + (covered.length ? ': not in ' + covered.join(', ') : ''));

// Cold air carries little rain, so frozen land isn't the wettest on the map: in the starting world, land colder than
// 0 °C got up to 2,990 mm a year, as much as anywhere ('-4 °C mean, 2,990 mm rain, Tundra'), and the coldest fifth of
// the land was wetter on average than the land as a whole.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const r = await pg.evaluate(() => {
    const land = [];
    for (let y = 0; y < 300; y += 2) for (let x = 0; x < 480; x += 2) { const c = window.terra.cell(x + 0.5, y + 0.5); if (c.h >= 0 && !c.lake) land.push(c); }
    land.sort((a, b) => a.temp - b.temp);
    const fifth = Math.floor(land.length / 5), mean = (a) => a.reduce((s, c) => s + c.rain, 0) / a.length;
    const frozen = land.filter((c) => c.temp < 0), wettest = land.reduce((a, b) => (b.rain > a.rain ? b : a));
    return { frozen: frozen.length, frozenMax: Math.max(...frozen.map((c) => c.rain)), cold: mean(land.slice(0, fifth)), all: mean(land), wettest: wettest.temp };
  });
  ok(r.frozen > 500 && r.frozenMax <= 1150 && r.cold < r.all && r.wettest > 5, `frozen land gets at most ${Math.round(r.frozenMax)} mm a year (over ${r.frozen} spots), the coldest fifth of the land ${Math.round(r.cold)} mm against ${Math.round(r.all)} for all of it, and the wettest spot is at ${r.wettest.toFixed(1)} °C`);
  await c.close();
}

// A generated world's rain comes in on a west wind, so a range has a wet side facing it and a dry side behind it: low
// ground just east of high mountains gets less rain than low ground just west of them. It got more in two of these
// (20417: 2,004 mm behind against 1,447 facing the wind). Every kind of land the README counts still turns up.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const out = [], kinds = new Set();
  for (const [seed, shape] of [[20417, 'continent'], [222, 'continent'], [15939, 'twin'], [950281, 'inland']]) {
    const r = await pg.evaluate(([seed, shape]) => {
      window.terra.newWorld(seed, shape);
      const W = 480, H = 300, g = [], kinds = new Set();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.push(window.terra.cell(x + 0.5, y + 0.5));
      const lee = [0, 0], wind = [0, 0];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = g[y * W + x]; if (c.h < 0 || c.lake) continue;
        kinds.add(c.kind); if (c.elev >= 600) continue;
        let west = false, east = false;
        for (let d = 2; d <= 12; d++) { if (x - d >= 0 && g[y * W + x - d].elev > 2000) west = true; if (x + d < W && g[y * W + x + d].elev > 2000) east = true; }
        if (west && !east) { lee[0]++; lee[1] += c.rain; } else if (east && !west) { wind[0]++; wind[1] += c.rain; }
      }
      return { lee: lee[1] / lee[0], wind: wind[1] / wind[0], kinds: [...kinds] };
    }, [seed, shape]);
    r.kinds.forEach((k) => kinds.add(k));
    out.push([seed, Math.round(r.lee), Math.round(r.wind)]);
  }
  const said = (await readFile(join(root, 'README.md'), 'utf8')).match(/(\w+) kinds of land/)[1];
  const all = JSON.parse((await readFile(join(root, 'js/app.js'), 'utf8')).match(/const BIOME_NAME = (\[[^\]]*\])/)[1].replace(/'/g, '"')).filter((b) => b !== 'Open sea' && b !== 'Lake');
  ok(out.every(([, lee, wind]) => lee < wind * 0.85), `low ground behind a range is drier than low ground facing the wind (${out.map(([s, l, w]) => `${s}: ${l} against ${w} mm`).join(', ')})`);
  ok(all.every((k) => kinds.has(k)), `and all ${said.toLowerCase()} kinds of land turn up in those worlds (${all.filter((k) => !kinds.has(k)).join(', ') || 'none missing'})`);
  await c.close();
}

// Twin lands are two lands, with a strait between them: in 15939 and 8020 they joined across a land bridge, though the
// title names two lands. Land touching only at a corner counts as apart, as water touching at a corner counts as one.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const out = [];
  for (const seed of [15939, 8020, 20417, 857490]) {
    out.push([seed, ...await pg.evaluate((seed) => {
      window.terra.newWorld(seed, 'twin');
      const W = 480, H = 300, land = [], seen = new Int8Array(W * H), sizes = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) land.push(window.terra.cell(x + 0.5, y + 0.5).h >= 0);
      for (let s = 0; s < W * H; s++) {
        if (!land[s] || seen[s]) continue;
        const q = [s]; seen[s] = 1; let n = 0;
        while (q.length) { const i = q.pop(); n++; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx >= 0 && ny >= 0 && nx < W && ny < H && land[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
        sizes.push(n);
      }
      const all = sizes.reduce((a, b) => a + b, 0); sizes.sort((a, b) => b - a);
      return [Math.round(sizes[0] / all * 100), Math.round(sizes[1] / all * 100)];
    }, seed)]);
  }
  ok(out.every(([, a, b]) => a < 70 && b >= 30), `Twin lands come out as two lands with a strait between them (the two largest hold ${out.map(([s, a, b]) => `${a}% and ${b}% in ${s}`).join(', ')})`);
  await c.close();
}

// Every big island gets at least a village: in archipelago 20417 the whole northern row of islands was blank, eight of
// its eleven lands of 20,000 km² or more. And no city outgrows its capital: in continent 29770 the city of Meath had
// 81,000 people against 88,000 in its capital, Gwoselie. Each is held under four-fifths of its capital.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const out = [];
  for (const [seed, shape] of [[20417, 'archipelago'], [8020, 'archipelago'], [29770, 'continent']]) {
    out.push([seed, shape, ...await pg.evaluate(([seed, shape]) => {
      window.terra.newWorld(seed, shape);
      const W = 480, H = 300, land = [], comp = new Int32Array(W * H).fill(-1), size = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) land.push(window.terra.cell(x + 0.5, y + 0.5).h >= 0);
      for (let s = 0; s < W * H; s++) {
        if (!land[s] || comp[s] >= 0) continue;
        const q = [s]; comp[s] = size.length; let n = 0;
        while (q.length) { const i = q.pop(); n++; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx >= 0 && ny >= 0 && nx < W && ny < H && land[j] && comp[j] < 0) { comp[j] = size.length; q.push(j); } } }
        size.push(n);
      }
      const ps = window.terra.places(), held = new Set(ps.map((p) => comp[Math.floor(p.y) * W + Math.floor(p.x)]));
      const big = size.filter((n) => n >= 200).length, empty = size.filter((n, k) => n >= 200 && !held.has(k)).length;
      const byId = new Map(ps.map((p) => [p.id, p])), over = ps.filter((p) => p.kind === 'city' && p.capital !== null && p.pop >= 0.8 * byId.get(p.capital).pop).map((p) => `${p.name} ${p.pop} against ${byId.get(p.capital).pop}`);
      return [big, empty, over];
    }, [seed, shape])]);
  }
  ok(out.every(([, , big, empty]) => big > 3 && empty === 0), `every land of 20,000 km² or more has a place on it (${out.map(([s, sh, big, empty]) => `${sh} ${s}: ${empty} of ${big} empty`).join(', ')})`);
  ok(out.every(([, , , , over]) => over.length === 0), `and every city has fewer than four-fifths of its capital's people (${out.flatMap(([, , , , o]) => o).join(', ') || 'all do'})`);
  await c.close();
}

// Lake shores are smoothed like the coast. Traced round the lake's cells they turned in 45° and 90° steps; now no
// shore in the starting world turns more than 30° from one point to the next.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const r = await pg.evaluate(() => {
    let worst = 0, points = 0; const shores = window.terra.lakeShores();
    for (const a of shores) {
      const closed = a.length > 6 && Math.hypot(a[0] - a[a.length - 2], a[1] - a[a.length - 1]) < 1e-6, n = a.length / 2;
      for (let j = 1; j < n - (closed ? 0 : 1); j++) {
        const k = j === n - 1 ? 1 : j + 1, ux = a[2 * j] - a[2 * j - 2], uy = a[2 * j + 1] - a[2 * j - 1], vx = a[2 * k] - a[2 * j], vy = a[2 * k + 1] - a[2 * j + 1];
        const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); if (lu < 1e-9 || lv < 1e-9) continue;
        worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lu / lv))) * 180 / Math.PI); points++;
      }
    }
    return { shores: shores.length, points, worst };
  });
  ok(r.shores > 50 && r.worst < 30, `lake shores are drawn smooth (${r.shores} shores, ${r.points} points, the sharpest turn ${r.worst.toFixed(1)}°)`);
  await c.close();
}

// A river that reaches the sea ends at the coast: it ended at the middle of the first cell of sea, a stub about 25 px
// long past the coastline when zoomed in close. Its end is now where the ground between its last two cells, read
// straight across, comes down to the sea, give or take a tenth of a cell.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const r = await pg.evaluate(() => {
    const ends = window.terra.riverEnds(), off = [];
    for (const e of ends) {
      // The cell the end is in and its neighbours: the coast lies between a land cell and a sea cell beside it.
      let best = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const lx = Math.floor(e.x) + dx + 0.5, ly = Math.floor(e.y) + dy + 0.5, a = window.terra.cell(lx, ly); if (a.h < 0) continue;
        for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
          if (!sx && !sy) continue; const b = window.terra.cell(lx + sx, ly + sy); if (b.h >= 0) continue;
          const t = a.h / (a.h - b.h), cx = lx + sx * t, cy = ly + sy * t; best = Math.min(best, Math.hypot(e.x - cx, e.y - cy));
        }
      }
      off.push(best);
    }
    off.sort((a, b) => a - b);
    return { n: ends.length, worst: off[off.length - 1], median: off[Math.floor(off.length / 2)] };
  });
  ok(r.n > 20 && r.worst < 0.2, `rivers end at the coast, not out in the sea (${r.n} rivers; the furthest from the coast ${r.worst.toFixed(2)} cells, half within ${r.median.toFixed(2)})`);
  await c.close();
}

// The map prints no latitudes or longitudes, on the map, on a place's page or under the pointer: the climate runs from
// ice sheet to jungle over 3,000 km, and the numbers put a frozen north at 55°N, where Denmark is.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript(() => { const said = (window.__drawn = []), f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { said.push(String(t)); return f.call(this, t, ...a); }; });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cap = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  await pg.evaluate(([id, x, y]) => { window.terra.select({ type: 'place', id }); window.terra.centerOn(x, y); }, [cap.id, cap.x, cap.y]);
  const at = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [cap.x + 3, cap.y + 3]), mb = await pg.locator('#map').boundingBox();
  await pg.mouse.move(mb.x + at.x, mb.y + at.y);
  await pg.waitForTimeout(200);
  const drawn = await pg.evaluate(() => window.__drawn.filter((t) => /\d\s*°\s*[NSEW]/.test(t)));
  const page = await pg.textContent('#pane-inspect .facts'), status = await pg.textContent('#status');
  ok(drawn.length === 0 && !/°[NSEW]|°\d|′/.test(page) && !/°[NSEW]|′/.test(status) && /Elevation|At sea level/.test(page) && /°C/.test(status), `no latitudes or longitudes on the map, a place's page or under the pointer (${drawn.slice(0, 3).join(', ') || 'none drawn'}; status "${status}")`);
  await c.close();
}

// Generated places stand at least 3 m above the sea, so the first steps up of the sea slider drown none of them: the
// first step drowned 11 of the starting world's 54 places, which stood on ground a metre or less above the sea.
await M(() => window.terra.newWorld(20417, 'continent'));
const inWater = () => M(() => window.terra.places().filter((p) => { const c = window.terra.cell(p.x, p.y); return c.h < 0 || c.lake; }).map((p) => p.name));
await map.click('#tab-world');
const seaSteps = (n) => M((n) => { const r = document.getElementById('wSea'); r.value = String(+r.value + 0.002 * n); r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }, n);
const lowest = await M(() => Math.min(...window.terra.places().map((p) => window.terra.cell(p.x, p.y).elev)));
await seaSteps(1);
const oneStep = await inWater();
await seaSteps(1);
const twoSteps = await inWater();
await M(() => { const r = document.getElementById('wSea'); r.value = '0.5'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
ok(lowest >= 3 && oneStep.length === 0 && twoSteps.length === 0 && (await inWater()).length === 0, `the starting world's places stand 3 m or more above the sea (the lowest ${lowest.toFixed(1)} m), and one or two steps up of the sea drown none`);
// Raising the sea says how many places it covered, and its Undo brings them back up: in the starting world, five
// steps of the slider cover a few of its places. A Sea sketch and a brush that leave a place in the water say so too.
await seaSteps(5);
const risen = await inWater(), riseToast = await map.textContent('#toast span');
await map.click('#toast button');
ok(risen.length > 1 && riseToast === `The sea rose over ${risen.length} places.` && (await inWater()).length === 0, `raising the sea says how many places it covered, and Undo brings them back ("${riseToast}")`);
// A town near the coast with no other place within 9 cells, for a Sea loop round it, and the lowest of the other towns
// on their own, for Lower.
const lone = await M(() => {
  const ps = window.terra.places(), alone = (p) => ps.every((q) => q === p || Math.hypot(q.x - p.x, q.y - p.y) > 9);
  const nearSea = (p) => { for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (window.terra.cell(p.x + dx, p.y + dy).h < 0) return true; return false; };
  const towns = ps.filter((p) => p.kind !== 'capital' && p.kind !== 'landmark' && alone(p) && p.x > 12 && p.x < 468 && p.y > 12 && p.y < 288);
  const shore = towns.find(nearSea), elev = (p) => window.terra.cell(p.x, p.y).elev;
  return { shore, low: towns.filter((p) => p !== shore).sort((a, b) => elev(a) - elev(b))[0] };
});
await map.keyboard.press('p');
await map.click('.chip[data-v="sea"]');
const krar = []; for (let k = 0; k <= 12; k++) krar.push([lone.shore.x + Math.cos(k * Math.PI / 6) * 6, lone.shore.y + Math.sin(k * Math.PI / 6) * 6]);
await drag(krar, 4, map);
const floodToast = await map.textContent('#toast span'), flooded = await inWater();
await map.click('#toast button');
await map.keyboard.press('l');
await M(() => { for (const [id, v] of [['optSize', '6'], ['optStr', '10']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
await M(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const brushAt = await map.locator('#map').boundingBox(), naeino = await M((p) => window.terra.toScreen(p.x, p.y), lone.low);
await map.mouse.move(brushAt.x + naeino.x, brushAt.y + naeino.y);
await map.mouse.down();
for (let k = 0; k < 8; k++) { await map.mouse.move(brushAt.x + naeino.x + (k % 2 ? 2 : -2), brushAt.y + naeino.y); await map.waitForTimeout(60); }
await map.mouse.up();
await map.waitForTimeout(300);
const brushToast = await map.textContent('#toast span'), lowered = await inWater();
ok(flooded.join() === lone.shore.name && floodToast === `Flooded. The sea rose over ${lone.shore.name}.` && lowered.join() === lone.low.name && brushToast === `${lone.low.name} is under water now.`, `so do a Sea sketch and a brush ("${floodToast}", "${brushToast}")`);
await map.context().close();

// The README counts the kinds of land the map can show.
const readme = await readFile(join(root, 'README.md'), 'utf8'), appSrc = await readFile(join(root, 'js/app.js'), 'utf8');
// Every Undo step has a name for the buttons to give: one passed in, or one set straight after (a place founded).
const srcLines = appSrc.split('\n'), unnamedSteps = srcLines.flatMap((l, k) => /pushUndo\((?!parts)/.test(l) && !/pushUndo\([^;]*\}, [^)]/.test(l) && !srcLines.slice(k, k + 3).join('\n').includes('nameStep(') ? [k + 1] : []);
ok(!unnamedSteps.length, 'every Undo step is named' + (unnamedSteps.length ? ': not on lines ' + unnamedSteps.join(', ') + ' of js/app.js' : ''));
const landKinds = JSON.parse(appSrc.match(/const BIOME_NAME = (\[[^\]]*\])/)[1].replace(/'/g, '"')).filter((b) => b !== 'Open sea' && b !== 'Lake');
const counted = readme.match(/(\w+) kinds of land/)[1].toLowerCase();
const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
ok(NUMBER.indexOf(counted) === landKinds.length, `the README's "${counted} kinds of land" are the ${landKinds.length} the map shows`);

// A phone held sideways fits the whole map on screen as the page opens, zoom buttons and the tool's options included:
// the tools are a column down the left, the options a strip across the map's top, and the header one line. (Half the
// world, the zoom buttons and the options were below the screen's bottom edge.)
for (const [width, height] of [[844, 390], [667, 375]]) {
  const side = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const sidePage = watch(await side.newPage());
  await sidePage.goto(base);
  await sidePage.click('.tool[data-tool="sketch"]');
  await sidePage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // the map refits to its frame
  const fit = await sidePage.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect(), wrap = r('#mapwrap'), a = window.terra.toScreen(0, 0), b = window.terra.toScreen(480, 300);
    return { mapTop: wrap.top + a.y, mapBottom: wrap.top + b.y, zoom: r('.zoom').bottom, opts: r('#toolOpts').bottom, wrapTop: wrap.top, toolsRight: r('#tools').right, toolsBottom: r('#tools').bottom, wrapLeft: wrap.left,
      header: r('.top').height, one: Math.abs(r('#btnNew').top - r('#btnUndo').top) < 2 && r('#worldName').bottom <= r('.top').bottom, map: Math.round(b.x - a.x) + ' x ' + Math.round(b.y - a.y), h: innerHeight, sw: document.documentElement.scrollWidth <= innerWidth };
  });
  ok(fit.mapTop >= 0 && fit.mapBottom <= fit.h && fit.zoom <= fit.h && fit.opts <= fit.wrapTop + 1 && fit.toolsRight <= fit.wrapLeft && fit.toolsBottom <= fit.h && fit.header <= 52 && fit.one && fit.sw,
    `a phone held sideways at ${width} x ${height} shows the whole map (${fit.map} px), the zoom buttons, the tools down its left and the options across its top, under a one-line header`);
  await side.close();
}
// On the smallest phones New world is its globe alone, and Undo, Redo, the look and New world share one row.
{
  const c = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), pg = await c.newPage();
  await pg.goto(base);
  const row = await pg.evaluate(() => { const t = ['#btnUndo', '#btnRedo', '.seg', '#btnNew'].map((q) => document.querySelector(q).getBoundingClientRect()); return { tops: new Set(t.map((b) => Math.round(b.top))).size, right: Math.max(...t.map((b) => b.right)), name: document.getElementById('btnNew').textContent.trim(), w: innerWidth }; });
  ok(row.tops === 1 && row.right <= row.w && row.name === 'New world', `at 320 px Undo, Redo, the look and New world share one row, New world still named for a screen reader`);
  await c.close();
}
// Found new realms on a small island frames it too, at once where reduced motion is asked for; but not once you have
// zoomed in yourself. A generated world, more land than sea, keeps the fit button to the whole map.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }), pg = await c.newPage();
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  await pg.click('#zFit'); const generated = await pg.evaluate(() => window.terra.view().zoom);
  await pg.evaluate(() => { window.terra.startBlank(); window.terra.fitView(); });
  await pg.click('#tab-world');
  await drag([[200, 120], [260, 112], [280, 160], [240, 190], [196, 170], [200, 120]], 5, pg);
  await pg.evaluate(() => window.terra.fitView());
  await pg.click('#wPopulate');
  const realmsView = await pg.evaluate(() => window.terra.view());
  await pg.click('#zIn'); await pg.click('#zIn');
  const mine = await pg.evaluate(() => window.terra.view());
  await pg.click('#wPopulate');
  const after = await pg.evaluate(() => window.terra.view());
  ok(Math.abs(generated - 1) < 1e-6 && realmsView.zoom > 2 && !realmsView.moving && realmsView.sees[0] <= 196 && realmsView.sees[2] >= 280 && Math.abs(after.zoom - mine.zoom) < 1e-6 && after.sees[0] === mine.sees[0],
    `Found new realms frames a small island (${realmsView.zoom.toFixed(2)} times the whole map, at once with reduced motion), not once you've zoomed in, and a generated world's fit button shows it whole`);
  await c.close();
}

// On a touch screen the map keeps clear of the screen's sides, where Android's back gesture starts: 24 px from where a
// finger reaches it to the edge of the screen, at any phone width. With a mouse, the page keeps its own margin.
for (const [width, height] of [[320, 568], [360, 740], [390, 844], [412, 915]]) {
  const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const m = await pg.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { left: r.left, right: innerWidth - r.right, wide: document.documentElement.scrollWidth <= innerWidth }; });
  ok(m.left >= 23.5 && m.right >= 23.5 && m.wide, `the map is ${Math.min(m.left, m.right).toFixed(1)} px from the screen's side on a ${width} px touch screen`);
  await c.close();
}
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  ok(await pg.evaluate(() => Math.round(document.getElementById('map').getBoundingClientRect().left)) === 17, 'with a mouse the map keeps the page\'s own margin');
  await c.close();
}

// On a phone the World tab is under the map, so on one under 700 px tall, where the map isn't kept in view, the map is
// scrolled out of view while it is used. A toast from there is still on screen, at its bottom, with an Undo a finger can
// reach: it used to sit inside the map, above the screen.
{
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.tap('#tab-world');
  const seen = async () => {
    await pg.waitForTimeout(300);
    return pg.evaluate(() => {
      const t = document.getElementById('toast'), r = t.getBoundingClientRect(), b = t.querySelector('button'), br = b && b.getBoundingClientRect();
      const top = b && document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return { text: t.querySelector('span').textContent, inside: !t.hidden && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, tappable: !!top && b.contains(top), mapOff: document.getElementById('mapwrap').getBoundingClientRect().bottom < 0 };
    });
  };
  const places = async () => (await pg.evaluate(() => window.terra.state())).places;
  const all = await places(), land = (await pg.evaluate(() => window.terra.state())).land;
  await pg.locator('#wClear').scrollIntoViewIfNeeded();
  await pg.tap('#wClear');
  const cleared = await seen();
  await pg.tap('#toast button');
  ok(cleared.mapOff && cleared.inside && cleared.tappable && cleared.text.startsWith('Cleared') && await places() === all, `on a phone, Clear places and labels with the map scrolled away shows its toast on screen, and its Undo works ("${cleared.text}")`);
  // A tap far along the sea slider raises the sea over towns.
  await pg.waitForTimeout(300);
  await pg.locator('#wSea').scrollIntoViewIfNeeded();
  const sb = await pg.locator('#wSea').boundingBox();
  await pg.touchscreen.tap(sb.x + sb.width * 0.85, sb.y + sb.height / 2);
  const rose = await seen(), drownedNow = await places();
  await pg.tap('#toast button');
  await pg.waitForTimeout(300);
  ok(rose.mapOff && rose.inside && rose.tappable && rose.text.startsWith('The sea rose over') && drownedNow === all && (await pg.evaluate(() => window.terra.state())).land === land, `and so does the sea rising over places from the sea slider ("${rose.text}")`);
  await c.close();
}

// A Back that comes while a coast is being sketched, or just after the browser took the touch away from the map (as
// Android's back gesture does when a finger near the screen's side is taken for it), is taken for a slip: the world
// stays, as it was. A while later, Back leaves the page in one press, as it always has: the guard's extra history entry
// goes on when a finger touches the map and comes off a second after it lifts.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto('about:blank');
  await pg.goto(base);
  await pg.evaluate(() => { window.terra.startBlank(); window.stayed = true; });
  const b = await pg.locator('#map').boundingBox();
  const at = async ([x, y]) => { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); return { x: b.x + p.x, y: b.y + p.y }; };
  const touch = async (type, cell) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: cell ? [await at(cell)] : [] });
  const stayed = async () => { await pg.waitForTimeout(300); return pg.evaluate(() => window.stayed === true).catch(() => false); };
  const loop = [[6, 60], [80, 40], [150, 70], [160, 160], [90, 220], [10, 170], [6, 80]];
  const guarded = () => pg.evaluate(() => history.state?.__edgeGuard === true);
  await pg.click('.tool[data-tool="sketch"]');
  ok(!(await guarded()), 'no extra history entry while nothing is being sketched');
  // Back in the middle of a coast: the sketch carries on, and letting go raises the land.
  await touch('touchStart', loop[0]);
  ok(await guarded(), 'a finger on the map adds the extra entry');
  for (const p of loop.slice(1, 4)) await touch('touchMove', p);
  await pg.evaluate(() => history.back()).catch(() => {}); // (without the guard, the page goes)
  ok(await stayed(), 'Back in the middle of a sketch stays on the world');
  for (const p of loop.slice(4)) await touch('touchMove', p);
  await touch('touchEnd');
  await pg.waitForTimeout(300);
  const raised = await pg.evaluate(() => window.terra.state());
  ok(raised.land > 1000, `and the coast sketched across the Back still raises land (${raised.land} cells)`);
  await pg.waitForTimeout(1100);
  ok(!(await guarded()), 'and a second after letting go, the entry is gone');
  // The browser takes the touch and a Back follows: the half-sketched coast goes, and the world is as it was.
  await touch('touchStart', [200, 60]);
  for (const p of [[260, 50], [320, 90], [330, 160]]) await touch('touchMove', p);
  await touch('touchCancel');
  await pg.goBack({ waitUntil: 'commit', timeout: 2000 }).catch(() => {});
  ok(await stayed(), 'Back just after the touch was taken stays on the world');
  ok(JSON.stringify(await pg.evaluate(() => window.terra.state())) === JSON.stringify(raised), 'and the world is as it was');
  // A while later, Back leaves in one press.
  await pg.click('.tool[data-tool="select"]');
  await pg.waitForTimeout(1300);
  ok(!(await guarded()), 'with nothing being sketched, there is no extra entry to press Back through');
  await pg.goBack({ waitUntil: 'commit', timeout: 2000 }).catch(() => {});
  for (let t = 0; t < 30 && pg.url() !== 'about:blank'; t++) await new Promise((r) => setTimeout(r, 100));
  ok(pg.url() === 'about:blank', 'a deliberate Back leaves the page in one press');
  await c.close();
}

// A browser that won't keep the autosave says so over the map, not only in the World tab.
const full = await browser.newContext({ viewport: { width: 390, height: 844 } });
await full.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
const fullPage = watch(await full.newPage());
await fullPage.goto(base);
ok(await fullPage.evaluate(() => { const t = document.getElementById('toast'); return !t.hidden && t.textContent.includes('would not keep an autosave'); }), 'a browser that will not keep the world says so');
await full.close();

// A world kept in this browser that the page can't read is copied aside before anything is saved over it, and the
// page says so. This one was cut short.
const openStored = async (stored) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('terra-incognita/world/v1', s); } }, stored);
  const pg = watch(await ctx.newPage());
  await pg.goto(base);
  const got = await pg.evaluate(() => ({ toast: document.getElementById('toast').textContent, kept: localStorage.getItem('terra-incognita/world/unreadable'), now: JSON.parse(localStorage.getItem('terra-incognita/world/v1')), name: window.terra.state().name }));
  await ctx.close();
  return got;
};
const cutShort = JSON.stringify(saved).slice(0, 5000), cutOpen = await openStored(cutShort);
ok(cutOpen.kept === cutShort && cutOpen.now.version === 1 && cutOpen.toast.startsWith('Your saved world could not be read'), 'a saved world the page cannot read is kept aside, and it says so');
// So is one saved by a newer version, rather than opened half-read and then saved back over as this version.
const future = JSON.stringify({ ...saved, version: 2, name: 'A future world' }), futureOpen = await openStored(future);
ok(futureOpen.kept === future && futureOpen.name !== 'A future world' && futureOpen.now.version === 1, 'and so is one saved by a newer version');

// The toast points at Download the old save in the World tab, which saves the kept text as a file, exactly as it was
// stored, and changes nothing in storage. The link is there only while a save is kept aside.
const oldSaveHidden = (pg) => pg.evaluate(() => document.getElementById('wOldSave').hidden);
ok(await oldSaveHidden(page), 'there is no Download the old save in a browser whose save opened');
const oldCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const oldText = JSON.stringify({ ...saved, name: 'Øresund — Ōmi' }).slice(0, 5000);
await oldCtx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('terra-incognita/world/v1', s); } }, oldText);
const oldPage = watch(await oldCtx.newPage());
await oldPage.goto(base);
const oldToast = await oldPage.textContent('#toast');
await oldPage.click('#tab-world');
ok(oldToast.includes('Download the old save is in the World tab') && await oldPage.locator('#wOldSaveLink').isVisible(), 'the toast points at Download the old save in the World tab, and it is there');
const storage = () => oldPage.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
const storedBefore = await storage();
const [oldDl] = await Promise.all([oldPage.waitForEvent('download'), oldPage.click('#wOldSaveLink')]);
const oldBytes = await readFile(await oldDl.path());
ok(oldBytes.equals(Buffer.from(oldText, 'utf8')) && oldDl.suggestedFilename() === 'terra-incognita-old-save.json', `it saves exactly the text that was kept, as ${oldDl.suggestedFilename()} (${oldBytes.length} bytes)`);
ok((await storage()) === storedBefore, 'and leaves storage as it was');
await oldPage.reload();
await oldPage.click('#tab-world');
ok(await oldPage.locator('#wOldSaveLink').isVisible() && await oldPage.locator('#toast').isHidden(), 'it is still there on the next visit, with no toast this time');
await oldPage.evaluate(() => localStorage.removeItem('terra-incognita/world/unreadable'));
await oldPage.reload();
await oldPage.click('#tab-world');
ok(await oldSaveHidden(oldPage), 'and gone once no old save is kept');
await oldCtx.close();
// Saving, said plainly. In Claude's viewer, where the view has no storage, the warning says the view can't keep an
// autosave rather than blaming the person's browser.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('denied', 'SecurityError'); };
    window.claude = { use: (n) => n === 'downloads' ? Promise.resolve({ save: async () => {} }) : Promise.reject(Object.assign(new Error('off'), { code: 'not_declared' })) };
  });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const said = await pg.evaluate(() => [document.getElementById('toast').textContent, document.getElementById('wSaveNote').textContent]);
  ok(said[0] === "This view can't keep an autosave. Use Save world file to keep your work." && said[1] === said[0], `in Claude's viewer the autosave warning is about the view ("${said[0]}")`);
  await c.close();
}
// Typing a world name after an Undo is a step of its own, even with the box still focused (as after a tap on Undo on a
// phone, which leaves the keyboard up). It used to join the step before, which Undo had already taken back.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const name = await pg.inputValue('#worldName');
  await pg.focus('#worldName');
  await pg.keyboard.press('End');
  await pg.keyboard.type(' One');
  await pg.evaluate(() => document.getElementById('btnUndo').click());
  const back = await pg.inputValue('#worldName');
  await pg.keyboard.press('End');
  await pg.keyboard.type(' Two');
  const typed = await pg.inputValue('#worldName');
  await pg.evaluate(() => document.getElementById('btnUndo').click());
  const after = await pg.evaluate(() => [document.getElementById('worldName').value, document.activeElement.id]);
  ok(back === name && typed === name + ' Two' && after[0] === name && after[1] === 'worldName', `a name typed after an Undo is its own step: Undo takes "${typed}" back to "${after[0]}"`);
  await c.close();
}
// Once the old save has been downloaded it can be removed from the browser. A second save the page can't read doesn't
// replace the one kept aside: it's offered as a download instead.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await c.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('terra-incognita/world/v1', '{"format":"terra-incognita","version":1,"cut'); } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const kept = () => pg.evaluate(() => localStorage.getItem('terra-incognita/world/unreadable'));
  const first = await kept();
  await pg.evaluate(() => { localStorage.setItem('terra-incognita/world/v1', '{"format":"terra-incognita","version":1,"second'); });
  await pg.reload();
  const toast = await pg.textContent('#toast');
  ok((await kept()) === first && toast.includes('An older save is kept in this browser already') && toast.endsWith('Download it'), 'a second save the page cannot read leaves the one kept aside, and says so');
  const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#toast button')]);
  ok((await readFile(await dl2.path(), 'utf8')).endsWith('"second') , `and its Download it saves that second one (${dl2.suggestedFilename()})`);
  await pg.click('#tab-world');
  ok(await pg.locator('#wOldSaveDrop').isHidden(), 'Remove it from this browser waits until the old save has been downloaded');
  await Promise.all([pg.waitForEvent('download'), pg.click('#wOldSaveLink')]);
  await pg.click('#wOldSaveDrop');
  ok((await kept()) === null && await pg.locator('#wOldSave').isHidden() && (await pg.textContent('#toast')) === 'Removed the old save from this browser.', 'once downloaded, Remove it from this browser lets it go');
  ok(await pg.locator('#pane-world .note', { hasText: 'Save world file keeps a copy that lasts' }).isVisible(), 'the World tab says a browser can clear what it keeps, and the file lasts');
  await c.close();
}

// A seed and shape keep growing the same world, since people may have written seeds down: the saved heights and
// rainfall, and the names, of five worlds, as sha1 (first 12 hex). If one of these fails, generation has changed: that
// is Mark's call, so take it to him with before and after pictures of these worlds rather than changing the numbers.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const changed = [];
  for (const [seed, shape, h, m, names] of [
    [20417, 'continent', '8b20efbd125e', '5a1b133e1280', '2ba02b08e72a'],
    [96298, 'continent', '736cd99437ab', '0b2596e96d31', 'dfbfe15247cb'],
    [950281, 'inland', '7ff144f0176e', '1afc775afd2b', '38f0d6c72332'],
    [857490, 'twin', '6c377492048c', 'e7bb04ba7404', '60140eb60cda'],
    [645278, 'inland', '358737c747f0', '049431645c33', '143fd960bf84'],
  ]) {
    const f = await pg.evaluate(([seed, shape]) => { window.terra.newWorld(seed, shape); return window.terra.fingerprint(); }, [seed, shape]);
    if (f.h !== h || f.m !== m || f.names !== names) changed.push(`${seed} ${shape}: h ${f.h}, m ${f.m}, names ${f.names}`);
  }
  ok(changed.length === 0, 'five seeds grow the same worlds as before' + (changed.length ? '. Generation changed, which must go to Mark with before and after pictures:\n' + changed.join('\n') : ''));
  // Each realm has its own tongue, so every town and village in it is named in that tongue, the few villages founded
  // where no realm reached yet included, once the realms' borders take them in.
  const foreign = [];
  for (const [seed, shape] of [[96298, 'continent'], [857490, 'twin'], [645278, 'inland'], [15939, 'continent'], [53527, 'continent']]) {
    const ps = await pg.evaluate(([seed, shape]) => { window.terra.newWorld(seed, shape); return window.terra.places(); }, [seed, shape]);
    for (const p of ps) if (p.kind !== 'capital' && p.kind !== 'landmark' && p.landTongue && p.tongue !== p.landTongue) foreign.push(`${seed} ${p.name} (${p.tongue} in a ${p.landTongue} realm)`);
  }
  ok(foreign.length === 0, 'every town and village is named in the tongue of the realm it stands in' + (foreign.length ? ': ' + foreign.join(', ') : ''));
  await c.close();
}

// Realm borders follow the land: a big river is dear to cross, so where two realms meet near one the border follows it
// (it lay on or beside a big river less often than the land does, 1.8% of border cells against 3.7%); a realm's reach
// wanders with the world's seed, so the same land and towns under another seed draw other borders (where a realm met
// unclaimed land its edge was a smooth arc); and the number of realms is one more or one fewer than the land alone
// gives, as the seed has it (every continent had five).
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  let border = 0, beside = 0, land = 0, landBeside = 0;
  for (const [seed, shape] of [[20417, 'continent'], [222, 'continent'], [15939, 'twin'], [96298, 'continent'], [53527, 'continent'], [8020, 'twin']]) {
    const b = await pg.evaluate(([seed, shape]) => { window.terra.newWorld(seed, shape); return window.terra.borderStats(); }, [seed, shape]);
    border += b.border; beside += b.beside; land += b.land; landBeside += b.landBeside;
  }
  const onRiver = beside / border, chance = landBeside / land;
  ok(onRiver > chance * 1.3, `realm borders lie on or beside big rivers more often than the land does (${(onRiver * 100).toFixed(1)}% of border cells, ${(chance * 100).toFixed(1)}% of land)`);
  const counts = [];
  for (const seed of [11, 222, 3333, 20417, 96298, 53527, 4242, 777, 31337]) counts.push(await pg.evaluate((seed) => { window.terra.newWorld(seed, 'continent'); return window.terra.state().realms; }, seed));
  ok(new Set(counts).size >= 3 && Math.max(...counts) - Math.min(...counts) <= 2, `continents have different numbers of realms from seed to seed (${counts.join(', ')})`);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const first = await pg.evaluate(() => window.terra.borderStats().owners), o = JSON.parse(await pg.evaluate(() => window.terra.worldText()));
  await pg.click('#tab-world');
  await pg.setInputFiles('#wFile', { name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...o, seed: 4242 })) });
  await pg.waitForFunction(() => window.terra.state().seed === 4242);
  const other = await pg.evaluate(() => [window.terra.borderStats().owners, window.terra.state().places]);
  await pg.setInputFiles('#wFile', { name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(o)) });
  await pg.waitForFunction(() => window.terra.state().seed === 20417);
  const again = await pg.evaluate(() => window.terra.borderStats().owners);
  ok(other[1] === o.places.length && other[0] !== first && again === first, `the same land and towns under another seed draw other borders, and under its own seed the same ones (${first}, ${other[0]}, ${again})`);
  await c.close();
}

// Realms whose land meets get colours that stay apart for colour-blind viewers: never Red beside Olive or Rose, nor
// Blue, Purple and Indigo beside each other, nor the other pairs a simulation of colour blindness makes look alike.
// Colours were picked without looking at the neighbours (on 20417 the Blue realm bordered the Indigo and the Purple).
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const alike = new Set([['Purple', 'Indigo'], ['Red', 'Olive'], ['Blue', 'Purple'], ['Olive', 'Orange'], ['Ochre', 'Orange'], ['Teal', 'Rose'], ['Blue', 'Indigo'], ['Ochre', 'Olive'], ['Blue', 'Teal'], ['Red', 'Rose']].flatMap(([a, b]) => [a + b, b + a]));
  const bad = [], pairs = [];
  for (const [seed, shape] of [[20417, 'continent'], [11, 'continent'], [222, 'continent'], [3333, 'continent'], [15939, 'twin'], [950281, 'inland'], [8020, 'archipelago'], [53527, 'continent']]) {
    const rs = await pg.evaluate(([seed, shape]) => { window.terra.newWorld(seed, shape); return window.terra.realms(); }, [seed, shape]);
    const colours = rs.map((r) => r.color);
    if (new Set(colours).size !== colours.length) bad.push(`${seed}: two realms share a colour (${colours.join(', ')})`);
    rs.forEach((r, k) => r.neighbours.forEach((j) => { if (j < k) return; pairs.push(1); if (alike.has(r.color + rs[j].color)) bad.push(`${seed}: ${r.name} (${r.color}) beside ${rs[j].name} (${rs[j].color})`); }));
  }
  ok(bad.length === 0 && pairs.length > 20, `neighbouring realms never get colours that look alike to colour-blind viewers (${pairs.length} borders in 8 worlds)` + (bad.length ? ': ' + bad.join('; ') : ''));
  await c.close();
}

// Generated sea names follow the water. Bay, Gulf and Sound sit only on an inlet, water with land on three sides (125 of
// 126 lay more than 300 km out in open ocean); an Inland sea world's sea is named, after its title ('The Shores of X'
// lies on the X Sea; in 15 of 40 it had no name); and a lake of 30,000 km² or more has a name on it (none had).
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const inlets = [], open = [], inland = [], lakes = [];
  for (const [seed, shape] of [[20417, 'continent'], [53527, 'continent'], [96298, 'continent'], [11, 'continent'], [222, 'continent'], [15939, 'twin'], [8020, 'twin'], [950281, 'inland'], [645278, 'inland'], [4242, 'inland'], [777, 'inland'], [31337, 'inland']]) {
    const r = await pg.evaluate(([seed, shape]) => {
      window.terra.newWorld(seed, shape);
      const t = window.terra, out = { name: t.state().name, inlets: [], inland: null, lake: null };
      for (const l of t.labels()) {
        if (l.kind !== 'sea' || !/^(Bay of|Gulf of|The .+ Sound$)/.test(l.text)) continue;
        let hits = 0;
        for (let a = 0; a < 16; a++) for (let r = 1; r <= 32; r++) { const x = l.x + Math.cos(a * Math.PI / 8) * r, y = l.y + Math.sin(a * Math.PI / 8) * r; if (x < 0 || y < 0 || x >= 480 || y >= 300) break; if (t.cell(x, y).h >= 0) { hits++; break; } }
        out.inlets.push([l.text, hits]);
      }
      const m = /^The Shores of (.+)$/.exec(out.name) || /^The (.+) Basin$/.exec(out.name);
      if (m) { const l = t.labels().find((q) => q.text === `The ${m[1]} Sea`); out.inland = l ? [l.text, t.water(l.x, l.y)] : [`no The ${m[1]} Sea`, null]; }
      // The biggest lake, and the labels on it.
      let big = null;
      for (let y = 0; y < 300; y += 2) for (let x = 0; x < 480; x += 2) { const w = t.cell(x + 0.5, y + 0.5).lake && t.water(x + 0.5, y + 0.5); if (w && (!big || w.cells > big.cells)) big = { cells: w.cells, x, y }; if (big && big.cells >= 300) break; }
      if (big && big.cells >= 300) out.lake = [big.cells, t.labels().filter((l) => l.kind === 'sea' && t.cell(l.x, l.y).lake && t.water(l.x, l.y).cells === big.cells).map((l) => l.text)];
      return out;
    }, [seed, shape]);
    for (const [text, hits] of r.inlets) (hits >= 10 ? inlets : open).push(`${seed} ${text} (land in ${hits} of 16 directions)`);
    if (r.inland) inland.push(`${seed} ${r.inland[0]}${r.inland[1] && !r.inland[1].lake && !r.inland[1].open ? '' : ' NOT ON AN ENCLOSED SEA'}`);
    if (r.lake) lakes.push(`${seed} ${r.lake[0]} cells: ${r.lake[1].join(', ') || 'NO NAME'}`);
  }
  ok(inlets.length >= 6 && open.length === 0, `Bay, Gulf and Sound name only inlets with land on three sides (${inlets.length} in 12 worlds)` + (open.length ? '; in open water: ' + open.join(', ') : ''));
  ok(inland.length >= 4 && inland.every((t) => !/NOT|^\d+ no /.test(t)), `an Inland sea world's sea takes the name in its title (${inland.join('; ')})`);
  ok(lakes.length >= 3 && lakes.every((t) => !t.includes('NO NAME')), `the biggest lake of 30,000 km² or more has a name (${lakes.join('; ')})`);
  await c.close();
}

// A Sea label left blank on water that already has a name opens that name rather than making up a second one for the
// same water, and offers to name a bay there instead.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.setTool('label'); });
  await pg.click('.chip[data-v="sea"]');
  const before = await pg.evaluate(() => window.terra.labels());
  const ocean = before.find((l) => l.kind === 'sea' && !/^(Bay|Gulf|Lake)/.test(l.text));
  // A spot on the same water, 20 cells below the name.
  const spot = await pg.evaluate(([x, y]) => { for (let d = 20; d < 60; d += 4) for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0]]) { const w = window.terra.water(x + dx, y + dy), here = window.terra.water(x, y); if (w && !w.lake && here && w.cells === here.cells) return [x + dx, y + dy]; } return null; }, [ocean.x, ocean.y]);
  const b = await pg.locator('#map').boundingBox(), at = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), spot);
  await pg.mouse.click(b.x + at.x, b.y + at.y);
  await pg.waitForTimeout(200);
  const said = await pg.textContent('#toast span'), opened = await pg.inputValue('#lText'), after = await pg.evaluate(() => window.terra.labels().length);
  await pg.click('#toast button');
  const bay = (await pg.evaluate(() => window.terra.labels())).filter((l) => !before.some((o) => o.id === l.id));
  ok(said === `${ocean.text} is already named here. Name a bay instead?` && opened === ocean.text && after === before.length && bay.length === 1 && /^Bay of /.test(bay[0].text),
    `a blank Sea label on water already named opens its name and offers a bay instead ("${said}", then ${bay.map((l) => l.text).join(', ')})`);
  await c.close();
}

// Roads: each capital's road runs to every settlement of its realm and to the capitals of the realms beside it, over dry
// land, along easy ground (lower than the straight line between its ends, and beside rivers more than the land is);
// a Roads layer turns them off; and a town's page says which road it is on.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const missing = [], wet = [], tally = { roadUp: 0, lineUp: 0, roadRiver: 0, roadCells: 0, landRiver: 0, land: 0, links: 0 };
  for (const [seed, shape] of [[20417, 'continent'], [11, 'continent'], [222, 'continent'], [15939, 'twin']]) {
    await pg.evaluate(([seed, shape]) => window.terra.newWorld(seed, shape), [seed, shape]);
    const q = await pg.evaluate(() => {
      const t = window.terra, places = t.places(), roads = t.roads(), realms = t.realms(), out = { missing: [], wet: [], roadUp: 0, lineUp: 0, roadRiver: 0, roadCells: 0, landRiver: 0, land: 0, links: 0 };
      // Which stretch of dry land each cell is on (a road can't cross sea or lakes), so places on different islands are
      // let off.
      const land = new Int32Array(480 * 300).fill(-1); let nl = 0;
      for (let s0 = 0; s0 < 480 * 300; s0++) {
        if (land[s0] >= 0) continue; const c0 = t.cell(s0 % 480 + 0.5, Math.floor(s0 / 480) + 0.5); if (c0.h < 0 || c0.lake) continue;
        const st = [s0]; land[s0] = nl;
        while (st.length) { const c = st.pop(), x = c % 480, y = Math.floor(c / 480); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy, n = ny * 480 + nx; if (nx < 0 || ny < 0 || nx >= 480 || ny >= 300 || land[n] >= 0) continue; const cl = t.cell(nx + 0.5, ny + 0.5); if (cl.h < 0 || cl.lake) continue; land[n] = nl; st.push(n); } }
        nl++;
      }
      const byId = new Map(places.map((p) => [p.id, p])), on = (id) => { const p = byId.get(id); return land[Math.floor(p.y) * 480 + Math.floor(p.x)]; };
      const has = (a, b) => roads.some((rd) => (rd.from === a && rd.to === b) || (rd.from === b && rd.to === a)) || on(a) !== on(b);
      for (const p of places) if (p.kind !== 'capital' && p.kind !== 'landmark' && p.capital && !has(p.id, p.capital)) out.missing.push(`${p.name} has no road to its capital`);
      const named = (id) => byId.get(id).name;
      realms.forEach((rm, k) => rm.neighbours.forEach((j) => { if (j < k) return; out.links++; if (!has(rm.capital, realms[j].capital)) out.missing.push(`no road from ${named(rm.capital)} to ${named(realms[j].capital)}`); }));
      const near = (x, y) => t.riverNear(x + 0.5, y + 0.5, 1.5);
      for (const rd of roads) {
        for (const [x, y] of rd.cells) { const cl = t.cell(x + 0.5, y + 0.5); if (cl.h < 0 || cl.lake) out.wet.push(`${x},${y}`); out.roadUp += cl.elev; out.roadCells++; if (near(x, y)) out.roadRiver++; }
        const [x0, y0] = rd.cells[0], [x1, y1] = rd.cells.at(-1), n = rd.cells.length;
        for (let k = 0; k < n; k++) out.lineUp += Math.max(0, t.cell(x0 + (x1 - x0) * k / n + 0.5, y0 + (y1 - y0) * k / n + 0.5).elev);
      }
      for (let y = 0; y < 300; y += 3) for (let x = 0; x < 480; x += 3) { const cl = t.cell(x + 0.5, y + 0.5); if (cl.h < 0 || cl.lake) continue; out.land++; if (near(x, y)) out.landRiver++; }
      return out;
    });
    missing.push(...q.missing.map((m) => `${seed}: ${m}`)); wet.push(...q.wet.slice(0, 3).map((m) => `${seed}: ${m}`));
    for (const k of Object.keys(tally)) tally[k] += q[k];
  }
  ok(missing.length === 0 && wet.length === 0 && tally.roadCells > 1000, `every settlement in a realm has a road to its capital, and every capital one to each neighbour's, over dry land (${tally.roadCells} cells of road)` + (missing.length || wet.length ? ': ' + missing.concat(wet).slice(0, 8).join('; ') : ''));
  ok(tally.roadUp < tally.lineUp * 0.85 && tally.roadRiver / tally.roadCells > tally.landRiver / tally.land, `roads keep to lower ground than the straight line (on average ${Math.round(tally.roadUp / tally.roadCells)} m up against ${Math.round(tally.lineUp / tally.roadCells)} m) and to rivers more than the land does (${Math.round(tally.roadRiver / tally.roadCells * 100)}% of road beside a river, ${Math.round(tally.landRiver / tally.land * 100)}% of land)`);
  // The Roads layer.
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const withRoads = await pg.evaluate(() => window.terra.mapImage(1, false));
  await pg.click('#tab-world'); await pg.uncheck('#lyRoads');
  const without = await pg.evaluate(() => window.terra.mapImage(1, false));
  await pg.check('#lyRoads');
  ok(withRoads !== without && withRoads === await pg.evaluate(() => window.terra.mapImage(1, false)), 'the Roads layer turns the roads off and on');
  // A town's page: the road it is on, with links to the places at its ends; a capital's, where its roads go.
  const ps = await pg.evaluate(() => window.terra.places());
  const page = (p) => pg.evaluate((id) => { window.terra.select({ type: 'place', id }); const dt = [...document.querySelectorAll('#pane-inspect .facts dt')].find((d) => /^Roads?$/.test(d.textContent)); return dt ? [dt.textContent, dt.nextElementSibling.textContent, [...dt.nextElementSibling.querySelectorAll('button[data-goto]')].length] : null; }, p.id);
  const town = ps.find((p) => p.kind === 'town' && p.capital), cap = ps.find((p) => p.kind === 'capital');
  const [tRow, cRow] = [await page(town), await page(cap)];
  ok(tRow && tRow[0] === 'Road' && /^On the road (from .+ to .+|to .+, \d+ leagues? \([\d,]+ km\))$/.test(tRow[1]) && tRow[2] >= 1 && cRow && cRow[0] === 'Roads' && /^To its \d+ settlements?( and to .+)?$/.test(cRow[1]),
    `a town's page says the road it is on, and a capital's where its roads go ("${tRow && tRow[1]}", "${cRow && cRow[1]}")`);
  await c.close();
}

// A road of your own: the Sketch tool's Road mode draws one where you draw it, named by the places at its ends, kept
// through a reload and in the world file; Erase on it takes it away, and Undo brings it back. Erase on a road between
// towns says those come and go with the towns.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const ps = await pg.evaluate(() => window.terra.places());
  // Two settlements 40 to 80 cells apart, drawn between in a gentle curve.
  let a = null, b = null;
  for (const p of ps) for (const q of ps) if (!a && p.kind !== 'landmark' && q.kind !== 'landmark' && p.id < q.id && Math.hypot(p.x - q.x, p.y - q.y) > 40 && Math.hypot(p.x - q.x, p.y - q.y) < 80) { a = p; b = q; }
  const line = []; for (let k = 0; k <= 8; k++) { const t = k / 8; line.push([a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * 4, a.y + (b.y - a.y) * t]); }
  await pg.evaluate(() => window.terra.setTool('sketch'));
  await pg.click('.chip[data-v="road"]');
  await drag(line, 6, pg);
  const drew = await pg.textContent('#toast span'), roads = await pg.evaluate(() => window.terra.drawnRoads());
  const inText = (p) => p.name.replace(/^The /, 'the ');
  ok(roads.length === 1 && roads[0].length >= 30 && drew === `Drew a road from ${inText(a)} to ${inText(b)}.`, `the Road sketch draws a road where it is drawn, named by its ends ("${drew}", ${roads[0] && roads[0].length / 2} points)`);
  await pg.waitForTimeout(1200);
  await pg.reload(); await pg.waitForFunction(() => window.terra && window.terra.state().places > 0);
  const kept = await pg.evaluate(() => window.terra.drawnRoads().length), file = JSON.parse(await pg.evaluate(() => window.terra.worldText()));
  ok(kept === 1 && Array.isArray(file.roads) && file.roads.length === 1 && file.roads[0].pts.length === roads[0].length, 'the road is kept through a reload and goes in the world file');
  await pg.evaluate(() => window.terra.setTool('erase'));
  // The point on a line farthest from any place or label, so Erase finds the road there rather than a place.
  const clear = (pts) => pg.evaluate((pts) => { const t = window.terra, things = t.places().concat(t.labels()); let best = null, bd = -1; for (const [x, y] of pts) { const d = Math.min(...things.map((q) => Math.hypot(q.x - x, q.y - y))); if (d > bd) { bd = d; best = [x, y]; } } return best; }, pts);
  const pts = []; for (let k = 0; k < roads[0].length; k += 2) pts.push([roads[0][k], roads[0][k + 1]]);
  const mid = await clear(pts), box = await pg.locator('#map').boundingBox(), at = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), mid);
  await pg.mouse.click(box.x + at.x, box.y + at.y);
  await pg.waitForTimeout(200);
  const erased = [await pg.textContent('#toast span'), await pg.evaluate(() => window.terra.drawnRoads().length)];
  await pg.click('#toast button');
  const back = await pg.evaluate(() => window.terra.drawnRoads().length);
  ok(erased[0] === 'Took away the road.' && erased[1] === 0 && back === 1, `Erase on a drawn road takes it away and Undo brings it back ("${erased[0]}")`);
  // With the Roads layer off, the road isn't shown, so Erase there leaves it be, as it does a hidden label.
  await pg.click('#tab-world'); await pg.uncheck('#lyRoads');
  await pg.mouse.click(box.x + at.x, box.y + at.y);
  await pg.waitForTimeout(200);
  const hidden = [await pg.textContent('#toast span'), await pg.evaluate(() => window.terra.drawnRoads().length)];
  await pg.check('#lyRoads');
  ok(hidden[1] === 1 && hidden[0].startsWith('Nothing to remove there.'), `Erase doesn't take away a road the Roads layer hides ("${hidden[0]}")`);
  // Erase on a road between towns: the longest one, where it is farthest from any place.
  const town = await clear(await pg.evaluate(() => window.terra.roads().sort((p, q) => q.cells.length - p.cells.length)[0].cells.map(([x, y]) => [x + 0.5, y + 0.5])));
  const tAt = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), town);
  await pg.mouse.click(box.x + tAt.x, box.y + tAt.y);
  await pg.waitForTimeout(200);
  const said = await pg.textContent('#toast span');
  ok(said.startsWith('That road joins towns, so it comes and goes with them.'), `Erase on a road between towns says it comes and goes with them ("${said}")`);
  await c.close();
}

// No two realms share a name. A realm's name was drawn without looking at the others, so now and then two came out
// the same (two Oaklands among 30 realms). Here two towns of one tongue are made capitals with the same roll of the
// dice, which drew the same name for both.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const places = await pg.evaluate(() => window.terra.places());
  const pair = places.filter((p) => p.kind === 'town').find((p, k, all) => all.some((q) => q !== p && q.tongue === p.tongue));
  const other = places.find((q) => q.kind === 'town' && q.id !== pair.id && q.tongue === pair.tongue);
  const realms = [];
  for (const t of [pair, other]) {
    await pg.evaluate((id) => {
      let a = 7; // the same dice for both
      Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      window.terra.select({ type: 'place', id });
    }, t.id);
    await pg.selectOption('#pKind', 'capital');
    realms.push(await pg.inputValue('#rName'));
  }
  ok(realms[0] !== realms[1], `two towns made capitals with the same dice get realms of different names (${realms.join(', ')})`);
  await c.close();
}

// Syllables thrown together can spell a slur or a crude word ('Bay of Cunt' was on one continent), or a bare English
// word that breaks a sentence (a village called 'The'). Every tongue draws 50,000 names, a third each bare, for a realm
// and plain, as towns, rivers, seas, landmarks and realms get them, and none is one of those.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const found = await pg.evaluate(() => {
    const unfit = /cunt|fuck|shit|nig|fag|rape|kike|coon|paki|spic|dyke|wank|twat|slut|whore|turd|poo|bum|sex|tard|anus|anal|porn|nazi|homo|jizz|spunk|cock|dick|piss|cum|arse|vag|^(pus|tit)|(pus|tit)$|^(the|and|of|an?)$/;
    const out = [];
    for (const t of ['north', 'imperial', 'sylvan', 'ember', 'vale', 'lilting']) {
      const names = window.terra.names(t, 50000, 7);
      out.push([t, names.length, new Set(names).size, names.filter(n => unfit.test(n.toLowerCase()) || n === 'Nameless')]);
    }
    return out;
  });
  ok(found.every(([, n, u, bad]) => n === 50000 && u > 500 && bad.length === 0), 'no generated name is a slur, a crude word or a bare English word' + found.filter(f => f[3].length).map(([t, , , bad]) => `; ${t}: ${[...new Set(bad)].slice(0, 12).join(', ')}`).join(''));
  await c.close();
}

// A capital made a town ends its realm, and says where its places went; made a capital again, it brings back the same
// realm, name, title and colour, rather than founding a new one. Switching a village to a town and back keeps its
// population after the first time, rather than rolling a new one each time.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const { id: riiel, name: riielName } = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital'));
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), riiel);
  const realm = () => pg.evaluate(() => ({ name: document.getElementById('rName')?.value, title: document.getElementById('rTitle')?.value, color: document.querySelector('[data-color][aria-pressed=true]')?.dataset.color, realms: window.terra.state().realms }));
  const before = await realm();
  // The settlements the realm's page counts, the capital among them, are the ones the toast says went.
  const counted = () => pg.evaluate(() => +[...document.querySelectorAll('#pane-inspect .note')].map((n) => n.textContent.match(/km², (\d+) settlements?/)).find(Boolean)[1]);
  const settlements = await counted();
  await pg.selectOption('#pKind', 'town');
  const toast = await pg.textContent('#toast span'), mid = await realm();
  ok(mid.realms === before.realms - 1 && new RegExp(`^The ${before.title} of ${before.name} is no longer a realm\\. (Its ${settlements} settlements now belong to|Of its ${settlements} settlements, )`).test(toast) && await pg.locator('#toast button', { hasText: 'Undo' }).isVisible(), `a capital made a town ends its realm and says where its ${settlements} settlements went, as its page counts them ("${toast}")`);
  await pg.selectOption('#pKind', 'capital');
  const after = await realm();
  ok(JSON.stringify(after) === JSON.stringify(before), `made a capital again, it rules the same realm (${before.title} of ${before.name}, ${before.color}; then ${after.title} of ${after.name}, ${after.color})`);
  // Removing a capital ends its realm too, and says so: it said only 'Removed Riiel.' It names where the realm's other
  // settlements went, one fewer than its page counted, since the capital itself is gone.
  await pg.click('#pDelete');
  const removed = await pg.textContent('#toast span');
  ok(new RegExp(`^Removed ${riielName}\\. The ${before.title} of ${before.name} is no longer a realm\\. (Its ${settlements - 1} other settlements now belong to|Of its ${settlements - 1} other settlements, )`).test(removed) && (await realm()).realms === before.realms - 1, `removing a capital says its realm is no more, and where its other settlements went ("${removed}")`);
  await pg.click('#toast button');
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), riiel);
  const pop = () => pg.evaluate(() => { const dd = [...document.querySelectorAll('#pane-inspect .facts dd')].find((d) => d.previousElementSibling.textContent === 'Population'); return dd ? +dd.querySelector('input').value.replace(/,/g, '') : 0; });
  const village = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'village').id);
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), village);
  const pops = [await pop()];
  for (const k of ['town', 'village', 'town', 'village']) { await pg.selectOption('#pKind', k); pops.push(await pop()); }
  ok(pops[1] >= 2000 && pops[2] <= 2600 && pops[3] === pops[1] && pops[4] === pops[2], `a village made a town and back keeps each number after the first time (${pops.join(', ')})`);
  await c.close();
}

// The ring round a selected town runs behind its name, not through its first letters: it was drawn over the name, and
// on a phone 'Vaimiuna' read 'iiuna'. Where the ring crosses the name, less of its colour shows than with names off.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  const nin = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital'));
  await pg.evaluate((p) => { window.terra.centerOn(p.x, p.y); window.terra.select({ type: 'place', id: p.id }); }, nin);
  // Pixels of the ring's colour where its right side crosses the name's first letters.
  const ringShows = () => pg.evaluate(async (p) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = document.getElementById('map'), k = cv.width / cv.getBoundingClientRect().width, at = window.terra.toScreen(p.x, p.y);
    const d = cv.getContext('2d').getImageData(Math.round((at.x + 10) * k), Math.round((at.y - 5) * k), Math.round(4 * k), Math.round(10 * k)).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xc6) < 30 && Math.abs(d[i + 1] - 0x8a) < 30 && Math.abs(d[i + 2] - 0x1a) < 40) n++;
    return n;
  }, nin);
  const withName = await ringShows();
  await pg.click('#tab-world'); await pg.uncheck('#lyNames');
  const without = await ringShows();
  ok(without > 20 && withName < without * 0.8, `the selection ring runs behind the selected town's name (${withName} pixels of the ring's colour across the name, ${without} with names off)`);
  await c.close();
}

// A label put near the map's edge stays on the map: it was centred where it was put, so one put at the west edge
// printed as 'e Kegra Sound', cut off by the frame. Dragged to an edge, it stays on the map too.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.keyboard.press('t');
  await pg.click('.chip[data-g="label"][data-v="sea"]');
  const b = await pg.locator('#map').boundingBox(), at = async (x, y) => { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); return [b.x + p.x, b.y + p.y]; };
  await pg.mouse.click(...await at(5, 20));
  const inside = () => pg.evaluate(() => { const box = window.terra.boxes().labels.at(-1), a = window.terra.toScreen(0, 0), z = window.terra.toScreen(480, 300); return { box: box.map(Math.round), ok: box[0] >= a.x - 0.5 && box[1] >= a.y - 0.5 && box[2] <= z.x + 0.5 && box[3] <= z.y + 0.5 }; });
  const placed = await inside(), text = (await pg.evaluate(() => window.terra.labels())).at(-1).text;
  // Dragged by its middle to the map's south-east corner.
  await pg.keyboard.press('v');
  const l = (await pg.evaluate(() => window.terra.labels())).at(-1), from = await at(l.x, l.y), to = await at(478, 298);
  await pg.mouse.move(...from); await pg.mouse.down();
  for (let k = 1; k <= 12; k++) await pg.mouse.move(from[0] + (to[0] - from[0]) * k / 12, from[1] + (to[1] - from[1]) * k / 12);
  await pg.mouse.up();
  const dragged = await inside();
  ok(placed.ok && dragged.ok && (await pg.evaluate(() => window.terra.labels())).at(-1).x > 300, `a label put at the map's west edge, and one dragged to its corner, stay on the map ("${text}" at ${placed.box.join(', ')}, then ${dragged.box.join(', ')})`);
  await c.close();
}

// Backspace on a button on a place's page (Suggest another name) leaves the place be; some screen reader users press
// it for Back. Delete after clicking the place on the map still removes it.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const nin = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital'));
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), nin.id);
  await pg.focus('#pReroll');
  await pg.keyboard.press('Backspace');
  const kept = await pg.evaluate((id) => window.terra.places().some((p) => p.id === id), nin.id);
  const b = await pg.locator('#map').boundingBox(), at = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [nin.x, nin.y]);
  await pg.mouse.click(b.x + at.x, b.y + at.y);
  await pg.keyboard.press('Delete');
  const gone = await pg.evaluate((id) => !window.terra.places().some((p) => p.id === id), nin.id);
  ok(kept && gone, `Backspace on a button on a place's page leaves the place, and Delete after clicking it on the map removes it (kept ${kept}, then removed ${gone})`);
  await c.close();
}

// A place's page has its name for a heading, as it is typed, and its realm's field says Realm name, so a screen reader
// doesn't meet two fields called Name; the Codex's groups are headings to jump between, and a population is in people.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const nin = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital'));
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), nin.id);
  const heading = await pg.getByRole('heading', { level: 2, name: nin.name, exact: true }).count();
  await pg.focus('#pName'); await pg.keyboard.press('End'); await pg.keyboard.type(' Vale');
  const typed = await pg.getByRole('heading', { level: 2, name: `${nin.name} Vale`, exact: true }).count();
  const fields = await pg.evaluate(() => [...document.querySelectorAll('#pane-inspect label')].map((l) => l.textContent).filter((t) => /name/i.test(t)));
  await pg.click('#tab-codex');
  const groups = await pg.evaluate(() => [document.querySelectorAll('#codexList h3').length, document.querySelectorAll('#codexList .clist').length]);
  const row = await pg.getByRole('button', { name: new RegExp(`^${nin.name} Vale Capital · [\\d,]+ people$`) }).count();
  ok(heading === 1 && typed === 1 && JSON.stringify(fields) === '["Name","Realm name"]' && groups[0] === groups[1] && groups[0] > 3 && row === 1,
    `a place's page has its name for a heading, kept in step as it is typed, its realm's field is Realm name, and the Codex's groups are headings with populations in people (${heading}, ${typed}, ${fields.join(' / ')}, ${groups.join(' of ')} groups, ${row})`);
  await c.close();
}

// Keyboard only, a rebuild of the side panel or the tool's options keeps focus: a row in the Codex, a link to a place
// and Found a town here focus the new page's heading, a colour, a chip, the title and the kind stay focused, the realm's
// name is left with Tab for the next field, and Remove focuses the Inspect tab. Focus used to fall to the page itself,
// where a screen reader says nothing and the next Tab starts again from the top.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const focused = () => pg.evaluate(() => { const a = document.activeElement; return a.id || (a.dataset.color ? 'color ' + a.dataset.color : a.dataset.v ? `chip ${a.dataset.v} ${a.getAttribute('aria-pressed')}` : a.tagName); });
  const seen = [];
  // A row in the Codex, the welcome's capital, a Nearest link and Found a town here open a page and focus its heading.
  await pg.click('#tab-codex');
  const row = pg.locator('#codexList .clist').nth(1).locator('.crow').nth(1), rowName = await row.locator('.nm').textContent();
  await row.focus();
  await pg.keyboard.press('Enter');
  seen.push(['codex', await focused(), await pg.evaluate((n) => document.activeElement.textContent === n, rowName)]);
  await pg.keyboard.press('Tab');
  seen.push(['codex, then Tab', await focused()]);
  await pg.evaluate(() => window.terra.select(null));
  await pg.focus('#pane-inspect .welcome [data-goto]'); await pg.keyboard.press('Enter');
  seen.push(['welcome link', await focused()]);
  await pg.focus('#pane-inspect .facts [data-goto]'); await pg.keyboard.press('Enter');
  seen.push(['nearest link', await focused()]);
  const nin = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital'));
  await pg.evaluate(([x, y]) => window.terra.select({ type: 'loc', x: x + 6, y: y + 6 }), [nin.x, nin.y]);
  if (await pg.locator('#locTown').count()) { await pg.focus('#locTown'); await pg.keyboard.press('Enter'); seen.push(['found a town', await focused()]); }
  else seen.push(['found a town', 'no button']);
  // On a capital's page: a colour, the title, the realm's name and the kind keep focus where it was.
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), nin.id);
  await pg.focus('[data-color]:not([aria-pressed="true"])');
  const col = await pg.evaluate(() => document.activeElement.dataset.color);
  await pg.keyboard.press('Enter');
  seen.push(['colour', await focused() === 'color ' + col ? 'same colour' : await focused(), await pg.evaluate(() => document.activeElement.getAttribute('aria-pressed'))]);
  await pg.focus('#rTitle'); await pg.keyboard.press('ArrowDown');
  await pg.selectOption('#rTitle', 'Empire');
  seen.push(['title', await focused()]);
  await pg.focus('#rName'); await pg.keyboard.press('End'); await pg.keyboard.type('x'); await pg.keyboard.press('Tab');
  seen.push(['realm name, then Tab', await focused(), await pg.evaluate(() => document.querySelector('#pane-inspect .eyebrow').textContent.includes('The Empire of Ainpaeanix'))]);
  await pg.selectOption('#pKind', 'city');
  seen.push(['kind', await focused()]);
  // A chip on the sketch tool's bar.
  await pg.evaluate(() => window.terra.setTool('sketch'));
  await pg.focus('.chip[data-g="skmode"][data-v="sea"]'); await pg.keyboard.press('Enter');
  seen.push(['chip', await focused()]);
  await pg.keyboard.press('Tab');
  seen.push(['chip, then Tab', await focused()]);
  // Remove on a place's page focuses the Inspect tab.
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), nin.id);
  await pg.focus('#pDelete'); await pg.keyboard.press('Enter');
  seen.push(['remove', await focused()]);
  const want = [['codex', 'pTitle', true], ['codex, then Tab', 'showOnMap'], ['welcome link', 'pTitle'], ['nearest link', 'pTitle'], ['found a town', 'pTitle'], ['colour', 'same colour', 'true'], ['title', 'rTitle'], ['realm name, then Tab', 'rTitle', true], ['kind', 'pKind'], ['chip', 'chip sea true'], ['chip, then Tab', 'chip range false'], ['remove', 'tab-inspect']];
  ok(JSON.stringify(seen) === JSON.stringify(want), `after a rebuild, focus stays on the control or goes to the new page's heading, never the page itself (${seen.map((s) => s.join(': ')).join('; ')})`);
  await c.close();
}

// A screen reader hears what the toasts say, a tool picked by its key and the brush size, through a live region that is
// on the page from the start. The toast's own was hidden until a toast appeared with its text already in it, which a
// screen reader often doesn't read; a tool's key changed nothing it would read at all. The tools name their keys.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const cdp = await c.newCDPSession(pg);
  const live = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter((n) => n.role && n.role.value === 'status' && !n.ignored).length;
  const before = await live();
  const said = () => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r((document.getElementById('say') || {}).textContent)))));
  await pg.keyboard.press('e');
  const erase = await said();
  const b = await pg.locator('#map').boundingBox(), sea = await pg.evaluate(() => window.terra.toScreen(5, 5));
  await pg.mouse.click(b.x + sea.x, b.y + sea.y);
  const nothing = await said(), shown = await pg.textContent('#toast span');
  await pg.keyboard.press('r'); const raise = await said();
  await pg.keyboard.press(']'); const brush = await said();
  const keys = await pg.evaluate(() => [...document.querySelectorAll('#tools .tool')].map((t) => t.getAttribute('aria-keyshortcuts')).join(''));
  ok(before === 1 && erase === 'Remove places, labels and drawn rivers picked' && nothing === shown && raise === 'Raise land picked' && /^Brush \d+$/.test(brush) && keys === 'VPRLSWDCMTE',
    `one live region is on the page before any toast, and reads the toasts, a tool picked by its key and the brush size (${before} before any toast; "${erase}", "${nothing}", "${raise}", "${brush}", keys ${keys})`);
  await c.close();
}

// The map from the keyboard: its label says the world's name and what is on it, Tab reaches it, the arrow keys pan it
// (they did nothing, and the map took no focus), and Enter or Space reads the spot in the middle or opens the page of
// the place there. After a click on the map with the mouse, Space and a drag still pan.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.fitView(); });
  const label = await pg.evaluate(() => [document.getElementById('map').getAttribute('aria-label'), window.terra.state()]);
  const at00 = () => pg.evaluate(() => window.terra.toScreen(0, 0));
  for (let k = 0; k < 3; k++) await pg.keyboard.press('+');
  await pg.focus('.tool[data-tool="erase"]');
  await pg.keyboard.press('Tab');
  const onMap = await pg.evaluate(() => document.activeElement.id);
  const view = await pg.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return [r.width, r.height]; });
  const a = await at00(); await pg.keyboard.press('ArrowRight');
  const b = await at00(); await pg.keyboard.press('Shift+ArrowDown');
  const d = await at00();
  // Enter in the middle of the map opens the page of the spot there and says what it is, and focus stays on the map.
  await pg.keyboard.press('Enter');
  const spot = await pg.evaluate(() => [document.querySelector('#pane-inspect h2').textContent, document.activeElement.id]);
  const spotSaid = await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r((document.getElementById('say') || {}).textContent)))));
  // With a place in the middle, Enter opens its page; so does Space, with focus brought by the keyboard.
  const places = await pg.evaluate(() => window.terra.places().filter((p) => p.kind !== 'landmark'));
  let mid = null;
  for (const p of places) {
    const s = await pg.evaluate(([x, y]) => { window.terra.centerOn(x, y); return window.terra.toScreen(x, y); }, [p.x, p.y]);
    if (Math.abs(s.x - view[0] / 2) < 3 && Math.abs(s.y - view[1] / 2) < 3) { mid = p; break; }
  }
  await pg.keyboard.press('Enter');
  const enterPage = await pg.evaluate(() => document.getElementById('pTitle')?.textContent);
  await pg.keyboard.press('Escape');
  await pg.keyboard.press(' ');
  const spacePage = await pg.evaluate(() => [document.getElementById('pTitle')?.textContent, document.activeElement.id]);
  ok(/^Map of .+: \d+ realms, \d+ settlements and \d+ landmarks?\. The Codex tab lists every place\. With the map focused, the arrow keys pan it and Enter reads the spot in the middle\.$/.test(label[0]) && label[0].startsWith(`Map of ${label[1].name}:`),
    `the map's label says the world's name, what is on it, and its keys ("${label[0]}")`);
  ok(onMap === 'map' && Math.abs(b.x - (a.x - view[0] / 8)) < 0.5 && b.y === a.y && d.y < b.y && d.x === b.x && spot[1] === 'map' && spot[0] && spotSaid.startsWith(spot[0] + ',') && mid && enterPage === mid.name && spacePage[0] === mid.name && spacePage[1] === 'map',
    `Tab reaches the map, the arrow keys pan it (right ${Math.round(a.x - b.x)} px of ${view[0]}, Shift and down ${Math.round(b.y - d.y)} px), and Enter or Space reads the spot in the middle ("${spotSaid}"; ${mid && mid.name}: ${enterPage}, ${spacePage[0]})`);
  // After a click on the map with the mouse, Space and a drag still pan, and open nothing.
  await pg.evaluate(() => window.terra.select(null));
  const mb = await pg.locator('#map').boundingBox();
  await pg.evaluate(() => window.terra.fitView());
  for (let k = 0; k < 3; k++) await pg.click('#zIn');
  await pg.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await pg.evaluate(() => window.terra.select(null));
  const p0 = await at00();
  await pg.keyboard.down(' '); await pg.mouse.down();
  for (let k = 1; k <= 6; k++) await pg.mouse.move(mb.x + mb.width / 2 - k * 8, mb.y + mb.height / 2 - k * 5);
  await pg.mouse.up(); await pg.keyboard.up(' ');
  const p1 = await at00(), opened = await pg.locator('#pane-inspect .welcome').count();
  ok(await pg.evaluate(() => document.activeElement.id) === 'map' && (p1.x !== p0.x || p1.y !== p0.y) && opened === 1, `after a click on the map, Space and a drag still pan and open nothing (moved ${Math.round(p0.x - p1.x)}, ${Math.round(p0.y - p1.y)} px)`);
  // Blank ocean says so.
  await pg.evaluate(() => window.terra.startBlank());
  ok((await pg.evaluate(() => document.getElementById('map').getAttribute('aria-label'))).includes(': open water, no land yet.'), 'on blank ocean the map\'s label says open water');
  await c.close();
}

// Where a text box or list box is: its edge is 3:1 against the panel in both looks (WCAG 2.2, 1.4.11 Non-text Contrast).
// It was 1.8:1 in the light look and 1.9:1 in the dark. The world's name is underlined, so it reads as one to change.
{
  const out = [];
  for (const colorScheme of ['light', 'dark']) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme });
    const pg = watch(await c.newPage());
    await pg.goto(base);
    await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); const p = window.terra.places().find((q) => q.kind === 'capital'); window.terra.select({ type: 'place', id: p.id }); window.terra.setTool('label'); });
    out.push(await pg.evaluate((scheme) => {
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = (c) => rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const root = getComputedStyle(document.documentElement), panels = ['--panel', '--panel-2'].map((v) => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
      const fields = { pName: 'Bottom', pKind: 'Top', rName: 'Top', pLore: 'Top', optLabelText: 'Top', codexQ: 'Top', wSeed: 'Top', wShape: 'Top' };
      const worst = Math.min(...Object.entries(fields).flatMap(([id, side]) => panels.map((p) => cr(getComputedStyle(document.getElementById(id))[`border${side}Color`], p))));
      const ground = (() => { const d = document.createElement('div'); d.style.color = 'var(--ground)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
      return `${scheme} ${Math.min(worst, cr(getComputedStyle(document.getElementById('worldName')).borderBottomColor, ground)).toFixed(2)}`;
    }, colorScheme));
    await c.close();
  }
  ok(out.every((s) => +s.split(' ')[1] >= 3), `text boxes and list boxes have edges at 3:1 or more against both panels, and the world's name underlined on the page, light and dark (${out.join(', ')})`);
}

// A realm's colours have their names on screen, not only for a screen reader: on each one, and the picked one's beside
// the row, for anyone who can't tell two of them apart by eye.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); const p = window.terra.places().find((q) => q.kind === 'capital'); window.terra.select({ type: 'place', id: p.id }); });
  const titles = await pg.locator('[data-color]').evaluateAll((bs) => bs.every((b) => b.title && b.title === b.getAttribute('aria-label')));
  const named = () => pg.evaluate(() => [document.querySelector('.swatch-name')?.textContent, document.querySelector('[data-color][aria-pressed="true"]')?.title]);
  const first = await named();
  await pg.click('[data-color]:not([aria-pressed="true"])');
  const next = await named();
  ok(titles && first[0] && first[0] === first[1] && next[0] === next[1] && next[0] !== first[0], `a realm's colours are named on screen as well, on each one and beside the row (${first[0]}, then ${next[0]})`);
  await c.close();
}

// Realm titles read on the ground under them in every colour and look: against their halo laid over forest green and
// tan ground, the worst was Ochre's name in the Atlas at 3.2:1 (seed 3333's Kingdom of Gyidor faded into its olive).
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const inks = await pg.evaluate(() => window.terra.realmInks ? window.terra.realmInks() : []);
  // Each ink against its halo laid over forest green and over tan ground, the two that hid Ochre, Orange and Olive.
  const rgb = (s) => s.match(/\d+(\.\d+)?/g).map(Number);
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  let worst = Infinity, at = '';
  for (const k of inks) for (const ground of [[70, 110, 70], [205, 150, 100]]) {
    const h = rgb(k.halo), under = ground.map((g, i) => h[i] * h[3] + g * (1 - h[3]));
    for (const line of ['title', 'name']) { const r = cr(rgb(k[line]), under); if (r < worst) { worst = r; at = `${k.style} ${k.color} ${line}`; } }
  }
  ok(inks.length === 18 && worst >= 4.5, `realm titles read at 4.5:1 or more against their halo on forest and tan ground, in each colour and look (worst ${worst.toFixed(1)}:1, ${at})`);
  await c.close();
}

// The map's frame shows on the plate in the dark look too: drawn in the map's own dark ink on the near-black plate, it
// was 1.2:1 and the deep sea ran straight into the plate.
{
  const out = [];
  for (const colorScheme of ['light', 'dark']) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme });
    const pg = watch(await c.newPage());
    await pg.goto(base);
    await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.fitView(); });
    await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // The map's frame, the line just outside its west edge halfway down, against the plate further out.
    out.push(await pg.evaluate((scheme) => {
      const cv = document.getElementById('map'), k = cv.width / cv.getBoundingClientRect().width, a = window.terra.toScreen(0, 150);
      const px = (x) => [...cv.getContext('2d').getImageData(Math.round(x * k), Math.round(a.y * k), 1, 1).data].slice(0, 3);
      const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
      const frame = px(a.x - 1), plate = px(a.x - 14), x = lum(frame), y = lum(plate);
      return [scheme, (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)];
    }, colorScheme));
    await c.close();
  }
  ok(out.every(([, r]) => r >= 3), `the map's frame shows against the plate in both looks (${out.map(([s, r]) => `${s} ${r.toFixed(1)}:1`).join(', ')})`);
}

// Up close, names stop growing: a realm's at 42 px and a sea's at three times its size on the whole map (they were 166
// and 115 px tall at the closest zoom). A sea name is clicked and dragged where it is drawn, not where its old size
// reached.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.fitView(); });
  const tall = (r) => r[3] - r[1];
  const fit = await pg.evaluate(() => window.terra.boxes());
  for (let k = 0; k < 14; k++) await pg.keyboard.press('+');
  await pg.waitForTimeout(100);
  const close = await pg.evaluate(() => window.terra.boxes());
  const realmMax = Math.max(0, ...close.realms.map(tall)), seaMax = Math.max(0, ...close.seas.map(tall)), seaFit = Math.max(...fit.seas.map(tall));
  ok(realmMax <= 42 * 1.2 + 0.5 && seaMax <= seaFit * 3 + 0.5, `at the closest zoom realm names are ${Math.round(realmMax / 1.2)} px and sea names ${Math.round(seaMax / 1.2)} px (${Math.round(seaFit / 1.2)} px on the whole map)`);
  const sea = (await pg.evaluate(() => window.terra.labels())).find((l) => l.kind === 'sea');
  await pg.evaluate(([x, y]) => window.terra.centerOn(x, y), [sea.x, sea.y]);
  await pg.waitForTimeout(100);
  const at = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [sea.x, sea.y]);
  const box = (await pg.evaluate(() => window.terra.boxes())).seas.find((r) => r[0] < at.x && r[2] > at.x && r[1] < at.y && r[3] > at.y) || [0, 0, 0, 0];
  const m = await pg.locator('#map').boundingBox(), cx = m.x + (box[0] + box[2]) / 2, cy = m.y + (box[1] + box[3]) / 2;
  await pg.mouse.click(cx, box[3] + m.y + tall(box) * 1.5);
  const offIt = await pg.locator('#lText').count();
  await pg.mouse.click(cx, cy);
  const onIt = await pg.locator('#lText').inputValue().catch(() => '');
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 30, cy + 20, { steps: 4 }); await pg.mouse.move(cx + 60, cy + 40, { steps: 4 }); await pg.mouse.up();
  const moved = (await pg.evaluate(() => window.terra.labels())).find((l) => l.id === sea.id), s = await pg.evaluate(() => { const a = window.terra.toScreen(0, 0), b = window.terra.toScreen(1, 0); return b.x - a.x; });
  ok(offIt === 0 && onIt === sea.text && Math.abs((moved.x - sea.x) * s - 60) < 3 && Math.abs((moved.y - sea.y) * s - 40) < 3, `up close a sea name is clicked where it is drawn, not below it, and drags with the pointer ("${onIt}" moved ${Math.round((moved.x - sea.x) * s)}, ${Math.round((moved.y - sea.y) * s)} px)`);
  await c.close();
}

// Place names find a clear spot: right of the symbol, or left, above, below or at a corner, clear of other names, other
// symbols and the map's edge, capitals first. Every name went to the right with no check, so on a phone 'Bogol' was cut
// at the edge, 'Lonlie' and 'Mea' read 'LoMea', and on the saved image 'Sion' printed into a capital's star. A town's,
// village's or landmark's name with no clear spot is left off until you zoom in; a capital's, and the selected place's,
// always shows.
{
  const clash = (spots) => {
    const hit = (a, b) => a[0] < b[2] - 0.5 && a[2] > b[0] + 0.5 && a[1] < b[3] - 0.5 && a[3] > b[1] + 0.5, out = [];
    const { names, marks } = spots;
    for (let i = 0; i < names.length; i++) for (let j = 0; j < i; j++) if (hit(names[i].box, names[j].box)) out.push(`${names[i].name}/${names[j].name}`);
    for (const n of names) if (n.kind !== 'capital' && n.kind !== 'city') for (const m of marks) if (m.id !== n.id && hit(n.box, m.box)) out.push(`${n.name}/symbol`);
    return out;
  };
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const caps = (await pg.evaluate(() => window.terra.places())).filter((p) => p.kind === 'capital');
  const looks = [];
  for (let k = 0; k <= 6; k++) {
    if (k) await pg.click('#zIn');
    await pg.waitForTimeout(80);
    const spots = await pg.evaluate(() => window.terra.nameSpots()), map = await pg.evaluate(() => { const a = window.terra.toScreen(0, 0), b = window.terra.toScreen(480, 300); return [Math.max(a.x, 0), Math.max(a.y, 0), Math.min(b.x, document.getElementById('map').clientWidth), Math.min(b.y, document.getElementById('map').clientHeight)]; });
    const scale = await pg.evaluate(() => window.terra.boxes().scale), under = (b) => b[0] < scale[2] && b[2] > scale[0] && b[1] < scale[3] && b[3] > scale[1];
    const off = spots.names.filter((n) => n.kind !== 'capital' && (n.box[0] < map[0] || n.box[1] < map[1] || n.box[2] > map[2] || n.box[3] > map[3] || under(n.box))).map((n) => n.name);
    looks.push({ k, clash: clash(spots), off, dropped: spots.marks.filter((m) => m.kind === 'village' && m.box[0] > map[0] && m.box[2] < map[2] && m.box[1] > map[1] && m.box[3] < map[3] && !spots.names.some((n) => n.id === m.id)).map((m) => m.id), sides: new Set(spots.names.map((n) => n.side)).size });
  }
  ok(looks.every((l) => !l.clash.length && !l.off.length), `on a phone, from the whole map to six steps in, no place name prints over another name or another place's symbol, runs off the map or goes under the scale bar (${looks.map((l) => [...l.clash, ...l.off].join(', ') || 'clear').join('; ')})`);
  // A village left off three steps in has its name again closer in, centred on it.
  const left = looks[3].dropped, back = [];
  for (const id of left) {
    const v = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === id);
    await pg.evaluate(([x, y]) => window.terra.centerOn(x, y), [v.x, v.y]);
    for (let k = 0; k < 4; k++) await pg.click('#zIn');
    await pg.waitForTimeout(80);
    if ((await pg.evaluate(() => window.terra.nameSpots().names.map((n) => n.id))).includes(id)) back.push(v.name);
  }
  ok(looks.some((l) => l.sides > 1) && left.length && back.length === left.length, `names step aside where the right is taken, and the ${left.length} village names left off three steps in come back closer in (${back.join(', ')})`);
  await pg.click('#zFit');
  await pg.waitForTimeout(80);
  const fitNames = await pg.evaluate(() => window.terra.nameSpots().names.map((n) => n.id));
  ok(caps.every((p) => fitNames.includes(p.id)), `every capital's name shows on the phone's whole map (${caps.length})`);
  const village = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'village' && !fitNames.includes(p.id));
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), village.id);
  await pg.waitForTimeout(80);
  ok((await pg.evaluate(() => window.terra.nameSpots().names.map((n) => n.id))).includes(village.id), `a village whose name is left off shows it once selected (${village.name})`);
  await pg.evaluate(() => window.terra.select(null));
  // On a laptop, three steps in, a city by the screen's edge is named inside it or not at all (Olmailora's ran off it).
  const lap = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const lp = watch(await lap.newPage());
  await lp.goto(base);
  await lp.evaluate(() => document.fonts.ready);
  await lp.evaluate(() => window.terra.newWorld(20417, 'continent'));
  for (let k = 0; k < 3; k++) await lp.click('#zIn');
  await lp.waitForTimeout(150);
  const edge = await lp.evaluate(() => { const w = document.getElementById('map').clientWidth, h = document.getElementById('map').clientHeight; return window.terra.nameSpots().names.filter((n) => n.kind !== 'capital' && (n.box[0] < 0 || n.box[2] > w || n.box[1] < 0 || n.box[3] > h)).map((n) => n.name); });
  await lap.close();
  ok(!edge.length, `on a laptop three steps in, no name but a capital's runs off the screen (${edge.join(', ') || 'none'})`);
  // The saved image, both looks: every capital, city and town named, and nothing printed over anything.
  for (const st of ['terrain', 'atlas']) {
    await pg.evaluate((st) => { window.terra.setStyle(st); window.terra.mapImage(4, true); }, st);
    const spots = await pg.evaluate(() => window.terra.nameSpots('image'));
    const named = new Set(spots.names.map((n) => n.id)), big = (await pg.evaluate(() => window.terra.places())).filter((p) => p.kind === 'capital' || p.kind === 'city');
    ok(!clash(spots).length && big.every((p) => named.has(p.id)), `on the saved map image (${st}) every capital and city is named, ${spots.names.length} names in all, and none prints over another or a symbol (${clash(spots).join(', ') || 'clear'})`);
  }
  await c.close();
}

// The World tab has a Map key under Layers: the four kinds of settlement, the six landmarks, a river, a road and a
// realm's border, and in the Terrain look a swatch for each kind of land the world has. Nothing on screen said what a
// star or a ringed dot meant.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  await pg.click('#tab-world');
  const key = () => pg.evaluate(() => ({ items: [...document.querySelectorAll('#wKey li:not(.sub)')].map((li) => li.textContent.trim()), icons: document.querySelectorAll('#wKey li:not(.sub) svg, #wKey li .land').length, wide: document.documentElement.scrollWidth <= innerWidth }));
  const terrain = await key();
  const kinds = ['Capital', 'City', 'Town', 'Village', 'Ruin', 'Tower', 'Temple', 'Cave', 'Battlefield', 'Monument', 'River', 'Road', "Realm's border"];
  const land = terrain.items.slice(kinds.length);
  ok(kinds.every((k, i) => terrain.items[i] === k) && terrain.icons === terrain.items.length && terrain.wide, `the Map key names each symbol beside its picture (${terrain.items.slice(0, kinds.length).join(', ')})`);
  const onMap = await pg.evaluate(() => { const n = {}; for (let y = 0; y < 300; y++) for (let x = 0; x < 480; x++) { const c = window.terra.cell(x, y); if (c.h >= 0 && !c.lake) n[c.kind] = (n[c.kind] || 0) + 1; } return Object.keys(n).filter((k) => n[k] >= 10); });
  ok(land.length >= 12 && land.length === onMap.length && onMap.every((k) => land.includes(k)), `in the Terrain look it has a swatch for each kind of land on the map (${land.length} on seed 20417: ${land.join(', ')})`);
  await pg.evaluate(() => window.terra.setStyle('atlas'));
  const atlas = await key();
  await pg.evaluate(() => { window.terra.setStyle('terrain'); window.terra.newWorld(20417, 'archipelago'); });
  const isles = await key();
  await pg.evaluate(() => window.terra.startBlank());
  const blank = await key();
  ok(atlas.items.length === kinds.length && isles.items.length > kinds.length && isles.items.length <= kinds.length + 14 && blank.items.length === kinds.length, `the Atlas look's key has no land swatches, an archipelago's has its own (${isles.items.length - kinds.length}), and blank ocean's none`);
  await c.close();
}

// The compass, scale bar and frame grow with the saved image: they were sized for the screen, so on the 1,980 px image
// the compass was 2% of its width and the scale's figures printed about 1.5 mm tall on A4. The scale bar gives km under
// the leagues, and Large, for printing, saves the same image at twice the pixels. On a phone's whole map the compass is
// smaller: at full size it and its N took a third of the map's height.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  await pg.waitForTimeout(80);
  const phone = await pg.evaluate(() => ({ f: window.terra.furniture(), mapH: window.terra.toScreen(0, 300).y - window.terra.toScreen(0, 0).y }));
  ok((phone.f.compass * 2.7) / phone.mapH < 0.18, `on a phone's whole map the compass takes ${Math.round(phone.f.compass * 2.7 / phone.mapH * 100)}% of the map's height, with its N (it took a third)`);
  ok(phone.f.km === `${Math.round(phone.f.leagues * 4.8).toLocaleString('en-US')} km`, `the scale bar gives the same length in km under the leagues (${phone.f.leagues} leagues, ${phone.f.km})`);
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = watch(await desk.newPage());
  await dp.goto(base);
  await dp.evaluate(() => window.terra.newWorld(20417, 'continent'));
  await dp.waitForTimeout(80);
  const screen = await dp.evaluate(() => window.terra.furniture());
  await dp.evaluate(() => window.terra.mapImage(4, true));
  const image = await dp.evaluate(() => window.terra.furniture('image'));
  await desk.close();
  ok(screen.compass === 21 && image.compass === 42 && image.scaleText === 21 && (image.compass * 2) / image.size[0] > 0.04, `on the saved image the compass and the scale's lettering are twice their size on a laptop's screen (compass ${image.compass * 2} px across on ${image.size[0]}, ${Math.round(image.compass * 200 / image.size[0])}% of the width; lettering ${image.scaleText} px)`);
  // Large, for printing: ticked, Save map image saves 3,960 by 2,520, and the box stays ticked after a reload.
  await pg.click('#tab-world');
  await pg.check('#wPngLarge');
  const [big] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSavePng')]);
  const bigPng = await readFile(await big.path());
  await pg.reload(); await pg.waitForFunction(() => window.terra && window.terra.state().places > 0);
  await pg.click('#tab-world');
  const kept = await pg.isChecked('#wPngLarge');
  await pg.uncheck('#wPngLarge');
  const [small] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSavePng')]);
  const smallPng = await readFile(await small.path());
  ok(bigPng.readUInt32BE(16) === 3960 && bigPng.readUInt32BE(20) === 2520 && kept && smallPng.readUInt32BE(16) === 1980, `Large, for printing saves the map at ${bigPng.readUInt32BE(16)} x ${bigPng.readUInt32BE(20)} and stays chosen after a reload; unticked it saves ${smallPng.readUInt32BE(16)} x ${smallPng.readUInt32BE(20)}`);
  await c.close();
}

// Save map image puts the world's name in a title panel in the top-left corner and a key to what is on the map in the
// bottom-right, with the place names kept clear of both; the README pictures and the link picture stay without them.
// On a phone that can share files it opens the share sheet with the picture instead of only saving to Downloads.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  await pg.click('#tab-world');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSavePng')]);
  const img = await pg.evaluate(() => ({ f: window.terra.furniture('image'), names: window.terra.nameSpots('image').names, name: window.terra.state().name }));
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const under = img.names.filter((n) => hit(n.box, img.f.title.box) || hit(n.box, img.f.key.box)).map((n) => n.name);
  ok(dl.suggestedFilename().endsWith('.png') && img.f.title.text === img.name && img.f.title.box[0] < 100 && img.f.title.box[1] < 100 && img.f.key.box[2] > 1880 && img.f.key.box[3] > 1160,
    `the saved map image has the world's name in its top-left corner ("${img.f.title.text}") and a key in its bottom-right (${img.f.key.rows.join(', ')})`);
  ok(img.f.key.rows.join() === 'Capital,City,Town,Village,Ruin,Tower,Temple,Cave,Battlefield,Monument,River,Road,Realm\'s border' && !under.length, `the key lists what this map has, and no place name prints under the title or the key (${under.join(', ') || 'none'})`);
  await pg.evaluate(() => window.terra.startBlank());
  await pg.evaluate(() => window.terra.mapImage(4, true, { title: true }));
  const blank = await pg.evaluate(() => window.terra.furniture('image'));
  await pg.evaluate(() => window.terra.mapImage(2, false));
  const plain = await pg.evaluate(() => window.terra.furniture('image'));
  ok(blank.key.rows.length === 0 && blank.title.text === 'Untitled world' && plain.title === null, `blank ocean's image has its title and no key, and the picture the README and link preview use has neither`);
  await c.close();

  // A phone that can share files: Save map image hands the share sheet the picture, named for the world. Cancelling
  // it saves nothing; a phone that refuses this long after the tap offers Share again from a toast; a laptop downloads.
  const shareCtx = async (touch) => {
    const sc = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch, acceptDownloads: true });
    await sc.addInitScript(() => {
      window.__shared = []; window.__answer = 'ok';
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = (d) => { window.__shared.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, title: d.title }); const a = window.__answer; window.__answer = 'ok'; return a === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('no', a)); };
    });
    const sp = watch(await sc.newPage()); await sp.goto(base);
    await sp.waitForFunction(() => window.terra && window.terra.state().places > 0);
    await sp.click('#tab-world');
    return { sc, sp };
  };
  const { sc, sp } = await shareCtx(true);
  let downloads = 0; sp.on('download', () => downloads++);
  await sp.click('#wSavePng');
  await sp.waitForFunction(() => window.__shared.length === 1);
  const first = await sp.evaluate(() => ({ s: window.__shared[0], name: window.terra.state().name }));
  await sp.evaluate(() => { window.__answer = 'AbortError'; });
  await sp.click('#wSavePng');
  await sp.waitForFunction(() => window.__shared.length === 2);
  await sp.evaluate(() => { window.__answer = 'NotAllowedError'; });
  await sp.click('#wSavePng');
  await sp.waitForFunction(() => window.__shared.length === 3);
  await sp.waitForSelector('#toast:not([hidden]) button');
  const toastText = await sp.textContent('#toast');
  await sp.click('#toast button');
  await sp.waitForFunction(() => window.__shared.length === 4);
  await sp.waitForTimeout(300);
  ok(first.s.type === 'image/png' && first.s.size > 100000 && first.s.name === first.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png' && first.s.title === first.name && downloads === 0 && /ready/.test(toastText),
    `on a phone that shares files, Save map image opens the share sheet with ${first.s.name} (${Math.round(first.s.size / 1024)} kB); cancelled it saves nothing, and refused it offers Share from a toast ("${toastText.replace('Share', '').trim()}")`);
  await sc.close();
  const lap = await shareCtx(false);
  const [lapDl] = await Promise.all([lap.sp.waitForEvent('download'), lap.sp.click('#wSavePng')]);
  ok(lapDl.suggestedFilename().endsWith('.png') && (await lap.sp.evaluate(() => window.__shared.length)) === 0, 'on a laptop Save map image downloads the picture, as before');
  await lap.sc.close();
}

// The saved sheet's finishing touches: a graduated border of dark and light bars in place of the plain double frame,
// a bigger compass rose in the Atlas look, and a paper grain on the Atlas sheet faint enough to leave its colours as
// they were. (No degree numbers on the bars: the map carries no latitudes.)
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const look = (o) => pg.evaluate(async (o) => {
    const url = window.terra.mapImage(4, true, o), f = window.terra.furniture('image');
    const img = new Image(); await new Promise((d) => { img.onload = d; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    // Along the band just outside the map's top edge: how often it turns from dark to light.
    const row = g.getImageData(40, 30 - 9, img.width - 80, 1).data; let turns = 0, dark = null;
    for (let i = 0; i < row.length; i += 4) { const d = row[i] + row[i + 1] + row[i + 2] < 300; if (dark !== null && d !== dark) turns++; dark = d; }
    // A patch of open sea in the middle of the top: its mean brightness and how much it varies pixel to pixel.
    const sea = g.getImageData(700, 80, 60, 40).data; let sum = 0, sq = 0, n = 0, step = 0;
    for (let i = 0; i < sea.length; i += 4) { const v = (sea[i] + sea[i + 1] + sea[i + 2]) / 3; sum += v; n++; if (i >= 4) step += Math.abs(v - (sea[i - 4] + sea[i - 3] + sea[i - 2]) / 3); }
    return { turns, compass: f.compass, mean: sum / n, rough: step / n };
  }, o);
  const tSheet = await look({ title: true }), tPlain = await look({});
  await pg.evaluate(() => window.terra.setStyle('atlas'));
  const aSheet = await look({ title: true }), aPlain = await look({});
  ok(tSheet.turns >= 60 && aSheet.turns >= 60 && tPlain.turns <= 2, `the saved sheet has a graduated border, in both looks (${tSheet.turns} and ${aSheet.turns} turns from dark to light along its top; ${tPlain.turns} on the plain picture)`);
  ok(aSheet.compass === tSheet.compass * 1.5 && tSheet.compass === tPlain.compass, `the Atlas sheet's compass rose is half as big again (${aSheet.compass * 2} px across, against ${tSheet.compass * 2})`);
  ok(aSheet.rough > aPlain.rough + 0.5 && Math.abs(aSheet.mean - aPlain.mean) / aPlain.mean < 0.03 && Math.abs(tSheet.rough - tPlain.rough) < 0.2, `the Atlas sheet has a faint paper grain (pixel to pixel ${aPlain.rough.toFixed(1)} to ${aSheet.rough.toFixed(1)}, brightness ${aPlain.mean.toFixed(0)} to ${aSheet.mean.toFixed(0)}); Terrain has none`);
  await c.close();
}

// Printing prints the map, not the app: one landscape page with the world's name over the whole map at the large size,
// with its key and border. Ctrl+P printed the toolbar, the tabs and the part of the map on screen. (Checked as a PDF;
// no printer here.)
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.__printed = null; addEventListener('beforeprint', () => { const cv = document.getElementById('printMap'); window.__printed = [cv.width, cv.height, document.getElementById('printTitle').textContent]; }); });
  await pg.emulateMedia({ media: 'print' });
  const shown = await pg.evaluate(() => [...document.body.children].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.className));
  await pg.emulateMedia({ media: null });
  const pdf = await pg.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  const text = pdf.toString('latin1'), pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length, box = (/\/MediaBox\s*\[([^\]]*)\]/.exec(text) || [, '0 0 0 0'])[1].trim().split(/\s+/).map(Number);
  const printed = await pg.evaluate(() => window.__printed), after = await pg.evaluate(() => document.getElementById('printMap').width), onScreen = await pg.isVisible('#printSheet');
  ok(shown.join() === 'printSheet' && !onScreen, `printed, the page shows only the map sheet (${shown.join(', ')}), which never shows on screen`);
  ok(pages === 1 && box[2] > box[3] && printed && printed[0] === 3960 && printed[1] === 2520 && printed[2] === 'Valtaea' && after === 0 && pdf.length > 1e6,
    `it prints on one landscape page (${Math.round(box[2])} x ${Math.round(box[3])} pt) under "${printed && printed[2]}", at ${printed && printed[0]} x ${printed && printed[1]}, and lets the picture go afterwards`);
  await c.close();
}

// A place name's spot is worked out from its width in the map's own lettering: the page draws the map before its fonts
// arrive, and widths measured then, in the fallback font, were kept, so names were placed for words of another size.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  // The fonts come in late, as on a slow connection, so the first map is drawn without them.
  await pg.route('**/*.woff2', async (r) => { await new Promise((d) => setTimeout(d, 700)); await r.continue(); });
  await pg.goto(base);
  await pg.waitForFunction(() => window.terra && window.terra.state().places > 0);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(150);
  const off = await pg.evaluate(() => {
    // A city's name box is its width and its letters' size, with 1.5 px to spare all round.
    const g = document.createElement('canvas').getContext('2d');
    return window.terra.nameSpots().names.filter((n) => n.kind === 'city').map((n) => {
      g.font = `${n.box[3] - n.box[1] - 3}px "IM Fell English", Georgia, serif`;
      return { name: n.name, drawn: n.box[2] - n.box[0] - 3, fell: g.measureText(n.name).width };
    }).filter((r) => Math.abs(r.drawn - r.fell) > 0.5);
  });
  ok(!off.length, `place names are spaced by their width in the map's own lettering once its fonts are in (${off.map((r) => `${r.name} ${r.drawn.toFixed(1)} against ${r.fell.toFixed(1)}`).join(', ') || 'all cities match'})`);
  await c.close();
}

// The Atlas on a phone's whole map draws a share of its trees, so they don't run into a solid mat (they were 1.9 px
// apart and 3 px across); a laptop's whole map and a closer look draw them all.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.setStyle('atlas'); window.terra.fitView(); });
  const phone = await pg.evaluate(() => window.terra.glyphs());
  for (let k = 0; k < 4; k++) { await pg.click('#zIn'); await pg.waitForTimeout(100); }
  const closer = await pg.evaluate(() => window.terra.glyphs());
  await c.close();
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = watch(await d.newPage());
  await dp.goto(base);
  const laptop = await dp.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.setStyle('atlas'); window.terra.fitView(); return window.terra.glyphs(); });
  await d.close();
  ok(phone.all > 1000 && phone.spacing >= 3.5 && phone.drawn < phone.all / 2 && closer.drawn === closer.all && laptop.drawn === laptop.all, `on a phone's whole map the Atlas draws ${phone.drawn} of its ${phone.all} trees, reeds and dunes, ${phone.spacing.toFixed(1)} px apart; zoomed in, and on a laptop, all of them`);
}

// A world file saved by an earlier build (with notes, a label, a drawn river's spring and a renamed, recolored realm)
// still opens, every field intact: saving it again gives back the same file.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const fixture = await readFile(join(root, 'test/fixtures/world-v1.json'));
  const old = JSON.parse(fixture);
  await pg.click('#tab-world');
  await pg.setInputFiles('#wFile', { name: 'world-v1.json', mimeType: 'application/json', buffer: fixture });
  await pg.waitForTimeout(400);
  const opened = await pg.textContent('#toast span');
  const [again] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]);
  const resaved = JSON.parse(await readFile(await again.path(), 'utf8'));
  const lost = Object.keys(old).filter((k) => k !== 'savedAt' && JSON.stringify(old[k]) !== JSON.stringify(resaved[k]));
  ok(opened.startsWith(`Opened ${old.name}.`) && lost.length === 0, `a world file from an earlier build opens with every field intact (${old.places.length} places, ${old.labels.length} labels, ${old.springs.length} spring)` + (lost.length ? ': changed ' + lost.join(', ') : ''));
  const cap = old.places.find((p) => p.lore);
  ok(await pg.evaluate((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }, cap.id) === cap.lore, 'and its notes are there');
  await c.close();
}

// A River line drawn uphill is turned round, and says so: it used to say the river ended inland when it ran down to
// the coast where the line began. And a line stopped 3 cells (30 km) short of the coast, a few pixels under a finger
// on a phone, reaches the sea; it used to be told it ended inland. One that stops well inland still says so.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.evaluate(() => window.terra.startBlank());
  await pg.click('.chip[data-v="land"]');
  await drag([[110, 70], [370, 66], [380, 230], [120, 236], [110, 70]], 6, pg);
  await pg.click('.chip[data-v="range"]'); await pg.click('.chip[data-v="high"]');
  await drag([[240, 95], [244, 150], [238, 205]], 8, pg);
  await pg.click('.chip[data-v="river"]');
  const coast = (x0, step) => pg.evaluate(([x0, step]) => { let x = x0; while (window.terra.cell(x + 0.5, 150.5).h >= 0) x += step; return x; }, [x0, step]);
  const east = await coast(260, 1), west = await coast(225, -1);
  const said = async (line) => { await drag(line, 8, pg); const s = await pg.textContent('#toast span'); await pg.click('#btnUndo'); await pg.waitForTimeout(300); return s; };
  const uphill = await said([[east - 2, 150], [east - 30, 148], [258, 150]]);
  const short = await said([[226, 150], [190, 152], [west + 3.5, 150]]);
  const farIn = await said([[226, 150], [190, 152], [west + 12.5, 150]]);
  // A river is named after its mouth: one drawn on this island often runs into a bigger river on its way down.
  const drew = '^Drew (a tributary of )?the (River )?\\S+\\.';
  ok(new RegExp(drew + ' Water runs downhill, so it flows toward the sea end of your line\\.$').test(uphill) && new RegExp(drew + '$').test(short) && new RegExp(drew + ' It ends inland, so it finds its own way on from there\\.$').test(farIn),
    `a River line drawn uphill says the water flows from its end, one stopped 3 cells short of the coast reaches the sea, and one stopped 12 cells short ends inland, each naming the river ("${uphill}", "${short}", "${farIn}")`);
  await c.close();
}

// A place on a river says where the river goes: which way it flows there, where it reaches the sea and how far on, and
// how much land it drains. It used to say only 'Inland, on the Caelea'. The river's name shows its mouth.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  // The line's text, leaving out its Rename button.
  const row = (k) => pg.evaluate((k) => { const dt = [...document.querySelectorAll('#pane-inspect dt')].find((d) => d.textContent === k); return dt ? dt.nextElementSibling.textContent.replace(/ Rename$/, '') : null; }, k);
  // A spot on the starting world's biggest river, 30 to 45 cells from its mouth as the crow flies.
  await pg.evaluate(() => window.terra.newWorld(20417, 'continent'));
  const spot = await pg.evaluate(bigRiverSpot), big = spot.name;
  await pg.evaluate((w) => window.terra.select({ type: 'loc', x: w.x, y: w.y }), spot);
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), core = big.replace(/^(River|The) /, '');
  const upstream = await row('River'), setting = await row('Setting');
  const m = upstream && upstream.match(new RegExp(`^${esc(big)} flows (north|south|east|west|northeast|northwest|southeast|southwest) and reaches the sea, (\\d+) leagues \\(([\\d,]+) km\\) on\\. It drains ([\\d,]+) km²\\.$`));
  ok(m && +m[2] > 40 && Math.abs(+m[2] * 4.8 - +m[3].replace(/,/g, '')) < +m[3].replace(/,/g, '') * 0.1 && +m[4].replace(/,/g, '') > 100000 && !/River/.test(setting) && !setting.includes(core), `a spot on a river says which way it flows, how far on it reaches the sea and what it drains, and its Setting leaves the river to that line ("${setting}"; "${upstream}")`);
  await pg.click('#pane-inspect [data-mouth]'); await pg.waitForTimeout(200);
  const mouth = await row('River'), sel = await pg.evaluate(() => document.querySelector('#pane-inspect .mono').textContent);
  ok(new RegExp(`^${esc(big)} flows \\w+ and reaches the sea here\\. It drains`).test(mouth) && mouth.endsWith(`${m[4]} km².`), `its name opens the spot at its mouth ("${mouth}", ${sel})`);
  await c.close();
}

// Rivers keep their names. A river was named after the cell at its mouth, so an edit that moved its mouth renamed it
// (a sea loop over the mouth of the starting world's biggest river turned the River Pameo into the River Las), and
// two rivers could share a name (seed 9 had two Rivers Thu, seed 3 the Riand and the River Riand). Now an edited
// river keeps its name, the names are saved with the world, and the bigger of two rivers keeps a name they'd share.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const E = (fn, arg) => pg.evaluate(fn, arg);
  const key = (n) => n.toLowerCase().replace(/^the\s+/, '').replace(/^river\s+/, '');
  const twins = [];
  for (const [seed, shape] of [[9, 'continent'], [3, 'continent'], [8, 'continent'], [3, 'archipelago']]) {
    const names = await E(([s, sh]) => { window.terra.newWorld(s, sh); return window.terra.rivers().map((r) => r.name); }, [seed, shape]);
    if (new Set(names.map(key)).size !== names.length) twins.push(`${shape} ${seed}`);
  }
  ok(!twins.length, `no two rivers share a name, on four worlds that had twins (${twins.join(', ') || 'none now'})`);
  await E(() => window.terra.newWorld(20417, 'continent'));
  const big = (await E(() => window.terra.rivers()))[0];
  await E(([x, y]) => window.terra.centerOn(x, y), [big.x, big.y]);
  await pg.click('.tool[data-tool="sketch"]'); await pg.click('.chip[data-v="sea"]');
  const loop = []; for (let a = 0; a <= 16; a++) loop.push([big.x + 0.5 + 5 * Math.cos(a / 16 * Math.PI * 2), big.y + 0.5 + 5 * Math.sin(a / 16 * Math.PI * 2)]);
  await drag(loop, 3, pg);
  // The flood can split its lower course in two; the bigger part, now the first river out to sea near there, keeps it.
  const nearOld = (rs) => rs.filter((r) => Math.hypot(r.x - big.x, r.y - big.y) < 14);
  const moved = nearOld(await E(() => window.terra.rivers()))[0];
  ok(moved && (moved.x !== big.x || moved.y !== big.y) && moved.name === big.name, `a sea loop over a river's mouth moves the mouth and leaves the river its name (${big.name} at ${big.x},${big.y}, now ${moved && moved.name} at ${moved && moved.x},${moved && moved.y})`);
  await pg.click('#btnUndo'); await pg.waitForTimeout(300);
  const undone = await E(() => window.terra.rivers()[0]);
  await pg.click('#btnRedo'); await pg.waitForTimeout(1500);
  await pg.reload(); await pg.waitForTimeout(600);
  const reloaded = nearOld(await E(() => window.terra.rivers()))[0];
  ok(undone.name === big.name && undone.x === big.x && reloaded.name === big.name && reloaded.x === moved.x && reloaded.y === moved.y, `Undo, Redo and a reload keep it (${undone.name}, ${reloaded.name})`);
  // A river drawn into it is named as its tributary.
  await E(() => window.terra.newWorld(20417, 'continent'));
  const on = await E(bigRiverSpot);
  await E((w) => window.terra.centerOn(w.x, w.y), on);
  await pg.click('.tool[data-tool="sketch"]'); await pg.click('.chip[data-v="river"]');
  await drag([[on.from.x, on.from.y], [(on.from.x + on.x) / 2, (on.from.y + on.y) / 2], [on.x, on.y]], 8, pg);
  const into = await pg.textContent('#toast span');
  ok(into.startsWith(`Drew a tributary of ${big.name.replace(/^The /, 'the ').replace(/^River /, 'the River ')}.`), `a river drawn into it is called its tributary ("${into}")`);
  await c.close();
}

// A river can be given a name of your own from its River line, and keeps it through an edit and a reload; Undo takes it
// back. A river that had that name takes another; one whose name was typed in too keeps it, and the box says so. And a
// river drawn by hand is named on the map, though it's too short to be one of the four biggest, which were all a map
// named.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const E = (fn, arg) => pg.evaluate(fn, arg);
  const row = () => E(() => { const dt = [...document.querySelectorAll('#pane-inspect dt')].find((d) => d.textContent === 'River'); return dt ? dt.nextElementSibling.textContent : null; });
  const rename = async (to) => { await pg.click('#pane-inspect [data-rename]'); await pg.fill('#rvName', to); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); };
  await E(() => window.terra.newWorld(20417, 'continent'));
  await E((w) => window.terra.select({ type: 'loc', x: w.x, y: w.y }), await E(bigRiverSpot));
  const [first, second, third] = await E(() => window.terra.rivers());
  await rename('Silverrun');
  const after = await E(() => [window.terra.rivers()[0], window.terra.riverLabels().map((l) => l.name)]), line = await row();
  ok(after[0].name === 'Silverrun' && after[0].own && after[1].includes('Silverrun') && !after[1].includes(first.name) && line.startsWith('Silverrun flows ') && await E(() => document.activeElement.dataset.rename) !== undefined,
    `Rename in the River line names the river, on the page and on the map (${first.name} is now "${line.split(' flows')[0]}"; labels ${after[1].join(', ')})`);
  await pg.click('#btnUndo'); await pg.waitForTimeout(300);
  const undone = await E(() => window.terra.rivers()[0].name);
  await pg.click('#btnRedo'); await pg.waitForTimeout(300);
  // Escape leaves it as it was.
  await pg.click('#pane-inspect [data-rename]'); await pg.fill('#rvName', 'Not this'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  const kept = await E(() => window.terra.rivers()[0].name);
  // A sea loop over its mouth, then a reload.
  await E(([x, y]) => window.terra.centerOn(x, y), [first.x, first.y]);
  await pg.click('.tool[data-tool="sketch"]'); await pg.click('.chip[data-v="sea"]');
  const loop = []; for (let a = 0; a <= 16; a++) loop.push([first.x + 0.5 + 5 * Math.cos(a / 16 * Math.PI * 2), first.y + 0.5 + 5 * Math.sin(a / 16 * Math.PI * 2)]);
  await drag(loop, 3, pg);
  await pg.waitForTimeout(1500); await pg.reload(); await pg.waitForTimeout(600);
  const own = await E(() => window.terra.rivers().filter((r) => r.own).map((r) => r.name));
  ok(undone === first.name && kept === 'Silverrun' && own.join() === 'Silverrun', `Undo takes the name back, Esc leaves it, and it lasts through a sea loop over the mouth and a reload (${undone}, ${kept}, ${own.join()})`);
  // The second river given the third's name: the third takes a new one. Then the third given Silverrun: refused.
  const spot = async (r) => E(([mx, my, name]) => { for (let d = 4; d < 40; d++) for (let a = 0; a < 48; a++) { const x = mx + 0.5 + d * Math.cos(a / 48 * Math.PI * 2), y = my + 0.5 + d * Math.sin(a / 48 * Math.PI * 2); if (window.terra.riverAt(x, y) === name) return [x, y]; } return null; }, [r.x, r.y, r.name]);
  const at2 = await spot(second);
  await E(([x, y]) => window.terra.select({ type: 'loc', x, y }), at2);
  await rename(third.name);
  const moved = await E(() => window.terra.rivers()), said = await pg.textContent('#toast span');
  const thirdNow = moved.find((r) => r.x === third.x && r.y === third.y);
  ok(moved.find((r) => r.x === second.x && r.y === second.y).name === third.name && thirdNow.name !== third.name && said === `The river that was ${third.name} is now ${thirdNow.name}.`, `a river given another's name takes it, and the other takes a new one ("${said}")`);
  await rename('Silverrun');
  const refused = await pg.textContent('#toast span');
  ok(refused === 'Another river is already called Silverrun.' && (await E(() => window.terra.rivers())).filter((r) => r.name === 'Silverrun').length === 1, `two names typed in can't be the same ("${refused}")`);
  // A short river drawn by hand down to the north coast of the starting world is named on the map.
  await E(() => { window.terra.newWorld(20417, 'continent'); window.terra.centerOn(234, 60); });
  await pg.click('.tool[data-tool="sketch"]'); await pg.click('.chip[data-v="river"]');
  await drag([[228.5, 60.5], [233.5, 60.5], [239.5, 60.5]], 8, pg);
  const drawn = await E(() => [window.terra.riverAt(231.5, 60.5), window.terra.riverLabels().map((l) => l.name)]);
  ok(drawn[0] && drawn[1].length === 5 && drawn[1][4] === drawn[0], `a river drawn by hand is named on the map, as well as the four biggest (${drawn[0]}; labels ${drawn[1].join(', ')})`);
  // Erase takes it away from where it starts, which shows as a ring. Its source used to stay in the world for good, and
  // only an Undo straight after drawing it took the river away. Its valley stays.
  const valley = await E(() => window.terra.cell(233.5, 60.5).h);
  await pg.keyboard.press('e');
  const hint = await pg.textContent('#toolOpts .hint');
  const b = await pg.locator('#map').boundingBox(), src = await E(() => window.terra.toScreen(228.5, 60.5));
  await pg.mouse.click(b.x + src.x + 6, b.y + src.y + 4); await pg.waitForTimeout(300);
  const gone = await E(() => [window.terra.state().springs, window.terra.riverLabels().length, window.terra.cell(233.5, 60.5).h]), took = await pg.textContent('#toast span');
  ok(/where a river you drew starts/.test(hint) && gone[0] === 0 && gone[1] === 4 && gone[2] === valley && took === `Took away the source of the ${drawn[0].replace(/^The /, '')}. Its valley stays, and rain finds its own way down it.`,
    `Erase on where a drawn river starts takes it away and leaves its valley ("${took}")`);
  await pg.click('#btnUndo'); await pg.waitForTimeout(300);
  ok(await E(() => window.terra.state().springs) === 1, 'and Undo brings it back');
  await c.close();
}

// Sketches that keep what's on the map, on the starting world. A River drawn into a lake ends there, and one drawn
// down beside a long lake passes it by: both lakes keep their water. (They were drained, from 252 cells to 29 and
// from 257 to 6.)
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const E = (fn, arg) => pg.evaluate(fn, arg);
  const fresh = () => E(() => window.terra.newWorld(20417, 'continent'));
  // The cells of the lake at a point, and how many of them are still lake.
  const lakeAt = (x, y) => E(([x0, y0]) => {
    const seen = new Set(), st = [[x0, y0]], out = [];
    while (st.length) {
      const [x, y] = st.pop(), k = x + ',' + y; if (seen.has(k) || x < 0 || y < 0 || x >= 480 || y >= 300) continue; seen.add(k);
      if (!window.terra.cell(x + 0.5, y + 0.5).lake) continue;
      out.push([x, y]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) st.push([x + dx, y + dy]);
    }
    return out;
  }, [x, y]);
  const still = (cells) => E((cells) => cells.filter(([x, y]) => window.terra.cell(x + 0.5, y + 0.5).lake).length, cells);
  await pg.click('.tool[data-tool="sketch"]');
  await pg.click('.chip[data-v="river"]');
  for (const [what, line, at] of [['into a lake', [[150, 140], [170, 160], [185, 172]], [185, 172]], ['down beside a long lake', [[262, 95], [262, 150], [262, 200], [262, 260]], [262, 122]]]) {
    await fresh();
    const lake = await lakeAt(...at);
    await drag(line, 10, pg);
    const left = await still(lake);
    ok(lake.length > 200 && left >= lake.length * 0.9, `a river drawn ${what} leaves the lake (${lake.length} cells before, ${left} after)`);
  }
  // A Mountain range across the way out of a lake: the lake's river cuts a gorge through it, and the lake stays the size
  // it was. The lake used to rise behind the range, from 1,382 lake cells on the map to 2,002.
  await fresh();
  const lakesBefore = (await E(() => window.terra.state())).lakes;
  await pg.click('.chip[data-v="range"]');
  await drag([[150, 90], [200, 130], [260, 160], [300, 170]], 10, pg);
  const lakesAfter = (await E(() => window.terra.state())).lakes;
  ok(lakesAfter <= lakesBefore * 1.05, `a range across a lake's way out leaves the lake be (${lakesBefore} lake cells before, ${lakesAfter} after)`);
  // A long River line that crosses a sea inlet near its start becomes a river over the long stretch of land after the
  // inlet, out to the sea at the line's end, and says the line crossed the sea. It used to end at the inlet, and the
  // rest of the line, about 250 cells, was dropped without a word.
  await fresh();
  await pg.click('.chip[data-v="river"]');
  const long = [[90, 80], [150, 110], [200, 140], [260, 170], [300, 200], [330, 240], [340, 275]];
  const along = []; for (let k = 0; k < long.length - 1; k++) for (let t = 0; t < 1; t += 0.05) along.push([long[k][0] + (long[k + 1][0] - long[k][0]) * t, long[k][1] + (long[k + 1][1] - long[k][1]) * t]);
  const sea = await E((pts) => pts.map(([x, y]) => window.terra.cell(x, y).h < 0), along);
  let end = sea.length - 1; while (sea[end]) end--;
  let start = end; while (start > 0 && !sea[start - 1]) start--;
  ok(start > 5 && end - start > 60, `that line crosses an inlet and then a long stretch of land (points ${start} to ${end} of ${along.length})`);
  await drag(long, 10, pg);
  const run = along.slice(start, end - 1), beside = (await E((pts) => pts.map(([x, y]) => window.terra.riverNear(x, y, 2.5)), run)).filter(Boolean).length;
  const inletToast = await pg.textContent('#toast span');
  ok(beside >= run.length * 0.8 && /crossed the sea/.test(inletToast), `a river line across an inlet runs over the land after it (${beside} of ${run.length} points), and says what was left out ("${inletToast}")`);
  // A figure-8 drawn as a Land loop raises both lobes, as two loops would, and a loop drawn twice round raises what one
  // loop does. The figure-8 was refused as too small (its lobes cancelled out), and the loop drawn twice stayed sea.
  await E(() => window.terra.startBlank());
  await E(() => { const r = document.getElementById('optRough'); r.value = '0'; r.dispatchEvent(new Event('input')); });
  const ring = (t0, t1, f) => { const o = []; for (let k = 0; k <= 48; k++) o.push(f(t0 + (t1 - t0) * k / 48)); return o; };
  const eight = (t) => [240 + 60 * Math.sin(t), 150 + 40 * Math.sin(2 * t)], oval = (t) => [240 + 50 * Math.cos(t), 150 + 30 * Math.sin(t)];
  const landFrom = async (...loops) => { await E(() => window.terra.startBlank()); for (const l of loops) await drag(l, 2, pg); return (await E(() => window.terra.state())).land; };
  const lobes = await landFrom(ring(0, Math.PI, eight), ring(Math.PI, 2 * Math.PI, eight)), figure8 = await landFrom(ring(0, 2 * Math.PI, eight));
  const once = await landFrom(ring(0, 2 * Math.PI, oval)), twice = await landFrom(ring(0, 4 * Math.PI, oval));
  ok(lobes > 2000 && Math.abs(figure8 - lobes) < lobes * 0.1 && once > 2000 && Math.abs(twice - once) < once * 0.1, `a figure-8 raises both its lobes (${figure8} land cells, against ${lobes} for the lobes drawn one at a time), and a loop drawn twice round raises one loop's land (${twice} cells, against ${once})`);
  // A drawn river goes with its land. Its source used to stay in the world for good, so a river ran from that spot again
  // wherever land came back. Flooding the island takes it; Undo brings it back with the island, and Redo takes it again.
  await E(() => window.terra.startBlank());
  const island = [[180, 100], [260, 100], [260, 180], [180, 180], [180, 100]];
  await drag(island, 8, pg);
  await pg.click('.chip[data-v="river"]');
  await drag([[215, 125], [230, 150], [258, 175], [275, 190]], 8, pg);
  const drawn = await E(() => [window.terra.state().springs, window.terra.riverNear(215, 125, 1.5)]);
  await pg.click('.chip[data-v="sea"]');
  await drag([[160, 80], [290, 80], [290, 210], [160, 210], [160, 80]], 8, pg);
  const drowned = await E(() => [window.terra.state().springs, window.terra.state().land]);
  await pg.click('#btnUndo'); const undone = await E(() => window.terra.state().springs);
  await pg.click('#btnRedo'); const redone = await E(() => window.terra.state().springs);
  await pg.click('.chip[data-v="land"]');
  await drag(island, 8, pg);
  ok(drawn.join() === '1,true' && drowned.join() === '0,0' && undone === 1 && redone === 0 && (await E(() => window.terra.state().springs)) === 0, `a drawn river's source goes when its island is flooded, comes back with an Undo, and stays gone when land is raised there again`);
  // Edits that change nothing you can see say so, and leave no Undo step to use up: Raise and Wetter out on open sea, and
  // a Land loop over mountains already higher than its coast would be. Each used to take an Undo step and say nothing,
  // or "Land raised".
  await fresh();
  const quiet = async () => E(async () => ({ undo: window.terra.state().undo, print: await window.terra.fingerprint() }));
  const openSea = [[25, 28], [35, 30], [45, 34]];
  ok(await E((pts) => pts.every(([x, y]) => window.terra.cell(x, y).h < -0.05), openSea), 'the starting world has open sea in its north-west corner');
  const said = [];
  for (const t of ['raise', 'rain']) {
    await pg.click(`.tool[data-tool="${t}"]`);
    const before = await quiet();
    await drag(openSea, 6, pg);
    said.push([t, (await quiet()).undo === before.undo, await pg.textContent('#toast span')]);
  }
  ok(said[0][1] && said[0][2].startsWith('The sea floor rose, but not above the waves yet.') && said[1][1] && said[1][2] === 'Rain only changes the land.', `Raise and Wetter on open sea take no Undo step, and say why ("${said[0][2]}", "${said[1][2]}")`);
  await pg.click('.tool[data-tool="sketch"]');
  await pg.click('.chip[data-v="land"]');
  await pg.click('.chip[data-v="low"]');
  const peaks = await quiet(), ridge = []; for (let k = 0; k <= 16; k++) ridge.push([304 + 6 * Math.cos(k * Math.PI / 8), 136 + 6 * Math.sin(k * Math.PI / 8)]);
  await drag(ridge, 3, pg);
  const highToast = await pg.textContent('#toast span');
  ok(JSON.stringify(await quiet()) === JSON.stringify(peaks) && highToast === 'That ground is already higher than a Low coast would make it. Use Raise, a higher Height, or a Mountain range to build it up.', `a Low Land loop over mountains changes nothing and takes no Undo step, and says why ("${highToast}")`);
  await pg.click('.chip[data-v="medium"]');
  // Each brush changes what it says under the stroke, and Undo puts it back exactly: Raise and Smooth the ground (on
  // the high ground the Low loop left alone), Wetter and Drier the rain. And Wetter turns grassland into forest, as the
  // README says.
  const under = () => E(() => { const o = []; for (let y = 132; y <= 140; y++) for (let x = 298; x <= 310; x++) { const c = window.terra.cell(x + 0.5, y + 0.5); o.push([c.h, c.m]); } return o; });
  const brushed = [];
  for (const [t, k] of [['raise', 0], ['smooth', 0], ['rain', 1], ['drought', 1]]) {
    await pg.click(`.tool[data-tool="${t}"]`);
    const before = await under();
    await drag([[300, 136], [308, 136], [300, 136]], 6, pg);
    const after = await under();
    await pg.click('#btnUndo');
    const changed = after.filter((c, i) => c[k] !== before[i][k]).length, other = after.filter((c, i) => c[1 - k] !== before[i][1 - k]).length;
    brushed.push([t, changed, other, JSON.stringify(await under()) === JSON.stringify(before)]);
  }
  ok(brushed.every(([, changed, other, back]) => changed > 20 && !other && back), `each brush changes the ground or the rain under it, and Undo puts it back (${brushed.map(([t, n]) => `${t} ${n} cells`).join(', ')})`);
  await pg.click('.tool[data-tool="rain"]');
  await E(() => { for (const [id, v] of [['optSize', '6'], ['optStr', '10']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
  // Grassland with grassland all round it, away from the map's edges and up from the coast's marshes.
  const field = await E(() => { for (let y = 20.5; y < 280; y += 2) for (let x = 20.5; x < 460; x += 2) { let all = window.terra.cell(x, y).elev > 150; for (let dy = -4; dy <= 4 && all; dy += 2) for (let dx = -4; dx <= 4 && all; dx += 2) if (window.terra.cell(x + dx, y + dy).kind !== 'Grassland') all = false; if (all) return { x, y }; } return null; });
  await E((w) => window.terra.centerOn(w.x, w.y), field);
  const grass = await E((w) => window.terra.cell(w.x, w.y).kind, field);
  for (let k = 0; k < 4; k++) await drag([[field.x - 4.5, field.y - 0.5], [field.x + 4.5, field.y - 0.5], [field.x - 4.5, field.y - 0.5]], 6, pg);
  const greener = await E((w) => window.terra.cell(w.x, w.y).kind, field);
  ok(grass === 'Grassland' && /forest/.test(greener), `Wetter turns grassland into forest (${grass}, then ${greener})`);
  await c.close();
}

// A Mountain range drawn over ground already higher than it would be changes nothing, so it takes no Undo step and
// says why, as a Land loop does. It said 'Mountains raised' and took an Undo step for a world exactly as it was.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const quiet = () => pg.evaluate(async () => ({ undo: window.terra.state().undo, print: await window.terra.fingerprint() }));
  await pg.click('.tool[data-tool="raise"]');
  await pg.evaluate(() => { for (const [id, v] of [['optSize', '14'], ['optStr', '10']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
  const b = await pg.locator('#map').boundingBox(), s = await pg.evaluate(() => window.terra.toScreen(304, 136));
  await pg.mouse.move(b.x + s.x, b.y + s.y); await pg.mouse.down(); await pg.waitForTimeout(3500); await pg.mouse.up();
  await pg.waitForTimeout(300);
  await pg.click('.tool[data-tool="sketch"]');
  await pg.click('.chip[data-v="range"]');
  await pg.click('.chip[data-v="low"]');
  await pg.evaluate(() => { const r = document.getElementById('optWidth'); r.value = '3'; r.dispatchEvent(new Event('input')); });
  const before = await quiet();
  await drag([[299, 136], [304, 136], [309, 136]], 6, pg);
  const said = await pg.textContent('#toast span');
  ok(JSON.stringify(await quiet()) === JSON.stringify(before) && said === 'That ground is already higher than a Low range would make it. Use Raise or a higher Height to build it up.', `a Low Mountain range over higher ground changes nothing and takes no Undo step, and says why ("${said}")`);
  await pg.click('.chip[data-v="medium"]');
  await c.close();
}

// Raise on open sea that doesn't reach the surface keeps the heights in the save's steps of 1/65535, as every other
// edit does, so the world in memory, the autosave and what Undo brings back agree. It left 396 cells between steps.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.click('.tool[data-tool="raise"]');
  await drag([[25, 28], [35, 30], [45, 34]], 6, pg);
  const said = await pg.textContent('#toast span');
  const between = await pg.evaluate(() => {
    const sea = +document.getElementById('wSea').value; let n = 0;
    for (let y = 15; y < 50; y++) for (let x = 10; x < 60; x++) { const v = (window.terra.cell(x + 0.5, y + 0.5).h + sea) * 65535; if (Math.abs(v - Math.round(v)) > 1e-3) n++; }
    return n;
  });
  ok(said.startsWith('The sea floor rose') && between === 0, `Raise on open sea leaves the heights in the save's steps (${between} cells between them)`);
  await c.close();
}

// Raise held in one spot builds a dome: it eases off near the top of the heights, so the ground keeps a shape the
// shading can show. It rose by the same amount to the very top, and made a flat white disc at exactly 5,200 m.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.click('.tool[data-tool="raise"]');
  await pg.evaluate(() => { for (const [id, v] of [['optSize', '14'], ['optStr', '10']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
  const b = await pg.locator('#map').boundingBox(), s = await pg.evaluate(() => window.terra.toScreen(150, 160));
  await pg.mouse.move(b.x + s.x, b.y + s.y); await pg.mouse.down(); await pg.waitForTimeout(3000); await pg.mouse.up();
  await pg.waitForTimeout(300);
  const top = await pg.evaluate(() => {
    const sea = +document.getElementById('wSea').value, o = [];
    for (let x = 144; x <= 156; x++) o.push(window.terra.cell(x + 0.5, 160.5).h + sea);
    return o;
  });
  const atCeiling = top.filter((h) => h > 1 - 1e-6).length, flat = new Set(top.slice(3, 10).map((h) => h.toFixed(5))).size;
  ok(atCeiling === 0 && flat > 3, `Raise held 3 s in one spot builds a dome, not a flat disc at the top (${atCeiling} cells at the very top, ${flat} different heights across its middle)`);
  await c.close();
}

// Raise over a river keeps it a channel through the raised ground, as a range does, instead of damming its bed into a
// string of small lakes (four dabs over a river on seed 10 turned 7 cells of its bed into lake, one cell wide). And a
// hollow it leaves fills rather than holding a pond.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const grid = () => pg.evaluate(() => { const g = []; for (let y = 100; y < 140; y++) for (let x = 140; x < 180; x++) { const c = window.terra.cell(x + 0.5, y + 0.5); g.push(c.lake ? 2 : c.river ? 1 : 0); } return g; });
  await pg.evaluate(() => { window.terra.newWorld(10, 'continent'); window.terra.setTool('raise'); window.terra.centerOn(160.5, 118.5); });
  await pg.evaluate(() => { for (const [id, v] of [['optSize', '6'], ['optStr', '10']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
  const before = await grid(), riverCells = before.filter((v) => v === 1).length;
  await pg.focus('#map');
  for (let k = 0; k < 4; k++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); }
  const after = await grid(), raised = await pg.evaluate(() => window.terra.cell(160.5, 118.5).elev);
  const bed = before.filter((v, i) => v === 1 && after[i] === 2).length, ponds = before.filter((v, i) => v !== 2 && after[i] === 2).length;
  ok(riverCells > 30 && bed === 0 && ponds === 0 && after.filter((v) => v === 1).length >= riverCells * 0.9, `Raise over a river leaves it running, with no lake along its bed (${bed} bed cells and ${ponds} cells in all turned to lake; ${after.filter((v) => v === 1).length} of ${riverCells} river cells; ground raised to ${Math.round(raised)} m)`);
  // A light dab in a lake that was already there only makes it shallower, as it always did: filling hollows mustn't
  // turn the dabbed patch of the starting world's big lake into dry land at the water's level.
  await pg.evaluate(() => { window.terra.newWorld(20417, 'continent'); window.terra.setTool('raise'); window.terra.centerOn(268.5, 143.5); });
  await pg.evaluate(() => { for (const [id, v] of [['optSize', '4'], ['optStr', '3']]) { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event('input')); } });
  const lakes0 = await pg.evaluate(() => window.terra.state().lakes);
  await pg.focus('#map'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  const [lakes1, mid] = await pg.evaluate(() => [window.terra.state().lakes, window.terra.cell(268.5, 143.5)]);
  ok(mid.lake && lakes1 === lakes0, `a light Raise dab in a lake leaves it a lake (${lakes0} lake cells, then ${lakes1}; the middle is ${mid.kind})`);
  await c.close();
}

// On a touch screen the brush's ring shows under the finger while it paints, and goes when it lifts; moving the Brush
// slider shows the ring at its real size in the middle of the map for a moment. With a mouse the ring follows the
// pointer as before, and the slider shows nothing.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  await pg.click('.tool[data-tool="raise"]');
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const b = await pg.locator('#map').boundingBox();
  const p = await pg.evaluate(() => window.terra.toScreen(200, 150)), q = await pg.evaluate(() => window.terra.toScreen(206, 153));
  const frames = () => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ring = () => pg.evaluate(() => window.terra.ring());
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x: b.x + x, y: b.y + y })) });
  ok((await ring()) === null, 'no brush ring shows on a touch screen before a finger is down');
  await touch('touchStart', [[p.x, p.y]]);
  for (let k = 1; k <= 4; k++) await touch('touchMove', [[p.x + (q.x - p.x) * k / 4, p.y + (q.y - p.y) * k / 4]]);
  await frames();
  const held = await ring(), size = await pg.evaluate(() => +document.getElementById('optSize').value), s = (q.x - p.x) / 6;
  ok(held && Math.abs(held.x - q.x) < 1 && Math.abs(held.y - q.y) < 1 && Math.abs(held.r - size * s) < 0.5, `a finger painting with Raise shows the brush's ring under it (${held && held.r.toFixed(1)} px from the middle for a ${size}-cell brush)`);
  await touch('touchEnd', []);
  await pg.waitForTimeout(300); await frames();
  ok((await ring()) === null, 'and the ring goes when the finger lifts');
  await pg.evaluate(() => { const r = document.getElementById('optSize'); r.value = '30'; r.dispatchEvent(new Event('input')); });
  await frames();
  const shown = await ring(), mid = await pg.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return [r.width / 2, r.height / 2]; });
  ok(shown && Math.abs(shown.x - mid[0]) < 1 && Math.abs(shown.y - mid[1]) < 1 && Math.abs(shown.r - 30 * s) < 0.5, `moving the Brush slider shows the ring at its size in the middle of the map (${shown && shown.r.toFixed(1)} px)`);
  await pg.waitForTimeout(900); await frames();
  ok((await ring()) === null, 'for a moment');
  await c.close();
  const m = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mp = watch(await m.newPage());
  await mp.goto(base);
  await mp.click('.tool[data-tool="raise"]');
  await mp.evaluate(() => { const r = document.getElementById('optSize'); r.value = '30'; r.dispatchEvent(new Event('input')); });
  await mp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const quiet = await mp.evaluate(() => window.terra.ring());
  const mb = await mp.locator('#map').boundingBox();
  await mp.mouse.move(mb.x + 300, mb.y + 300);
  await mp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const follow = await mp.evaluate(() => window.terra.ring());
  ok(quiet === null && follow && Math.round(follow.x) === 300 && Math.round(follow.y) === 300, 'with a mouse the ring follows the pointer, and the slider shows nothing');
  await m.close();
}

// A brush stroke traces the coast again at most every 120 ms while it moves, not on every frame (which took most of each
// frame on a slow phone), and once more when it lets go, so the coast at rest is the same.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }), pg = await c.newPage();
  await pg.goto(base);
  await pg.click('.tool[data-tool="raise"]');
  const b = await pg.locator('#map').boundingBox(), a = await pg.evaluate(() => window.terra.toScreen(200, 150));
  const t0 = await pg.evaluate(() => [window.terra.coastTraces(), performance.now()]);
  await pg.mouse.move(b.x + a.x, b.y + a.y); await pg.mouse.down();
  for (let k = 1; k <= 30; k++) { await pg.mouse.move(b.x + a.x + k * 3, b.y + a.y + k); await pg.waitForTimeout(20); }
  const t1 = await pg.evaluate(() => [window.terra.coastTraces(), performance.now()]);
  await pg.mouse.up(); await pg.waitForTimeout(300);
  const t2 = await pg.evaluate(() => window.terra.coastTraces());
  const held = t1[1] - t0[1], traced = t1[0] - t0[0];
  ok(traced <= held / 120 + 2 && t2 > t1[0], `a brush stroke of ${Math.round(held)} ms traced the coast ${traced} times while it moved, and again when it let go`);
  await c.close();
}

// A touch screen says Tap, tells you two fingers move the map, and leaves out the keyboard shortcuts; a mouse says Click
// and lists them, with ⌘ on a Mac. A Land loop's hint says how high it rises.
{
  const hints = async (pg) => {
    const out = {};
    for (const t of ['select', 'sketch', 'raise', 'settle', 'landmark', 'label', 'erase']) {
      await pg.click(`.tool[data-tool="${t}"]`);
      if (t === 'settle') await pg.click('.chip[data-v="town"]');
      out[t] = await pg.textContent('#toolOpts .hint');
    }
    await pg.click('.tool[data-tool="sketch"]');
    out.land = [];
    for (const h of ['low', 'medium', 'high']) { await pg.click(`.chip[data-v="${h}"]`); out.land.push(await pg.textContent('#toolOpts .hint')); }
    await pg.click('.tool[data-tool="select"]');
    await pg.click('#tab-world');
    out.keys = await pg.locator('.keys-section').isVisible();
    out.twoFingers = await pg.locator('.touch-only').isVisible();
    out.rows = await pg.evaluate(() => [...document.querySelectorAll('.keys dt')].map((d) => d.textContent));
    out.grid = await pg.evaluate(() => document.getElementById('lyGrid').parentElement.textContent);
    out.undo = await pg.evaluate(() => [document.getElementById('btnUndo').title, document.getElementById('btnRedo').title]);
    out.tool = await pg.evaluate(() => document.querySelector('.tool[data-tool="sketch"]').getAttribute('aria-label'));
    await pg.click('#tab-inspect');
    out.welcome = await pg.textContent('#pane-inspect .tips li');
    return out;
  };
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const t = await hints(pg);
  ok(t.select === 'Drag to pan. Pinch to zoom. Tap a place or any spot to read about it.', `on a touch screen the Select hint says Tap ("${t.select}")`);
  ok(t.settle === 'Tap dry land to found it.' && t.erase.startsWith('Tap a place or label') && t.landmark === 'Tap dry land to mark it.' && t.label === 'Tap the map to place it.' && t.welcome.startsWith('Tap any place'), 'and so do the settle, landmark, label and remove hints and the welcome, and landmark and label say what to do');
  ok(t.sketch.endsWith('Two fingers move the map.') && t.raise.endsWith('Two fingers move the map.'), 'the sketch and brush hints say two fingers move the map');
  ok(!t.keys && t.twoFingers, 'the keyboard shortcuts give way to one line on moving the map');
  await c.close();
  const m = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mp = watch(await m.newPage());
  await mp.goto(base);
  const d = await hints(mp);
  ok(d.select.startsWith('Drag to pan. Scroll or pinch to zoom. Click') && d.settle === 'Click dry land to found it.' && d.landmark === 'Click dry land to mark it.' && d.label === 'Click the map to place it.' && !/Two fingers/.test(d.sketch + d.raise), 'with a mouse the hints say Click');
  ok(d.keys && !d.twoFingers && d.rows.includes('+ −') && d.rows.includes('Esc') && d.rows.includes('Ctrl Z') && d.rows.includes('Ctrl S') && d.rows.includes('Ctrl O') && d.undo[0] === 'Undo (Ctrl+Z)', `with a mouse the shortcuts show, zoom and Esc among them (${d.rows.join(', ')})`);
  ok(JSON.stringify(d.land) === JSON.stringify(['400', '1,000', '2,500'].map((m) => `Draw a loop. Land rises inside it, to about ${m} m.`)), `a Land loop's hint says how high it rises (${d.land.map((h) => h.match(/about ([\d,]+) m/)[1]).join(', ')} m)`);
  ok(d.grid === 'Grid lines' && d.tool === 'Sketch land, sea, ranges, rivers and roads', 'the grid layer and the sketch tool say what they are');
  await m.close();
  const mac = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await mac.addInitScript(() => { for (const [k, v] of [['platform', 'MacIntel'], ['userAgentData', { platform: 'macOS' }]]) Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true }); });
  const macPage = watch(await mac.newPage());
  await macPage.goto(base);
  const undoKeys = await macPage.evaluate(() => [document.getElementById('btnUndo').title, document.getElementById('btnRedo').title, ...['keyUndo', 'keySave', 'keyOpen'].map((k) => document.getElementById(k).textContent)]);
  ok(JSON.stringify(undoKeys) === JSON.stringify(['Undo (⌘Z)', 'Redo (⇧⌘Z)', '⌘ Z', '⌘ S', '⌘ O']), `on a Mac Undo, Save and Open say ⌘ (${undoKeys.join(', ')})`);
  await mac.close();
}

// The first screen says what this is and what to try. The welcome opens with a line on what this world is, its tool
// names pick those tools (and on a phone bring the map up), and its count leaves out what there's none of. A place's
// page has Show on map, which on a phone brings the map back into view, centred on it. (On a phone under 700 px tall,
// where the map isn't kept at the top of the screen.)
{
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const hint = () => pg.textContent('#toolOpts .hint');
  const first = await hint();
  ok(first === 'Tap a town to read its page, or tap the pencil to sketch your own land.', `on the first visit the Select hint says what to try ("${first}")`);
  const lede = await pg.textContent('#pane-inspect .lede');
  ok(lede === "A world that doesn't exist, made for you from seed 20417. Read about any town, or sketch your own coastlines, ranges and rivers.", 'the welcome opens with what this world is');
  const tools = await pg.evaluate(() => [...document.querySelectorAll('#pane-inspect .tool-link')].map((b) => [b.dataset.tool, b.textContent, !!b.querySelector('svg')]));
  ok(JSON.stringify(tools) === JSON.stringify([['sketch', 'Sketch', true], ['raise', 'Raise', true], ['lower', 'Lower', true], ['settle', 'Found a settlement', true]]), 'the welcome names Sketch, Raise, Lower and Found a settlement as buttons with their icons');
  // Once a town's page has been read, the hint stops telling you to tap one. It stayed until another tool was picked.
  await pg.click('#pane-inspect .welcome [data-goto]');
  const afterRead = await hint();
  await pg.evaluate(() => window.terra.select(null));
  ok(afterRead.startsWith('Drag to pan.'), `once a town's page is open the Select hint is the usual one ("${afterRead}")`);
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  ok(await pg.evaluate(() => document.getElementById('map').getBoundingClientRect().top < -40), 'with the welcome scrolled to, the map is partly off screen');
  await pg.click('#pane-inspect .tool-link[data-tool="sketch"]');
  await pg.waitForTimeout(900);
  const picked = await pg.evaluate(() => { const r = document.getElementById('mapwrap').getBoundingClientRect(); return { tool: document.querySelector('.tool[aria-pressed="true"]').dataset.tool, top: r.top, bottom: r.bottom }; });
  ok(picked.tool === 'sketch' && picked.top >= -1 && picked.bottom <= 668, `its Sketch picks the sketch tool and brings the map into view (map ${Math.round(picked.top)} to ${Math.round(picked.bottom)} px down the screen)`);
  await pg.click('.tool[data-tool="select"]');
  const normal = await hint();
  ok(normal.startsWith('Drag to pan.'), 'and once a tool has been picked the Select hint is the usual one');
  await pg.click('#pane-inspect .tool-link[data-tool="settle"]');
  ok(await pg.evaluate(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool === 'settle' && document.querySelector('.chip[data-v="capital"]').getAttribute('aria-pressed') === 'true'), 'its Found a settlement picks the settle tool, with Capital chosen');
  // A place's climate says a year, with room around the dot.
  await pg.click('#tab-codex');
  await pg.locator('#codexList .crow').nth(8).click();
  const climate = await pg.evaluate(() => { const dd = [...document.querySelectorAll('#pane-inspect .facts dt')].find((d) => d.textContent === 'Climate').nextElementSibling; return [dd.textContent, parseFloat(getComputedStyle(dd.querySelector('.sep')).marginLeft)]; });
  ok(/^-?\d+ °C mean·[\d,]+ mm a year$/.test(climate[0]) && climate[1] >= 4, `a place's climate gives its rain a year ("${climate[0]}")`);
  // Show on map, from a page scrolled down below the map.
  await pg.evaluate(() => { const p = window.terra.places()[0]; window.terra.centerOn(p.x, p.y); window.scrollTo(0, document.documentElement.scrollHeight); });
  ok(await pg.evaluate(() => document.getElementById('map').getBoundingClientRect().bottom < 0), 'with the page scrolled down to the notes, the map is off screen');
  await pg.click('#showOnMap');
  await pg.waitForTimeout(900);
  const shown = await pg.evaluate(() => { const r = document.getElementById('mapwrap').getBoundingClientRect(); const pl = window.terra.places(), name = document.getElementById('pName').value, p = pl.find((q) => q.name === name), s = window.terra.toScreen(p.x, p.y); return { top: r.top, bottom: r.bottom, dx: Math.abs(s.x - r.width / 2), dy: Math.abs(s.y - r.height / 2), cw: r.width, ch: r.height }; });
  ok(shown.top >= -1 && shown.bottom <= 668 && shown.dx < shown.cw * 0.3 && shown.dy < shown.ch * 0.3, `Show on map brings the map into view, centred on the place (${Math.round(shown.dx)}, ${Math.round(shown.dy)} px off the middle)`);
  // A count with no realms in it says so, and points at founding a capital.
  await pg.click('#tab-world');
  await pg.click('#wClear');
  await pg.evaluate(() => { window.terra.setTool('settle'); window.terra.fitView(); });
  await pg.click('.chip[data-v="town"]');
  await pg.evaluate(() => window.scrollTo(0, 0));
  const b = await pg.locator('#map').boundingBox(), at = await pg.evaluate(() => window.terra.toScreen(200, 150));
  await pg.touchscreen.tap(b.x + at.x, b.y + at.y);
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.terra.select(null));
  const lone = await pg.evaluate(() => [document.querySelector('#pane-inspect .welcome p:not(.eyebrow):not(.lede)').textContent, document.querySelectorAll('#pane-inspect .tips li')[2].textContent]);
  ok(/^1 settlement and no realms across [\d,]+ km² of land\.$/.test(lone[0]) && lone[1].startsWith('No realm rules this land yet. Pick Found a settlement and choose Capital'), `a world with one town and no realms says so ("${lone[0]}")`);
  await c.close();
  const m = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mp = watch(await m.newPage());
  await mp.goto(base);
  ok((await mp.textContent('#toolOpts .hint')).startsWith('Click a town to read its page'), 'with a mouse the first hint says Click');
  const mapAt = await mp.locator('#map').boundingBox();
  await mp.mouse.click(mapAt.x + mapAt.width / 2, mapAt.y + mapAt.height / 2);
  ok((await mp.textContent('#toolOpts .hint')).startsWith('Drag to pan. Scroll or pinch') && await mp.evaluate(() => !!document.getElementById('showOnMap')), 'and once a spot on the map has been read, the usual one');
  const p = (await mp.evaluate(() => window.terra.places())).sort((a, b) => Math.hypot(a.x - 240, a.y - 150) - Math.hypot(b.x - 240, b.y - 150))[0];
  await mp.evaluate((p) => window.terra.select({ type: 'place', id: p.id }), p);
  await mp.click('#showOnMap');
  const centred = await mp.evaluate((p) => { const r = document.getElementById('mapwrap').getBoundingClientRect(), s = window.terra.toScreen(p.x, p.y); return [Math.abs(s.x - r.width / 2), Math.abs(s.y - r.height / 2), scrollY]; }, p);
  ok(centred[0] < 2 && centred[1] < 2 && centred[2] === 0, 'on a laptop Show on map centres the map on the place');
  await mp.evaluate(() => window.terra.select({ type: 'loc', x: 240, y: 150 }));
  ok(await mp.locator('#showOnMap').isVisible(), 'and a spot on the map has it too');
  await m.close();
}

// A pinch with a brush picked zooms and paints nothing. Every pinch starts with one finger, which used to start a stroke
// that the second finger then kept: a dab of Raise, or of rain, and an Undo step nobody meant. A stroke already under
// way when a second finger lands is kept, as before.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  const b = await pg.locator('#map').boundingBox();
  const at = async (x, y) => { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); return [b.x + p.x, b.y + p.y]; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const look = () => pg.evaluate(async () => ({ undo: window.terra.state().undo, redo: !document.getElementById('btnRedo').disabled, cells: [[200, 150], [205, 152], [196, 147]].map(([x, y]) => window.terra.cell(x, y).h), print: await window.terra.fingerprint() }));
  // Something to redo, which a pinch should leave alone too.
  await pg.click('#tab-world');
  await pg.fill('#worldName', 'Pinched');
  await pg.click('#btnUndo');
  for (const tool of ['raise', 'rain']) {
    await pg.click(`.tool[data-tool="${tool}"]`);
    const before = await look(), a = await at(200, 150), z = await at(215, 165);
    await touch('touchStart', [a]);
    await pg.waitForTimeout(60);
    await touch('touchStart', [a, z]);
    for (let k = 1; k <= 5; k++) await touch('touchMove', [[a[0] - k * 4, a[1] - k * 4], [z[0] + k * 4, z[1] + k * 4]]);
    await touch('touchEnd', []);
    await pg.waitForTimeout(400);
    const after = await look();
    ok(JSON.stringify(after) === JSON.stringify(before), `a pinch with ${tool === 'raise' ? 'Raise' : 'Wetter'} picked leaves the land, the rain and Undo and Redo as they were`);
  }
  await pg.click('.tool[data-tool="raise"]');
  const undoBefore = (await look()).undo, a = await at(200, 150);
  await touch('touchStart', [a]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [[a[0] + k * 4, a[1]]]); await pg.waitForTimeout(50); }
  await touch('touchStart', [[a[0] + 32, a[1]], [a[0] + 80, a[1] + 60]]);
  await touch('touchEnd', []);
  await pg.waitForTimeout(400);
  ok((await look()).undo === undoBefore + 1, 'a stroke already under way when a second finger lands is kept');
  // A brush keeps painting where a finger is held, so a finger held still a while has built something: a second finger
  // then keeps it.
  const heldBefore = await look(), h0 = await at(204, 146);
  await touch('touchStart', [h0]);
  await pg.waitForTimeout(1300);
  await touch('touchStart', [h0, [h0[0] + 60, h0[1] + 60]]);
  await touch('touchEnd', []);
  await pg.waitForTimeout(400);
  const heldAfter = await look();
  ok(heldAfter.undo === heldBefore.undo + 1 && heldAfter.print.h !== heldBefore.print.h, 'a finger held still painting for over a second keeps what it painted when a second finger lands');
  await c.close();
}

// A pinch with one finger just off the map, on the tool's options under it, zooms and paints nothing, as a pinch
// wholly on the map does. The map is only 250 px tall on a phone, with the tools right above and below it, so a pinch
// near its edge often puts a finger off it; that finger went unseen, and the other drew a river or raised land.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const look = () => pg.evaluate(() => { const s = window.terra.state(); return { land: s.land, springs: s.springs, undo: s.undo }; });
  const span = () => pg.evaluate(() => window.terra.toScreen(480, 0).x - window.terra.toScreen(0, 0).x);
  const said = [];
  for (const [tool, mode] of [['raise'], ['sketch', 'river']]) {
    await pg.click(`.tool[data-tool="${tool}"]`);
    if (mode) await pg.click(`.chip[data-v="${mode}"]`);
    await pg.evaluate(() => { window.terra.fitView(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    const b = await pg.locator('#map').boundingBox(), o = await pg.locator('#toolOpts').boundingBox();
    const p = await pg.evaluate(() => window.terra.toScreen(215, 250)), a = [b.x + p.x, b.y + p.y], z = [a[0] + 10, o.y + 16];
    const before = await look(), wide = await span();
    await touch('touchStart', [a]);
    await pg.waitForTimeout(30);
    await touch('touchStart', [a, z]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[a[0], a[1] - k * 5], [z[0], z[1] + k * 5]]); await pg.waitForTimeout(16); }
    await touch('touchEnd', []);
    await pg.waitForTimeout(400);
    const after = await look(), zoomed = await span();
    said.push(`${tool}${mode ? ' > ' + mode : ''}: land ${before.land} then ${after.land}, ${after.springs - before.springs} new rivers, ${after.undo - before.undo} Undo steps, map ${Math.round(wide)} then ${Math.round(zoomed)} px wide`);
    ok(JSON.stringify(after) === JSON.stringify(before) && zoomed > wide * 1.1, `a pinch with one finger on the tool's options under the map zooms and changes nothing, with ${said.at(-1)}`);
  }
  // A second finger held still on a tool in the toolbar above the map, while the first moves: the pinch doesn't pick
  // that tool when it lifts.
  await pg.click('.tool[data-tool="raise"]');
  await pg.evaluate(() => { window.terra.fitView(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  {
    const b = await pg.locator('#map').boundingBox(), t = await pg.locator('.tool[data-tool="select"]').boundingBox();
    const p = await pg.evaluate(() => window.terra.toScreen(200, 60)), a = [b.x + p.x, b.y + p.y], z = [t.x + t.width / 2, t.y + t.height / 2];
    const before = await look();
    await touch('touchStart', [a]);
    await pg.waitForTimeout(30);
    await touch('touchStart', [a, z]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[a[0], a[1] + k * 6], z]); await pg.waitForTimeout(16); }
    await touch('touchEnd', [a]);
    await touch('touchEnd', []);
    await pg.waitForTimeout(400);
    const tool = await pg.evaluate(() => document.querySelector('.tool[aria-pressed="true"]').dataset.tool);
    ok(JSON.stringify(await look()) === JSON.stringify(before) && tool === 'raise', `with the second finger held still on the Select tool, it changes nothing and Raise stays picked (${tool})`);
  }
  // A tap on a tool with no finger on the map still picks it.
  await pg.click('.tool[data-tool="select"]');
  ok(await pg.evaluate(() => document.querySelector('.tool[data-tool="select"]').getAttribute('aria-pressed') === 'true'), 'and a tap on a tool with no finger on the map still picks it');
  await c.close();
}

// A town dragged and then pinched before the finger lifts stays where it was dragged to: the move is saved, the borders
// follow it and its page shows where it is now. The pinch used to take over the drag before it was finished, so the
// move was drawn but never saved, and a reload put the town back. (A real drag: 40 px over 400 ms. One just begun, or
// a wobble, goes back; see the next test.)
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  const b = await pg.locator('#map').boundingBox();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const position = () => pg.evaluate(() => [...document.querySelectorAll('#pane-inspect .facts dd')].map((d) => d.textContent).join(' | '));
  // A capital with dry land where the drag ends, about 70 cells east on a phone's whole map.
  const cap = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital' && [60, 65, 70, 75, 80].every((d) => { const c = window.terra.cell(p.x + d, p.y); return c.h >= 0 && !c.lake; })));
  const s = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [cap.x, cap.y]), a = [b.x + s.x, b.y + s.y];
  await touch('touchStart', [a]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [[a[0] + k * 5, a[1]]]); await pg.waitForTimeout(50); }
  const held = [a[0] + 40, a[1]];
  await touch('touchStart', [held, [held[0] + 60, held[1] + 60]]);
  await touch('touchMove', [held, [held[0] + 70, held[1] + 70]]);
  await touch('touchEnd', []);
  await pg.waitForTimeout(400);
  const moved = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === cap.id), shown = await position();
  await pg.evaluate((id) => { window.terra.select(null); window.terra.select({ type: 'place', id }); }, cap.id);
  const fresh = await position();
  // The realms' areas in the Codex, as drawn now and as worked out afresh from the saved world after a reload.
  const areas = () => pg.evaluate(() => {
    document.getElementById('tab-codex').click();
    const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')].map((r) => r.textContent).join('|');
    document.getElementById('tab-inspect').click();
    return rows;
  });
  const areasBefore = await areas();
  await pg.waitForTimeout(1200);
  await pg.reload();
  await pg.waitForTimeout(400);
  const back = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === cap.id);
  ok(moved.x > cap.x + 5 && back.x === moved.x && back.y === moved.y, `${cap.name}, dragged and then pinched, keeps its new place after a reload (${cap.x} across, then ${moved.x.toFixed(1)}, then ${back.x.toFixed(1)})`);
  ok(shown === fresh, `and its page shows where it is now (${shown})`);
  ok(areasBefore === await areas(), 'and the borders followed it');
  await c.close();
}

// A pinch that starts on a town leaves it where it was, though the first finger wobbled a few pixels first: the same
// rule as a brush stroke, a drag under 300 ms old, or under 12 px and under a second, goes. A 5 px wobble moved the town
// about 90 km (a pixel is about 17 km on a phone's whole map) and took an Undo step.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  const b = await pg.locator('#map').boundingBox();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const town = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'town');
  const s = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [town.x, town.y]), a = [b.x + s.x, b.y + s.y];
  const undoBefore = (await pg.evaluate(() => window.terra.state())).undo;
  await touch('touchStart', [a]);
  await touch('touchMove', [[a[0] + 2.5, a[1]]]);
  await touch('touchMove', [[a[0] + 5, a[1]]]);
  await pg.waitForTimeout(30);
  const f = [a[0] + 5, a[1]];
  await touch('touchStart', [f, [f[0] + 50, f[1] + 50]]);
  for (let k = 1; k <= 5; k++) await touch('touchMove', [[f[0] - k * 4, f[1] - k * 4], [f[0] + 50 + k * 4, f[1] + 50 + k * 4]]);
  await touch('touchEnd', []);
  await pg.waitForTimeout(300);
  const now = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === town.id), undo = (await pg.evaluate(() => window.terra.state())).undo;
  ok(now.x === town.x && now.y === town.y && undo === undoBefore, `a pinch that starts on ${town.name} with a 5 px wobble leaves it where it was, with no Undo step (moved ${Math.hypot(now.x - town.x, now.y - town.y).toFixed(1)} cells)`);
  await c.close();
}

// A settlement dragged into the sea goes back where it was, as founding one there is refused. A capital could be left
// in open ocean, 3,166 m deep, ruling a realm of 0 km² while its towns went to a neighbour.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const realms = () => pg.evaluate(() => {
    document.getElementById('tab-codex').click();
    const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')].map((r) => r.textContent).join('|');
    document.getElementById('tab-inspect').click();
    return rows;
  });
  const cap = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  const before = { realms: await realms(), undo: (await pg.evaluate(() => window.terra.state())).undo };
  await drag([[cap.x, cap.y], [cap.x - 30, cap.y - 40], [20, 20]], 8, pg);
  const said = await pg.evaluate(() => document.getElementById('toast').hidden ? '' : document.querySelector('#toast span').textContent), now = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === cap.id);
  ok(now.x === cap.x && now.y === cap.y && (await pg.evaluate(() => window.terra.state())).undo === before.undo && await realms() === before.realms && said === `Settlements need dry land. ${cap.name} is back where it was.`,
    `${cap.name} dragged out to sea goes back where it was, with no Undo step and the realms as they were ("${said}")`);
  // Ctrl+Z with the place still over the sea takes back the drag and nothing before it.
  await pg.click('#tab-world');
  await pg.fill('#worldName', 'Dragged');
  await pg.click('.tool[data-tool="select"]');
  const b = await pg.locator('#map').boundingBox(), s = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [cap.x, cap.y]), t = await pg.evaluate(() => window.terra.toScreen(20, 20));
  await pg.mouse.move(b.x + s.x, b.y + s.y); await pg.mouse.down();
  for (let k = 1; k <= 8; k++) await pg.mouse.move(b.x + s.x + (t.x - s.x) * k / 8, b.y + s.y + (t.y - s.y) * k / 8);
  await pg.keyboard.press('Control+z');
  await pg.mouse.up();
  const after = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === cap.id);
  ok(after.x === cap.x && (await pg.evaluate(() => window.terra.state())).name === 'Dragged', 'and Ctrl+Z with it over the sea takes back the drag, not the rename before it');
  // Ctrl+Shift+Z likewise takes back only the drag, and brings back nothing Undo took.
  await pg.keyboard.press('Control+z');
  const named = (await pg.evaluate(() => window.terra.state())).name;
  await pg.mouse.move(b.x + s.x, b.y + s.y); await pg.mouse.down();
  for (let k = 1; k <= 8; k++) await pg.mouse.move(b.x + s.x + (t.x - s.x) * k / 8, b.y + s.y + (t.y - s.y) * k / 8);
  await pg.keyboard.press('Control+Shift+z');
  await pg.mouse.up();
  const redone = (await pg.evaluate(() => window.terra.places())).find((p) => p.id === cap.id), st = await pg.evaluate(() => ({ ...window.terra.state(), redo: !document.getElementById('btnRedo').disabled }));
  ok(named !== 'Dragged' && redone.x === cap.x && st.name === named && st.redo, `and so does Ctrl+Shift+Z, which leaves the undone rename undone ("${st.name}")`);
  await c.close();
}

// Leaving the page in the middle of a brush stroke or a drag saves it, as a phone switching apps may never come back
// to run the autosave's timer.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  // A place with dry land east of it, to drag a little way east.
  const k = await pg.evaluate(() => window.terra.places().findIndex((p) => [2, 4, 6, 8].every((d) => { const c = window.terra.cell(p.x + d, p.y); return c.h >= 0 && !c.lake; })));
  const stored = () => pg.evaluate((k) => { const w = JSON.parse(localStorage.getItem('terra-incognita/world/v1')); return { h: w.h, ninten: w.places[k].x }; }, k);
  const b = await pg.locator('#map').boundingBox();
  const at = async (x, y) => { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); return [b.x + p.x, b.y + p.y]; };
  const before = await stored();
  await pg.click('.tool[data-tool="raise"]');
  const a = await at(200, 150);
  await pg.mouse.move(...a); await pg.mouse.down();
  for (let k = 1; k <= 6; k++) { await pg.mouse.move(a[0] + k * 6, a[1]); await pg.waitForTimeout(40); }
  await pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const midStroke = await stored();
  await pg.mouse.up();
  await pg.click('.tool[data-tool="select"]');
  const first = (await pg.evaluate(() => window.terra.places()))[k], f = await at(first.x, first.y);
  await pg.mouse.move(...f); await pg.mouse.down();
  for (let k = 1; k <= 6; k++) await pg.mouse.move(f[0] + k * 6, f[1]);
  await pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const midDrag = await stored();
  await pg.mouse.up();
  ok(midStroke.h !== before.h && midDrag.ninten > first.x, 'leaving the page mid-stroke or mid-drag saves it');
  await c.close();
}

// The autosave never keeps half a brush stroke. The save timer from the edit before could fire mid-stroke and write
// what was painted so far; a stroke then taken back (by a pinch, or Wetter over open sea) was never saved again, so a
// reload brought it back: about 2,000 m of ground under the finger, and the lake and border beside it moved.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  const cdp = await c.newCDPSession(pg);
  await pg.goto(base);
  // The saved heights and rain against the world on screen.
  const agree = () => pg.evaluate(async () => {
    const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    const w = JSON.parse(localStorage.getItem('terra-incognita/world/v1')), now = await window.terra.fingerprint();
    return w.name === window.terra.state().name && await sha(w.h) === now.h && await sha(w.m) === now.m;
  });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  await pg.click('.tool[data-tool="raise"]');
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const b = await pg.locator('#map').boundingBox(), s = await pg.evaluate(() => window.terra.toScreen(204, 146)), a = [b.x + s.x, b.y + s.y];
  const undoBefore = (await pg.evaluate(() => window.terra.state())).undo;
  await pg.evaluate(() => { const n = document.getElementById('worldName'); n.value = 'Held'; n.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(300);
  await touch('touchStart', [a]);
  await pg.waitForTimeout(750);
  await touch('touchStart', [a, [a[0] + 60, a[1] + 60]]);
  await touch('touchEnd', []);
  await pg.waitForTimeout(1500);
  const pinched = await agree(), undoAfter = (await pg.evaluate(() => window.terra.state())).undo;
  ok(pinched && undoAfter === undoBefore + 1, 'a stroke a pinch takes back, after the save timer ran mid-stroke, is not in the autosave');
  await c.close();
  const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = watch(await d.newPage());
  await dp.goto(base);
  await dp.click('.tool[data-tool="rain"]');
  await dp.evaluate(() => { const n = document.getElementById('worldName'); n.value = 'Rained'; n.dispatchEvent(new Event('input')); });
  const db = await dp.locator('#map').boundingBox(), ds = await dp.evaluate(() => window.terra.toScreen(30, 30));
  await dp.mouse.move(db.x + ds.x, db.y + ds.y); await dp.mouse.down();
  await dp.waitForTimeout(1300);
  await dp.mouse.up();
  const rainToast = await dp.textContent('#toast span');
  await dp.waitForTimeout(1500);
  const ok2 = await dp.evaluate(async () => {
    const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    const w = JSON.parse(localStorage.getItem('terra-incognita/world/v1')), now = await window.terra.fingerprint();
    return await sha(w.m) === now.m;
  });
  ok(rainToast === 'Rain only changes the land.' && ok2, 'and nor is Wetter held over open sea, which it takes back');
  await d.close();
}

// Ctrl+Z in the middle of a brush stroke or a drag takes back the whole of it, and the rest of the stroke paints
// nothing. It used to take back the first half and leave the rest with no Undo step at all. Then thirty Land sketches,
// each taken back by Undo, each leave the world exactly as it was.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const b = await pg.locator('#map').boundingBox();
  const at = async (x, y) => { const p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); return [b.x + p.x, b.y + p.y]; };
  const look = () => pg.evaluate(async () => JSON.stringify({ ...window.terra.state(), print: await window.terra.fingerprint(), places: window.terra.places() }));
  await pg.click('#tab-world');
  await pg.fill('#worldName', 'Before the stroke');
  const start = await look();
  await pg.click('.tool[data-tool="raise"]');
  const a = await at(200, 150);
  await pg.mouse.move(...a); await pg.mouse.down();
  for (let k = 1; k <= 10; k++) { await pg.mouse.move(a[0] + k * 4, a[1]); await pg.waitForTimeout(30); }
  await pg.keyboard.press('Control+z');
  for (let k = 11; k <= 30; k++) { await pg.mouse.move(a[0] + k * 4, a[1]); await pg.waitForTimeout(30); }
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  ok(await look() === start, 'Ctrl+Z in the middle of a brush stroke takes back the whole stroke, and the rest of it paints nothing');
  await pg.keyboard.press('Control+Shift+z');
  const redone = await look();
  await pg.keyboard.press('Control+z');
  ok(redone !== start && await look() === start, 'and Redo puts back what was painted before it, which one Undo takes away again');
  await pg.click('.tool[data-tool="select"]');
  const first = (await pg.evaluate(() => window.terra.places()))[0], f = await at(first.x, first.y);
  await pg.mouse.move(...f); await pg.mouse.down();
  for (let k = 1; k <= 6; k++) await pg.mouse.move(f[0] + k * 6, f[1]);
  await pg.keyboard.press('Control+z');
  for (let k = 7; k <= 12; k++) await pg.mouse.move(f[0] + k * 6, f[1]);
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  ok(await look() === start, `and so does Ctrl+Z in the middle of dragging ${first.name}`);
  await pg.click('.tool[data-tool="sketch"]');
  await pg.click('.chip[data-v="land"]');
  const differ = [];
  for (let k = 0; k < 30; k++) {
    const cx = 40 + (k % 6) * 75, cy = 50 + Math.floor(k / 6) * 50, loop = [];
    for (let t = 0; t <= 8; t++) loop.push([cx + Math.cos(t * Math.PI / 4) * 14, cy + Math.sin(t * Math.PI / 4) * 10]);
    await drag(loop, 3, pg);
    const sketched = await look();
    // A loop over ground already higher than its coast would be changes nothing and takes no step, and says so.
    if (sketched === start) { if (!(await pg.textContent('#toast span')).startsWith('That ground is already higher')) differ.push(k + 1); continue; }
    await pg.click('#btnUndo');
    if (await look() !== start) differ.push(k + 1);
  }
  ok(differ.length === 0, 'thirty Land sketches, each taken back by Undo, each leave the world as it was' + (differ.length ? ': not after ' + differ.join(', ') : ''));
  await c.close();
}

// A toast's Undo takes back what the toast is about, or nothing. Once another step goes on, or Undo or Redo is used some
// other way, the toast goes. Its Undo used to take back whatever was on top: after the top Undo had already taken the
// Land sketch back, the toast's Undo took back the sea level too.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const T = (fn, arg) => pg.evaluate(fn, arg);
  const toastUp = () => T(() => !document.getElementById('toast').hidden);
  await pg.click('#tab-world');
  await T(() => { const r = document.getElementById('wSea'); r.value = String(+r.value + 0.006); r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  const seaMoved = (await T(() => window.terra.state())).land;
  await pg.keyboard.press('p');
  await pg.click('.chip[data-v="land"]');
  const loop = []; for (let t = 0; t <= 8; t++) loop.push([60 + Math.cos(t * Math.PI / 4) * 16, 255 + Math.sin(t * Math.PI / 4) * 10]);
  await drag(loop, 3, pg);
  const raised = await T(() => document.querySelector('#toast span').textContent);
  await pg.click('#btnUndo');
  const hidden = !(await toastUp());
  if (!hidden) await pg.click('#toast button');
  ok(raised === 'Land raised. Rivers and borders have been redrawn.' && hidden && (await T(() => window.terra.state())).land === seaMoved, `after the top Undo, a toast's Undo is gone, and the sea level stays where it was moved to ("${raised}")`);
  // A sketch, then a town dragged before its toast is gone: the toast goes with the drag, and the town stays put.
  await drag(loop, 3, pg);
  await pg.keyboard.press('v');
  // Select's options are shorter than Sketch's, so the map grows; let it take its new size before finding the town on it.
  await T(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const first = await T(() => window.terra.places().find((p) => [2, 4, 6, 8].every((d) => { const c = window.terra.cell(p.x + d, p.y); return c.h >= 0 && !c.lake; })));
  const b = await pg.locator('#map').boundingBox(), f = await T(([x, y]) => window.terra.toScreen(x, y), [first.x, first.y]);
  await pg.mouse.move(b.x + f.x, b.y + f.y); await pg.mouse.down();
  for (let k = 1; k <= 6; k++) await pg.mouse.move(b.x + f.x + k * 6, b.y + f.y);
  await pg.mouse.up();
  ok(!(await toastUp()), `and dragging ${first.name} takes the Land sketch's toast away, so its Undo can't take back the drag`);
  await c.close();
}

// A plain message about one tool goes when another tool is picked: 'Landmarks need dry land.' stayed up over a label
// placed with the next tool. A toast with an Undo stays for its time.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const up = () => pg.evaluate(() => document.getElementById('toast').hidden ? '' : document.querySelector('#toast span').textContent);
  await pg.keyboard.press('m');
  const b = await pg.locator('#map').boundingBox(), sea = await pg.evaluate(() => window.terra.toScreen(8, 8));
  await pg.mouse.click(b.x + sea.x, b.y + sea.y);
  const refused = await up();
  await pg.keyboard.press('t');
  const afterSwitch = await up();
  ok(refused === 'Landmarks need dry land.' && afterSwitch === '', `picking another tool takes away the last tool's message ("${refused}")`);
  await pg.keyboard.press('p');
  await pg.click('.chip[data-v="land"]');
  const loop = []; for (let t = 0; t <= 8; t++) loop.push([60 + Math.cos(t * Math.PI / 4) * 16, 255 + Math.sin(t * Math.PI / 4) * 10]);
  await drag(loop, 3, pg);
  await pg.keyboard.press('v');
  ok((await up()).startsWith('Land raised') && await pg.locator('#toast button', { hasText: 'Undo' }).isVisible(), 'but a toast with an Undo stays when the tool changes');
  await c.close();
}

// Writing in a new town's notes is a step of its own: the first Undo puts back the empty notes and leaves the town
// (it used to take the town away, notes and all), and only the second takes the town away, saying so. Redo brings
// the town back, and then its notes.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  // Dry land 6 cells from the first capital.
  const spot = await pg.evaluate(() => { const cap = window.terra.places().find((p) => p.kind === 'capital'); for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4]]) { const c = window.terra.cell(cap.x + dx, cap.y + dy); if (c.h >= 0 && !c.lake) return [cap.x + dx, cap.y + dy]; } return null; });
  await pg.evaluate(([x, y]) => window.terra.select({ type: 'loc', x, y }), spot);
  await pg.click('#locTown');
  const town = (await pg.evaluate(() => window.terra.places())).at(-1);
  await pg.fill('#pLore', 'The ferry runs at dawn.');
  await pg.click('#btnUndo');
  const first = await pg.evaluate((id) => ({ there: window.terra.places().some((p) => p.id === id), notes: document.getElementById('pLore')?.value }), town.id);
  ok(first.there && first.notes === '', `the first Undo empties ${town.name}'s notes again and leaves the town`);
  await pg.click('#btnUndo');
  const said = await pg.evaluate(() => [document.querySelector('#toast span').textContent, document.querySelector('#toast button')?.textContent]);
  const goneNow = !(await pg.evaluate(() => window.terra.places())).some((p) => p.id === town.id);
  ok(goneNow && said[0] === `Undid founding ${town.name}.` && said[1] === 'Redo', `the second takes the town away, and says so ("${said[0]}")`);
  await pg.click('#toast button');
  const backSaid = await pg.textContent('#toast span');
  await pg.click('#btnRedo');
  const notes = await pg.evaluate((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }, town.id);
  ok(notes === 'The ferry runs at dawn.' && backSaid === `${town.name} is back.`, `and Redo brings ${town.name} back, then its notes ("${backSaid}")`);
  // An Undo that changes no places says nothing.
  await pg.click('#tab-world');
  await pg.fill('#worldName', 'Renamed');
  await pg.click('#btnUndo');
  // (The Redo toast that renaming took away may still be fading out, but no toast is up.)
  ok(await pg.evaluate(() => document.getElementById('toast').hidden) && await pg.locator('#toast').waitFor({ state: 'hidden', timeout: 1000 }).then(() => true, () => false), 'an Undo that leaves the places as they were says nothing');
  await c.close();
}

// A world's name emptied out becomes Untitled world when you leave it, as a reload would make it, with spaces round a
// name trimmed. It left an empty gap in the header with nothing to tap back into, and an empty Gazetteer heading.
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const undoBefore = (await pg.evaluate(() => window.terra.state())).undo;
  await pg.fill('#worldName', '');
  const hint = await pg.getAttribute('#worldName', 'placeholder');
  await pg.locator('#worldName').blur();
  const field = await pg.inputValue('#worldName'), heading = await pg.textContent('#pane-inspect .welcome h2');
  ok(hint === 'Name your world' && field === 'Untitled world' && heading === 'Untitled world' && (await pg.evaluate(() => window.terra.state())).undo === undoBefore + 1, `a world's name emptied out says "${hint}" while empty, and becomes "${field}" when left, in the Gazetteer too ("${heading}"), in one Undo step`);
  await pg.fill('#worldName', '  Far Shores ');
  await pg.locator('#worldName').blur();
  ok((await pg.evaluate(() => window.terra.state())).name === 'Far Shores', 'and spaces round a name are trimmed');
  await c.close();
}

// A rumor rolled for a town that Undo then took away goes with it. The next town founded gets the same number, and
// used to open with the old town's rumor and Keep in notes, which wrote it into the new town's notes.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const cap = await pg.evaluate(() => window.terra.places().find((p) => p.kind === 'capital' && [0, 4].every((dy) => { const c = window.terra.cell(p.x + 6, p.y + dy); return c.h >= 0 && !c.lake; })));
  await pg.click('.tool[data-tool="settle"]');
  const b = await pg.locator('#map').boundingBox();
  const found = async (dy) => { const s = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [cap.x + 6, cap.y + dy]); await pg.mouse.click(b.x + s.x, b.y + s.y); return (await pg.evaluate(() => window.terra.places())).at(-1); };
  const first = await found(0);
  await pg.click('#pRumor');
  await pg.click('#btnUndo');
  const second = await found(4);
  const box = await pg.evaluate(() => { const b = document.getElementById('draftBox'); return b && !b.hidden ? b.textContent : ''; });
  ok(second.id === first.id && second.name !== first.name && !box, `a rumor rolled for a town Undo took away doesn't turn up on the next town founded, which gets its number (${first.name}, then ${second.name}${box ? `, showing "${box}"` : ''})`);
  await c.close();
}

// A label whose text is cleared gets it back when the box is left, as a place cleared of its name becomes Nameless.
// It stayed in the world with no text: invisible on the map, still clicked on, saved and counted.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const sea = (await pg.evaluate(() => window.terra.labels())).find((l) => l.kind === 'sea');
  await pg.evaluate((id) => window.terra.select({ type: 'label', id }), sea.id);
  const undoBefore = (await pg.evaluate(() => window.terra.state())).undo;
  await pg.fill('#lText', '');
  await pg.press('#lText', 'Tab');
  const now = (await pg.evaluate(() => window.terra.labels())).find((l) => l.id === sea.id), box = await pg.inputValue('#lText');
  ok(now.text === sea.text && box === sea.text && (await pg.evaluate(() => window.terra.state())).undo === undoBefore, `a label cleared of its text gets it back on leaving the box, and takes no Undo step ("${now.text}")`);
  await c.close();
}

// Found new realms keeps every place with notes where it is, with its name, kind and notes (a capital its realm), grows
// the new realms around them, and says so; it used to replace them. Clear places and labels says which notes it
// replaced, and the World tab says what each does.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const write = (id, text) => pg.evaluate(([id, text]) => { window.terra.select({ type: 'place', id }); const ta = document.getElementById('pLore'); ta.value = text; ta.dispatchEvent(new Event('input')); }, [id, text]);
  const said = () => pg.textContent('#toast span');
  const ps = await pg.evaluate(() => window.terra.places()), st = await pg.evaluate(() => window.terra.state());
  const keptCap = ps.find((p) => p.kind === 'capital'), realmOf = () => pg.evaluate((id) => { window.terra.select({ type: 'place', id }); return [document.getElementById('rName').value, document.getElementById('rTitle').value, document.querySelector('[data-color][aria-pressed=true]').dataset.color]; }, keptCap.id);
  const capRealm = await realmOf();
  await write(ps[3].id, 'A town with a story.');
  await write(keptCap.id, 'The old capital.');
  await pg.click('#tab-world');
  const notes = await pg.locator('#pane-world .note').allTextContents();
  ok(notes.some((t) => t.startsWith('Found new realms replaces the places and labels with a fresh set grown from the terrain. Places you have written notes on stay')) && notes.some((t) => t.startsWith('Clear places and labels')), 'the World tab says Found new realms keeps places with notes, and Clear replaces them');
  await pg.click('#wPopulate');
  const founded = await said();
  const now = await pg.evaluate(() => window.terra.places());
  const same = (a) => { const b = now.find((q) => q.id === a.id); return b && b.name === a.name && b.kind === a.kind && b.x === a.x && b.y === a.y; };
  const keptLore = await pg.evaluate((ids) => ids.map((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }), [ps[3].id, keptCap.id]);
  const others = ps.filter((p) => p.id !== ps[3].id && p.id !== keptCap.id && now.some((q) => q.id === p.id));
  const capAfter = await realmOf(), keptRealms = [ps[3], keptCap].filter((p) => p.kind === 'capital').map((p) => p.id === keptCap.id ? `the ${capRealm[1]} of ${capRealm[0]}` : null).filter(Boolean);
  if (ps[3].kind === 'capital') keptRealms.push(await pg.evaluate((id) => { window.terra.select({ type: 'place', id }); return `the ${document.getElementById('rTitle').value} of ${document.getElementById('rName').value}`; }, ps[3].id));
  ok(same(ps[3]) && same(keptCap) && keptLore[0] === 'A town with a story.' && keptLore[1] === 'The old capital.' && JSON.stringify(capAfter) === JSON.stringify(capRealm) && others.length === 0 && now.length > 10 && now.filter((p) => p.kind === 'capital').length >= 2,
    `Found new realms keeps the places with notes where they were, the capital ruling ${capRealm[1]} of ${capRealm[0]} still, and founds the rest anew (${now.length} places)`);
  // It names the realms it founded as the Codex names them ('the Republic of Tiassium' mid-sentence), the largest by
  // the Codex's areas first, and how many settlements they have. It used to say only 'New realms founded.'
  const codexRealms = await pg.evaluate(() => {
    document.getElementById('tab-codex').click();
    const rows = [...document.querySelector('#codexList .clist').querySelectorAll('.crow')].map((r) => [r.querySelector('.nm').textContent.replace(/^The /, 'the '), +r.querySelector('.meta.mono').textContent.replace(/\D/g, '')]);
    document.getElementById('tab-world').click();
    return rows.sort((a, b) => b[1] - a[1]).map((r) => r[0]);
  }).then((rs) => rs.filter((r) => !keptRealms.includes(r)));
  const towns = (await pg.evaluate(() => window.terra.places())).filter((p) => p.kind !== 'landmark' && p.id !== ps[3].id && p.id !== keptCap.id).length;
  const realmsSaid = codexRealms.length >= 4 ? `${codexRealms.length} realms, ${codexRealms[0]} the largest` : codexRealms.length === 1 ? codexRealms[0] : codexRealms.slice(0, -1).join(', ') + ' and ' + codexRealms.at(-1);
  ok(codexRealms.length >= 1 && founded === `Founded ${realmsSaid}, with ${towns} settlements. ${ps.filter((p) => p === ps[3] || p === keptCap).map((p) => p.name).join(' and ')} and their notes stay.`, `Found new realms names the realms it founded and the places with notes it kept ("${founded}")`);
  await pg.click('#toast button');
  for (const p of ps.slice(0, 3)) await write(p.id, 'Notes.');
  await pg.click('#tab-world');
  await pg.click('#wClear');
  const cleared = await said();
  ok(cleared === `Cleared ${st.places} places and ${st.labels} labels, and the notes on 4 of them.`, `Clear says how many places and labels went, and how many had notes ("${cleared}")`);
  // On a world with land and no places yet, the welcome says to found new realms before founding your own.
  await pg.click('#tab-inspect');
  ok((await pg.textContent('#pane-inspect .tips li')).includes('Do it before you found your own: it replaces every place you haven\'t written notes on.'), 'the welcome says to found new realms before founding your own');
  await c.close();
}

// A file that's refused changes nothing: Redo, the open place and its unkept rumor stay. It used to put an Undo step on
// before checking the file and take it off again after, which lost all three. A world file cut short in the middle is
// called damaged, not something else.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  const open = async (name, text) => {
    await pg.setInputFiles('#wFile', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await pg.waitForTimeout(400);
    return pg.textContent('#toast span');
  };
  await pg.click('#tab-world');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]);
  const whole = await readFile(await dl.path(), 'utf8');
  await pg.click('#wPopulate');
  await pg.click('#btnUndo');
  const cap = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  await pg.click('#pRumor');
  const rumor = await pg.textContent('#draftBox');
  await pg.click('#tab-world');
  const refused = await open('package.json', JSON.stringify({ name: 'package', version: '1.0.0' }));
  await pg.click('#tab-inspect');
  const after = await pg.evaluate(() => ({ redo: !document.getElementById('btnRedo').disabled, name: document.getElementById('pName')?.value, rumor: document.getElementById('draftBox')?.textContent }));
  ok(refused === 'That file is not a Terra Incognita world.' && after.redo && after.name === cap.name && after.rumor === rumor, `a refused file leaves Redo, ${cap.name}'s page and its unkept rumor as they were`);
  await pg.click('#tab-world');
  const cut = await open('world.json', whole.slice(0, whole.length >> 1));
  ok(cut === 'That world file is damaged or cut short, so it can\'t be opened. Try another copy.', `a world file cut short is called damaged ("${cut}")`);
  await c.close();
}

// Your worlds. A save from before the list (one with no id) becomes its first world. Random seed and Open world file
// add a world, and the one that was open stays in the list: they used to replace it, and after a reload it was gone.
// Undo goes back to it, with its own Undo steps, and takes the new one out of the list again; Redo puts it back. The
// list opens, duplicates and deletes worlds, and Bring it back returns a deleted world after a reload, and a world as
// it was before Clear took places with notes. Two tabs on two worlds each save their own without asking.
{
  const fixture = await readFile(join(root, 'test/fixtures/world-v1.json'), 'utf8');
  const old = JSON.parse(fixture);
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await c.addInitScript((text) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('terra-incognita/world/v1', text); } }, fixture);
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.waitForTimeout(600);
  const worlds = () => pg.evaluate(() => window.terra.worlds());
  let w = await worlds();
  const slotId = await pg.evaluate(() => JSON.parse(localStorage.getItem('terra-incognita/world/v1')).id);
  ok(w.length === 1 && w[0].name === old.name && w[0].open && w[0].id === slotId && (await pg.evaluate(() => window.terra.state().name)) === old.name, `a save from before Your worlds opens as its first world (${old.name})`);
  await pg.fill('#worldName', 'Kept world');
  await pg.waitForTimeout(1200);
  await pg.click('#tab-world');
  await pg.click('#wDice'); await pg.waitForFunction(() => !window.terra.busy());
  const made = await pg.evaluate(() => [window.terra.state(), document.querySelector('#toast span').textContent]);
  w = await worlds();
  ok(w.length === 2 && w.some((x) => x.name === 'Kept world' && !x.open) && w.find((x) => x.open).name === made[0].name && made[1].endsWith('Kept world is kept in Your worlds.'), `Random seed adds ${made[0].name} to Your worlds, and Kept world stays there ("${made[1]}")`);
  await pg.click('#btnUndo');
  const back = await pg.evaluate(() => [window.terra.state(), window.terra.worlds()]);
  ok(back[0].name === 'Kept world' && back[0].undo === 1 && back[1].length === 1, 'Undo goes back to Kept world, with its own Undo step, and takes the new world out of the list');
  await pg.click('#btnRedo');
  ok((await pg.evaluate(() => window.terra.state().name)) === made[0].name && (await worlds()).length === 2, 'and Redo puts the new world back');
  await pg.evaluate(() => window.terra.syncWorlds());
  await pg.reload(); await pg.waitForTimeout(600);
  await pg.click('#tab-world');
  const rows = await pg.evaluate(() => [...document.querySelectorAll('#worldList .wrow')].map((r) => [r.querySelector('.nm').textContent, !!r.querySelector('img.wthumb'), !!r.querySelector('[data-wopen]')]));
  ok(rows.length === 2 && rows[0][0] === made[0].name && !rows[0][2] && rows[1][0] === 'Kept world' && rows[1][2] && rows.every((r) => r[1]), `after a reload Your worlds lists both, each with a picture, the open one first (${rows.map((r) => r[0]).join(', ')})`);
  await pg.click('#worldList [data-wopen]');
  await pg.waitForFunction(() => window.terra.state().name === 'Kept world');
  const keptSt = await pg.evaluate(() => window.terra.state());
  ok(keptSt.places === old.places.length && keptSt.undo === 0, `Open brings Kept world back as it was (${keptSt.places} places)`);
  const [fdl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]);
  await pg.setInputFiles('#wFile', await fdl.path());
  await pg.waitForFunction(() => document.querySelector('#toast span')?.textContent.startsWith('Opened'));
  ok((await worlds()).length === 3, 'Open world file adds the world it opens too');
  await pg.click('#worldList .wrow.open [data-wdup]');
  await pg.waitForFunction(() => window.terra.worlds().length === 4);
  const copy = (await worlds()).find((x) => x.name === 'Kept world (copy)');
  ok(copy && !copy.open, 'Duplicate adds a copy, and the world open stays open');
  await pg.click(`#worldList .wrow[data-id="${copy.id}"] [data-wdel]`);
  await pg.waitForFunction(() => window.terra.worlds().length === 3);
  await pg.waitForTimeout(300);
  await pg.reload(); await pg.waitForTimeout(600); await pg.click('#tab-world');
  const asideSays = await pg.textContent('#wAside');
  await pg.click('#wAsideBack');
  await pg.waitForFunction(() => window.terra.state().name === 'Kept world (copy)');
  ok(/^Kept world \(copy\) was deleted (at|on) .+\. Bring it back$/.test(asideSays) && (await worlds()).length === 4 && await pg.locator('#wAside').isHidden(), `Delete keeps the world aside, and Bring it back returns it after a reload ("${asideSays}")`);
  const cap = (await pg.evaluate(() => window.terra.places()))[0];
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  await pg.fill('#pLore', 'Written before Clear.');
  await pg.click('#tab-world');
  await pg.click('#wClear');
  await pg.waitForTimeout(400);
  await pg.reload(); await pg.waitForTimeout(600); await pg.click('#tab-world');
  const clearSays = await pg.textContent('#wAside');
  await pg.click('#wAsideBack');
  await pg.waitForFunction(() => window.terra.state().places > 0);
  const before = await pg.evaluate((name) => { const p = window.terra.places().find((q) => q.name === name); window.terra.select({ type: 'place', id: p.id }); return [window.terra.state().name, document.getElementById('pLore').value]; }, cap.name);
  ok(/^Kept world \(copy\) is kept as it was before Clear places and labels (at|on) /.test(clearSays) && before[0] === 'Kept world (copy) (before Clear)' && before[1] === 'Written before Clear.' && (await worlds()).length === 5, `a Clear that took notes keeps the world as it was, to bring back after a reload ("${clearSays}")`);
  // Two tabs: B adds a world while A stays on its own, and each saves its own world without asking about the other.
  const B = watch(await c.newPage());
  await B.goto(base); await B.waitForTimeout(600);
  await B.click('#tab-world'); await B.click('#wDice'); await B.waitForFunction(() => !window.terra.busy()); await B.waitForTimeout(300);
  const rename = (p, n) => p.evaluate((n) => { const el = document.getElementById('worldName'); el.dispatchEvent(new Event('focus')); el.value = n; el.dispatchEvent(new Event('input')); }, n);
  const said = (p) => p.evaluate(() => document.getElementById('toast').hidden ? '' : document.querySelector('#toast span').textContent);
  await rename(pg, 'Renamed in tab A'); await pg.waitForTimeout(1300);
  await rename(B, 'Renamed in tab B'); await B.waitForTimeout(1300);
  await rename(pg, 'Renamed again in tab A'); await pg.waitForTimeout(1300);
  const names = (await pg.evaluate(() => window.terra.worlds())).map((x) => x.name), saids = [await said(pg), await said(B)];
  ok(saids.every((t) => !t.includes('another tab')) && names.includes('Renamed again in tab A') && names.includes('Renamed in tab B') && names.length === 6, `two tabs on two worlds each save their own without asking (${names.length} worlds)`);
  await c.close();
  // Where the browser's larger store doesn't work, a new world takes the open one's place, as it used to, and Undo
  // brings that back; the list says so.
  const n = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await n.addInitScript(() => { IDBFactory.prototype.open = function () { throw new Error('no'); }; });
  const np = watch(await n.newPage());
  await np.goto(base); await np.waitForTimeout(600);
  await np.click('#tab-world');
  const was = await np.evaluate(() => window.terra.state().name);
  await np.click('#wDice'); await np.waitForFunction(() => !window.terra.busy());
  const off = await np.evaluate(() => [window.terra.worlds().length, document.getElementById('wWorldsNote').textContent, document.querySelector('#toast span').textContent]);
  await np.click('#btnUndo');
  ok(off[0] === 1 && off[1].startsWith('This browser can\'t keep a second world') && !off[2].includes('Your worlds') && (await np.evaluate(() => window.terra.state().name)) === was, `without the larger store, Random seed replaces the world and Undo brings it back ("${off[1]}")`);
  await n.close();
}

// When the browser's larger store refuses a write (it is full, say), opening another of Your worlds leaves the open one
// on screen and says so: the autosave would otherwise go to the other world, and this one's latest changes with it.
// And an Undo after Save world file is newer work than the file, so Keep your world says so again.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base); await pg.waitForTimeout(600);
  await pg.click('#tab-world');
  await pg.click('#wDice'); await pg.waitForFunction(() => !window.terra.busy()); await pg.click('#tab-world');
  await pg.fill('#worldName', 'Full store'); await pg.waitForTimeout(400);
  await pg.evaluate(() => { IDBObjectStore.prototype.put = function () { this.transaction.abort(); }; });
  await pg.click('#worldList [data-wopen]');
  await pg.waitForFunction(() => !document.getElementById('toast').hidden && /would not keep/.test(document.querySelector('#toast span').textContent));
  const kept = await pg.evaluate(() => [window.terra.state().name, document.querySelector('#toast span').textContent, JSON.parse(localStorage.getItem('terra-incognita/world/v1')).name]);
  ok(kept[0] === 'Full store' && kept[2] === 'Full store', `with the store refusing writes, Open leaves the open world on screen and in the autosave ("${kept[1]}")`);
  await pg.fill('#worldName', 'Filed'); await pg.waitForTimeout(400);
  await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]); await pg.waitForTimeout(300);
  const filed = await pg.evaluate(() => document.getElementById('wFileNote').hidden);
  await pg.waitForTimeout(1100);
  await pg.click('#btnUndo'); await pg.waitForTimeout(300);
  const undone = await pg.evaluate(() => [document.getElementById('wFileNote').hidden, document.getElementById('wFileNote').textContent]);
  ok(filed && !undone[0] && /^Not saved to a file since /.test(undone[1]), `an Undo after Save world file is newer than the file, and Keep your world says so ("${undone[1]}")`);
  await c.close();
}

// A seed link. Copy seed link copies …/#seed=N&shape=S for the world open; opening one grows that world, adds it to
// Your worlds with an Undo, and takes the link from the address bar, so a reload doesn't grow it again. On a first
// visit it grows in place of the starting world. A world sketched from blank ocean has no seed to share.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
  const pg = watch(await c.newPage());
  await pg.goto(base + '#seed=4242&shape=archipelago');
  await pg.waitForTimeout(400);
  const first = await pg.evaluate(() => [window.terra.state(), window.terra.worlds().length, location.hash, document.querySelector('#toast span')?.textContent]);
  ok(first[0].seed === 4242 && first[0].shape === 'archipelago' && first[1] === 1 && first[2] === '' && first[3].startsWith('Grew world 4242 from a seed link'), `a seed link on a first visit grows its world in place of the starting one ("${first[3]}")`);
  await pg.click('#tab-world');
  await pg.click('#wDice'); await pg.waitForFunction(() => !window.terra.busy());
  await pg.click('#wLink');
  await pg.waitForTimeout(200);
  const copied = await pg.evaluate(() => navigator.clipboard.readText());
  const st = await pg.evaluate(() => window.terra.state());
  ok(copied === `${base}#seed=${st.seed}&shape=${st.shape}`, `Copy seed link copies the world's seed and shape (${copied.slice(base.length)})`);
  await pg.evaluate(() => { location.hash = 'seed=20417&shape=continent'; });
  await pg.waitForFunction(() => window.terra.state().seed === 20417);
  const grown = await pg.evaluate(() => [window.terra.worlds().length, location.hash, document.querySelector('#toast span').textContent]);
  await pg.click('#toast button:has-text("Undo")');
  const after = await pg.evaluate(() => [window.terra.state().seed, window.terra.worlds().length]);
  ok(grown[0] === 3 && grown[1] === '' && grown[2].endsWith('is kept in Your worlds.') && after[0] === st.seed && after[1] === 2, `a seed link opened later adds its world to Your worlds, and Undo takes it out again ("${grown[2]}")`);
  await pg.reload(); await pg.waitForTimeout(400);
  ok((await pg.evaluate(() => [window.terra.state().seed, window.terra.worlds().length])).join() === `${st.seed},2`, 'a reload doesn\'t grow the link again');
  await pg.click('#tab-world'); await pg.click('#wBlank');
  await pg.click('#tab-world'); await pg.click('#wLink');
  ok((await pg.textContent('#toast span')).startsWith('A world sketched from blank ocean has no seed to share.'), 'a world sketched from blank ocean has no seed link to give');
  await c.close();
}

// Run from the home screen, the app asks the browser to keep its storage, which Chrome grants there without asking; in
// a tab it doesn't ask, since Firefox would show a prompt.
{
  const asked = async (installed) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript((installed) => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => q === '(display-mode: standalone)' ? { matches: installed, media: q, addEventListener() { }, removeEventListener() { } } : mm(q);
      window.persistAsked = 0; navigator.storage.persisted = async () => false; navigator.storage.persist = async () => { window.persistAsked++; return true; };
    }, installed);
    const pg = watch(await c.newPage());
    await pg.goto(base); await pg.waitForTimeout(300);
    const n = await pg.evaluate(() => window.persistAsked);
    await c.close();
    return n;
  };
  const home = await asked(true), tab = await asked(false);
  ok(home === 1 && tab === 0, `installed, it asks the browser to keep its storage once; in a tab it doesn't (${home}, ${tab})`);
}

// Two tabs on the same world. A change saved in one is brought into the other, so notes written in tab A survive a
// rename in tab B; it used to be saved over with B's stale copy. A tab with changes of its own still to save asks which
// to keep, and either answer leaves both tabs able to save.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = watch(await c.newPage());
  await A.goto(base);
  const B = watch(await c.newPage());
  await B.goto(base);
  const cap = (await A.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  const stored = () => A.evaluate(() => { const w = JSON.parse(localStorage.getItem('terra-incognita/world/v1')); return { name: w.name, lore: w.places.find((p) => p.kind === 'capital').lore }; });
  const notes = (pg) => pg.evaluate((id) => { window.terra.select({ type: 'place', id }); return document.getElementById('pLore').value; }, cap.id);
  const said = (pg) => pg.evaluate(() => { const t = document.getElementById('toast'); return t.hidden ? '' : [t.querySelector('span').textContent, ...[...t.querySelectorAll('button')].map((b) => b.textContent)].join(' | '); });
  const rename = (pg, name) => pg.evaluate((name) => { const n = document.getElementById('worldName'); n.dispatchEvent(new Event('focus')); n.value = name; n.dispatchEvent(new Event('input')); }, name);
  const write = (pg, text) => pg.evaluate(([id, text]) => { window.terra.select({ type: 'place', id }); const ta = document.getElementById('pLore'); ta.value = text; ta.dispatchEvent(new Event('input')); }, [cap.id, text]);
  const leave = (pg) => pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await write(A, 'Written in tab A.');
  await A.waitForTimeout(1300);
  const broughtIn = await said(B);
  await rename(B, 'Renamed in tab B');
  await B.waitForTimeout(1300);
  await A.reload();
  ok((await stored()).name === 'Renamed in tab B' && await notes(A) === 'Written in tab A.' && broughtIn === 'Brought in the changes from another tab. | Undo', `notes written in tab A survive a rename in tab B, which brought them in ("${broughtIn}")`);
  // Both tabs have changes to save: B saves first, and A asks.
  const clash = async (aText, bName) => {
    await rename(B, bName);
    await write(A, aText);
    await leave(B);
    await A.waitForTimeout(300);
    return said(A);
  };
  const asked = await clash('Kept from tab A.', 'Lost in tab B');
  await A.click('#tab-world');
  await A.click('#wSaveFile');
  const still = await said(A), note = await A.textContent('#wSaveNote');
  ok(asked === "This world was changed in another tab. | Load theirs | Keep this tab's" && still === asked && note.startsWith('Not saved'), `a tab with changes of its own asks which to keep, and the question stays up ("${asked}")`);
  await A.waitForTimeout(1200);
  ok((await stored()).name === 'Lost in tab B', 'and saves nothing until it is answered');
  await A.click("#toast button:has-text(\"Keep this tab's\")");
  await A.waitForTimeout(300);
  const kept = await stored();
  await A.reload(); await B.reload();
  ok(kept.lore === 'Kept from tab A.' && kept.name === 'Renamed in tab B' && await notes(A) === 'Kept from tab A.' && await notes(B) === 'Kept from tab A.', "Keep this tab's saves tab A's world over tab B's, and both open it after a reload");
  await rename(B, 'Saved from tab B');
  await B.waitForTimeout(1300);
  ok((await stored()).name === 'Saved from tab B', 'and tab B can still save');
  // Load theirs.
  await clash('Dropped in tab A.', 'Kept from tab B');
  await A.click('#toast button:has-text("Load theirs")');
  const loaded = { name: await A.evaluate(() => window.terra.state().name), notes: await notes(A), said: await said(A), note: await A.textContent('#wSaveNote') };
  ok(loaded.name === 'Kept from tab B' && loaded.notes === 'Kept from tab A.' && loaded.said === 'Brought in the changes from another tab. | Undo' && loaded.note.startsWith('Autosaved'), `Load theirs brings in tab B's world ("${loaded.said}")`);
  await rename(A, 'Saved from tab A');
  await A.waitForTimeout(1300);
  await A.reload(); await B.reload();
  ok((await stored()).name === 'Saved from tab A' && await B.evaluate(() => window.terra.state().name) === 'Saved from tab A', 'and tab A can save afterwards, which tab B opens after a reload');
  // A save from another tab this tab never heard about is caught when it comes to save.
  await A.evaluate(() => { const k = 'terra-incognita/world/v1', w = JSON.parse(localStorage.getItem(k)); w.name = 'Saved elsewhere'; w.savedAt = new Date(Date.now() + 1000).toISOString(); localStorage.setItem(k, JSON.stringify(w)); });
  await rename(A, 'Not over that');
  await A.waitForTimeout(1300);
  ok((await said(A)).startsWith('This world was changed in another tab.') && (await stored()).name === 'Saved elsewhere', 'a tab about to save over a world another tab saved asks first');
  await A.click('#toast button:has-text("Load theirs")');
  ok(await A.evaluate(() => window.terra.state().name) === 'Saved elsewhere', 'and Load theirs opens it');
  await c.close();
}

// The single-file copy for Claude's Artifact viewer (scripts/build.mjs): opened from a file with the viewer's
// window.claude, it draws the world, a town's page drafts a history with Claude, and Save world file goes through the
// viewer's downloads. Served on its own over http it logs no error: it doesn't look for a sw.js that isn't there.
{
  execSync('node scripts/build.mjs', { cwd: root, stdio: 'pipe' });
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => {
    window.claude = { use: async (n) => {
      if (n === 'sample') return async (prompt, o) => { if (window.slow) await new Promise((r) => { window.release = r; }); if (window.refuse) { window.asked = prompt; throw Object.assign(new Error('no'), { code: 'refused' }); } o.onText && o.onText({ text: 'Founded' }); window.asked = prompt; return { text: 'Founded on salt and old quarrels.\nHook: a door nobody opens.', truncated: !!window.cutShort }; };
      if (n === 'downloads') return { save: async (f) => { window.savedFile = { filename: f.filename, size: String(f.data).length }; } };
      throw Object.assign(new Error('no'), { code: 'not_declared' });
    } };
  });
  const pg = await c.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('file://' + join(root, 'dist/terra-incognita.html'));
  await pg.waitForFunction(() => window.terra && window.terra.state().places > 0);
  const drawn = await pg.evaluate(() => { const cv = document.getElementById('map'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 101) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return seen.size; });
  ok(drawn > 50, `the single-file copy draws the world from a file (${drawn} colours on the map)`);
  const cap = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  ok(await pg.locator('#pWrite').isVisible(), "in Claude's viewer a town's page offers Write its history");
  await pg.click('#pWrite');
  await pg.waitForFunction(() => !document.getElementById('draftActions').hidden);
  const draft = await pg.evaluate(() => [document.getElementById('draftBox').textContent, (window.asked || '').includes('Write a short history')]);
  ok(draft[0].startsWith('Founded on salt') && draft[1], 'and Claude drafts it from the map');
  // A warning stays for the draft it is about, not under the next rumor.
  const note = () => pg.evaluate(() => { const n = document.getElementById('draftNote'); return [n.textContent, n.classList.contains('warn')]; });
  const calm = await note();
  await pg.evaluate(() => { window.cutShort = true; });
  await pg.click('#pWrite');
  await pg.waitForFunction(() => document.getElementById('draftNote').classList.contains('warn'));
  const warned = await note();
  await pg.click('#pRumor');
  const after = await note();
  ok(warned[0].includes('ran out of room') && !after[1] && after[0] === calm[0] && !calm[1], `a warning about a cut-short draft goes when a rumor is rolled ("${warned[0]}", then "${after[0]}")`);
  await pg.evaluate(() => { window.cutShort = false; });
  // A town in a realm is told where its capital is. Notes too long to send whole go as their start and their end, the
  // latest kept history included, cut between words, and the page says so.
  const ask = async (id, lore) => {
    await pg.evaluate((id) => window.terra.select({ type: 'place', id }), id);
    if (lore !== undefined) await pg.fill('#pLore', lore);
    await pg.click('#pWrite');
    await pg.waitForFunction(() => !document.getElementById('pWrite').textContent.includes('Stop'));
    return pg.evaluate(() => [window.asked, document.getElementById('draftNote').textContent]);
  };
  const all = await pg.evaluate(() => window.terra.places());
  const village = all.find((p) => p.kind !== 'capital' && p.kind !== 'landmark' && p.landTongue);
  const long = 'FIRST-LINE The Margrave rules here. ' + 'Old quarrels and salt. '.repeat(160) + 'LATEST-HISTORY The bridge fell.';
  const [vp, vnote] = await ask(village.id, long);
  // A population typed in goes to Claude as it is, not as a guess.
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), village.id);
  await pg.fill('#pPop', '12,345'); await pg.press('#pPop', 'Tab');
  const [pp] = await ask(village.id);
  ok(new RegExp(` of 12,345 people\\.`).test(pp) && / of about [\d,]+ people/.test(vp), `the history prompt gives a population typed in as it is ("${pp.match(/^Place: .*$/m)}")`);
  ok(/Its capital is [^,]+, \d+ leagues? (north|south|east|west)/.test(vp) && vp.includes('FIRST-LINE') && vp.includes('LATEST-HISTORY') && /\s(Old|quarrels|and|salt\.) … (Old|quarrels|and|salt\.)\s/.test(vp) && vnote === 'Only part of your notes fits: the start and the latest are sent.',
    `a town's prompt names its capital and sends the start and the end of long notes ("${vp.match(/Its capital[^.]*\./)}"; "${vnote}")`);
  // A landmark has no tongue, and a refusal on a place with no notes says to add one.
  const lm = all.find((p) => p.kind === 'landmark' && p.landTongue);
  await pg.evaluate(() => { window.refuse = true; });
  const [lp, lnote] = await ask(lm.id, '');
  ok(/^Realm: The /m.test(lp) && !/tongue/.test(lp) && !/Its capital/.test(lp) && lnote === 'Claude declined to write this one. Try again, or add a note to steer it.', `a landmark's prompt has no tongue line, and a refusal with no notes says to add one ("${lnote}")`);
  await pg.evaluate(() => { window.refuse = false; });
  // A history Claude is still writing carries on while another place's page is open, and waits on its own place's
  // page until it is kept or discarded, as the village's from before does. Tapping another place threw it away.
  await pg.evaluate(() => { window.slow = true; });
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  await pg.click('#dDiscard');
  await pg.click('#pWrite');
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), village.id);
  const elsewhere = await pg.evaluate(() => [document.getElementById('draftBox').textContent, document.getElementById('pWrite').textContent]);
  await pg.evaluate(() => { window.slow = false; window.release(); });
  await pg.waitForTimeout(200);
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  const waited = await pg.evaluate(() => [document.getElementById('draftBox').textContent, document.getElementById('draftActions').hidden]);
  ok(elsewhere[0].startsWith('Founded on salt') && elsewhere[1] === 'Write another' && waited[0].startsWith('Founded on salt') && !waited[1], `a history Claude writes while another page is open waits on its own place's page, and the village keeps its own ("${waited[0].slice(0, 24)}…")`);
  await pg.click('#tab-world');
  await pg.click('#wSaveFile');
  await pg.waitForFunction(() => window.savedFile);
  const savedFile = await pg.evaluate(() => window.savedFile);
  ok(savedFile.filename.endsWith('.json') && savedFile.size > 100000, `Save world file goes through the viewer's downloads (${savedFile.filename})`);
  ok(errors.length === 0, 'with no errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  await c.close();
  // Published without downloads, the viewer can't save files. Save world file, Save map image, Download the old save
  // and Ctrl S's line go (they stayed, and only said so when pressed), the welcome leaves out its tip on saving, and
  // the World tab says how to keep a copy. Open world file stays.
  const n = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await n.addInitScript(() => {
    window.claude = { use: async (k) => { if (k === 'downloads') return null; throw Object.assign(new Error('no'), { code: 'not_declared' }); } };
    try { localStorage.setItem('terra-incognita/world/unreadable', '{"old":true}'); } catch (e) { }
  });
  const np = await n.newPage();
  const nerrors = [];
  np.on('pageerror', (e) => nerrors.push(e.message)); np.on('console', (m) => { if (m.type() === 'error') nerrors.push(m.text()); });
  await np.goto('file://' + join(root, 'dist/terra-incognita.html'));
  await np.waitForFunction(() => window.terra && window.terra.state().places > 0);
  await np.waitForTimeout(300);
  const noSave = await np.evaluate(() => ({
    hidden: ['wSaveFile', 'wSavePng', 'wPngSize', 'wOldSave', 'keySave'].filter((id) => document.getElementById(id).hidden),
    open: !document.getElementById('wOpenFile').hidden,
    note: document.getElementById('wKeepNote').textContent,
    tip: [...document.querySelectorAll('#pane-inspect .tips li')].pop().textContent,
  }));
  ok(noSave.hidden.join() === 'wSaveFile,wSavePng,wPngSize,wOldSave,keySave' && noSave.open && noSave.note === "This view can't save files. Open terra-incognita.junkdrawer.works to keep a copy." && !noSave.tip.startsWith('The World tab keeps it') && nerrors.length === 0,
    `in a view of Claude's that can't save files, the save buttons go and the World tab says so ("${noSave.note}")` + (nerrors.length ? ': ' + nerrors.join('; ') : ''));
  await n.close();
  const h = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const hp = await h.newPage();
  const herrors = [];
  hp.on('pageerror', (e) => herrors.push(e.message)); hp.on('console', (m) => { if (m.type() === 'error') herrors.push(m.text()); });
  hp.on('requestfailed', (r) => herrors.push('failed: ' + r.url()));
  hp.on('response', (r) => { if (r.status() >= 400) herrors.push(r.status() + ' ' + r.url()); });
  await hp.goto(base + 'dist/terra-incognita.html');
  await hp.waitForFunction(() => window.terra && window.terra.state().places > 0);
  await hp.waitForTimeout(800);
  ok(herrors.length === 0 && await hp.evaluate(async () => !(await navigator.serviceWorker.getRegistration())), 'served on its own over http, it registers no offline copy and logs no error' + (herrors.length ? ': ' + herrors.join('; ') : ''));
  await h.close();
}

// What the tools and the files promise, end to end on a laptop with a mouse: a village, a landmark and a label placed on
// the map, one taken off again with Erase, and Undo taking each step back; a world file the app saved opening as the
// same world, notes and all; the Atlas look on the map and in Save map image; each Shape in the World tab; the
// single-file fragment drawing inside a host's page; and the README's 6.5 °C cooler for every kilometre up.
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const pg = watch(await c.newPage());
  await pg.goto(base);
  await pg.waitForFunction(() => window.terra && window.terra.state().places > 0);
  const count = () => pg.evaluate(() => { const s = window.terra.state(); return [s.places, s.labels]; });
  // Three spots of dry land well away from any place, and from each other.
  const spots = await pg.evaluate(() => {
    const ps = window.terra.places(), out = [];
    for (let y = 60.5; y < 250 && out.length < 3; y += 6) for (let x = 60.5; x < 420 && out.length < 3; x += 6) {
      const k = window.terra.cell(x, y); let dry = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const n = window.terra.cell(x + dx, y + dy); if (n.h <= 0 || n.lake || n.river) dry = false; }
      if (dry && k.h > 0 && ps.every((p) => Math.hypot(p.x - x, p.y - y) > 10) && out.every(([a, b]) => Math.hypot(a - x, b - y) > 20)) out.push([x, y]);
    }
    return out;
  });
  const clickAt = async ([x, y]) => { const b = await pg.locator('#map').boundingBox(), p = await pg.evaluate(([x, y]) => window.terra.toScreen(x, y), [x, y]); await pg.mouse.click(b.x + p.x, b.y + p.y); await pg.waitForTimeout(250); };
  const steps = [await count()];
  await pg.click('.tool[data-tool="settle"]'); await pg.click('.chip[data-v="village"]'); await clickAt(spots[0]); steps.push(await count());
  const village = (await pg.evaluate(([x, y]) => window.terra.places().filter((p) => Math.hypot(p.x - x, p.y - y) < 2), spots[0]))[0];
  await pg.click('.tool[data-tool="landmark"]'); await clickAt(spots[1]); steps.push(await count());
  await pg.click('.tool[data-tool="label"]'); await pg.click('.chip[data-v="region"]'); await clickAt(spots[2]); steps.push(await count());
  await pg.click('.tool[data-tool="erase"]'); await clickAt(spots[0]); steps.push(await count());
  const [p0, l0] = steps[0];
  ok(spots.length === 3 && village && village.kind === 'village' && JSON.stringify(steps) === JSON.stringify([[p0, l0], [p0 + 1, l0], [p0 + 2, l0], [p0 + 2, l0 + 1], [p0 + 1, l0 + 1]]),
    `with the mouse a village, a landmark and a label go on the map, and Erase takes the village off again (places and labels: ${steps.map((s) => s.join('/')).join(', ')})`);
  const undone = [];
  for (let k = 0; k < 4; k++) { await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); undone.push(await count()); }
  ok(JSON.stringify(undone) === JSON.stringify(steps.slice(0, 4).reverse()), `and Undo takes each step back in turn (${undone.map((s) => s.join('/')).join(', ')})`);

  // A world file the app saved opens as the same world, notes and all.
  await pg.keyboard.press('v');
  const cap = (await pg.evaluate(() => window.terra.places())).find((p) => p.kind === 'capital');
  await pg.evaluate((id) => window.terra.select({ type: 'place', id }), cap.id);
  await pg.fill('#pLore', 'Kept in the file, and back out of it.');
  const printBefore = await pg.evaluate(() => window.terra.fingerprint());
  await pg.click('#tab-world');
  const [fileDl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]);
  const filePath = await fileDl.path();
  await pg.evaluate(() => window.terra.newWorld(777, 'archipelago'));
  const printOther = await pg.evaluate(() => window.terra.fingerprint());
  await pg.setInputFiles('#wFile', filePath);
  await pg.waitForFunction(() => document.querySelector('#toast span')?.textContent.startsWith('Opened'));
  const printAfter = await pg.evaluate(() => window.terra.fingerprint());
  const noteBack = await pg.evaluate((name) => { const p = window.terra.places().find((q) => q.name === name); window.terra.select({ type: 'place', id: p.id }); return document.getElementById('pLore').value; }, cap.name);
  ok(JSON.stringify(printAfter) === JSON.stringify(printBefore) && JSON.stringify(printOther) !== JSON.stringify(printBefore) && noteBack === 'Kept in the file, and back out of it.', `a world file the app saved opens as the same world, with its notes (${printAfter.h}, ${printAfter.names})`);

  // Atlas: pale inks on the map, where Terrain's sea is a deep blue, and a parchment margin on Save map image.
  const parchment = () => pg.evaluate(() => { const cv = document.getElementById('map'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, all = 0; for (let i = 0; i < d.length; i += 4 * 53) { all++; if (Math.min(d[i], d[i + 1], d[i + 2]) > 140) n++; } return n / all; });
  await pg.evaluate(() => window.terra.select(null));
  const terrainShare = await parchment();
  await pg.click('#styleAtlas'); await pg.waitForTimeout(400);
  const atlasShare = await parchment();
  await pg.click('#tab-world');
  const [atlasDl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSavePng')]);
  const atlasPng = await readFile(await atlasDl.path());
  const corner = await pg.evaluate((b64) => new Promise((done) => { const img = new Image(); img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); done([...g.getImageData(4, 4, 1, 1).data.slice(0, 3)]); }; img.src = 'data:image/png;base64,' + b64; }), atlasPng.toString('base64'));
  await pg.click('#styleTerrain');
  // (Parchment with its faint grain: within a few steps of #E9DFC6.)
  ok(atlasShare > terrainShare + 0.3 && atlasPng.readUInt32BE(16) === 1980 && [0xE9, 0xDF, 0xC6].every((v, i) => Math.abs(corner[i] - v) <= 8),
    `Atlas draws the map in pale inks (${Math.round(atlasShare * 100)}% of the frame pale, against ${Math.round(terrainShare * 100)}% in Terrain), and its Save map image on parchment (margin rgb ${corner.join(', ')})`);
  // A world file keeps the look it was saved in, and opens in it on another device, where the other look was chosen.
  // The autosave doesn't keep one, so there your own choice stays. (The file from an earlier build has none, and opens
  // in the look on screen.)
  await pg.click('#styleAtlas'); await pg.waitForTimeout(200);
  await pg.click('#tab-world');
  const [lookDl] = await Promise.all([pg.waitForEvent('download'), pg.click('#wSaveFile')]);
  const lookFile = JSON.parse(await readFile(await lookDl.path(), 'utf8'));
  await pg.click('#styleTerrain'); await pg.waitForTimeout(200);
  await pg.setInputFiles('#wFile', await lookDl.path());
  await pg.waitForFunction(() => document.querySelector('#toast span')?.textContent.startsWith('Opened'));
  const lookSaid = await pg.textContent('#toast span');
  await pg.waitForTimeout(1300);
  const look = await pg.evaluate(() => [document.getElementById('styleAtlas').getAttribute('aria-pressed'), 'style' in JSON.parse(localStorage.getItem('terra-incognita/world/v1'))]);
  await pg.click('#styleTerrain');
  ok(lookFile.style === 'atlas' && look[0] === 'true' && !look[1] && lookSaid.includes(', in Atlas as it was saved.'), `a world file saved in Atlas opens in Atlas ("${lookSaid}"), and the autosave keeps no look`);

  // Each Shape grows its own kind of world, with land and realms on it.
  const shapes = [];
  for (const shape of await pg.evaluate(() => [...document.querySelectorAll('#wShape option')].map((o) => o.value))) {
    await pg.selectOption('#wShape', shape); await pg.fill('#wSeed', '20417'); await pg.click('#wGen'); await pg.waitForFunction(() => !window.terra.busy()); await pg.waitForTimeout(200);
    const s = await pg.evaluate(() => window.terra.state());
    shapes.push([shape, s.shape, s.land, s.places, s.realms]);
  }
  ok(shapes.map((s) => s[0]).join() === 'continent,archipelago,twin,inland' && shapes.every(([want, got, land, places, realms]) => want === got && land > 10000 && places >= 10 && realms >= 2) && new Set(shapes.map((s) => s[2])).size === 4,
    `each Shape grows a world with land, places and realms (${shapes.map(([k, , l, p, r]) => `${k} ${l} cells, ${p} places, ${r} realms`).join('; ')})`);

  // The README: 6.5 °C cooler for every kilometre up. Neighbouring cells on one row, a kilometre or so apart in height.
  const lapse = await pg.evaluate(() => {
    window.terra.newWorld(20417);
    const rates = [];
    for (let y = 0.5; y < 300; y += 1) for (let x = 0.5; x < 477; x += 1) {
      const a = window.terra.cell(x, y); if (a.h < 0 || a.lake) continue;
      for (let dx = 1; dx <= 3; dx++) { const b = window.terra.cell(x + dx, y); const dE = b.elev - a.elev; if (b.h < 0 || b.lake || Math.abs(dE) < 800 || Math.abs(dE) > 1200) continue; rates.push([-(b.temp - a.temp) / dE * 1000, a, b]); }
    }
    rates.sort((p, q) => p[0] - q[0]);
    const [rate, a, b] = rates[rates.length >> 1];
    return { n: rates.length, median: rate, pair: [Math.round(a.elev), Math.round(b.elev), +a.temp.toFixed(1), +b.temp.toFixed(1)] };
  });
  ok(lapse.n > 50 && Math.abs(lapse.median - 6.5) < 0.4, `ground a kilometre higher is about 6.5 °C cooler, as the README says (${lapse.median.toFixed(2)} °C a km over ${lapse.n} pairs of neighbours; ${lapse.pair[0]} m at ${lapse.pair[2]} °C beside ${lapse.pair[1]} m at ${lapse.pair[3]} °C)`);
  await c.close();

  // dist/artifact.html, the fragment published as an Artifact, inside a host's page: it draws the world, with no errors.
  execSync('node scripts/build.mjs', { cwd: root, stdio: 'pipe' });
  const fragment = await readFile(join(root, 'dist/artifact.html'), 'utf8');
  const hc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const hp = await hc.newPage();
  const hostErrors = [];
  hp.on('pageerror', (e) => hostErrors.push(e.message)); hp.on('console', (m) => { if (m.type() === 'error') hostErrors.push(m.text()); });
  await hp.route('**/host.html', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fragment}</body></html>` }));
  await hp.goto(base + 'host.html');
  await hp.waitForFunction(() => window.terra && window.terra.state().places > 0);
  await hp.waitForTimeout(300);
  const hostDrawn = await hp.evaluate(() => { const cv = document.getElementById('map'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 101) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return seen.size; });
  ok(hostDrawn > 50 && hostErrors.length === 0, `dist/artifact.html draws the world inside a host's page (${hostDrawn} colours)` + (hostErrors.length ? ': ' + hostErrors.join('; ') : ''));
  await hc.close();
}

const real = problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(p));
ok(real.length === 0, 'no errors and nothing loaded from elsewhere' + (real.length ? ':\n' + real.join('\n') : ''));

// Offline, checked the junkdrawer house kit's way, from a server that answers like GitHub Pages: a browser may keep
// each file for ten minutes, and asks again by its ETag. `net` is the connection: 'up', 'down' (the server drops every
// connection) or 'stalled' (a plane's or a train's wifi: it takes each request and holds on to it). With `release`
// set it serves the next release. The server's own switches are needed because the browser's offline switch can't
// make a stall, and in some Chromium builds it doesn't stop the service worker's own requests.
{
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { join, extname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  let net = 'up', release = false;
  const held = [];
  const server = createServer((req, res) => {
    if (net === 'down') { req.socket.destroy(); return; }
    if (net === 'stalled') { held.push([req, res]); return; }
    serve(req, res);
  }).listen(0);
  async function serve(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    let body;
    try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
    if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
    if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
    const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    res.writeHead(200, head);
    res.end(body);
  }
  const base = `http://localhost:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  const title = await page.title();

  // Works offline once it has been opened.
  net = 'down';
  await ctx.setOffline(true);
  await page.reload();
  assert.equal(await page.title(), title, 'the page did not open offline');
  // After that one visit, a file the copy keeps comes from it as itself (the icons were left out of it), and one it
  // doesn't keep fails. Both used to come back as the app's page, with a 200.
  const offlineFiles = await page.evaluate(() => Promise.all(['icon-192.png', 'icon-512-maskable.png', 'og.png'].map((f) => fetch(f).then((r) => `${r.status} ${r.headers.get('content-type')}`, () => 'failed'))));
  ok(JSON.stringify(offlineFiles) === JSON.stringify(['200 image/png', '200 image/png', 'failed']), `offline after one visit, the icons come from the copy and a file it doesn't keep fails (${offlineFiles.join(', ')})`);
  await ctx.setOffline(false);

  // On a connection that's up but not answering, it opens from the copy too, after the worker's few seconds' wait for
  // the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
  net = 'stalled';
  const t0 = Date.now();
  await page.reload({ timeout: 10000 }).catch(() => {});
  const took = Date.now() - t0;
  assert.ok(took < 8000, `the page took ${took} ms to open on a stalled connection`);
  assert.equal(await page.title(), title, 'the page did not open on a stalled connection');
  assert.ok(await page.evaluate(() => window.terra.state().places) > 0, 'the page opened on a stalled connection with no world');
  assert.ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "IM Fell English"') && document.fonts.check('14px "Instrument Sans"'); }), 'the fonts did not load on a stalled connection');
  net = 'up';
  for (const [req, res] of held.splice(0)) serve(req, res);

  // A new release: every file in the new copy comes from the server, though the browser still has its own copies of
  // the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
  // The new release's worker clears out this app's older copies by name, and leaves any other cache on the site alone.
  await page.evaluate(async () => { await caches.open('terra-incognita-v1'); await caches.open('someone-else'); });
  release = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  for (const end = Date.now() + 10000; !(await page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')));) {
    assert.ok(Date.now() < end, "the new release's offline copy kept the old index.html");
    await new Promise(r => setTimeout(r, 100));
  }
  for (const end = Date.now() + 10000; await page.evaluate(() => caches.has('terra-incognita-v1'));) {
    assert.ok(Date.now() < end, "the new release's worker kept the app's older copy");
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(await page.evaluate(() => caches.has('someone-else')), "the new release's worker deleted a cache that wasn't the app's");
  assert.deepEqual(problems, [], 'problems while offline or on a stalled connection');
  await ctx.close();
  server.close();

  // sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js
  // is a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
  // index.html; the first 8 hex of the sha1 of those).
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
  const all = createHash('sha1');
  for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
  const files = all.digest('hex').slice(0, 8);
  assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
}

await browser.close();
server.close();
console.log('all good');
