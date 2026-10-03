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



  function snapshotError(code, message){
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function validateSnapshotShape(snapshot){
    if (!snapshot || typeof snapshot !== 'object') throw snapshotError('INVALID_SNAPSHOT','Snapshot must be an object');
    if (snapshot.v !== 1) throw snapshotError(snapshot.v == null ? 'INVALID_SNAPSHOT' : 'UNSUPPORTED_SNAPSHOT','Unsupported snapshot version');
    const days = Number(snapshot.days), gal = Number(snapshot.gal);
    if (!Number.isInteger(days) || days < 1 || !finite(gal) || gal < 0) throw snapshotError('INVALID_SNAPSHOT','Invalid cycle');
    if (!['en','zh'].includes(snapshot.lang)) throw snapshotError('INVALID_SNAPSHOT','Invalid language');
    if (!['g','kg','lb','oz'].includes(snapshot.dryUnit)) throw snapshotError('INVALID_SNAPSHOT','Invalid dry unit');
    if (!['ml','l','gal','floz'].includes(snapshot.liquidUnit)) throw snapshotError('INVALID_SNAPSHOT','Invalid liquid unit');
    if (!Array.isArray(snapshot.nutrients)) throw snapshotError('INVALID_SNAPSHOT','Invalid nutrients');
    const nutrients = snapshot.nutrients.map(n => {
      if (!n || typeof n !== 'object' || typeof n.name !== 'string' || !['dry','liquid'].includes(n.kind) || !/^#[0-9A-Fa-f]{6}$/.test(n.color || '') || !Array.isArray(n.windows) || !n.windows.length){
        throw snapshotError('INVALID_SNAPSHOT','Invalid nutrient');
      }
      const windows = sortWindowsByStart(n.windows).map(w => ({rate:Number(w.rate),start:Number(w.start),end:Number(w.end)}));
      const evals = evaluateWindows(windows, days);
      if (evals.some(x => !x.ok)) throw snapshotError('INVALID_SNAPSHOT','Invalid nutrient windows');
      return {name:n.name,kind:n.kind,color:n.color,windows};
    });
    return {v:1,days,gal,lang:snapshot.lang,dryUnit:snapshot.dryUnit,liquidUnit:snapshot.liquidUnit,nutrients};
  }

  function createSnapshot(source){
    return validateSnapshotShape({
      v:1,
      days:source && source.days,
      gal:source && source.gal,
      lang:source && source.lang,
      dryUnit:source && source.dryUnit,
      liquidUnit:source && source.liquidUnit,
      nutrients:(source && Array.isArray(source.nutrients) ? source.nutrients : []).map(n => ({
        name:n.name, kind:n.kind, color:n.color,
        windows:Array.isArray(n.windows) ? n.windows.map(w => ({rate:w.rate,start:w.start,end:w.end})) : []
      }))
    });
  }

  function utf8ToBase64Url(text){
    if (typeof Buffer !== 'undefined') return Buffer.from(text,'utf8').toString('base64url');
    const bytes = new TextEncoder().encode(text);
    let bin=''; bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function base64UrlToUtf8(encoded){
    try{
      if (typeof Buffer !== 'undefined') return Buffer.from(encoded,'base64url').toString('utf8');
      let s=String(encoded).replace(/-/g,'+').replace(/_/g,'/');
      while (s.length % 4) s += '=';
      const bin=atob(s), bytes=Uint8Array.from(bin,c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }catch(e){
      throw snapshotError('INVALID_SNAPSHOT','Invalid encoding');
    }
  }

  function encodeSnapshot(snapshot){
    return utf8ToBase64Url(JSON.stringify(validateSnapshotShape(snapshot)));
  }

  function decodeSnapshot(encoded){
    try{
      const raw = base64UrlToUtf8(String(encoded || ''));
      const parsed = JSON.parse(raw);
      return validateSnapshotShape(parsed);
    }catch(e){
      if (e && (e.code === 'INVALID_SNAPSHOT' || e.code === 'UNSUPPORTED_SNAPSHOT')) throw e;
      throw snapshotError('INVALID_SNAPSHOT','Malformed snapshot');
    }
  }

  function verifyHomepagePin(value){
    return String(value) === '1800911';
  }

  function requiresHomepageLock(hash, sessionUnlocked){
    return !String(hash || '').startsWith('#view=') && !sessionUnlocked;
  }

  function parseViewHash(hash){
    const raw=String(hash || '');
    if (!raw.startsWith('#view=')) return {mode:'edit'};
    const encoded=raw.slice(6);
    if (!encoded) throw snapshotError('INVALID_SNAPSHOT','Missing snapshot');
    return {mode:'view',snapshot:decodeSnapshot(encoded)};
  }

  return {sortWindowsByStart, evaluateWindows, activeWindowAt, nutrientStats, computePhases, createSnapshot, encodeSnapshot, decodeSnapshot, parseViewHash, verifyHomepagePin, requiresHomepageLock};
});
