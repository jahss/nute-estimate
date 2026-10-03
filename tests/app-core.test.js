'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../app-core.js');

const W = (rate, start, end) => ({rate, start, end});
const nutrient = windows => ({name:'A', kind:'dry', color:'#123456', windows});

test('sortWindowsByStart keeps nutrient order irrelevant and sorts only windows', () => {
  const windows = [W(5,36,63), W(6,1,14), W(4,15,28)];
  const sorted = Core.sortWindowsByStart(windows);
  assert.deepEqual(sorted.map(w => w.start), [1,15,36]);
  assert.deepEqual(windows.map(w => w.start), [36,1,15]);
});

test('evaluateWindows accepts gaps and adjacent windows', () => {
  const result = Core.evaluateWindows([W(6,1,14), W(4,15,28), W(5,36,63)], 63);
  assert.equal(result.every(x => x.ok), true);
  assert.deepEqual(result.map(x => x.days), [14,14,28]);
});

test('evaluateWindows rejects every member of overlapping windows', () => {
  const result = Core.evaluateWindows([W(6,1,20), W(4,10,30), W(5,25,40)], 63);
  assert.deepEqual(result.map(x => x.ok), [false,false,false]);
  assert.deepEqual(result.map(x => x.reason), ['overlap','overlap','overlap']);
});

test('evaluateWindows rejects out-of-cycle windows without deleting them', () => {
  const windows = [W(6,1,14), W(4,60,70)];
  const result = Core.evaluateWindows(windows, 63);
  assert.equal(result.length, 2);
  assert.equal(result[0].ok, true);
  assert.equal(result[1].ok, false);
  assert.equal(result[1].reason, 'outside-cycle');
  assert.equal(windows[1].end, 70);
});

test('nutrientStats sums active days and amount across valid windows', () => {
  const n = nutrient([W(6,1,14), W(4,15,28), W(5,36,63)]);
  const stats = Core.nutrientStats(n, 63, 300);
  assert.equal(stats.activeDays, 56);
  assert.equal(stats.validWindowCount, 3);
  assert.equal(stats.total, (14*6 + 14*4 + 28*5) * 300);
});

test('nutrientStats accepts a zero rate', () => {
  const stats = Core.nutrientStats(nutrient([W(0,1,7)]), 63, 300);
  assert.equal(stats.validWindowCount, 1);
  assert.equal(stats.activeDays, 7);
  assert.equal(stats.total, 0);
});

test('activeWindowAt returns the matching rate segment for the day', () => {
  const n = nutrient([W(6,1,14), W(4,15,28), W(5,36,63)]);
  assert.equal(Core.activeWindowAt(n, 20, 63).rate, 4);
  assert.equal(Core.activeWindowAt(n, 30, 63), null);
  assert.equal(Core.activeWindowAt(n, 50, 63).rate, 5);
});

test('computePhases splits on adjacent rate changes', () => {
  const a = nutrient([W(6,1,14), W(4,15,28)]);
  const phases = Core.computePhases([a], 28);
  assert.deepEqual(phases.map(p => [p.s,p.e]), [[1,14],[15,28]]);
  assert.deepEqual(phases.map(p => p.active[0].window.rate), [6,4]);
});


test('snapshot round trip preserves mixed nutrients, presentation, and mixing order', () => {
  const source = {
    days:63, gal:300, lang:'zh', dryUnit:'lb', liquidUnit:'l',
    nutrients:[
      {name:'液体 B',kind:'liquid',color:'#B4552D',windows:[W(2,20,30),W(1,1,10)]},
      {name:'A',kind:'dry',color:'#2F6B3F',windows:[W(6,1,63)]}
    ]
  };
  const snap = Core.createSnapshot(source);
  const decoded = Core.decodeSnapshot(Core.encodeSnapshot(snap));
  assert.equal(decoded.v, 1);
  assert.equal(decoded.lang, 'zh');
  assert.equal(decoded.dryUnit, 'lb');
  assert.equal(decoded.liquidUnit, 'l');
  assert.deepEqual(decoded.nutrients.map(n => n.name), ['液体 B','A']);
  assert.deepEqual(decoded.nutrients[0].windows.map(w => w.start), [1,20]);
});

test('snapshot preserves Chinese nutrient names exactly', () => {
  const snap = Core.createSnapshot({days:14,gal:100,lang:'zh',dryUnit:'g',liquidUnit:'ml',nutrients:[{name:'修复 液体',kind:'liquid',color:'#6D3B52',windows:[W(0.5,1,14)]}]});
  assert.equal(Core.decodeSnapshot(Core.encodeSnapshot(snap)).nutrients[0].name, '修复 液体');
});

test('snapshot rejects overlapping windows', () => {
  assert.throws(() => Core.createSnapshot({days:20,gal:100,lang:'en',dryUnit:'g',liquidUnit:'ml',nutrients:[{name:'A',kind:'dry',color:'#2F6B3F',windows:[W(1,1,10),W(2,10,20)]}]}), e => e && e.code === 'INVALID_SNAPSHOT');
});

test('decodeSnapshot rejects malformed payload and unsupported version', () => {
  assert.throws(() => Core.decodeSnapshot('not-base64'), e => e && e.code === 'INVALID_SNAPSHOT');
  const bad = Buffer.from(JSON.stringify({v:99}), 'utf8').toString('base64url');
  assert.throws(() => Core.decodeSnapshot(bad), e => e && e.code === 'UNSUPPORTED_SNAPSHOT');
});

test('parseViewHash distinguishes edit and view modes', () => {
  assert.deepEqual(Core.parseViewHash(''), {mode:'edit'});
  assert.deepEqual(Core.parseViewHash('#other=1'), {mode:'edit'});
  const snap = Core.createSnapshot({days:7,gal:10,lang:'en',dryUnit:'g',liquidUnit:'ml',nutrients:[{name:'A',kind:'dry',color:'#2F6B3F',windows:[W(1,1,7)]}]});
  const parsed = Core.parseViewHash('#view=' + Core.encodeSnapshot(snap));
  assert.equal(parsed.mode, 'view');
  assert.equal(parsed.snapshot.days, 7);
});


test('homepage lock requires PIN for a fresh editor session', () => {
  assert.equal(Core.requiresHomepageLock('', false), true);
});

test('homepage lock stays open after session unlock', () => {
  assert.equal(Core.requiresHomepageLock('', true), false);
});

test('homepage lock never blocks frozen view links', () => {
  assert.equal(Core.requiresHomepageLock('#view=abc', false), false);
});

test('homepage PIN accepts only the configured code', () => {
  assert.equal(Core.verifyHomepagePin('1800911'), true);
  assert.equal(Core.verifyHomepagePin('1800910'), false);
  assert.equal(Core.verifyHomepagePin(' 1800911 '), false);
});


test('index wires the homepage PIN screen and session-only unlock', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="homeLockForm"/);
  assert.match(html, /id="homePin"/);
  assert.match(html, /sessionStorage\.getItem\('nbl-home-unlocked'\)/);
  assert.match(html, /sessionStorage\.setItem\('nbl-home-unlocked','1'\)/);
  assert.match(html, /NuteCore\.requiresHomepageLock\(location\.hash,/);
  assert.match(html, /NuteCore\.verifyHomepagePin\(/);
  assert.match(html, /#view=/);
});


test('weekBands groups the cycle into seven-day weeks with a partial final week', () => {
  assert.deepEqual(Core.weekBands(15), [
    {week:1,start:1,end:7},
    {week:2,start:8,end:14},
    {week:3,start:15,end:15}
  ]);
});

test('index presents Estimate/Feed with weekly hero print timeline and movable day overlay', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<title>Estimate\/Feed<\/title>/);
  assert.match(html, /<h1>Estimate\/Feed<\/h1>/);
  assert.match(html, /ESTIMATE \/ FEED/);
  assert.match(html, /id="scheduleSection"/);
  assert.match(html, /tl-weeks/);
  assert.match(html, /week-band/);
  assert.match(html, /under\.style\.width\s*=\s*W\s*\+\s*'px'/);
  assert.match(html, /over\.style\.width\s*=\s*W\s*\+\s*'px'/);
  assert.match(html, /\.unit-note\{[^}]*font-size:11px/);
  assert.match(html, /@media print[\s\S]*#scheduleSection\{order:2/);
  assert.match(html, /@media print[\s\S]*\.tl-phases\{display:none!important\}/);
});


test('timeline labels expose Weeks blocks and a Days axis label above grid overlays', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /const c2 = h\('div','tl-corner ax day-corner'\); c2\.textContent = 'Days'/);
  assert.match(html, /\.tl-phases,.tl-weeks,.tl-ruler\{[^}]*z-index:1/);
  assert.match(html, /label\.textContent='Week '\+w\.week/);
});


test('PWA install page exposes manifest, install action, and service worker registration', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'install.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icon-192\.png"/);
  assert.match(html, /id="installBtn"/);
  assert.match(html, /beforeinstallprompt/);
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match(html, /Share → Add to Home Screen/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'), /"display"\s*:\s*"standalone"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), /\.\/install\.html/);
});


test('timeline ruler uses seven-day ticks and keeps the final cycle day', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /for \(let d = 7; d <= D; d \+= 7\) marks\.push\(d\)/);
  assert.match(html, /marks\[marks\.length - 1\] !== D/);
  assert.doesNotMatch(html, /for \(let b = 1; b <= D; b \+= step\)/);
  assert.match(html, /label\.textContent='Week '\+w\.week/);
  assert.match(html, /c2\.textContent = 'Days'/);
});


test('mobile timeline keeps day 1, uses compact week numbers, and dismisses tooltip', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /const marks = \[1\]/);
  assert.match(html, /for \(let d = 7; d <= D; d \+= 7\) marks\.push\(d\)/);
  assert.match(html, /label\.textContent=String\(w\.week\)/);
  assert.doesNotMatch(html, /label\.textContent='Week '\+w\.week/);
  assert.match(html, /renderTimeline\(\); renderDayCard\(\); hideHover\(\);/);
  assert.match(html, /document\.addEventListener\('pointerdown',[\s\S]*!tlEl\.contains\(e\.target\)[\s\S]*hideHover\(\)/);
});


test('Days corner matches compact timeline header typography', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /\.tl-corner\.ph,\.day-corner\{font-size:10px;letter-spacing:\.18em;text-transform:uppercase;color:var\(--ink-3\)/);
});

test('shared view hides batching phases while editor keeps the section', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<section id="phaseSection">[\s\S]*<h2>Batching phases<\/h2>/);
  assert.match(html, /body\.view-mode #phaseSection\{display:none!important\}/);
});


test('grand total sits directly under nutrient register before the schedule', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const reg = html.indexOf('id="regTable"');
  const tally = html.indexOf('<footer class="tally">');
  const schedule = html.indexOf('id="scheduleSection"');
  assert.ok(reg >= 0 && tally > reg && schedule > tally);
});


test('shared view actions sit under application windows, not grand total', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tally = html.indexOf('<footer class="tally">');
  const schedule = html.indexOf('id="scheduleSection"');
  const actions = html.indexOf('class="view-actions schedule-actions"');
  const phase = html.indexOf('id="phaseSection"');
  assert.ok(tally >= 0 && schedule > tally && actions > schedule && (phase < 0 || actions < phase));
  const tallyEnd = html.indexOf('</footer>', tally);
  assert.ok(actions > tallyEnd);
});


test('print is a single application-window sheet with pinned-day card', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /@page\{size:landscape;margin:8mm\}/);
  assert.match(html, /\.page>\*\{display:none!important/);
  assert.match(html, /\.page>#scheduleSection\{display:block!important/);
  assert.match(html, /#scheduleSection \.phase-corner\{display:flex!important\}/);
  assert.match(html, /#scheduleSection \.tl-phases\{display:block!important/);
  assert.match(html, /#scheduleSection \.day-card\{display:grid!important/);
  assert.match(html, /#scheduleSection \.schedule-actions,[\s\S]*#scheduleSection \.view-actions\{display:none!important\}/);
});
