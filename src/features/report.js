// Plain-text change report.

import { ROOM_STAT_MAP, STAT_NAMES } from '../data/rooms.js';
import { getRooms, getAllDwellers } from '../core/save.js';

// ============================================================
// CHANGE REPORT (plain text, for copying or keeping alongside a backup)
// ============================================================
export function buildReport(save, plans, tagPlan) {
  const L = [];
  const rooms = getRooms(save);
  const byId = {};
  getAllDwellers(save).forEach(d => { byId[d.serializeId] = d; });
  const nm = id => (byId[id] ? byId[id].name : '#' + id);

  L.push('FALLOUT SHELTER — VAULT ' + (save.vault.VaultName || '?') + ' OPTIMIZATION REPORT');
  L.push('Generated ' + new Date().toLocaleString());
  L.push('');

  if (plans.room) {
    L.push('--- ROOM ASSIGNMENTS ---');
    rooms.forEach((r, idx) => {
      const cfg = ROOM_STAT_MAP[r.type];
      if (!cfg) return;
      const oldIds = r.dwellers || [];
      const newIds = plans.room.newRoomDwellers[idx] || [];
      const moveIn = newIds.filter(x => !oldIds.includes(x));
      const moveOut = oldIds.filter(x => !newIds.includes(x));
      if (!moveIn.length && !moveOut.length) return;
      L.push(cfg.label + ' (' + STAT_NAMES[cfg.stat] + ')');
      if (moveOut.length) L.push('   out: ' + moveOut.map(nm).join(', '));
      if (moveIn.length) L.push('    in: ' + moveIn.map(nm).join(', '));
    });
    L.push('');
  }
  if (plans.outfit) {
    const ch = plans.outfit.assignments.filter(a => a.changed && a.statKey);
    L.push('--- OUTFITS (' + ch.length + ' changes) ---');
    ch.forEach(a => L.push('  ' + a.name + ': ' + (a.oldOutfitId || 'none') + ' -> ' + a.newOutfitId +
      '  (' + STAT_NAMES[a.statKey] + ' +' + a.oldBonus + ' -> +' + a.newBonus + ')'));
    L.push('');
  }
  if (plans.weapon) {
    const ch = plans.weapon.assignments.filter(a => a.changed);
    L.push('--- WEAPONS (' + ch.length + ' changes) ---');
    ch.forEach(a => L.push('  ' + a.name + ': ' + (a.oldWeaponId || 'none') + ' -> ' + a.newWeaponId));
    L.push('');
  }
  if (plans.pet) {
    L.push('--- PETS ---');
    plans.pet.recommendations.forEach(r => L.push('  ' + r.petName + ' (' + r.bonusLabel + ' +' + r.bonusValue +
      ') -> ' + (r.recommendedOwnerName || 'storage') + '  [' + r.reason + ']'));
    L.push('');
  }
  if (tagPlan && tagPlan.changes.length) {
    L.push('--- RENAMED (' + tagPlan.changes.length + ') ---');
    tagPlan.changes.forEach(c => L.push('  ' + c.from + ' -> ' + c.to));
    L.push('');
  }
  L.push('Breeding suggestions are advisory and are never written to the save file.');
  return L.join('\n');
}
