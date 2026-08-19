// Step 5 — breeding pairs (advisory only).

import { getAssignableDwellers } from '../core/save.js';

// ---- Breeding ------------------------------------------------
// A child inherits its highest-BASE stat from one parent (~50/50, gear does
// not count), and a higher combined parent SPECIAL total raises the odds of
// a Rare/Legendary child. Charisma speeds up conception.
export function dwellerPrimaryStat(d) {
  let best = 1, bestVal = -1;
  for (let i = 1; i <= 7; i++) {
    const v = d.stats.stats[i].value;
    if (v > bestVal) { bestVal = v; best = i; }
  }
  return best;
}
export function dwellerBaseTotal(d) {
  let sum = 0;
  for (let i = 1; i <= 7; i++) sum += d.stats.stats[i].value;
  return sum;
}
export function suggestBreedingPairs(save, opts) {
  const targetStat = opts && opts.targetStat;
  const dwellers = getAssignableDwellers(save);
  const females = dwellers.filter(d => d.gender === 1 && d.relations && d.relations.partner === -1);
  const males = dwellers.filter(d => d.gender === 2 && d.relations && d.relations.partner === -1);

  const candidates = [];
  females.forEach(f => males.forEach(m => {
    const total = dwellerBaseTotal(f) + dwellerBaseTotal(m);
    let score = total;
    if (targetStat) score += (f.stats.stats[targetStat].value + m.stats.stats[targetStat].value) * 3;
    candidates.push({
      femaleId: f.serializeId, femaleName: f.name, maleId: m.serializeId, maleName: m.name,
      combinedTotal: total, femalePrimary: dwellerPrimaryStat(f), malePrimary: dwellerPrimaryStat(m),
      femaleCharisma: f.stats.stats[4].value, maleCharisma: m.stats.stats[4].value, score,
    });
  }));
  candidates.sort((a, b) => b.score - a.score);

  const usedF = new Set(), usedM = new Set(), pairs = [];
  candidates.forEach(c => {
    if (usedF.has(c.femaleId) || usedM.has(c.maleId)) return;
    usedF.add(c.femaleId); usedM.add(c.maleId);
    pairs.push(c);
  });
  return { pairs, femalesAvailable: females.length, malesAvailable: males.length };
}
