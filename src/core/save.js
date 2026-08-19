// Save access helpers.
// Schemas differ between game versions, so every read goes through these: a
// missing structure degrades to an empty result instead of throwing.

import { ROOM_STAT_MAP } from '../data/rooms.js';

// ---- Defensive save accessors -------------------------------
// Save schemas vary between game versions: older/smaller vaults may omit
// questDwellers or inventory entirely. Every read goes through these so a
// missing field degrades gracefully instead of throwing.
export function getQuestDwellers(save) {
  return (save && save.questDwellers && Array.isArray(save.questDwellers.dwellers))
    ? save.questDwellers.dwellers : [];
}
export function getQuestDwellerIds(save) {
  return new Set(getQuestDwellers(save).map(d => d.serializeId));
}
export function getInventoryItems(save) {
  return (save && save.vault && save.vault.inventory && Array.isArray(save.vault.inventory.items))
    ? save.vault.inventory.items : [];
}
export function getAllDwellers(save) {
  return (save && save.dwellers && Array.isArray(save.dwellers.dwellers))
    ? save.dwellers.dwellers : [];
}
export function getRooms(save) {
  return (save && save.vault && Array.isArray(save.vault.rooms)) ? save.vault.rooms : [];
}
// Alive, in-vault dwellers (excludes the dead and anyone away on a quest —
// we must never touch an away team's gear or reassign them to a room).
export function getAssignableDwellers(save) {
  const questIds = getQuestDwellerIds(save);
  return getAllDwellers(save).filter(d => d.deathTime === -1 && !questIds.has(d.serializeId));
}

// ---- SPECIAL helpers ----------------------------------------
export function effectiveStat(dweller, statKey) {
  if (statKey === 'ALL') {
    let sum = 0;
    for (let i = 1; i <= 7; i++) sum += dweller.stats.stats[i].value + dweller.stats.stats[i].mod;
    return sum / 7;
  }
  const s = dweller.stats.stats[statKey];
  return s.value + s.mod;
}
export function baseStat(dweller, statKey) {
  if (statKey === 'ALL') return 0;
  return dweller.stats.stats[statKey].value;
}
export function healthRatio(d) {
  if (!d.health || !d.health.maxHealth) return 1;
  return d.health.healthValue / d.health.maxHealth;
}
export function roomCapacity(room) {
  // The Barbershop only ever holds a single dweller, unlike every other
  // room's mergeLevel*2 formula.
  if (room.type === 'BarberShop') return 1;
  return Math.min(6, Math.max(2, (room.mergeLevel || 1) * 2));
}
