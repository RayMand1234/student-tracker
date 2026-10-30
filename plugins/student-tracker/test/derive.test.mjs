// Dashboard derivation module. Expected colours are the anchor stops from the dashboard
// prototype (ticket 08), or hand-interpolated between two of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talkColor, daysSince, talkCircles, talkScale } from '../dashboard/derive.mjs';

const GREEN = 'hsl(140 55% 38%)';
const LIME = 'hsl(78 62% 42%)';
const AMBER = 'hsl(38 88% 48%)';
const RED = 'hsl(6 72% 46%)';
const DEEP = 'hsl(355 70% 30%)';
const DEFAULT = { target: 10, yellow: 10, red: 14 };
const EARLY = { target: 7, yellow: 10, red: 14 };

test('circle colour sits on its anchors: green at 0, lime at target, amber at yellow, red at +7, deep red from +14', () => {
  assert.equal(talkColor(0, EARLY).bg, GREEN);
  assert.equal(talkColor(7, EARLY).bg, LIME);
  assert.equal(talkColor(10, EARLY).bg, AMBER);
  assert.equal(talkColor(17, EARLY).bg, RED);
  assert.equal(talkColor(24, EARLY).bg, DEEP);
  assert.equal(talkColor(90, EARLY).bg, DEEP);
});

test('no Talk yet is the deepest red', () => {
  assert.equal(talkColor(null, DEFAULT).bg, DEEP);
});

test('when target and yellow threshold are the same day, amber wins there', () => {
  assert.equal(talkColor(10, DEFAULT).bg, AMBER);
  // halfway from green (140 55 38) to amber (38 88 48)
  assert.equal(talkColor(5, DEFAULT).bg, 'hsl(89 72% 43%)');
});

test('between red and deep red the hue wraps through 0 instead of sweeping back through green', () => {
  // 5/7 of the way from red (6 72 46) to deep red (-5 70 30)
  assert.equal(talkColor(22, DEFAULT).bg, 'hsl(358 71% 35%)');
});

test('the scale moves with the Commander’s settings', () => {
  const strict = { target: 5, yellow: 7, red: 10 };
  assert.equal(talkColor(5, strict).bg, LIME);
  assert.equal(talkColor(7, strict).bg, AMBER);
  assert.equal(talkColor(14, strict).bg, RED);
  assert.equal(talkColor(21, strict).bg, DEEP);
});

// WCAG 2 contrast, computed independently of the module.
function contrast(ink, bg) {
  const [h, s, l] = bg.match(/hsl\((\d+) (\d+)% (\d+)%\)/).slice(1).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const ch = (n) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const hex = ink.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
  const lum = ([r, g, b]) => [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(hex), lum([ch(0), ch(8), ch(4)])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('circle text keeps at least 4.5:1 contrast on every day of the scale', () => {
  for (const settings of [DEFAULT, EARLY]) {
    for (let d = 0; d <= 30; d++) {
      const { bg, ink } = talkColor(d, settings);
      assert.ok(contrast(ink, bg) >= 4.5, `day ${d}: ${ink} on ${bg} is ${contrast(ink, bg).toFixed(2)}:1`);
    }
  }
  assert.equal(talkColor(null, DEFAULT).ink, '#ffffff');
});

test('days since the last Talk count calendar days, across a clock change', () => {
  assert.equal(daysSince('2026-10-30', '2026-10-30'), 0);
  assert.equal(daysSince('2026-10-20', '2026-10-30'), 10);
  assert.equal(daysSince('2026-10-24', '2026-10-27'), 3); // Israel leaves summer time on 25/10
  assert.equal(daysSince(null, '2026-10-30'), null);
  assert.equal(daysSince('2026-10-31', '2026-10-30'), 0);
});

test('circles: one per active Trainee, reddest first, no-Talk first of all; those who left listed apart', () => {
  const cards = [
    { id: 't-a', name: 'נועה', active: true, lastTalk: '2026-10-28' },
    { id: 't-b', name: 'דני', active: true, lastTalk: '2026-10-10', evalStage: 'רף מקס' },
    { id: 't-c', name: 'מאיה', active: true, lastTalk: null },
    { id: 't-d', name: 'יואב', active: false, left: { date: '2026-10-01', reason: 'העברה' }, lastTalk: '2026-09-01' },
    { id: 't-e', name: 'אור', active: true, lastTalk: '2026-10-28' },
  ];
  const { circles, left } = talkCircles(cards, DEFAULT, '2026-10-30');

  assert.deepEqual(circles.map((c) => [c.name, c.days]), [['מאיה', null], ['דני', 20], ['אור', 2], ['נועה', 2]]);
  assert.equal(circles[0].color.bg, DEEP);
  assert.equal(circles[1].evalStage, 'רף מקס');
  assert.deepEqual(left, ['יואב']);
});

test('the colour bar runs from 0 to deep red with a tick at each distinct anchor', () => {
  const { max, ticks, gradient } = talkScale(DEFAULT);
  assert.equal(max, 24);
  assert.deepEqual(ticks, [0, 10, 17, 24]);
  assert.equal(gradient[0], GREEN);
  assert.equal(gradient.at(-1), DEEP);
  assert.deepEqual(talkScale(EARLY).ticks, [0, 7, 10, 17, 24]);
});
