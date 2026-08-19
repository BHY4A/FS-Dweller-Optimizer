// Step 3 — weapons.

import { WEAPON_AVG_DAMAGE, WEAPON_BASE_TIER, WEAPON_SUFFIX_MOD } from '../data/items.js';
import { getAssignableDwellers, getInventoryItems, effectiveStat } from '../core/save.js';

// ---- Combat & weapons ---------------------------------------
// Damage-and-crit factor x survivability. Strength pulls the damage roll
// toward the top of the weapon's range, Agility raises attack rate,
// Perception slows the crit reticle, Luck raises crit frequency. maxHealth
// (already derived by the game from level + trained Endurance) scales how
// long a dweller survives, and therefore how many total hits they land.
export function combatScore(d) {
  const effS = effectiveStat(d, 1), effP = effectiveStat(d, 2);
  const effA = effectiveStat(d, 6), effL = effectiveStat(d, 7);
  const maxHealth = (d.health && d.health.maxHealth) || 100;
  return effS * effA * (1 + 0.05 * (effP + effL)) * (maxHealth / 100);
}
export function weaponScoreEstimated(id) {
  let base = id, suffixMod = 0;
  for (const suf of Object.keys(WEAPON_SUFFIX_MOD)) {
    if (id.endsWith('_' + suf)) { base = id.slice(0, -(suf.length + 1)); suffixMod = WEAPON_SUFFIX_MOD[suf]; break; }
  }
  const baseTier = WEAPON_BASE_TIER[base] !== undefined ? WEAPON_BASE_TIER[base] : 3;
  return baseTier * 2 + suffixMod;
}
export function weaponScore(id) {
  if (!id || id === 'Fist') return 0;
  if (WEAPON_AVG_DAMAGE[id] !== undefined) return WEAPON_AVG_DAMAGE[id];
  return weaponScoreEstimated(id);
}
export function isWeaponScoreExact(id) {
  return !!id && (id === 'Fist' || WEAPON_AVG_DAMAGE[id] !== undefined);
}

// Pair the strongest fighters with the deadliest weapons. Sorting both lists
// descending and matching rank-for-rank maximises the sum of
// (combat multiplier x weapon damage) — the rearrangement inequality — so
// no Hungarian solve is needed here.
export function optimizeWeapons(save) {
  const dwellers = getAssignableDwellers(save);

  const weaponPool = [];
  dwellers.forEach(d => {
    // 'Fist' is the game's sentinel for "unarmed", not a real item. It must
    // never enter the pool, or leftovers would be written back to storage and
    // the player would see phantom "Fist" entries in their inventory.
    if (d.equipedWeapon && d.equipedWeapon.id && d.equipedWeapon.id !== 'Fist') {
      weaponPool.push({ id: d.equipedWeapon.id, source: 'dweller', ownerId: d.serializeId });
    }
  });
  getInventoryItems(save).forEach(it => {
    if (it.type === 'Weapon' && it.id !== 'Fist') weaponPool.push({ id: it.id, source: 'storage' });
  });

  const dwellersSorted = dwellers.slice().sort((a, b) => combatScore(b) - combatScore(a));
  const weaponsSorted = weaponPool.slice().sort((a, b) => weaponScore(b.id) - weaponScore(a.id));

  const assignments = [];
  const n = Math.min(dwellersSorted.length, weaponsSorted.length);
  for (let i = 0; i < dwellersSorted.length; i++) {
    const d = dwellersSorted[i];
    const oldId = d.equipedWeapon ? d.equipedWeapon.id : null;
    const newId = i < n ? weaponsSorted[i].id : 'Fist';
    assignments.push({
      dwellerId: d.serializeId, name: d.name, combatScore: combatScore(d),
      oldWeaponId: oldId, newWeaponId: newId,
      oldScore: weaponScore(oldId), newScore: weaponScore(newId),
      changed: oldId !== newId,
      exact: isWeaponScoreExact(newId),
    });
  }
  // Firepower = the objective actually being maximised, so the reported
  // gain reflects better pairing and not merely better gear.
  const firepowerOld = assignments.reduce((s, a) => s + a.combatScore * a.oldScore, 0);
  const firepowerNew = assignments.reduce((s, a) => s + a.combatScore * a.newScore, 0);
  return {
    assignments,
    leftoverWeapons: weaponsSorted.slice(n),
    totalOld: assignments.reduce((s, a) => s + a.oldScore, 0),
    totalNew: assignments.reduce((s, a) => s + a.newScore, 0),
    firepowerOld, firepowerNew,
  };
}
