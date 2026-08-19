// Read-only vault health checks.

import { ROOM_STAT_MAP } from '../data/rooms.js';
import { getRooms, getAssignableDwellers, getInventoryItems, getQuestDwellers, healthRatio } from '../core/save.js';

// ============================================================
// VAULT DIAGNOSTICS
// Read-only observations the optimizer can't fix by moving people around —
// things worth the Overseer's attention.
// ============================================================
export function diagnoseVault(save) {
  const dwellers = getAssignableDwellers(save);
  const rooms = getRooms(save);
  const findings = [];

  const injured = dwellers.filter(d => healthRatio(d) < 0.6);
  if (injured.length) {
    findings.push({
      level: 'warn', title: injured.length + ' dweller(s) below 60% health',
      detail: 'Worst: ' + injured.slice()
        .sort((a, b) => healthRatio(a) - healthRatio(b)).slice(0, 5)
        .map(d => d.name + ' (' + Math.round(healthRatio(d) * 100) + '%)').join(', ') +
        '. Stimpaks won\'t be used automatically — heal them before the next incident.',
    });
  }

  const unhappy = dwellers.filter(d => d.happiness && d.happiness.happinessValue < 80);
  if (unhappy.length) {
    findings.push({
      level: 'warn', title: unhappy.length + ' dweller(s) below 80% happiness',
      detail: 'Happiness scales production output directly. Common causes: missing food or water, ' +
        'no partner, recent incidents, or working a room that doesn\'t match their best stat.',
    });
  }

  // Resource room balance — a rough structural check, not a live rate calculation.
  const groupCount = { power: 0, water: 0, food: 0 };
  rooms.forEach(r => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (!cfg || cfg.group !== 'production') return;
    if (cfg.stat === 1) groupCount.power++;
    else if (cfg.stat === 2) groupCount.water++;
    else if (cfg.stat === 6) groupCount.food++;
  });
  const weakest = Object.keys(groupCount).sort((a, b) => groupCount[a] - groupCount[b])[0];
  const strongest = Object.keys(groupCount).sort((a, b) => groupCount[b] - groupCount[a])[0];
  if (groupCount[strongest] >= groupCount[weakest] * 3 && groupCount[weakest] >= 0) {
    findings.push({
      level: 'info', title: 'Lopsided resource rooms',
      detail: 'Power ' + groupCount.power + ' / Water ' + groupCount.water + ' / Food ' + groupCount.food +
        '. The thinnest line is ' + weakest + '. No amount of reassignment fixes a missing room — ' +
        'consider building more.',
    });
  }

  const unarmed = dwellers.filter(d => !d.equipedWeapon || !d.equipedWeapon.id || d.equipedWeapon.id === 'Fist');
  const spareWeapons = getInventoryItems(save).filter(i => i.type === 'Weapon' && i.id !== 'Fist').length;
  if (unarmed.length && spareWeapons) {
    findings.push({
      level: 'info', title: unarmed.length + ' unarmed dweller(s), ' + spareWeapons + ' weapon(s) idle in storage',
      detail: 'Step 3 will hand these out automatically.',
    });
  }

  const noPartner = dwellers.filter(d => d.relations && d.relations.partner === -1).length;
  const pregnant = dwellers.filter(d => d.pregnant).length;
  if (noPartner >= 2 && pregnant === 0) {
    findings.push({
      level: 'info', title: 'No births in progress',
      detail: noPartner + ' unattached dwellers and nobody expecting. Step 5 suggests the strongest pairings.',
    });
  }

  const away = getQuestDwellers(save).length;
  if (away) {
    findings.push({
      level: 'info', title: away + ' dweller(s) away on a quest',
      detail: 'They and their gear are deliberately left untouched by every step.',
    });
  }

  return findings;
}
