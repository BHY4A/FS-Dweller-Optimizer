// Writing a plan back into a save.
// Storage is rebuilt by multiset difference so no item is duplicated or
// lost, and quest dwellers are never touched.

import { getAssignableDwellers, getInventoryItems } from '../core/save.js';
import { applyNameTags } from '../features/naming.js';

// ---- Applying a plan to a save ------------------------------
// Rebuilds storage by multiset difference so no item is ever duplicated or
// lost, and never touches quest dwellers or rooms without a stat.
export function buildOptimizedSave(save, plans) {
  const out = JSON.parse(JSON.stringify(save));
  const applied = [];

  if (plans.room) {
    Object.keys(plans.room.newRoomDwellers).forEach(idx => {
      out.vault.rooms[idx].dwellers = plans.room.newRoomDwellers[idx].slice();
    });
    applied.push('room assignments');
  }

  const byId = {};
  (out.dwellers && out.dwellers.dwellers ? out.dwellers.dwellers : []).forEach(d => { byId[d.serializeId] = d; });
  if (!out.vault.inventory) out.vault.inventory = { items: [] };
  if (!Array.isArray(out.vault.inventory.items)) out.vault.inventory.items = [];

  if (plans.weapon) {
    plans.weapon.assignments.forEach(a => {
      const d = byId[a.dwellerId];
      if (d) d.equipedWeapon = { id: a.newWeaponId, type: 'Weapon', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false };
    });
    out.vault.inventory.items = out.vault.inventory.items.filter(it => it.type !== 'Weapon');
    plans.weapon.leftoverWeapons.forEach(w => {
      // Belt-and-braces: 'Fist' is the unarmed state, never a storable item.
      if (w.id === 'Fist') return;
      out.vault.inventory.items.push({ id: w.id, type: 'Weapon', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false });
    });
    applied.push('weapons');
  }

  if (plans.pet) {
    plans.pet.recommendations.forEach(r => {
      if (r.currentOwnerId != null && r.currentOwnerId !== r.recommendedOwnerId) {
        const d = byId[r.currentOwnerId];
        if (d) delete d.equippedPet;
      }
    });
    plans.pet.recommendations.forEach(r => {
      if (r.recommendedOwnerId == null) return;
      const d = byId[r.recommendedOwnerId];
      if (d) d.equippedPet = { id: r.petId, type: 'Pet', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false, extraData: r.extraData };
    });
    out.vault.inventory.items = out.vault.inventory.items.filter(it => it.type !== 'Pet');
    plans.pet.recommendations.forEach(r => {
      if (r.recommendedOwnerId == null) {
        out.vault.inventory.items.push({ id: r.petId, type: 'Pet', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false, extraData: r.extraData });
      }
    });
    applied.push('pets');
  }

  if (plans.outfit) {
    const originalPool = [];
    getAssignableDwellers(save).forEach(d => { if (d.equipedOutfit && d.equipedOutfit.id) originalPool.push(d.equipedOutfit.id); });
    getInventoryItems(save).forEach(it => { if (it.type === 'Outfit') originalPool.push(it.id); });

    plans.outfit.assignments.forEach(a => {
      const d = byId[a.dwellerId];
      if (!d) return;
      if (a.newOutfitId) d.equipedOutfit = { id: a.newOutfitId, type: 'Outfit', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false };
      else delete d.equipedOutfit;
    });
    out.vault.inventory.items = out.vault.inventory.items.filter(it => it.type !== 'Outfit');
    const remaining = originalPool.slice();
    plans.outfit.assignments.forEach(a => {
      const i = remaining.indexOf(a.newOutfitId);
      if (i !== -1) remaining.splice(i, 1);
    });
    remaining.forEach(id => {
      out.vault.inventory.items.push({ id, type: 'Outfit', hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false });
    });
    applied.push('outfits');
  }

  if (plans.nameTags && plans.nameTags.changes.length) {
    applyNameTags(out, plans.nameTags);
    applied.push('name tags');
  }

  return { save: out, applied };
}
