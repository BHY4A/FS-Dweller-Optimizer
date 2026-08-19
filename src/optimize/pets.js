// Step 4 — pets.
// Pet bonus type and magnitude live in the save itself, so only the matching
// rule is a heuristic.

import { ROOM_STAT_MAP } from '../data/rooms.js';
import { getRooms, getAssignableDwellers, getInventoryItems, healthRatio, baseStat } from '../core/save.js';
import { combatScore } from './weapons.js';
import { dwellerBaseTotal } from './breeding.js';

// ---- Pets ----------------------------------------------------
// Pet bonus type and magnitude are stored in the save itself, so only the
// "who benefits most" rule is heuristic.
export const PET_BONUS_LABEL = {
  XPBoost: 'XP gain', HealingBoost: 'Healing rate', DamageBoost: 'Combat damage',
  WastelandJunkBoost: 'Wasteland junk finds', WastelandCapsBoost: 'Wasteland caps',
  WastelandItemBoost: 'Wasteland item finds', TrainingBoost: 'Training speed',
  TrainingNonStopBoost: 'Non-stop training', ChildSpecialBoost: 'Newborn SPECIAL',
  ChildMultiplier: 'Twin/triplet chance', HappinessBoost: 'Happiness',
  AddMaxHP: 'Max health', Resistance: 'Damage resistance', RadHealingBoost: 'Rad healing',
  CheaperCrafting: 'Crafting cost', FasterCrafting: 'Crafting speed',
  FasterAndCheaperCrafting: 'Crafting speed + cost', ObjectiveMultiplier: 'Objective rewards',
  MysteriousMagnet: 'Mysterious Stranger', FasterWastelandReturnSpeed: 'Wasteland return speed',
};
export function optimizePets(save, roomPlan) {
  const dwellers = getAssignableDwellers(save);
  const rooms = getRooms(save);

  const petPool = [];
  dwellers.forEach(d => { if (d.equippedPet && d.equippedPet.id) petPool.push({ pet: d.equippedPet, ownerId: d.serializeId }); });
  getInventoryItems(save).forEach(it => { if (it.type === 'Pet') petPool.push({ pet: it, ownerId: null }); });

  // Who is doing what. When a room plan exists we use the PLANNED rooms, so a
  // training pet follows the dweller the optimizer is about to put in a
  // training room. Without a plan we fall back to the save's current layout.
  const trainingStat = {};   // dwellerId -> stat being trained
  const craftingIds = new Set();
  const roster = (roomIdx) => (roomPlan && roomPlan.newRoomDwellers)
    ? (roomPlan.newRoomDwellers[roomIdx] || [])
    : (rooms[roomIdx].dwellers || []);
  rooms.forEach((r, idx) => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (!cfg) return;
    if (cfg.group === 'training') roster(idx).forEach(id => { trainingStat[id] = cfg.stat; });
    else if (cfg.group === 'crafting') roster(idx).forEach(id => craftingIds.add(id));
  });

  const explorerIds = new Set();
  try {
    const teams = (save.vault.wasteland && save.vault.wasteland.teams) || [];
    teams.forEach(t => (t.dwellers || t.dwellerList || []).forEach(id => explorerIds.add(id)));
  } catch (e) { /* structure varies across versions; safe to ignore */ }

  // Category priority first, raw bonus value second. Bonus magnitudes aren't
  // comparable across categories (a +99 junk boost and a +10 XP boost are
  // different units), so role-matched pets pick their owner before
  // general-purpose ones claim the pool.
  const PRIORITY = {
    TrainingBoost: 0, TrainingNonStopBoost: 0,
    WastelandJunkBoost: 1, WastelandCapsBoost: 1, WastelandItemBoost: 1, FasterWastelandReturnSpeed: 1,
    CheaperCrafting: 2, FasterCrafting: 2, FasterAndCheaperCrafting: 2,
    HealingBoost: 3, RadHealingBoost: 3,
    XPBoost: 4,
    ChildSpecialBoost: 5, ChildMultiplier: 5,
    DamageBoost: 6, Resistance: 6, AddMaxHP: 6,
    HappinessBoost: 7,
  };
  const ordered = petPool.slice().sort((a, b) => {
    const ab = (a.pet.extraData && a.pet.extraData.bonus) || '';
    const bb = (b.pet.extraData && b.pet.extraData.bonus) || '';
    const ap = PRIORITY[ab] !== undefined ? PRIORITY[ab] : 99;
    const bp = PRIORITY[bb] !== undefined ? PRIORITY[bb] : 99;
    if (ap !== bp) return ap - bp;
    const av = (a.pet.extraData && a.pet.extraData.bonusValue) || 0;
    const bv = (b.pet.extraData && b.pet.extraData.bonusValue) || 0;
    return bv - av;
  });

  const used = new Set();
  const recommendations = [];
  ordered.forEach(({ pet, ownerId }) => {
    const bonus = (pet.extraData && pet.extraData.bonus) || 'Unknown';
    const bonusValue = (pet.extraData && pet.extraData.bonusValue) || 0;
    const pool = dwellers.filter(d => !used.has(d.serializeId));
    let best = null, reason = '';

    if (pool.length === 0) {
      reason = 'more pets than dwellers — no one left to carry this one';
    } else if (bonus === 'TrainingBoost' || bonus === 'TrainingNonStopBoost') {
      // Only useful on someone actually in a training room; among those, the
      // one with the most headroom left in the stat gains the most.
      const trainees = pool.filter(d => trainingStat[d.serializeId] !== undefined);
      if (trainees.length) {
        best = trainees.slice().sort((a, b) =>
          baseStat(a, trainingStat[a.serializeId]) - baseStat(b, trainingStat[b.serializeId]))[0];
        reason = 'in a training room with the most stat headroom left';
      } else {
        reason = 'nobody is training — hold this one until you staff a training room';
      }
    } else if (bonus === 'WastelandJunkBoost' || bonus === 'WastelandCapsBoost' ||
               bonus === 'WastelandItemBoost' || bonus === 'FasterWastelandReturnSpeed') {
      const explorers = pool.filter(d => explorerIds.has(d.serializeId));
      if (explorers.length) { best = explorers[0]; reason = 'currently out in the wasteland'; }
      else { reason = 'nobody is exploring — hold this one until you send a team out'; }
    } else if (bonus === 'CheaperCrafting' || bonus === 'FasterCrafting' || bonus === 'FasterAndCheaperCrafting') {
      const crafters = pool.filter(d => craftingIds.has(d.serializeId));
      if (crafters.length) { best = crafters[0]; reason = 'assigned to a workshop'; }
      else { reason = 'no one is crafting — hold this one until a workshop is staffed'; }
    } else if (bonus === 'HealingBoost' || bonus === 'RadHealingBoost') {
      best = pool.slice().sort((a, b) => healthRatio(a) - healthRatio(b))[0];
      reason = 'most badly hurt right now';
    } else if (bonus === 'XPBoost') {
      best = pool.slice().sort((a, b) => a.experience.currentLevel - b.experience.currentLevel)[0];
      reason = 'lowest level, so the XP multiplier compounds fastest';
    } else if (bonus === 'ChildSpecialBoost' || bonus === 'ChildMultiplier') {
      best = pool.slice().sort((a, b) => dwellerBaseTotal(b) - dwellerBaseTotal(a))[0];
      reason = 'highest SPECIAL total — best genes to pass on';
    } else if (bonus === 'DamageBoost' || bonus === 'Resistance' || bonus === 'AddMaxHP') {
      best = pool.slice().sort((a, b) => combatScore(b) - combatScore(a))[0];
      reason = 'top combat rating — the bonus stacks on the biggest hitter';
    } else if (bonus === 'HappinessBoost') {
      best = pool.slice().sort((a, b) => a.happiness.happinessValue - b.happiness.happinessValue)[0];
      reason = 'unhappiest dweller in the vault';
    } else {
      best = pool.slice().sort((a, b) => combatScore(b) - combatScore(a))[0];
      reason = 'general-purpose bonus — no sharper rule, so it goes to the strongest';
    }

    recommendations.push({
      petId: pet.id,
      petName: (pet.extraData && pet.extraData.uniqueName) || pet.id,
      bonus, bonusLabel: PET_BONUS_LABEL[bonus] || bonus, bonusValue,
      currentOwnerId: ownerId,
      recommendedOwnerId: best ? best.serializeId : null,
      recommendedOwnerName: best ? best.name : null,
      reason, extraData: pet.extraData,
    });
    if (best) used.add(best.serializeId);
  });
  return {
    recommendations, petCount: petPool.length, dwellerCount: dwellers.length,
    unplaced: recommendations.filter(r => r.recommendedOwnerId == null).length,
  };
}
