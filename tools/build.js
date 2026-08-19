#!/usr/bin/env node
/**
 * Bundles the modular source into one self-contained HTML file.
 *
 * Why this exists: ES modules are fetched over HTTP, so `index.html` works
 * when served (GitHub Pages, or any local server) but not when opened
 * straight off disk with a file:// URL — the browser blocks module requests
 * as cross-origin. The bundle removes that limitation, so people who just
 * want to double-click a file still can.
 *
 *   node tools/build.js
 *   → dist/vault-optimizer.html
 *
 * The bundler is deliberately small: it resolves the import graph, strips
 * import/export keywords, and concatenates in dependency order. That is
 * sufficient because the source only uses static named imports of local
 * files — no dynamic import, no npm packages, no circular-value use at
 * module top level.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'app.js');

// ---- resolve the module graph ------------------------------------
const IMPORT_RE = /^import\s*\{[^}]*\}\s*from\s*'([^']+)';?\s*$/gm;
const seen = new Set();
const order = [];

function visit(file) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  const text = fs.readFileSync(abs, 'utf8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    visit(path.resolve(path.dirname(abs), m[1]));
  }
  order.push(abs);   // dependencies first
}
visit(ENTRY);

// ---- flatten ------------------------------------------------------
// Every module shares one scope in the bundle, so names must be unique.
// Verify that before concatenating rather than emitting broken output.
const declared = new Map();
const DECL_RE = /^export\s+(?:async\s+)?function\s+([\w$]+)|^export\s+(?:const|let|var)\s+([\w$]+)/gm;
let clashes = 0;
order.forEach(file => {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(text))) {
    const name = m[1] || m[2];
    if (declared.has(name)) {
      clashes++;
      console.error(`  name clash: ${name} declared in both ` +
        `${path.relative(ROOT, declared.get(name))} and ${path.relative(ROOT, file)}`);
    } else {
      declared.set(name, file);
    }
  }
});
if (clashes) {
  console.error(`\n${clashes} duplicate top-level name(s) — bundle would be broken. Aborting.`);
  process.exit(1);
}

const chunks = order.map(file => {
  const rel = path.relative(SRC, file);
  const body = fs.readFileSync(file, 'utf8')
    .replace(IMPORT_RE, '')                       // drop local imports
    .replace(/^export\s+(?=(async\s+)?function|const|let|var|class)/gm, '')
    .trim();
  return `/* ===== ${rel} ===== */\n${body}`;
});

// ---- assemble the page --------------------------------------------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// The icon sprite has to be inline for same-document <use> references, but it
// is authored as its own file. Fail loudly if the two have drifted rather than
// shipping a page with missing glyphs.
{
  const authored = fs.readFileSync(path.join(SRC, 'icon-sprite.svg'), 'utf8').trim();
  const embedded = (html.match(/<svg id="iconsprite"[\s\S]*?<\/svg>/) || [''])[0].trim();
  const ids = t => (t.match(/id="ic-[\w-]+"/g) || []).sort().join(',');
  if (ids(authored) !== ids(embedded)) {
    console.error('  index.html icon sprite is out of sync with src/icon-sprite.svg');
    console.error('  copy the <svg id="iconsprite"> block across and rebuild.');
    process.exit(1);
  }
}

const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const css = cssFiles
  .map(f => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

const cryptoJs = fs.readFileSync(path.join(ROOT, 'vendor/crypto-js.js'), 'utf8');

let out = html
  .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/<link rel="icon"[^>]*>\s*/g, '')
  .replace(/<!--[^>]*Vendored locally[\s\S]*?-->\s*/, '')
  .replace(/<script src="vendor\/crypto-js\.js"><\/script>/,
           '<script>\n' + cryptoJs + '\n</script>')
  .replace(/<script type="module" src="src\/app\.js"><\/script>/,
           '<script>\n' + chunks.join('\n\n') + '\n</script>')
  .replace('</head>', '<style>\n' + css + '\n</style>\n</head>');

// A standalone file should say so.
out = out.replace('<title>', '<!-- Single-file offline build. Source of truth is src/ — ' +
  'regenerate with: node tools/build.js -->\n<title>');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const dest = path.join(ROOT, 'dist/vault-optimizer.html');
fs.writeFileSync(dest, out);

console.log('modules bundled : ' + order.length);
console.log('stylesheets     : ' + cssFiles.length);
console.log('output          : ' + path.relative(ROOT, dest) +
            ' (' + Math.round(out.length / 1024) + ' KB)');
