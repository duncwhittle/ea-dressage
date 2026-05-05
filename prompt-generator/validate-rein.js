// Validation harness for prompt-generator rein detection.
// Runs walkRein over a test and prints a per-segment table.
// Compare output against the change-of-rein table in EA_DRESSAGE_PROJECT.md.

const shim = require('./translator-shim.js');
const PG = require('./prompt-generator.js');

// Wire up the marker reverse-lookup table.
PG.setMarkers(shim.MARKERS);

const TESTS = {
  '1.2': shim.MOVES_12,
  '1.3': shim.MOVES_13,
  'EVB': shim.MOVES_EVB,
};

function fmt(s, w) {
  s = String(s ?? '');
  if (s.length >= w) return s.slice(0, w);
  return s + ' '.repeat(w - s.length);
}

function describeSeg(mv, seg, segI) {
  const t = seg.t;
  if (t === 'halt') return `halt@${ptStr(seg.pt)}`;
  if (t === 'circle') return `circ ${seg.ccw ? 'CCW' : 'CW'} r=${seg.r.toFixed(1)} sw=${seg.sweep}°`;
  if (t === 'bezier') return `bez ${ptStr(seg.pts[0])}→${ptStr(seg.pts[1])}→${ptStr(seg.pts[2])}`;
  if (t === 'arc' || t === 'line' || t === 'grad') {
    const f = seg.pts[0], l = seg.pts[seg.pts.length - 1];
    return `${t} ${ptStr(f)}→${ptStr(l)} (${seg.pts.length}pts)`;
  }
  return t;
}
function ptStr(p) {
  if (!p) return '?';
  return `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`;
}

function runTest(name, moves) {
  console.log('═'.repeat(78));
  console.log(`TEST ${name}  —  ${moves.length} movements`);
  console.log('═'.repeat(78));
  const trace = PG.walkRein(moves);

  // Group by movement
  let curMv = -1;
  for (const row of trace) {
    if (row.mvI !== curMv) {
      curMv = row.mvI;
      const mv = moves[curMv];
      console.log();
      console.log(`Mv ${mv.n}  ${mv.label}`);
      console.log('  ' + '─'.repeat(74));
    }
    const segDesc = describeSeg(moves[row.mvI], moves[row.mvI].segs[row.segI], row.segI);
    const reinShift = row.reinBefore !== row.reinAfter
      ? `${row.reinBefore || '·'}→${row.reinAfter || '·'}`
      : (row.reinAfter || '·');
    console.log(`  s${row.segI} ${fmt(segDesc, 40)} segRein=${fmt(row.rein, 8)} carried=${fmt(reinShift, 12)} ${formatEvents(row.events)}`);
  }

  // Summary: list all rein-change events
  console.log();
  console.log('  REIN CHANGE EVENTS:');
  for (const row of trace) {
    for (const ev of row.events) {
      const mv = moves[row.mvI];
      if (ev.type === 'rein-change') {
        const where = ev.atMarker || '?';
        const tag = ev.softness === 'soft' ? `(soft @ t=${ev.tInSeg.toFixed(2)})`
                  : ev.softness === 'implicit' ? `(implicit via ${ev.atNull})`
                  : ev.softness === 'crossing' ? `(crossing)`
                  : '';
        console.log(`    Mv${mv.n} s${row.segI}  ${ev.from}→${ev.to} at ${where}  ${tag}`);
      } else if (ev.type === 'rein-establish') {
        console.log(`    Mv${mv.n} s${row.segI}  establish ${ev.rein} rein at ${ev.atMarker || '?'}`);
      }
    }
  }
}

function endpointMarker(seg) {
  if (!seg.pts) return null;
  const last = seg.pts[seg.pts.length - 1];
  for (const [name, c] of Object.entries(shim.MARKERS)) {
    if (Math.abs(c[0] - last[0]) < 0.5 && Math.abs(c[1] - last[1]) < 0.5) {
      // Prefer named markers over helpers
      if (['A','C','K','E','H','M','B','F','X'].includes(name)) return name;
    }
  }
  for (const [name, c] of Object.entries(shim.MARKERS)) {
    if (Math.abs(c[0] - last[0]) < 0.5 && Math.abs(c[1] - last[1]) < 0.5) return name;
  }
  return null;
}

function formatEvents(evs) {
  if (!evs.length) return '';
  return evs.map(e => {
    if (e.type === 'rein-change') return `[CHANGE ${e.from}→${e.to} ${e.softness}]`;
    if (e.type === 'rein-establish') return `[ESTABLISH ${e.rein}]`;
    return `[${e.type}]`;
  }).join(' ');
}

// Run requested test (default 1.2 per session 8 plan)
const arg = process.argv[2] || '1.2';
if (arg === 'all') {
  for (const [n, m] of Object.entries(TESTS)) runTest(n, m);
} else {
  runTest(arg, TESTS[arg]);
}
