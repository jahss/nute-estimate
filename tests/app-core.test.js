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
