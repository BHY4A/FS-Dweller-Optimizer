// Application wiring.
// Holds the mutable session state (the loaded save and the five plans) and
// connects the pure modules above to the page.

import { WEAPON_AVG_DAMAGE, OUTFIT_BONUS } from './data/items.js';
import { ROOM_STAT_MAP, STAT_NAMES, STAT_LETTERS } from './data/rooms.js';
import { decryptSave, encryptSave } from './core/crypto.js';
import { getQuestDwellers, getInventoryItems, getAllDwellers, getRooms,
         getAssignableDwellers, effectiveStat, baseStat, healthRatio, roomCapacity } from './core/save.js';
import { optimizeVault, currentProductiveScore, combinedProductiveScore } from './optimize/rooms.js';
import { optimizeWeapons, combatScore, isWeaponScoreExact } from './optimize/weapons.js';
import { optimizeOutfits, isOutfitBonusKnown } from './optimize/outfits.js';
import { optimizePets } from './optimize/pets.js';
import { suggestBreedingPairs } from './optimize/breeding.js';
import { buildOptimizedSave } from './core/apply.js';
import { planNameTags, stripNameTag } from './features/naming.js';
import { diagnoseVault } from './features/diagnostics.js';
import { buildReport } from './features/report.js';
import { buildMapModel, roomGridWidth } from './features/map-model.js';
import { makeExampleSave } from './features/example.js';
import { $, esc, setHTML, makeTablesResponsive, icon, statIcon, ROOM_ICON } from './ui/dom.js';
import { pagedTable } from './ui/paged.js';

// ---- Sticky step navigation ----------------------------------
function updateNav() {
  const nav = $('stepnav');
  if (!nav) return;
  if (!SAVE) { nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');
  const done = { 1: !!PLAN, 2: !!OUTFIT_PLAN, 3: !!WEAPON_PLAN, 4: !!PET_PLAN, 5: !!BREEDING };
  nav.querySelectorAll('a').forEach(a => {
    const k = a.getAttribute('data-nav');
    if (done[k]) a.classList.add('done'); else a.classList.remove('done');
  });
}

// ---- Map zoom ------------------------------------------------
let MAP_ZOOM = 1;
function applyMapZoom() {
  const g = document.querySelector('.map-grid');
  if (!g) return;
  const base = window.innerWidth <= 380 ? 19 : window.innerWidth <= 600 ? 22 : 26;
  g.style.setProperty('--cell', Math.round(base * MAP_ZOOM) + 'px');
  g.style.setProperty('--cellh', Math.round(base * 2 * MAP_ZOOM) + 'px');
}


$('boot').textContent = [
  '> ROBCO INDUSTRIES (TM) TERMLINK PROTOCOL',
  '> LOADING VAULT-TEC PERSONNEL MODULE ......... OK',
  '> ITEM DATABASE .............................. OK',
  '> AWAITING SAVE FILE',
].join('\n');

let SAVE = null, FILENAME = 'Vault1.sav', ORIGINAL_TEXT = null;
let IS_EXAMPLE = false;
let PLAN = null, WEAPON_PLAN = null, PET_PLAN = null, OUTFIT_PLAN = null, BREEDING = null;

// ---- Backup store -------------------------------------------
// Persists to localStorage when the page is opened as a local file (the
// normal case). Some sandboxed viewers block storage entirely, so every
// access is guarded and falls back to memory for the session.
const BACKUP_KEY = 'fsvo_backups_v1';
const MAX_BACKUPS = 10;
let memoryBackups = [];
let storageWorks = true;

function readBackups() {
  if (!storageWorks) return memoryBackups;
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { storageWorks = false; return memoryBackups; }
}
function writeBackups(list) {
  memoryBackups = list;
  if (!storageWorks) return false;
  try {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    // Most likely the quota: drop the oldest entries and try again before
    // giving up, so a full store degrades instead of silently failing.
    const trimmed = list.slice();
    while (trimmed.length > 1) {
      trimmed.pop();
      try { window.localStorage.setItem(BACKUP_KEY, JSON.stringify(trimmed)); return true; }
      catch (e2) { /* keep shrinking */ }
    }
    storageWorks = false;
    return false;
  }
}
function addBackup(entry) {
  const list = readBackups();
  list.unshift(entry);
  const ok = writeBackups(list.slice(0, MAX_BACKUPS));
  renderBackups();
  return ok;
}
function deleteBackup(id) {
  writeBackups(readBackups().filter(b => b.id !== id));
  renderBackups();
}

function backupsMarkup() {
  const list = readBackups();
  let h = '<h2>' + icon('restore') + ' LOCAL BACKUPS <span class="small">(' + list.length + ' / ' + MAX_BACKUPS + ')</span></h2>';
  h += '<div class="panel">';
  h += '<div class="small">Every file you load and every file you export is snapshotted here so you can ' +
       'roll back. Stored in this browser only, on this machine' +
       (storageWorks ? '' : ' &mdash; <b style="color:var(--amber);">storage is blocked in this viewer, so ' +
        'these will vanish when you close the tab. Open the .html file directly from disk to keep them.</b>') +
       '. Clearing site data will remove them, so keep your own copy of anything important.</div>';
  if (!list.length) {
    h += '<div class="small" style="margin-top:10px;">No snapshots yet.</div>';
  } else {
    list.forEach(b => {
      h += '<div class="backup-row">' +
        '<div class="backup-meta"><div class="bt">' + esc(b.label) + '</div>' +
        '<div class="bd">' + esc(new Date(b.time).toLocaleString()) + ' &middot; Vault ' + esc(b.vaultName) +
        ' &middot; ' + esc(b.dwellers) + ' dwellers &middot; ' + esc(b.sizeKb) + ' KB</div></div>' +
        '<div class="backup-actions">' +
        '<button class="btn small" data-dl="' + esc(b.id) + '">' + icon('download') + 'save</button>' +
        '<button class="btn small" data-restore="' + esc(b.id) + '">' + icon('restore') + 'load</button>' +
        '<button class="btn small danger" data-del="' + esc(b.id) + '" aria-label="delete">' + icon('trash') + '</button>' +
        '</div></div>';
    });
    h += '<div class="controls-row"><button class="btn small danger" id="clearBackupsBtn">' + icon('trash') + 'delete all snapshots</button></div>';
  }
  h += '</div>';
  return h;
}

function renderBackups() {
  const target = SAVE ? $('backupsPanelMain') : $('backupsPanelEarly');
  const other = SAVE ? $('backupsPanelEarly') : $('backupsPanelMain');
  if (other) other.innerHTML = '';
  if (!target) return;
  setHTML(target, backupsMarkup());

  target.querySelectorAll('[data-dl]').forEach(btn => btn.addEventListener('click', () => {
    const b = readBackups().find(x => x.id === btn.getAttribute('data-dl'));
    if (b) downloadText(b.data, b.filename);
  }));
  target.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', () => {
    const b = readBackups().find(x => x.id === btn.getAttribute('data-restore'));
    if (!b) return;
    try {
      loadFromText(b.data, b.filename);
      $('uploadStatus').textContent = 'RESTORED from snapshot — ' + b.label;
    } catch (e) {
      alert('That snapshot could not be restored: ' + e.message);
    }
  }));
  target.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    deleteBackup(btn.getAttribute('data-del'));
  }));
  const clr = target.querySelector('#clearBackupsBtn');
  if (clr) clr.addEventListener('click', () => {
    if (confirm('Delete all local snapshots? This cannot be undone.')) { writeBackups([]); renderBackups(); }
  });
}

function snapshot(text, label, filename, parsed) {
  addBackup({
    id: 'b' + Date.now() + Math.random().toString(36).slice(2, 7),
    time: Date.now(), label, filename,
    vaultName: (parsed && parsed.vault && parsed.vault.VaultName) || '?',
    dwellers: parsed ? getAssignableDwellers(parsed).length : 0,
    sizeKb: Math.round(text.length / 1024),
    data: text,
  });
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Loading -------------------------------------------------
const dropzone = $('dropzone'), fileInput = $('fileInput');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) readFile(e.target.files[0]);
  e.target.value = '';   // allow re-selecting the same file
});

function readFile(file) {
  $('uploadError').classList.add('hidden');
  $('uploadStatus').innerHTML = '<span class="spinner"></span> Decrypting ' + esc(file.name) + ' ...';
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadFromText(reader.result, file.name);
      IS_EXAMPLE = false;
      updateExampleNotice();
      $('uploadStatus').textContent = 'DECRYPTED — ' + file.name;
      snapshot(reader.result, 'Loaded: ' + file.name, file.name, SAVE);
    } catch (err) {
      $('uploadStatus').textContent = '';
      $('uploadError').textContent = 'COULD NOT READ THIS FILE: ' + err.message + '\n\n' +
        'Make sure it is a genuine Vault*.sav from Fallout Shelter, copied out while the game was closed, ' +
        'and not already modified by another tool.';
      $('uploadError').classList.remove('hidden');
    }
  };
  reader.onerror = () => {
    $('uploadError').textContent = 'Could not read the file from disk.';
    $('uploadError').classList.remove('hidden');
  };
  reader.readAsText(file);
}

$('exampleBtn').addEventListener('click', () => {
  $('uploadError').classList.add('hidden');
  try {
    const demo = makeExampleSave();
    // Encrypt it first so the demo travels the exact same path as a real save.
    const text = encryptSave(demo);
    loadFromText(text, 'ExampleVault.sav');
    // Snapshot it like any other load, so "restore" returns to the pristine demo.
    snapshot(text, 'Loaded: example vault', 'ExampleVault.sav', SAVE);
    $('uploadStatus').innerHTML = 'EXAMPLE LOADED — a 16-dweller vault with people in the wrong ' +
      'rooms, better gear sitting in storage and an empty training room. Press ' +
      '<b>Run all steps</b> to see what changes.';
    IS_EXAMPLE = true;
    updateExampleNotice();
  } catch (err) {
    $('uploadError').textContent = 'Could not build the example vault: ' + err.message;
    $('uploadError').classList.remove('hidden');
  }
});

// Make it obvious the loaded vault is a demo, not the user's own save.
function updateExampleNotice() {
  const el = $('exampleNotice');
  if (!el) return;
  el.innerHTML = IS_EXAMPLE
    ? '<div class="note">' + icon('info') + ' <b>This is the example vault, not your save.</b> ' +
      'Everything here is fully functional — you can run every step and even download the result — ' +
      'but it is a generated demo. Load your own <code>Vault*.sav</code> above to optimise it for real.</div>'
    : '';
}

function loadFromText(text, filename) {
  const parsed = decryptSave(text);
  if (!parsed || !parsed.vault || !parsed.dwellers) {
    throw new Error('That decrypted, but it does not contain a vault and a dweller roster.');
  }
  SAVE = parsed;
  ORIGINAL_TEXT = text;
  FILENAME = filename || 'Vault1.sav';
  resetPlans();
  $('resultsStage').classList.add('hidden');
  $('vaultStage').classList.remove('hidden');
  showVault();
  renderDiagnostics();
  MAP_MODE = 'before';
  MAP_ZOOM = 1;
  renderMap();
  renderBackups();
  updateNav();
  $('vaultStage').scrollIntoView({ behavior: 'smooth' });
}

function resetPlans() {
  PLAN = WEAPON_PLAN = PET_PLAN = OUTFIT_PLAN = BREEDING = null;
  ['outfitsResult', 'weaponsResult', 'petsResult', 'breedingResult', 'downloadStatus', 'renamePreview']
    .forEach(id => { if ($(id)) $(id).innerHTML = ''; });
  setState(1, 'not run'); setState(2, 'not run'); setState(3, 'not run');
  setState(4, 'not run'); setState(5, 'not run');
}

function setState(step, text, cls) {
  const el = $('st' + step);
  if (el) {
    el.textContent = text;
    el.className = 'step-state' + (cls ? ' ' + cls : '');
  }
  updateNav();
}

$('unloadBtn').addEventListener('click', () => {
  SAVE = null; ORIGINAL_TEXT = null;
  IS_EXAMPLE = false;
  updateExampleNotice();
  resetPlans();
  $('vaultStage').classList.add('hidden');
  $('uploadStatus').textContent = '';
  renderBackups();
  updateNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function addStat(c, label, value, amber) {
  const b = document.createElement('div');
  b.className = 'stat-box';
  b.innerHTML = '<div class="label">' + esc(label) + '</div>' +
    '<div class="value' + (amber ? ' amber' : '') + '">' + esc(value) + '</div>';
  c.appendChild(b);
}
function statBox(label, value, amber) {
  return '<div class="stat-box"><div class="label">' + esc(label) + '</div>' +
    '<div class="value' + (amber ? ' amber' : '') + '">' + esc(value) + '</div></div>';
}

function showVault() {
  $('vaultTitle').textContent = 'VAULT ' + (SAVE.vault.VaultName || '???');
  const dwellers = getAssignableDwellers(SAVE);
  const away = getQuestDwellers(SAVE).length;
  const staffable = getRooms(SAVE).filter(r => ROOM_STAT_MAP[r.type]).length;
  const s = $('vaultSummary'); s.innerHTML = '';
  addStat(s, 'Dwellers', dwellers.length + (away ? ' (+' + away + ' away)' : ''));
  addStat(s, 'Rooms', getRooms(SAVE).length);
  addStat(s, 'Staffable rooms', staffable);
  addStat(s, 'Current output', currentProductiveScore(SAVE).toFixed(0));
}

function renderDiagnostics() {
  const findings = diagnoseVault(SAVE);
  const el = $('diagPanel');
  if (!findings.length) {
    setHTML(el, '<h3>' + icon('info') + ' VAULT STATUS</h3><div class="small">Nothing flagged. The vault is in good order.</div>');
    return;
  }
  let h = '<h3>' + icon('info') + ' VAULT STATUS</h3>';
  findings.forEach(f => {
    h += '<div class="diag ' + (f.level === 'warn' ? 'warn' : '') + '">' +
      '<div class="dt">' + icon(f.level === 'warn' ? 'warn' : 'info') + esc(f.title) +
      '</div><div class="dd">' + esc(f.detail) + '</div></div>';
  });
  setHTML(el, h);
}

// ---- Vault map UI --------------------------------------------
let MAP_MODE = 'after';   // 'before' | 'after' | 'delta'
const ROOM_LIMIT_DEFAULT = 20;
let ROOM_LIMIT = ROOM_LIMIT_DEFAULT;

// Tint strength is read from CSS custom properties so the two themes can
// scale it differently: the same alpha that reads well on black is far too
// heavy on paper.
function tintVars() {
  const cs = (typeof getComputedStyle === 'function')
    ? getComputedStyle(document.documentElement) : null;
  const num = (name, fallback) => {
    if (!cs) return fallback;
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    light: num('--tint-light', 45),
    alphaMin: num('--tint-alpha-min', 0.18),
    alphaRange: num('--tint-alpha-range', 0.42),
  };
}
function statColour(v) {
  // 0..10+ -> red through to green. Used for the average-stat fill.
  if (v == null) return 'transparent';
  const t = Math.max(0, Math.min(1, v / 10));
  const { light, alphaMin, alphaRange } = tintVars();
  const hue = t * 130;                      // red -> green
  return 'hsla(' + hue.toFixed(0) + ', 70%, ' + light + '%, ' +
    (alphaMin + t * alphaRange).toFixed(2) + ')';
}
function deltaColour(d) {
  if (d == null || Math.abs(d) < 0.05) return 'transparent';
  const m = Math.max(0, Math.min(1, Math.abs(d) / 5));
  const { light, alphaMin, alphaRange } = tintVars();
  const a = (alphaMin * 0.85 + m * alphaRange).toFixed(2);
  return d > 0
    ? 'hsla(135, 70%, ' + light + '%, ' + a + ')'
    : 'hsla(0, 70%, ' + (light + 3) + '%, ' + a + ')';
}

function renderMap() {
  const host = $('mapPanel');
  if (!host || !SAVE) return;
  const model = buildMapModel(SAVE, PLAN, OUTFIT_PLAN);
  const showPlan = !!PLAN;

  let h = '<div class="map-toolbar">';
  h += '<div class="map-modes">';
  [['before', 'Before'], ['after', 'After'], ['delta', 'Change']].forEach(([k, lab]) => {
    const dis = (k !== 'before' && !showPlan) ? ' disabled' : '';
    h += '<button class="btn small mapmode' + (MAP_MODE === k ? ' active' : '') +
      '" data-mode="' + k + '"' + dis + '>' + lab + '</button>';
  });
  h += '</div>';
  h += '<div class="map-zoom">' +
    '<button class="btn small" id="mapZoomOut" aria-label="Zoom out">' + icon('minus') + '</button>' +
    '<button class="btn small" id="mapZoomIn" aria-label="Zoom in">' + icon('plus') + '</button>' +
    '<button class="btn small" id="mapZoomReset" aria-label="Fit">' + icon('fit') + '</button></div>';
  h += '<div class="map-legend">';
  if (MAP_MODE === 'delta') {
    h += '<span class="lg"><i style="background:hsla(0,70%,48%,0.5)"></i>worse</span>' +
         '<span class="lg"><i style="background:transparent;border:1px solid var(--border)"></i>same</span>' +
         '<span class="lg"><i style="background:hsla(135,70%,45%,0.5)"></i>better</span>';
  } else {
    h += '<span class="lg">' + icon('chart') + 'avg stat</span>' +
         '<span class="lg"><i style="background:' + statColour(1) + '"></i>1</span>' +
         '<span class="lg"><i style="background:' + statColour(5) + '"></i>5</span>' +
         '<span class="lg"><i style="background:' + statColour(10) + '"></i>10+</span>';
  }
  h += '</div></div>';

  if (!showPlan) {
    h += '<div class="small" style="margin-bottom:8px;">Showing the vault as it stands. ' +
         'Run Step 1 to compare against the optimised layout.</div>';
  }

  h += '<div class="map-scroll"><div class="map-grid" style="grid-template-columns:repeat(' +
       model.cols + ', var(--cell));grid-auto-rows:var(--cellh);">';

  model.cells.forEach(c => {
    const isElev = c.type === 'Elevator';
    const cls = ['mapcell'];
    if (!c.staffed) cls.push('inert');
    if (isElev) cls.push('elev');
    if (c.group === 'training') cls.push('training');
    if (c.broken) cls.push('broken');

    let bg = 'transparent';
    if (c.staffed) {
      if (MAP_MODE === 'delta') bg = deltaColour(c.avgAfter == null || c.avgBefore == null
        ? (c.avgAfter == null ? null : c.avgAfter - (c.avgBefore || 0))
        : c.avgAfter - c.avgBefore);
      else bg = statColour(MAP_MODE === 'before' ? c.avgBefore : c.avgAfter);
    }

    const avg = MAP_MODE === 'before' ? c.avgBefore : c.avgAfter;
    const cnt = MAP_MODE === 'before' ? c.countBefore : c.countAfter;
    const delta = (c.avgBefore != null && c.avgAfter != null) ? (c.avgAfter - c.avgBefore) : null;

    let inner = '';
    if (isElev) {
      inner = '<div class="mc-elev">' + icon('lift') + '</div>';
    } else {
      inner = '<div class="mc-name">' + icon(ROOM_ICON[c.type] || 'box', 'mc-icon') +
        esc(c.label) + '</div>';
      if (c.staffed) {
        const avgTxt = avg == null ? '—' : avg.toFixed(1);
        inner += '<div class="mc-main">' + avgTxt +
          '<span class="mc-letter">' + esc(c.statLetter) + '</span></div>';
        inner += '<div class="mc-sub">' + cnt + '/' + c.capacity + ' staffed';
        if (MAP_MODE === 'delta' && delta != null && Math.abs(delta) >= 0.05) {
          inner += ' <b class="' + (delta > 0 ? 'delta-pos' : 'delta-neg') + '">' +
            (delta > 0 ? '+' : '') + delta.toFixed(1) + '</b>';
        }
        inner += '</div>';
      } else {
        inner += '<div class="mc-sub">—</div>';
      }
    }

    // Tooltip carries the full before/after breakdown.
    let tip = c.label;
    if (c.staffed) {
      tip += '\n' + STAT_NAMES[c.statKey] + (c.group === 'training' ? ' (training)' : '');
      tip += '\nBefore: ' + (c.avgBefore == null ? 'empty' : c.avgBefore.toFixed(2) + ' avg, ' +
        c.countBefore + ' staffed, total ' + c.outBefore.toFixed(1));
      if (showPlan) {
        tip += '\nAfter:  ' + (c.avgAfter == null ? 'empty' : c.avgAfter.toFixed(2) + ' avg, ' +
          c.countAfter + ' staffed, total ' + c.outAfter.toFixed(1));
        if (delta != null) tip += '\nChange: ' + (delta > 0 ? '+' : '') + delta.toFixed(2) + ' avg';
      }
    } else {
      tip += '\n(no SPECIAL stat — left untouched)';
    }
    if (c.broken) tip += '\nBROKEN';

    h += '<div class="' + cls.join(' ') + '" data-idx="' + c.idx + '" title="' + esc(tip) + '"' +
      ' style="grid-row:' + (c.row + 1) + ';grid-column:' + (c.col + 1) + ' / span ' + c.w +
      ';background:' + bg + ';">' + inner + '</div>';
  });

  h += '</div></div>';
  h += '<div class="scroll-hint">Swipe the map sideways to see the rest of the vault.</div>';
  h += '<div id="mapDetail" class="map-detail small">Tap a room to see its roster.</div>';
  host.innerHTML = h;

  host.querySelectorAll('.mapmode').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    MAP_MODE = b.getAttribute('data-mode');
    renderMap();
  }));
  host.querySelectorAll('.mapcell').forEach(el => el.addEventListener('click', () => {
    host.querySelectorAll('.mapcell').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    showMapDetail(model, parseInt(el.getAttribute('data-idx'), 10));
  }));

  const zIn = host.querySelector('#mapZoomIn'), zOut = host.querySelector('#mapZoomOut'),
        zRst = host.querySelector('#mapZoomReset');
  if (zIn) zIn.addEventListener('click', () => { MAP_ZOOM = Math.min(2.5, MAP_ZOOM * 1.25); applyMapZoom(); });
  if (zOut) zOut.addEventListener('click', () => { MAP_ZOOM = Math.max(0.5, MAP_ZOOM / 1.25); applyMapZoom(); });
  if (zRst) zRst.addEventListener('click', () => { MAP_ZOOM = 1; applyMapZoom(); });
  applyMapZoom();
}

function showMapDetail(model, idx) {
  const c = model.cells.find(x => x.idx === idx);
  const el = $('mapDetail');
  if (!c || !el) return;
  const byId = {};
  getAllDwellers(SAVE).forEach(d => { byId[d.serializeId] = d; });

  if (!c.staffed) {
    setHTML(el, '<b>' + icon(ROOM_ICON[c.type] || 'box') + ' ' + esc(c.label) +
      '</b> — no SPECIAL stat governs this room, so it is left exactly as it is.');
    return;
  }
  const oldSet = new Set(c.oldIds), newSet = new Set(c.newIds);
  const nameOf = id => {
    const d = byId[id];
    if (!d) return '#' + id;
    const v = c.statKey === 'ALL' ? effectiveStat(d, 'ALL').toFixed(1) : effectiveStat(d, c.statKey);
    return esc(d.name) + ' (' + v + ')';
  };
  let h = '<b>' + icon(ROOM_ICON[c.type] || 'box') + ' ' + esc(c.label) + '</b> — ' +
    statIcon(c.statKey) + esc(STAT_NAMES[c.statKey]) +
    (c.group === 'training' ? ' <span class="tag">training</span>' : '') +
    ' · level ' + c.level + ' · capacity ' + c.capacity + '<br>';
  h += 'Average stat: ' + (c.avgBefore == null ? '—' : c.avgBefore.toFixed(2)) +
       ' → ' + (c.avgAfter == null ? '—' : c.avgAfter.toFixed(2));
  if (c.avgBefore != null && c.avgAfter != null) {
    const d = c.avgAfter - c.avgBefore;
    h += ' <b class="' + (d > 0.05 ? 'delta-pos' : d < -0.05 ? 'delta-neg' : 'delta-zero') + '">(' +
      (d > 0 ? '+' : '') + d.toFixed(2) + ')</b>';
  }
  h += '<br>Total output: ' + c.outBefore.toFixed(1) + ' → ' + c.outAfter.toFixed(1) + '<br><br>';
  h += '<span class="name-stay">Before:</span> ' +
       (c.oldIds.length ? c.oldIds.map(nameOf).join(', ') : '(empty)') + '<br>';
  h += '<span class="name-in">After:</span> ' +
       (c.newIds.length ? c.newIds.map(nameOf).join(', ') : '(empty)');
  const moved = c.newIds.filter(x => !oldSet.has(x)).length;
  const gone = c.oldIds.filter(x => !newSet.has(x)).length;
  if (moved || gone) h += '<br><span class="small">' + moved + ' moved in, ' + gone + ' moved out.</span>';
  setHTML(el, h);
}

// ---- Step 1: rooms -------------------------------------------
$('trainSlider').addEventListener('input', e => {
  $('trainLabel').textContent = 'Training priority: ' + parseFloat(e.target.value).toFixed(2);
});

function runRooms() {
  const w = parseFloat($('trainSlider').value);
  PLAN = optimizeVault(SAVE, { trainingWeight: Number.isFinite(w) ? w : 0.2 });
  // Everything downstream is derived from the room plan.
  OUTFIT_PLAN = null; PET_PLAN = null;
  $('outfitsResult').innerHTML = ''; $('petsResult').innerHTML = '';
  setState(1, 'done', 'done');
  setState(2, 'not run'); setState(4, 'not run');
  renderRooms(); renderSummary(); renderRenamePreview();
  MAP_MODE = 'after';
  renderMap();
  $('resultsStage').classList.remove('hidden');
}

$('optimizeBtn').addEventListener('click', () => {
  runRooms();
  $('resultsStage').scrollIntoView({ behavior: 'smooth' });
});

$('runAllBtn').addEventListener('click', () => {
  runRooms(); runOutfits(); runWeapons(); runPets(); runBreeding();
  $('resultsStage').scrollIntoView({ behavior: 'smooth' });
});

function trainingHeadcount() {
  let n = 0;
  getRooms(SAVE).forEach((r, i) => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (cfg && cfg.group === 'training') n += (PLAN.newRoomDwellers[i] || []).length;
  });
  return n;
}

function renderSummary() {
  const before = currentProductiveScore(SAVE);
  const after = combinedProductiveScore(SAVE, PLAN, OUTFIT_PLAN);
  const rs = $('resultSummary'); rs.innerHTML = '';
  addStat(rs, 'Output before', before.toFixed(0));
  addStat(rs, OUTFIT_PLAN ? 'After (rooms + outfits)' : 'Output after', after.toFixed(0), true);
  const pct = before > 0 ? ((after / before - 1) * 100) : 0;
  addStat(rs, 'Change', (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', true);
  addStat(rs, 'In training', trainingHeadcount());
  addStat(rs, 'Unassigned', PLAN.idleCount);
}

function dwellerLine(d, id, cfg, cls, suffix) {
  if (!d) return '<div class="small">#' + esc(id) + '</div>';
  const val = cfg.stat === 'ALL'
    ? effectiveStat(d, 'ALL').toFixed(1)
    : (d.stats.stats[cfg.stat].value + d.stats.stats[cfg.stat].mod);
  return '<div class="' + cls + '">' + esc(d.name) + (d.lastName ? ' ' + esc(d.lastName) : '') +
    ' <span class="tag stat">' + esc(val) + '</span>' + (suffix || '') + '</div>';
}

function renderRooms() {
  const rooms = getRooms(SAVE);
  const byId = {};
  getAllDwellers(SAVE).forEach(d => { byId[d.serializeId] = d; });
  const q = ($('roomFilter').value || '').trim().toLowerCase();
  const onlyChanged = $('onlyChangedRooms').checked;
  const tbody = $('roomTableBody');
  tbody.innerHTML = '';
  let shown = 0, matched = 0;

  rooms.forEach((r, idx) => {
    const cfg = ROOM_STAT_MAP[r.type];
    if (!cfg) return;
    const oldIds = r.dwellers || [];
    const newIds = PLAN.newRoomDwellers[idx] || [];
    const oldSet = new Set(oldIds), newSet = new Set(newIds);
    const changed = newIds.some(x => !oldSet.has(x)) || oldIds.some(x => !newSet.has(x));
    if (onlyChanged && !changed) return;

    if (q) {
      const names = oldIds.concat(newIds).map(id => (byId[id] ? byId[id].name : '')).join(' ').toLowerCase();
      if (cfg.label.toLowerCase().indexOf(q) === -1 && names.indexOf(q) === -1) return;
    }
    matched++;
    if (matched > ROOM_LIMIT) return;   // windowed; the rest is one click away
    shown++;

    const isTraining = cfg.group === 'training';
    let oldScore = 0, newScore = 0;
    if (!isTraining) {
      oldIds.forEach(id => { const d = byId[id]; if (d && d.deathTime === -1) oldScore += effectiveStat(d, cfg.stat); });
      newIds.forEach(id => { const d = byId[id]; if (d) newScore += effectiveStat(d, cfg.stat); });
    }
    const delta = newScore - oldScore;

    const tr = document.createElement('tr');
    tr.className = 'room-row';
    tr.innerHTML =
      '<td>' + icon(ROOM_ICON[r.type] || 'box', 'mc-icon') + esc(cfg.label) +
      (changed ? ' <span class="tag">changed</span>' : '') + '</td>' +
      '<td>' + statIcon(cfg.stat) + esc(STAT_NAMES[cfg.stat]) +
      '<span class="tag">' + esc(cfg.group) + '</span></td>' +
      '<td>' + newIds.length + ' / ' + roomCapacity(r) + '</td>' +
      '<td class="' + (delta > 0.05 ? 'delta-pos' : delta < -0.05 ? 'delta-neg' : 'delta-zero') + '">' +
      (isTraining ? '&mdash;' : (delta >= 0 ? '+' : '') + delta.toFixed(1)) + '</td>';
    tbody.appendChild(tr);

    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';
    const td = document.createElement('td');
    td.colSpan = 4; td.style.padding = '0';
    td.setAttribute('data-label', '');
    const detail = document.createElement('div');
    detail.className = 'room-detail';
    let html = '<div class="small">Before:</div>';
    if (!oldIds.length) html += '<div class="small">(empty)</div>';
    oldIds.forEach(id => {
      const stays = newSet.has(id);
      html += dwellerLine(byId[id], id, cfg, stays ? 'name-stay' : 'name-out', stays ? ' (stays)' : ' (moved out)');
    });
    html += '<div class="small" style="margin-top:8px;">After:</div>';
    if (!newIds.length) html += '<div class="small">(empty)</div>';
    newIds.forEach(id => {
      const isNew = !oldSet.has(id);
      html += dwellerLine(byId[id], id, cfg, isNew ? 'name-in' : 'name-stay', isNew ? ' (moved in)' : '');
    });
    detail.innerHTML = html;
    td.appendChild(detail); detailTr.appendChild(td); tbody.appendChild(detailTr);
    tr.addEventListener('click', () => {
      detail.classList.toggle('open');
      tr.classList.toggle('open');
    });
  });

  if (!shown) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="small">Nothing matches that filter.</td>';
    tbody.appendChild(tr);
  }
  makeTablesResponsive(tbody.parentNode);
  renderRoomFoot(shown, matched);
}

// Footer for the room list: how much is on screen, and how to see the rest.
function renderRoomFoot(shown, matched) {
  const foot = $('roomFoot');
  if (!foot) return;
  if (!matched) { foot.innerHTML = ''; return; }
  let h = '<div class="page-foot"><span class="small">Showing ' + shown + ' of ' + matched + ' rooms</span>';
  const remaining = matched - shown;
  if (remaining > 0) {
    h += '<span class="page-btns">' +
      '<button class="btn small" id="roomMore">show ' + Math.min(25, remaining) + ' more</button>' +
      (remaining > 25 ? '<button class="btn small" id="roomAll">show all ' + matched + '</button>' : '') +
      '</span>';
  } else if (ROOM_LIMIT > ROOM_LIMIT_DEFAULT) {
    h += '<span class="page-btns"><button class="btn small" id="roomLess">collapse</button></span>';
  }
  h += '</div>';
  foot.innerHTML = h;
  const more = foot.querySelector('#roomMore');
  if (more) more.addEventListener('click', () => { ROOM_LIMIT += 25; renderRooms(); });
  const all = foot.querySelector('#roomAll');
  if (all) all.addEventListener('click', () => { ROOM_LIMIT = Infinity; renderRooms(); });
  const less = foot.querySelector('#roomLess');
  if (less) less.addEventListener('click', () => {
    ROOM_LIMIT = ROOM_LIMIT_DEFAULT; renderRooms();
    const h2 = $('navMap'); if (h2 && h2.scrollIntoView) h2.scrollIntoView({ behavior: 'smooth' });
  });
}

$('roomFilter').addEventListener('input', () => {
  ROOM_LIMIT = ROOM_LIMIT_DEFAULT;
  if (PLAN) renderRooms();
});
$('onlyChangedRooms').addEventListener('change', () => {
  ROOM_LIMIT = ROOM_LIMIT_DEFAULT;
  if (PLAN) renderRooms();
});
$('expandAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.room-detail').forEach(d => d.classList.add('open'));
  document.querySelectorAll('.room-row').forEach(r => r.classList.add('open'));
});
$('collapseAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.room-detail').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.room-row').forEach(r => r.classList.remove('open'));
});

// ---- Step 2: outfits -----------------------------------------
function runOutfits() {
  if (!PLAN) {
    $('outfitsResult').innerHTML = '<div class="error-box">Run Step 1 first — outfits are fitted to the room plan.</div>';
    return;
  }
  OUTFIT_PLAN = optimizeOutfits(SAVE, PLAN);
  const changed = OUTFIT_PLAN.assignments.filter(a => a.changed && a.statKey);
  const prefix = '<div class="grid-stats">' +
    statBox('Stat bonus before', OUTFIT_PLAN.totalOld.toFixed(1)) +
    statBox('Stat bonus after', OUTFIT_PLAN.totalNew.toFixed(1), true) +
    statBox('Wardrobe changes', changed.length) + '</div>';
  let suffix = '';
  if (OUTFIT_PLAN.unknownCount) {
    suffix += '<div class="small" style="margin-top:8px;">' + OUTFIT_PLAN.unknownCount +
      ' item(s) in the pool are not in the database and were left alone rather than guessed at.</div>';
  }
  pagedTable('outfitsResult', {
    headers: ['Dweller', 'Room needs', 'Was', 'Now'],
    unit: 'changes', pageSize: 15, prefix, suffix,
    empty: 'Nothing to improve — everyone already wears the best available fit.',
    rows: changed.map(a => ({
      text: a.name + ' ' + STAT_NAMES[a.statKey] + ' ' + (a.oldOutfitId || '') + ' ' + a.newOutfitId,
      cells: [
        esc(a.name),
        statIcon(a.statKey) + esc(STAT_NAMES[a.statKey]),
        esc(a.oldOutfitId || '—') + ' (+' + a.oldBonus + ')' + (a.oldKnown ? '' : ' <span class="tag">unknown</span>'),
        '<span class="name-in">' + icon('shirt', 'mc-icon') + esc(a.newOutfitId) + ' (+' + a.newBonus + ')' +
          (a.newKnown ? '' : ' <span class="tag">unknown</span>') + '</span>',
      ],
    })),
  });
  setState(2, 'done', 'done');
  renderSummary();
  renderMap();
}
$('outfitsBtn').addEventListener('click', runOutfits);

// ---- Step 3: weapons -----------------------------------------
function runWeapons() {
  WEAPON_PLAN = optimizeWeapons(SAVE);
  const byId = {};
  getAllDwellers(SAVE).forEach(d => { byId[d.serializeId] = d; });
  const changed = WEAPON_PLAN.assignments.filter(a => a.changed);
  const gain = WEAPON_PLAN.firepowerOld > 0
    ? ((WEAPON_PLAN.firepowerNew / WEAPON_PLAN.firepowerOld - 1) * 100).toFixed(1) + '%' : '—';
  const prefix = '<div class="grid-stats">' +
    statBox('Firepower before', Math.round(WEAPON_PLAN.firepowerOld).toLocaleString('en-US')) +
    statBox('Firepower after', Math.round(WEAPON_PLAN.firepowerNew).toLocaleString('en-US'), true) +
    statBox('Change', (WEAPON_PLAN.firepowerNew >= WEAPON_PLAN.firepowerOld ? '+' : '') + gain, true) +
    statBox('Reassignments', changed.length + ' / ' + WEAPON_PLAN.assignments.length) + '</div>';

  let suffix = '';
  const hurt = changed.filter(a => byId[a.dwellerId] && healthRatio(byId[a.dwellerId]) < 0.6);
  if (hurt.length) {
    suffix += '<div class="small" style="margin-top:8px;color:var(--amber);">' + icon('warn') + ' ' +
      hurt.length + ' of these fighters are below 60% health. Stim them before the next incident — a ' +
      'combat rating only pays off if they survive to use it.</div>';
  }
  const unarmed = WEAPON_PLAN.assignments.filter(a => a.newWeaponId === 'Fist').length;
  if (unarmed) {
    suffix += '<div class="small" style="margin-top:8px;">' + unarmed + ' dweller(s) end up unarmed — there ' +
      'are fewer weapons than dwellers. They are the lowest combat ratings, so the loss is the smallest possible.</div>';
  }
  if (WEAPON_PLAN.leftoverWeapons.length) {
    const names = WEAPON_PLAN.leftoverWeapons.map(w => w.id);
    const shown = names.slice(0, 25).join(', ') + (names.length > 25 ? ' … +' + (names.length - 25) + ' more' : '');
    suffix += '<div class="small" style="margin-top:8px;">Surplus left in storage: ' + esc(shown) + '</div>';
  }

  pagedTable('weaponsResult', {
    headers: ['Dweller', 'Combat', 'HP', 'Was', 'Now'],
    unit: 'reassignments', pageSize: 15, prefix, suffix,
    empty: 'Every weapon is already in the right hands.',
    rows: changed.map(a => {
      const d = byId[a.dwellerId];
      const ratio = d ? healthRatio(d) : 1;
      const hp = d ? Math.round(d.health.healthValue) + '/' + Math.round(d.health.maxHealth) : '—';
      return {
        text: a.name + ' ' + (a.oldWeaponId || '') + ' ' + a.newWeaponId,
        cells: [
          esc(a.name),
          a.combatScore.toFixed(1),
          ratio < 0.6 ? '<span style="color:var(--red);">' + esc(hp) + ' !</span>' : esc(hp),
          esc(a.oldWeaponId || '—') + ' (' + a.oldScore + ')',
          '<span class="name-in">' + icon('gun', 'mc-icon') + esc(a.newWeaponId) + ' (' + a.newScore + ')' +
            (a.exact ? '' : ' <span class="tag">estimated</span>') + '</span>',
        ],
      };
    }),
  });
  setState(3, 'done', 'done');
}
$('weaponsBtn').addEventListener('click', runWeapons);

// ---- Step 4: pets --------------------------------------------
function runPets() {
  PET_PLAN = optimizePets(SAVE, PLAN);
  let suffix = '';
  if (!PLAN) {
    suffix += '<div class="small" style="margin-top:8px;color:var(--amber);">' + icon('warn') +
      ' Run Step 1 for sharper results — training and workshop pets are matched against the planned ' +
      'layout, not the current one.</div>';
  }
  if (PET_PLAN.unplaced) {
    suffix += '<div class="small" style="margin-top:8px;">' + PET_PLAN.unplaced +
      ' pet(s) have no useful holder right now and stay in storage rather than being handed to someone ' +
      'who cannot use the bonus.</div>';
  }
  pagedTable('petsResult', {
    headers: ['Pet', 'Bonus', 'Currently', 'Give to', 'Why'],
    unit: 'pets', pageSize: 15, suffix,
    empty: 'No pets in this vault — none equipped, none in storage.',
    rows: PET_PLAN.recommendations.map(r => ({
      text: r.petName + ' ' + r.bonusLabel + ' ' + (r.recommendedOwnerName || 'storage'),
      cells: [
        icon('paw', 'mc-icon') + esc(r.petName),
        esc(r.bonusLabel) + ' +' + esc(r.bonusValue),
        r.currentOwnerId != null ? '#' + esc(r.currentOwnerId) : 'storage',
        r.recommendedOwnerName
          ? '<span class="name-in">' + esc(r.recommendedOwnerName) + '</span>'
          : '<span class="name-stay">keep in storage</span>',
        '<span class="small">' + esc(r.reason) + '</span>',
      ],
    })),
  });
  setState(4, 'done', 'done');
}
$('petsBtn').addEventListener('click', runPets);

// ---- Step 5: breeding ----------------------------------------
function runBreeding() {
  BREEDING = suggestBreedingPairs(SAVE);
  const prefix = BREEDING.pairs.length
    ? '<div class="small">' + BREEDING.femalesAvailable + ' unattached women, ' +
      BREEDING.malesAvailable + ' unattached men. Best pairings by combined base SPECIAL:</div>'
    : '';
  pagedTable('breedingResult', {
    headers: ['Pair', 'Combined SPECIAL', 'Her strongest', 'His strongest', 'Charisma (F/M)'],
    unit: 'pairs', pageSize: 15, prefix,
    empty: 'No pairs available — this needs at least one unattached man and one unattached woman ' +
      'who are not away on a quest.',
    rows: BREEDING.pairs.map(p => ({
      text: p.femaleName + ' ' + p.maleName,
      cells: [
        icon('pair', 'mc-icon') + esc(p.femaleName) + ' &amp; ' + esc(p.maleName),
        String(p.combinedTotal),
        statIcon(p.femalePrimary) + esc(STAT_NAMES[p.femalePrimary]),
        statIcon(p.malePrimary) + esc(STAT_NAMES[p.malePrimary]),
        p.femaleCharisma + ' / ' + p.maleCharisma,
      ],
    })),
  });
  setState(5, 'done', 'done');
}
$('breedingBtn').addEventListener('click', runBreeding);

// ---- Renaming ------------------------------------------------
function currentTagPlan() {
  if (!$('renameCheck').checked) return null;
  const mode = $('renameMode').value;
  if (mode !== 'off' && !PLAN) return null;
  return planNameTags(SAVE, PLAN, mode);
}
function renderRenamePreview() {
  const el = $('renamePreview');
  if (!el) return;
  if (!$('renameCheck').checked) { el.innerHTML = ''; return; }
  const mode = $('renameMode').value;
  if (mode !== 'off' && !PLAN) {
    el.innerHTML = '<span style="color:var(--amber);">Run Step 1 first — tags describe the new assignment.</span>';
    return;
  }
  const plan = planNameTags(SAVE, PLAN, mode);
  if (!plan.changes.length) {
    el.innerHTML = mode === 'off'
      ? 'No tags found — nothing to strip.'
      : 'No names would change.';
    return;
  }
  const sample = plan.changes.slice(0, 4).map(c => esc(c.from) + ' → ' + esc(c.to)).join('  ·  ');
  el.innerHTML = plan.changes.length + ' name(s) would change. e.g. ' + sample +
    '<br>Tags are rewritten in place, so re-running never stacks them up, and "strip existing tags" ' +
    'restores the original names exactly. Long names may be shortened on screen by the game itself.';
}
$('renameCheck').addEventListener('change', renderRenamePreview);
$('renameMode').addEventListener('change', renderRenamePreview);

// ---- Export --------------------------------------------------
$('downloadBtn').addEventListener('click', () => {
  const status = $('downloadStatus');
  const tagPlan = currentTagPlan();
  if (!PLAN && !WEAPON_PLAN && !PET_PLAN && !OUTFIT_PLAN && !(tagPlan && tagPlan.changes.length)) {
    const strippingNothing = $('renameCheck').checked && $('renameMode').value === 'off';
    status.innerHTML = '<span style="color:var(--red);">' + (strippingNothing
      ? 'No name tags found to strip, and no other step has been run — nothing to export.'
      : 'Nothing to export yet — run at least one step above.') + '</span>';
    return;
  }
  try {
    status.innerHTML = '<span class="spinner"></span> Encrypting ...';
    const built = buildOptimizedSave(SAVE, {
      room: PLAN, weapon: WEAPON_PLAN, pet: PET_PLAN, outfit: OUTFIT_PLAN, nameTags: tagPlan,
    });
    const text = encryptSave(built.save);
    const name = FILENAME.replace(/\.(sav|json)$/i, '') + '_optimized.sav';
    downloadText(text, name);
    snapshot(text, 'Exported: ' + built.applied.join(', '), name, built.save);
    status.innerHTML = 'SAVED as <b>' + esc(name) + '</b> — applied: ' + esc(built.applied.join(', ')) +
      '. A snapshot was kept below in case you want to roll back. Breeding suggestions are advisory and ' +
      'must be arranged in-game.';
  } catch (err) {
    status.innerHTML = '<span style="color:var(--red);">EXPORT FAILED: ' + esc(err.message) + '</span>';
  }
});

$('reportBtn').addEventListener('click', () => {
  if (!PLAN && !WEAPON_PLAN && !PET_PLAN && !OUTFIT_PLAN) {
    $('downloadStatus').innerHTML = '<span style="color:var(--red);">Run a step first — there is nothing to report.</span>';
    return;
  }
  const text = buildReport(SAVE, {
    room: PLAN, weapon: WEAPON_PLAN, pet: PET_PLAN, outfit: OUTFIT_PLAN,
  }, currentTagPlan());
  downloadText(text, FILENAME.replace(/\.(sav|json)$/i, '') + '_changes.txt');
});

renderBackups();
updateNav();

// ---- Theme ---------------------------------------------------
// Dark is the default; the choice is remembered per browser. The initial
// value is applied by an inline script in the page head so there is no flash
// of the wrong palette on load.
const THEME_KEY = 'fsvo_theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');

  const btn = $('themeBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', light ? 'true' : 'false');
    const label = $('themeLabel');
    if (label) label.textContent = light ? 'Dark' : 'Light';
    const use = btn.querySelector && btn.querySelector('use');
    if (use) use.setAttribute('href', light ? '#ic-moon' : '#ic-sun');
  }
  try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* not fatal */ }

  // The map's fills are computed in JS from theme variables, so it has to be
  // redrawn rather than merely recoloured by the stylesheet.
  if (SAVE) renderMap();
}

if ($('themeBtn')) {
  applyTheme(currentTheme());
  $('themeBtn').addEventListener('click', () => {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  });
}

// ---- Back to top ---------------------------------------------
const toTop = $('toTop');
const canListen = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
if (toTop && canListen) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 600) toTop.classList.add('show');
    else toTop.classList.remove('show');
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// Keep map cell sizing sensible across viewport changes, rotation included.
let resizeTimer = null;
if (canListen) {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyMapZoom, 150);
  }, { passive: true });
}
