// Vault map geometry and per-room figures.
// Columns are thirds of a room: a room spans mergeLevel*3, elevators span 1.

import { ROOM_STAT_MAP, STAT_LETTERS } from '../data/rooms.js';
import { getRooms, getAllDwellers, effectiveStat, baseStat, roomCapacity } from '../core/save.js';

// ============================================================
// VAULT MAP
// Rooms carry a row and a column in the save. Columns are measured in
// thirds of a room: a room spans mergeLevel * 3 columns, except elevators,
// which are a single narrow column. Verified against several vaults with
// zero overlapping cells.
// ============================================================
export function roomGridWidth(room) {
  return room.type === 'Elevator' ? 1 : (room.mergeLevel || 1) * 3;
}

// Average of the room's governing stat across the dwellers in it. This is
// what actually drives production rate, so it's the number worth showing.
export function roomStatAverage(save, room, dwellerIds) {
  const cfg = ROOM_STAT_MAP[room.type];
  if (!cfg || !dwellerIds || !dwellerIds.length) return null;
  const byId = {};
  getAllDwellers(save).forEach(d => { byId[d.serializeId] = d; });
  let sum = 0, n = 0;
  dwellerIds.forEach(id => {
    const d = byId[id];
    if (!d || d.deathTime !== -1) return;
    sum += effectiveStat(d, cfg.stat);
    n++;
  });
  return n ? sum / n : null;
}

// Everything the map needs for one room, before and after.
export function buildMapModel(save, roomPlan, outfitPlan) {
  const rooms = getRooms(save);
  const byId = {};
  getAllDwellers(save).forEach(d => { byId[d.serializeId] = d; });
  const outfitByDweller = {};
  if (outfitPlan) outfitPlan.assignments.forEach(a => { outfitByDweller[a.dwellerId] = a; });

  // Effective stat for a dweller, honouring a pending outfit swap.
  const statOf = (d, statKey) => {
    const a = outfitByDweller[d.serializeId];
    if (a && a.changed && a.newKnown && statKey !== 'ALL') {
      return baseStat(d, statKey) + a.newBonus;
    }
    return effectiveStat(d, statKey);
  };

  let maxRow = 0, maxCol = 0;
  const cells = [];
  rooms.forEach((room, idx) => {
    const cfg = ROOM_STAT_MAP[room.type];
    const w = roomGridWidth(room);
    maxRow = Math.max(maxRow, room.row);
    maxCol = Math.max(maxCol, room.col + w);

    const oldIds = (room.dwellers || []).filter(id => byId[id] && byId[id].deathTime === -1);
    const newIds = roomPlan && roomPlan.newRoomDwellers[idx] ? roomPlan.newRoomDwellers[idx] : oldIds;

    let avgBefore = null, avgAfter = null, outBefore = 0, outAfter = 0;
    if (cfg) {
      if (oldIds.length) {
        let s = 0; oldIds.forEach(id => { s += effectiveStat(byId[id], cfg.stat); });
        avgBefore = s / oldIds.length; outBefore = s;
      }
      if (newIds.length) {
        let s = 0; newIds.forEach(id => { if (byId[id]) s += statOf(byId[id], cfg.stat); });
        avgAfter = s / newIds.length; outAfter = s;
      }
    }

    cells.push({
      idx, type: room.type, row: room.row, col: room.col, w,
      label: cfg ? cfg.label : prettyRoomName(room.type),
      staffed: !!cfg,
      group: cfg ? cfg.group : null,
      statKey: cfg ? cfg.stat : null,
      statLetter: cfg ? (cfg.stat === 'ALL' ? '?' : STAT_LETTERS[cfg.stat]) : null,
      capacity: roomCapacity(room),
      countBefore: oldIds.length, countAfter: newIds.length,
      avgBefore, avgAfter, outBefore, outAfter,
      level: room.level, broken: !!room.broken, powered: room.power !== false,
      oldIds, newIds,
    });
  });
  return { cells, rows: maxRow + 1, cols: maxCol };
}

export function prettyRoomName(type) {
  const known = {
    Elevator: 'Elevator', Entrance: 'Vault Door', Overseer: "Overseer's Office",
    Storage: 'Storage', LivingQuarters: 'Living Quarters', FakeWasteland: 'Wasteland',
  };
  return known[type] || String(type).replace(/([a-z])([A-Z])/g, '$1 $2');
}
