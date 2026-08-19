/**
 * Verifies the modular source itself: that each module imports cleanly in
 * isolation, that the pure logic is DOM-free (and therefore testable in Node),
 * and that the bundle produced from it behaves identically.
 *
 *   node tests/modules.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.CryptoJS = require('crypto-js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src');

let fails = 0;
const ok = (c, m) => { if (c) console.log('  PASS  ' + m); else { fails++; console.log('  FAIL  ' + m); } };

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, ext, out);
    else if (f.endsWith(ext)) out.push(f);
  }
  return out;
}
const jsFiles = walk(SRC, '.js');
const rel = f => path.relative(ROOT, f);

console.log('=== 1. Every module imports on its own ===');
for (const f of jsFiles) {
  const isEntry = f.endsWith('app.js');
  try {
    await import(f);
    ok(true, rel(f));
  } catch (e) {
    // app.js is the browser entry point: it wires the page on load, so in Node
    // it parses and then stops at the first DOM call. That is expected — a
    // SyntaxError would not be.
    if (isEntry && e instanceof ReferenceError && /document|window/.test(e.message)) {
      ok(true, rel(f) + ' (parses; needs a DOM, as the entry point should)');
    } else {
      ok(false, rel(f) + ' — ' + e.name + ': ' + e.message);
    }
  }
}

console.log('\n=== 2. Logic modules are free of DOM dependencies ===');
{
  // These must stay importable in Node so the algorithms can be tested
  // without a browser. Anything touching document/window belongs in ui/.
  const pure = jsFiles.filter(f => /\/(core|data|optimize|features)\//.test(f));
  pure.forEach(f => {
    const t = fs.readFileSync(f, 'utf8');
    const hits = (t.match(/\b(document|window)\s*\./g) || [])
      .filter(h => !/typeof/.test(h));
    ok(hits.length === 0, rel(f) + (hits.length ? ' references ' + hits.join(', ') : ''));
  });
  const uiFiles = jsFiles.filter(f => /\/ui\//.test(f));
  ok(uiFiles.length > 0, uiFiles.length + ' UI module(s) hold the DOM-facing code');
}

console.log('\n=== 3. No module is orphaned or duplicated ===');
{
  const entry = path.join(SRC, 'app.js');
  const seen = new Set();
  const IMPORT_RE = /^import\s*\{[^}]*\}\s*from\s*'([^']+)';?\s*$/gm;
  (function visit(file) {
    const abs = path.resolve(file);
    if (seen.has(abs)) return;
    seen.add(abs);
    const t = fs.readFileSync(abs, 'utf8');
    let m; IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(t))) visit(path.resolve(path.dirname(abs), m[1]));
  })(entry);
  const orphans = jsFiles.filter(f => !seen.has(path.resolve(f)));
  ok(orphans.length === 0, 'every module is reachable from app.js' +
     (orphans.length ? ' — orphans: ' + orphans.map(rel).join(', ') : ''));

  // The bundle shares one scope, so top-level names must be globally unique.
  const names = new Map(); let clash = 0;
  const DECL = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)|^(?:export\s+)?(?:const|let|var)\s+([\w$]+)/gm;
  jsFiles.forEach(f => {
    const t = fs.readFileSync(f, 'utf8');
    let m; DECL.lastIndex = 0;
    while ((m = DECL.exec(t))) {
      const n = m[1] || m[2];
      if (names.has(n) && names.get(n) !== f) { clash++; console.log('        clash: ' + n); }
      names.set(n, f);
    }
  });
  ok(clash === 0, 'no duplicate top-level names across modules (bundle-safe)');
}

console.log('\n=== 4. The algorithms still produce the right answers ===');
{
  const { decryptSave, encryptSave } = await import(path.join(SRC, 'core/crypto.js'));
  const { optimizeVault, currentProductiveScore, combinedProductiveScore } =
    await import(path.join(SRC, 'optimize/rooms.js'));
  const { optimizeWeapons } = await import(path.join(SRC, 'optimize/weapons.js'));
  const { optimizeOutfits } = await import(path.join(SRC, 'optimize/outfits.js'));
  const { optimizePets } = await import(path.join(SRC, 'optimize/pets.js'));
  const { suggestBreedingPairs } = await import(path.join(SRC, 'optimize/breeding.js'));
  const { buildOptimizedSave } = await import(path.join(SRC, 'core/apply.js'));
  const { getAssignableDwellers, getInventoryItems } = await import(path.join(SRC, 'core/save.js'));
  const { makeExampleSave } = await import(path.join(SRC, 'features/example.js'));

  const ex = makeExampleSave();
  const room = optimizeVault(ex, { trainingWeight: 0.2 });
  const outfit = optimizeOutfits(ex, room);
  const weapon = optimizeWeapons(ex);
  const pet = optimizePets(ex, room);
  const breed = suggestBreedingPairs(ex);

  const before = currentProductiveScore(ex);
  const after = combinedProductiveScore(ex, room, outfit);
  ok(after > before * 1.5, 'example vault output ' + before.toFixed(1) + ' -> ' + after.toFixed(1));
  ok(weapon.firepowerNew > weapon.firepowerOld, 'firepower improves');
  ok(pet.recommendations.length === 3 && breed.pairs.length > 0, 'pets and pairs produced');

  // Item conservation, the invariant that matters most.
  const built = buildOptimizedSave(ex, { room, weapon, pet, outfit });
  const re = decryptSave(encryptSave(built.save));
  const count = (save, type, get) => {
    const out = [];
    getAssignableDwellers(save).forEach(d => { const v = get(d); if (v && v !== 'Fist') out.push(v); });
    getInventoryItems(save).forEach(i => { if (i.type === type && i.id !== 'Fist') out.push(i.id); });
    return out.sort().join(',');
  };
  ok(count(ex, 'Weapon', d => d.equipedWeapon?.id) === count(re, 'Weapon', d => d.equipedWeapon?.id),
     'weapons conserved through the module path');
  ok(count(ex, 'Outfit', d => d.equipedOutfit?.id) === count(re, 'Outfit', d => d.equipedOutfit?.id),
     'outfits conserved');
  ok(count(ex, 'Pet', d => d.equippedPet?.id) === count(re, 'Pet', d => d.equippedPet?.id),
     'pets conserved');

  // And against a real save, not just the generated one.
  const realPath = '/mnt/user-data/uploads/Vault1.sav';
  if (fs.existsSync(realPath)) {
    const S = decryptSave(fs.readFileSync(realPath, 'utf8'));
    const p2 = optimizeVault(S, { trainingWeight: 0.2 });
    ok(combinedProductiveScore(S, p2, optimizeOutfits(S, p2)) > currentProductiveScore(S),
       'real save also improves');
  }
}

console.log('\n=== 4b. Vault map geometry ===');
{
  const { makeExampleSave } = await import(path.join(SRC, 'features/example.js'));
  const { buildMapModel, roomGridWidth } = await import(path.join(SRC, 'features/map-model.js'));
  const { decryptSave } = await import(path.join(SRC, 'core/crypto.js'));

  // Column units are thirds of a room; elevators are a single narrow shaft.
  const rowsOf = save => {
    const byRow = {};
    save.vault.rooms.forEach(r => { (byRow[r.row] ||= []).push(r); });
    return byRow;
  };
  const gapsIn = save => {
    let gaps = 0;
    Object.values(rowsOf(save)).forEach(items => {
      items.sort((a, b) => a.col - b.col);
      let cursor = 0;
      items.forEach(r => {
        if (r.col > cursor) gaps++;
        cursor = Math.max(cursor, r.col + roomGridWidth(r));
      });
    });
    return gaps;
  };
  const overlapsIn = save => {
    const model = buildMapModel(save, null, null);
    const seen = new Set(); let clashes = 0;
    model.cells.forEach(c => {
      for (let x = c.col; x < c.col + c.w; x++) {
        const k = c.row + ':' + x;
        if (seen.has(k)) clashes++;
        seen.add(k);
      }
    });
    return clashes;
  };

  const ex = makeExampleSave();
  ok(overlapsIn(ex) === 0, 'example vault: no overlapping rooms');
  // The demo should look like a real vault — every row dug solid from the left,
  // with the lift shaft flush against the rooms on either side.
  ok(gapsIn(ex) === 0, 'example vault: no holes in the layout (' + gapsIn(ex) + ' found)');

  const lift = ex.vault.rooms.find(r => r.type === 'Elevator');
  const sameRow = ex.vault.rooms
    .filter(r => r.row === lift.row && r !== lift)
    .sort((a, b) => a.col - b.col);
  const left = sameRow.filter(r => r.col < lift.col).pop();
  ok(!left || left.col + roomGridWidth(left) === lift.col,
     'the lift shaft sits flush against the room to its left');

  // A real save may legitimately contain unexcavated ground; that must not be
  // treated as an error, only rendered as empty space.
  const realPath = '/mnt/user-data/uploads/Vault1.sav';
  if (fs.existsSync(realPath)) {
    const S = decryptSave(fs.readFileSync(realPath, 'utf8'));
    ok(overlapsIn(S) === 0, 'real save: no overlapping rooms');
    const model = buildMapModel(S, null, null);
    ok(model.cells.length === S.vault.rooms.length, 'every real room gets a cell');
    ok(model.rows > 0 && model.cols > 0, 'real save grid is ' + model.rows + ' x ' + model.cols);
  }
}

console.log('\n=== 5. The build output matches the source ===');
{
  const distPath = path.join(ROOT, 'dist/vault-optimizer.html');
  ok(fs.existsSync(distPath), 'dist/vault-optimizer.html exists (run: node tools/build.js)');
  if (fs.existsSync(distPath)) {
    const dist = fs.readFileSync(distPath, 'utf8');
    ok(!/\bimport\s*\{/.test(dist), 'no import statements survive in the bundle');
    ok(!/^export\s/m.test(dist), 'no export statements survive in the bundle');
    ok(!/<script type="module"/.test(dist), 'bundle uses a plain script, so file:// works');
    ok(!/<link rel="stylesheet"/.test(dist), 'stylesheets are inlined');
    ok(!/src="vendor\//.test(dist), 'the crypto library is inlined');
    ok(/CryptoJS/.test(dist) && /function optimizeVault/.test(dist), 'both libraries and app code present');
    // Every source module must appear in the bundle.
    const missing = jsFiles.filter(f => !dist.includes('===== ' + path.relative(SRC, f)));
    ok(missing.length === 0, 'all ' + jsFiles.length + ' modules bundled' +
       (missing.length ? ' — missing ' + missing.map(rel).join(', ') : ''));
  }
}

console.log('\n=== 6. Hostable as plain static files ===');
{
  ok(fs.existsSync(path.join(ROOT, 'index.html')), 'index.html at the repo root');
  ok(fs.existsSync(path.join(ROOT, '.nojekyll')), '.nojekyll present so Pages serves files verbatim');
  ok(fs.existsSync(path.join(ROOT, 'vendor/crypto-js.js')), 'crypto library vendored, not fetched from a CDN');
  ok(fs.existsSync(path.join(ROOT, 'vendor/crypto-js.LICENSE')), 'its licence is included');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '').match(/<head>[\s\S]*<\/head>/)[0]),
     'no external requests in <head> — works offline and leaks nothing');
  // Relative paths only, so it works from a project subpath like user.github.io/repo/
  const srcs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  const absolute = srcs.filter(u => u.startsWith('/'));
  ok(absolute.length === 0, 'all asset paths are relative, so a project subpath works' +
     (absolute.length ? ' — absolute: ' + absolute.join(', ') : ''));
  ok(srcs.some(u => u === 'src/app.js'), 'entry module referenced');
}

console.log('\n>>> TOTAL FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
