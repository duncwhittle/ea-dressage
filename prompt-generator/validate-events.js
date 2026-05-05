// Layer 3 validation harness — dumps event stream per test.
// Usage: node validate-events.js {1.2|1.3|EVB|all}

const shim = require('./translator-shim.js');
const PG   = require('./prompt-generator.js');
PG.setMarkers(shim.MARKERS);

const TESTS = {
  '1.2': { moves: shim.MOVES_12, def: shim.TEST_12_DEF },
  '1.3': { moves: shim.MOVES_13, def: shim.TEST_13_DEF },
  'EVB': { moves: shim.MOVES_EVB, def: shim.TEST_EVB_DEF },
};

function pad(s, w) {
  s = String(s ?? '');
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function fmtEvent(ev) {
  const loc   = `s${ev.atSeg} t=${ev.atT.toFixed(2)}`;
  const at    = ev.atMarker ? `at=${ev.atMarker}` : '       ';
  const phase = ev.phase === 'post-test' ? ' [post-test]' : '';
  const base  = `${pad(ev.type, 18)} ${pad(loc, 12)} ${pad(at, 8)}${phase}`;

  switch (ev.type) {
    case 'rein-change':
      return `${base}  ${ev.from}→${ev.to} [${ev.softness}]`;

    case 'gait-transition':
      if (ev.style === 'between')
        return `${base}  ${ev.fromGait}→${ev.toGait}  between ${ev.fromMarker} and ${ev.toMarker}`;
      return `${base}  ${ev.fromGait}→${ev.toGait}  at ${ev.atMarker || '(mid)'}`;

    case 'circle-entry':
      return `${base}  hand=${ev.hand}  rein=${ev.rein}`;

    case 'halt':
      return base;

    case 'mv-preview': {
      const coeff = ev.nextMvCoeff > 1 ? ` ×${ev.nextMvCoeff}` : '';
      const ctx   = ev.nextCtx
        ? `  ctx:${ev.nextCtx.type}` +
          (ev.nextCtx.atMarker  ? `@${ev.nextCtx.atMarker}`                     : '') +
          (ev.nextCtx.fromGait  ? ` ${ev.nextCtx.fromGait}→${ev.nextCtx.toGait}` : '')
        : '  ctx:none';
      return `${base}  →Mv${ev.nextMvN}${coeff}: ${ev.nextMvLabel.slice(0, 38)}${ctx}`;
    }

    case 'coeff-banner':
      return `${base}  next=×${ev.nextMvCoeff}`;

    default:
      return base;
  }
}

function runTest(name, moves, def) {
  console.log('\n' + '═'.repeat(90));
  console.log(`TEST ${name}  —  ${moves.length} movements`);
  console.log('═'.repeat(90));

  const trace  = PG.walkRein(moves);
  const events = PG.generateEvents(moves, trace, def);

  // Count by type for summary
  const counts = {};
  for (const ev of events) counts[ev.type] = (counts[ev.type] || 0) + 1;

  let curMvI = -1;
  for (const ev of events) {
    if (ev.mvI !== curMvI) {
      curMvI = ev.mvI;
      const mv = moves[curMvI];
      console.log(`\n  Mv${mv.n}  ${mv.label}`);
    }
    console.log('    ' + fmtEvent(ev));
  }

  console.log('\n  SUMMARY:');
  for (const [type, n] of Object.entries(counts)) {
    console.log(`    ${pad(type, 18)} ${n}`);
  }

  // Spot-check: one mv-preview per non-approach, non-last movement
  const activeMovements = moves.filter((mv, i) => mv.gait !== 'none' && i < moves.length - 1);
  const previews = events.filter(e => e.type === 'mv-preview');
  if (previews.length !== activeMovements.length) {
    console.log(`\n  ⚠ PREVIEW COUNT MISMATCH: expected ${activeMovements.length}, got ${previews.length}`);
  } else {
    console.log(`\n  ✓ Preview count correct (${previews.length})`);
  }
}

const arg = process.argv[2] || 'all';
if (arg === 'all') {
  for (const [name, { moves, def }] of Object.entries(TESTS)) runTest(name, moves, def);
} else {
  const t = TESTS[arg];
  if (!t) { console.error('Unknown test:', arg); process.exit(1); }
  runTest(arg, t.moves, t.def);
}
