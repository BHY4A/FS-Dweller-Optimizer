// Optional dweller name tagging.

import { ROOM_STAT_MAP, STAT_LETTERS } from '../data/rooms.js';
import { getRooms, getAssignableDwellers } from '../core/save.js';

// ============================================================
// DWELLER NAME TAGGING
// Optional: stamp each dweller's first name with a short tag for their new
// assignment, so the changes are visible at a glance inside the game itself.
// Tags are written in a fixed bracket form and stripped before re-tagging,
// so running this repeatedly never stacks them up.
// ============================================================
export const NAME_TAG_RE = /\s*\[[^\]]{1,14}\]\s*$/;

export function stripNameTag(name) {
  return String(name == null ? '' : name).replace(NAME_TAG_RE, '').trim();
}

export const ROOM_SHORT_CODE = {
  Energy1: 'PWR', Energy2: 'PWR', Energy3: 'RCTR', NuclearReactor: 'RCTR', Geothermal: 'GEO',
  Water1: 'H2O', Water2: 'H2O', Water3: 'H2O', WaterPlant: 'H2O',
  Diner: 'FOOD', Cafeteria: 'FOOD', Garden: 'FOOD', Hydroponic: 'FOOD',
  NukaCola: 'COLA', NukaColaBottler: 'COLA', UltraciteMining: 'MINE',
  MedBay: 'MED', ScienceLab: 'LAB', Radio: 'RADIO', BarberShop: 'BARB',
  Gym: 'TRN-S', WeightRoom: 'TRN-S', Dojo: 'TRN-A', AthleticsRoom: 'TRN-A',
  Armory: 'TRN-P', Classroom: 'TRN-I', SuperRoom2: 'TRN-E', FitnessRoom: 'TRN-E',
  Bar: 'TRN-C', Lounge: 'TRN-C', Casino: 'TRN-L', GameRoom: 'TRN-L',
  WeaponFactory: 'WPN', OutfitFactory: 'FIT', DesignFactory: 'THM',
  DecorationFactory: 'DEC', UltraciteWeaponFactory: 'ULT',
};

// mode: 'stat' -> [S] / [TRN-S]  |  'room' -> [PWR]  |  'off' -> strip only
export function planNameTags(save, roomPlan, mode) {
  const rooms = getRooms(save);
  const dwellers = getAssignableDwellers(save);
  const tagFor = {};

  if (mode !== 'off' && roomPlan) {
    Object.keys(roomPlan.newRoomDwellers).forEach(roomIdx => {
      const room = rooms[roomIdx];
      const cfg = ROOM_STAT_MAP[room.type];
      if (!cfg) return;
      roomPlan.newRoomDwellers[roomIdx].forEach(id => {
        if (mode === 'room') {
          tagFor[id] = ROOM_SHORT_CODE[room.type] || 'ROOM';
        } else if (cfg.stat === 'ALL') {
          // Workshops have no single governing stat, so a letter would be a lie.
          tagFor[id] = 'CRF';
        } else {
          const letter = STAT_LETTERS[cfg.stat] || '?';
          tagFor[id] = cfg.group === 'training' ? 'TRN-' + letter : letter;
        }
      });
    });
  }

  const changes = [];
  dwellers.forEach(d => {
    const base = stripNameTag(d.name);
    const tag = tagFor[d.serializeId];
    // Never truncate: the original name must survive so that stripping the
    // tag restores it character for character. Long names are shortened by
    // the game's own display, not by us.
    const next = tag ? (base + ' [' + tag + ']') : base;
    if (next !== d.name) changes.push({ dwellerId: d.serializeId, from: d.name, to: next });
  });
  return { changes, mode };
}

export function applyNameTags(saveObj, tagPlan) {
  const byId = {};
  ((saveObj.dwellers && saveObj.dwellers.dwellers) || []).forEach(d => { byId[d.serializeId] = d; });
  tagPlan.changes.forEach(c => { const d = byId[c.dwellerId]; if (d) d.name = c.to; });
}
