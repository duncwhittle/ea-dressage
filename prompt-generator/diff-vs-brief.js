// Summary report: detector output vs brief table
// Highlights matches and brief-table corrections.

const shim = require('./translator-shim.js');
const PG = require('./prompt-generator.js');
PG.setMarkers(shim.MARKERS);

const TESTS = {
  '1.2': shim.MOVES_12,
  '1.3': shim.MOVES_13,
  'EVB': shim.MOVES_EVB,
};

// Brief table from EA_DRESSAGE_PROJECT.md
const BRIEF = {
  '1.2': [
    { mv: 3,  cross: 'K→X→M',     marker: 'M', dir: 'right→left' },
    { mv: 8,  cross: 'F→E',        marker: 'E', dir: 'left→right' },
    { mv: 9,  cross: 'E→M',        marker: 'M', dir: 'right→left' },
    { mv: 12, cross: 'F→X→H',     marker: 'H', dir: 'right→left' }, // brief wrong
  ],
  '1.3': [
    { mv: 2, cross: 'loop H→X→K', marker: 'K', dir: 'left→right' }, // brief wrong (loop is transient)
    { mv: 5, cross: 'H→X→F',      marker: 'F', dir: 'right→left' }, // brief wrong (carried left in)
    { mv: 7, cross: 'K→X→H',      marker: 'H', dir: 'left→right' }, // brief wrong (same wall, no flip)
    { mv: 8, cross: 'loop M→X→F', marker: 'F', dir: 'right→left' }, // brief wrong (loop is transient)
  ],
  'EVB': [
    { mv: 8, cross: 'F→X→H',       marker: 'H', dir: 'left→right' },
  ],
};

for (const [name, moves] of Object.entries(TESTS)) {
  console.log(`\n=== Test ${name} ===\n`);
  const trace = PG.walkRein(moves);
  const events = [];
  for (const row of trace) {
    for (const ev of row.events) events.push({ row, ev });
  }
  console.log('DETECTED rein-change/establish events:');
  for (const { row, ev } of events) {
    const mv = moves[row.mvI];
    if (ev.type === 'rein-establish') {
      console.log(`  Mv${mv.n}: establish ${ev.rein} rein at ${ev.atMarker || '?'}`);
    } else if (ev.type === 'rein-change') {
      const tag = ev.softness === 'soft' ? `soft @ ${ev.atMarker}`
                : ev.softness === 'crossing' ? 'diagonal/crossing'
                : 'hard';
      console.log(`  Mv${mv.n}: ${ev.from}→${ev.to} at ${ev.atMarker}  [${tag}]`);
    }
  }

  console.log('\nBRIEF table for this test:');
  for (const row of (BRIEF[name] || [])) {
    console.log(`  Mv${row.mv}: ${row.cross} → ${row.dir} AT ${row.marker}`);
  }
}
