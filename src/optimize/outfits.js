// Step 2 — outfits.

import { OUTFIT_BONUS } from '../data/items.js';
import { ROOM_STAT_MAP } from '../data/rooms.js';
import { getRooms, getAssignableDwellers, getInventoryItems } from '../core/save.js';
import { hungarianMaxAssignment } from '../core/hungarian.js';

// ---- Outfits -------------------------------------------------
export function outfitBonusFor(outfitId, statKey) {
  const entry = OUTFIT_BONUS[outfitId];
  if (!entry) return 0;
  if (statKey === 'ALL') {
    let sum = 0;
    for (let i = 1; i <= 7; i++) sum += entry[i] || 0;
    return sum / 7;
  }
  return entry[statKey] || 0;
}
export function isOutfitBonusKnown(outfitId) { return !!OUTFIT_BONUS[outfitId]; }

// Pools every worn and stored outfit, then finds the assignment maximising
// each dweller's bonus toward the stat their PLANNED room needs. Dwellers
// with no stat-relevant job get a tiny preference for keeping their own
// current outfit, so the solve doesn't shuffle irrelevant wardrobes around.
export function optimizeOutfits(save, roomPlan) {
  const dwellers = getAssignableDwellers(save);
  const rooms = getRooms(save);

  const jobStatByDweller = {};
  Object.keys(roomPlan.newRoomDwellers).forEach(roomIdx => {
    const cfg = ROOM_STAT_MAP[rooms[roomIdx].type];
    if (!cfg || cfg.group === 'training') return;
    roomPlan.newRoomDwellers[roomIdx].forEach(id => { jobStatByDweller[id] = cfg.stat; });
  });

  const outfitPool = [];
  dwellers.forEach(d => {
    if (d.equipedOutfit && d.equipedOutfit.id) outfitPool.push({ id: d.equipedOutfit.id, ownerId: d.serializeId });
  });
  getInventoryItems(save).forEach(it => { if (it.type === 'Outfit') outfitPool.push({ id: it.id, ownerId: null }); });

  const KEEP_EPS = 0.001;
  const weightMatrix = dwellers.map(d => {
    const statKey = jobStatByDweller[d.serializeId];
    return outfitPool.map(o => {
      if (statKey) return outfitBonusFor(o.id, statKey);
      return (o.ownerId === d.serializeId) ? KEEP_EPS : 0;
    });
  });
  const res = hungarianMaxAssignment(weightMatrix);

  const assignments = [];
  res.assignment.forEach((outfitIdx, di) => {
    const d = dwellers[di];
    const statKey = jobStatByDweller[d.serializeId];
    const oldId = d.equipedOutfit ? d.equipedOutfit.id : null;
    const newId = outfitIdx !== -1 ? outfitPool[outfitIdx].id : oldId;
    assignments.push({
      dwellerId: d.serializeId, name: d.name, statKey,
      oldOutfitId: oldId, newOutfitId: newId,
      oldBonus: statKey ? outfitBonusFor(oldId, statKey) : null,
      newBonus: statKey ? outfitBonusFor(newId, statKey) : null,
      changed: oldId !== newId,
      oldKnown: isOutfitBonusKnown(oldId), newKnown: isOutfitBonusKnown(newId),
    });
  });
  return {
    assignments,
    totalOld: assignments.reduce((s, a) => s + (a.oldBonus || 0), 0),
    totalNew: assignments.reduce((s, a) => s + (a.newBonus || 0), 0),
    unknownCount: outfitPool.filter(o => !isOutfitBonusKnown(o.id)).length,
  };
}
