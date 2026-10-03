(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NuteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const finite = Number.isFinite;

  function sortWindowsByStart(windows){
    return (Array.isArray(windows) ? windows : []).slice().sort((a,b) => {
      const as = Number(a && a.start), bs = Number(b && b.start);
      const af = finite(as), bf = finite(bs);
      if (af && bf) return as - bs;
      if (af) return -1;
      if (bf) return 1;
      return 0;
    });
  }

  function evaluateWindows(windows, days){
    const D = Number(days);
    const source = Array.isArray(windows) ? windows : [];
    const out = source.map((window, index) => {
      const rate = Number(window && window.rate);
      const start = Number(window && window.start);
      const end = Number(window && window.end);
      let reason = null;
      if (!finite(rate) || !finite(start) || !finite(end)) reason = 'incomplete';
      else if (rate < 0) reason = 'negative-rate';
      else if (!Number.isInteger(start) || !Number.isInteger(end)) reason = 'non-integer-day';
      else if (!finite(D) || !Number.isInteger(D) || D < 1 || start < 1 || end > D) reason = 'outside-cycle';
      else if (start > end) reason = 'start-after-end';
      return {window, index, rate, start, end, days: reason ? 0 : end - start + 1, ok: !reason, reason};
    });

    for (let i = 0; i < out.length; i++){
      if (!out[i].ok) continue;
      for (let j = i + 1; j < out.length; j++){
        if (!out[j].ok) continue;
        if (out[i].start <= out[j].end && out[j].start <= out[i].end){
          out[i].reason = 'overlap';
          out[j].reason = 'overlap';
        }
      }
    }
    out.forEach(x => {
      x.ok = !x.reason;
      x.days = x.ok ? x.end - x.start + 1 : 0;
    });
    return out;
  }

  function validEvaluations(nutrient, days){
    return evaluateWindows(nutrient && nutrient.windows, days).filter(x => x.ok);
  }

  function activeWindowAt(nutrient, day, days){
    const d = Number(day);
    if (!finite(d)) return null;
    const hit = validEvaluations(nutrient, days).find(x => d >= x.start && d <= x.end);
    return hit ? hit.window : null;
  }

  function nutrientStats(nutrient, days, gal){
    const G = Number(gal);
    const valid = validEvaluations(nutrient, days);
    const activeDays = valid.reduce((sum,x) => sum + x.days, 0);
    const total = finite(G) && G >= 0
      ? valid.reduce((sum,x) => sum + x.rate * G * x.days, 0)
      : NaN;
    return {activeDays, total, validWindowCount: valid.length};
  }

  function computePhases(nutrients, days){
    const D = Number(days);
    if (!finite(D) || !Number.isInteger(D) || D < 1) return [];
    const list = Array.isArray(nutrients) ? nutrients : [];
    const validByNutrient = list.map(n => validEvaluations(n, D));
    const boundaries = new Set([1, D + 1]);
    validByNutrient.forEach(wins => wins.forEach(w => {
      boundaries.add(w.start);
      boundaries.add(w.end + 1);
    }));
    const points = [...boundaries].filter(x => x >= 1 && x <= D + 1).sort((a,b) => a-b);
    const phases = [];
    for (let i = 0; i < points.length - 1; i++){
      const s = points[i], e = points[i+1] - 1;
      if (s > e) continue;
      const active = [];
      list.forEach((nutrient, ni) => {
        const hit = validByNutrient[ni].find(w => w.start <= s && w.end >= e);
        if (hit) active.push({nutrient, window: hit.window});
      });
      phases.push({s,e,active});
    }
    return phases;
  }

  return {sortWindowsByStart, evaluateWindows, activeWindowAt, nutrientStats, computePhases};
});
