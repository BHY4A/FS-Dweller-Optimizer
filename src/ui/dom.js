// DOM helpers, icons and the responsive table transform.

import { ROOM_STAT_MAP, STAT_LETTERS } from '../data/rooms.js';

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Responsive helpers --------------------------------------
// On phones, wide data tables are turned into stacked cards. Rather than
// hand-writing labels at every call site, each cell inherits its column
// heading here, which the stylesheet then renders via ::before.
// ---- Icons ---------------------------------------------------
// Original geometric glyphs drawn to match the terminal styling. Referenced
// from a single inline sprite so they cost nothing extra to repeat.
export function icon(name, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' +
    '<use href="#ic-' + name + '"/></svg>';
}

// Which glyph represents each room type on the map.
export const ROOM_ICON = {
  Energy1: 'bolt', Energy2: 'bolt', Energy3: 'bolt', NuclearReactor: 'bolt', Geothermal: 'bolt',
  Water1: 'drop', Water2: 'drop', Water3: 'drop', WaterPlant: 'drop',
  Diner: 'leaf', Cafeteria: 'leaf', Garden: 'leaf', Hydroponic: 'leaf',
  NukaCola: 'cola', NukaColaBottler: 'cola', UltraciteMining: 'pick',
  MedBay: 'cross', ScienceLab: 'flask',
  Radio: 'radio', BarberShop: 'scissors',
  Gym: 'dumbbell', WeightRoom: 'dumbbell',
  Dojo: 'run', AthleticsRoom: 'run',
  Armory: 'target', Classroom: 'book',
  SuperRoom2: 'heart', FitnessRoom: 'heart',
  Bar: 'chat', Lounge: 'chat',
  Casino: 'dice', GameRoom: 'dice',
  WeaponFactory: 'wrench', OutfitFactory: 'wrench', DesignFactory: 'wrench',
  DecorationFactory: 'wrench', UltraciteWeaponFactory: 'wrench',
  Storage: 'box', LivingQuarters: 'bed', Entrance: 'door', Elevator: 'lift',
  Overseer: 'terminal', FakeWasteland: 'map',
};
// And each SPECIAL stat, so the letter is reinforced rather than replaced.
export const STAT_ICON = {
  1: 'dumbbell', 2: 'target', 3: 'heart', 4: 'chat',
  5: 'book', 6: 'run', 7: 'dice', ALL: 'wrench',
};
export function statIcon(statKey) {
  return icon(STAT_ICON[statKey] || 'gear', 'stat-ic');
}

export function makeTablesResponsive(root) {
  if (!root || !root.querySelectorAll) return;
  const tables = (root.tagName === 'TABLE') ? [root] : root.querySelectorAll('table');
  tables.forEach(t => {
    t.classList.add('cards');
    const heads = [];
    t.querySelectorAll('thead th').forEach(th => heads.push(th.textContent.trim()));
    t.querySelectorAll('tbody tr').forEach(tr => {
      const cells = tr.children;
      for (let i = 0; i < cells.length; i++) {
        if (!cells[i].hasAttribute('data-label')) {
          cells[i].setAttribute('data-label', heads[i] || '');
        }
      }
    });
  });
}
// Single place to write markup, so nothing can be rendered without the
// mobile treatment being applied.
export function setHTML(idOrEl, html) {
  const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
  if (!el) return;
  el.innerHTML = html;
  makeTablesResponsive(el);
}
