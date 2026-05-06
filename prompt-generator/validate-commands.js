// Layer 4 validation harness — dumps command stream + L1–L3 rendered text.
// Usage: node validate-commands.js {1.2|1.3|EVB|all}

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

function runTest(name, moves, def) {
  console.log('\n' + '═'.repeat(90));
  console.log(`TEST ${name}  —  ${moves.length} movements`);
  console.log('═'.repeat(90));

  const trace    = PG.walkRein(moves);
  const events   = PG.generateEvents(moves, trace, def);
  const commands = PG.generateCommands(moves, events);

  const counts = {};
  let curMvI = -1;

  for (const cmd of commands) {
    if (cmd.mvI !== curMvI) {
      curMvI = cmd.mvI;
      const mv = moves[curMvI];
      console.log(`\n  Mv${mv.n}  ${mv.label}`);
    }

    const loc   = `s${cmd.atSeg} t=${cmd.atT.toFixed(2)}`;
    const vut   = `vut:${cmd.visibleUpTo}`;
    const phase = cmd.phase === 'post-test' ? ' [post]' : '';
    console.log(`    ${pad(cmd.action, 16)} ${pad(loc, 10)} ${pad(vut, 6)}${phase}`);

    const l1 = PG.renderCommand(cmd, 1);
    const l2 = PG.renderCommand(cmd, 2);
    const l3 = PG.renderCommand(cmd, 3);

    // Always show L1. Only show L2/L3 when they differ from the level above.
    if (l1 !== null) console.log(`      L1: ${l1}`);
    if (l2 !== l1)  console.log(`      L2: ${l2 ?? '(silent)'}`);
    if (l3 !== l2)  console.log(`      L3: ${l3 ?? '(silent)'}`);

    counts[cmd.action] = (counts[cmd.action] || 0) + 1;
  }

  console.log('\n  SUMMARY:');
  for (const [action, n] of Object.entries(counts))
    console.log(`    ${pad(action, 16)} ${n}`);
}

const arg = process.argv[2] || 'all';
if (arg === 'all') {
  for (const [name, { moves, def }] of Object.entries(TESTS)) runTest(name, moves, def);
} else {
  const t = TESTS[arg];
  if (!t) { console.error('Unknown test:', arg); process.exit(1); }
  runTest(arg, t.moves, t.def);
}
