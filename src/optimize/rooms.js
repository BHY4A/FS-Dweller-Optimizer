// Step 1 — room assignments.

import { ROOM_STAT_MAP } from '../data/rooms.js';
import { getRooms, getAllDwellers, getAssignableDwellers, effectiveStat, baseStat, roomCapacity } from '../core/save.js';
import { hungarianMaxAssignment } from '../core/hungarian.js';

// ---- Room assignment ----------------------------------------
// One unified solve across production AND training slots. Production slots
// are weighted by current effective SPECIAL (immediate output); training
// slots by growth headroom (10 - base value), scaled by trainingWeight.
// Because both live on the same numeric scale, the solver naturally routes
// low-stat dwellers into training and veterans into the jobs they're good
// at — no arbitrary "fill production first" rule that would empty every
// training room whenever the vault has more jobs than dwellers.
export function optimizeVault(save, opts) {
  // Guard against a non-numeric weight (a blank or detached slider): NaN
  // would poison every score and break the solver.
  const rawWeight = opts && opts.trainingWeight;
  const trainingWeight = Number.isFinite(rawWeight) ? rawWeight : 0.2;
  const rooms = getRooms(save);
  const dwellers = getAssignableDwellers(save);

  const slots = [];
  rooms.forEach((r, idx) => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (!cfg) return;
    const cap = roomCapacity(r);
    for (let s = 0; s < cap; s++) slots.push({ roomIdx: idx, statKey: cfg.stat, group: cfg.group });
  });

  const weightMatrix = dwellers.map(d => slots.map(sl => {
    if (sl.group === 'training') return trainingWeight * Math.max(0, 10 - baseStat(d, sl.statKey));
    return effectiveStat(d, sl.statKey);
  }));
  const res = hungarianMaxAssignment(weightMatrix);

  const newRoomDwellers = {};
  rooms.forEach((r, idx) => { if (ROOM_STAT_MAP[r.type]) newRoomDwellers[idx] = []; });

  let productiveScore = 0, trainingPotential = 0;
  const assignedIds = new Set();
  res.assignment.forEach((slotIdx, di) => {
    if (slotIdx === -1) return;
    const sl = slots[slotIdx];
    const d = dwellers[di];
    newRoomDwellers[sl.roomIdx].push(d.serializeId);
    assignedIds.add(d.serializeId);
    if (sl.group === 'training') trainingPotential += Math.max(0, 10 - baseStat(d, sl.statKey));
    else productiveScore += effectiveStat(d, sl.statKey);
  });

  return {
    newRoomDwellers, productiveScore, trainingPotential,
    idleCount: dwellers.filter(d => !assignedIds.has(d.serializeId)).length,
    prodSlotCount: slots.filter(s => s.group !== 'training').length,
    trainSlotCount: slots.filter(s => s.group === 'training').length,
    dwellerCount: dwellers.length,
  };
}

// Efficiency of the CURRENT (pre-optimization) room layout, for comparison.
export function currentProductiveScore(save) {
  const byId = {};
  getAllDwellers(save).forEach(d => { byId[d.serializeId] = d; });
  let score = 0;
  getRooms(save).forEach(r => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (!cfg || cfg.group === 'training') return;
    (r.dwellers || []).forEach(id => {
      const d = byId[id];
      if (d && d.deathTime === -1) score += effectiveStat(d, cfg.stat);
    });
  });
  return score;
}

// Efficiency of a planned layout. When an outfit plan is supplied, a dweller
// whose outfit actually changed is scored as base + the NEW outfit's bonus;
// everyone else keeps the game's own precise mod value.
export function combinedProductiveScore(save, roomPlan, outfitPlan) {
  const rooms = getRooms(save);
  const byId = {};
  getAllDwellers(save).forEach(d => { byId[d.serializeId] = d; });
  const planByDweller = {};
  if (outfitPlan) outfitPlan.assignments.forEach(a => { planByDweller[a.dwellerId] = a; });

  let score = 0;
  Object.keys(roomPlan.newRoomDwellers).forEach(roomIdx => {
    const cfg = ROOM_STAT_MAP[rooms[roomIdx].type];
    if (!cfg || cfg.group === 'training') return;
    roomPlan.newRoomDwellers[roomIdx].forEach(id => {
      const d = byId[id];
      if (!d) return;
      const a = planByDweller[id];
      if (a && a.changed && a.newKnown) score += baseStat(d, cfg.stat) + a.newBonus;
      else score += effectiveStat(d, cfg.stat);
    });
  });
  return score;
}
