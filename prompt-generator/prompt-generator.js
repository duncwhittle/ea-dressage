// ═══════════════════════════════════════════════════════════════
// EA DRESSAGE — PROMPT GENERATOR
// ───────────────────────────────────────────────────────────────
// Pure module. No DOM, no globals, no animation state.
// Input:  testDef (compact definitions) + segs (resolved by translator)
// Output: prompts[] tagged with minLevel
//
// LAYERS:
//   1. Geometry  — segDirection(seg) → rotation per segment
//   2. State     — walkRein(testMoves) → carried rein per segment + change events
//   3. Events    — emit movement events from rein state + test structure
//   4. Templates — turn events into prompt text per level
//   5. Distance  — auto-calc dist from geometry
//
// CONVENTIONS (bird's eye view):
//   Left rein  = tracking left  = CCW rotation
//   Right rein = tracking right = CW rotation
//   Centreline entry = null rein
//   Straight segments carry prior rein
//   A and C are null moments — rein resumes from next curving segment
// ═══════════════════════════════════════════════════════════════

// ─── GAIT SPEEDS (m/s, base) ────────────────────────────────────
// Mirrors GSPEED in v14.html — kept here so this module is standalone.
const GSPEED_MPS = {
  walk: 1.111, freewalk: 1.111, trot: 2.222, canter: 3.333,
  stretch: 2.222, halt: 0, none: 1.5,
};

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — GEOMETRY: per-segment rotational direction
// ═══════════════════════════════════════════════════════════════
//
// CONVENTION (locked in — see project brief):
//   RIGHT REIN = CW (bird's eye, math-CW)
//   LEFT REIN  = CCW (bird's eye, math-CCW)
//
// We measure the LOCAL turning direction of the rider's path:
// at each interior vertex of a polyline, the signed cross product
// (b - a) × (c - b) tells us whether the path bends left or right.
//   Positive (math-CCW) = left turn = LEFT REIN
//   Negative (math-CW)  = right turn = RIGHT REIN
//
// This is intentionally local — the rider may rotate around any point
// (a marker, a corner, or implicitly through X). There is NO single
// reference point. Local curvature is the truth.

// Signed cross product of (b-a) × (c-b). Positive = math-CCW (left turn).
function crossSign(a, b, c) {
  const cx = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (Math.abs(cx) < 0.001) return 0;
  return cx > 0 ? +1 : -1;
}

// Determine the rein of a polyline by summing the signed turning at each
// interior vertex. Net positive turning = left turn dominant = left rein.
// Net negative = right rein. Net zero / near-zero = straight.
//
// Magnitude threshold avoids labelling tiny corner-rounding helper arcs
// as a definite rein when they're really just smoothing.
function polylineRein(pts) {
  if (!pts || pts.length < 3) return 'straight';
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += crossSign(pts[i - 1], pts[i], pts[i + 1]);
  }
  if (acc > 0) return 'left';
  if (acc < 0) return 'right';
  return 'straight';
}

// Sample a quadratic bezier at t in [0,1]
function bezAt(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// Detect curvature sign reversals in a bezier. Returns array of t values
// in (0,1) where curvature changes sign. Quadratic beziers have constant
// curvature sign so this returns []; kept for future cubic-bezier support.
function bezierCurvatureFlips(p0, p1, p2, samples = 32) {
  const flips = [];
  let prevSign = 0;
  let prevT = 0;
  for (let i = 1; i < samples - 1; i++) {
    const t0 = (i - 1) / (samples - 1);
    const t1 = i / (samples - 1);
    const t2 = (i + 1) / (samples - 1);
    const a = bezAt(p0, p1, p2, t0);
    const b = bezAt(p0, p1, p2, t1);
    const c = bezAt(p0, p1, p2, t2);
    const s = crossSign(a, b, c);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) {
      flips.push((prevT + t1) / 2);
    }
    if (s !== 0) { prevSign = s; prevT = t1; }
  }
  return flips;
}

// Determine the per-segment intrinsic rein. Returns:
//   { rein: 'left' | 'right' | 'straight' | 'halt' | 'none',
//     flips:    [t1, t2, ...]  // bezier curvature reversals (unused for
//                              // quadratic; reserved for cubic future work)
//     crossing: null  // legacy field; wall-crossings now detected in walkRein
//   }
//
// MAPPING:
//   Circle: ccw=true → left rein; ccw=false → right rein.
//   Arc/grad: local turning direction (sum of signed cross products at
//             interior vertices). Net left turn → left rein; net right
//             turn → right rein. The rider may rotate around any point —
//             local curvature is the only truth.
//   Line: straight. Carries rein (or, in walkRein, may trigger a hard
//         rein change at X if it's a wall→X line followed by an X→wall
//         line, per the K→X→H pattern).
//   Halt: halt. Carries rein.
function segDirection(seg) {
  if (seg.t === 'halt') return { rein: 'halt', flips: [], crossing: null };
  if (seg.t === 'circle') {
    return { rein: seg.ccw ? 'left' : 'right', flips: [], crossing: null };
  }
  if (seg.t === 'bezier') {
    const [p0, p1, p2] = seg.pts;
    const flips = bezierCurvatureFlips(p0, p1, p2);
    return { rein: 'straight', flips, crossing: null };
  }
  if (seg.t === 'arc' || seg.t === 'grad') {
    return { rein: polylineRein(seg.pts), flips: [], crossing: null };
  }
  if (seg.t === 'line') {
    return { rein: 'straight', flips: [], crossing: null };
  }
  return { rein: 'none', flips: [], crossing: null };
}

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — REIN STATE: walk through a test, carry rein, emit events
// ═══════════════════════════════════════════════════════════════

// Walk an entire test (array of moves), tracking rein state across all
// segments. Returns parallel array of:
//   { mvI, segI, rotation, reinBefore, reinAfter, events: [...] }
// where events is one of:
//   { type: 'rein-change', from, to, softness: 'hard'|'soft', tInSeg? }
//   { type: 'rein-establish', rein }   (first time rein is set after null)
//
// "A/C null" rule is implemented at segment boundaries: when consecutive
// segments touch A or C and the rotation reverses, we treat it as the
// boundary segment driving the new rein, not a "change". The previous
// rein essentially expires at A/C and the new one is established by
// the next curving segment.
//
// Implementation: we don't *carry* rein across A/C transitions — instead,
// at each segment, if the segment endpoint matches A or C and the next
// segment has a definite rotation, the next segment "establishes" rein
// fresh (no change event). If the rein matches what came before, no
// event. If it differs, that's just the next phase, not a "change of rein"
// in the coaching sense.
// ═══════════════════════════════════════════════════════════════
// LAYER 2 — REIN STATE: walk through a test, carry rein, emit events
// ═══════════════════════════════════════════════════════════════
//
// CORE RULE (locked in — see project brief):
//   The rider has a rein at all times after the test starts.
//   Null rein exists only ONCE per test: entering on the centreline,
//   before the first turn at C. Once established, rein is always carried.
//   A and C are NOT special — they carry the rein through.
//
// REIN-CHANGE DETECTION:
//   The rider's rein follows their LOCAL turning direction. We detect
//   rein changes by examining the path at the granularity of "vertices":
//     — interior vertices within a multi-point line/arc segment, AND
//     — joins between consecutive segments.
//
//   At each vertex, we compute the cross product (b-a) × (c-b) where a/b/c
//   are points on either side of the vertex. The sign tells us which way
//   the path bends. A sign change vs the carried rein = rein change.
//
//   This handles:
//     - Diagonal K→X→M: line is geometrically straight at X (cross=0).
//       Turn happens at M (line→arc join), where rein flips.
//     - Diagonal K→X→M split by gait at X (two line segs): same — both
//       sub-lines point the same direction, cross=0 at X, turn at M.
//     - K→X→H same-wall figure: two lines with different directions,
//       cross ≠ 0 at X. Two rein changes: one at X, one at H.
//     - Loops (bezier): handled separately as 2 soft changes.
//     - Curving segments matching/changing rein: handled by intrinsic rein.

function walkRein(testMoves) {
  const result = [];
  let carriedRein = null;  // null only at start of test

  // We need direction context across segment boundaries. Cache the last
  // tangent vector and the last marker we passed (for naming change points).
  let lastDir = null;       // [dx, dy] heading at end of previous seg
  let lastEndPt = null;     // last point we left

  for (let mvI = 0; mvI < testMoves.length; mvI++) {
    const mv = testMoves[mvI];
    for (let segI = 0; segI < mv.segs.length; segI++) {
      const seg = mv.segs[segI];

      // Skip gait:'none' segments — these are approach (before A) and
      // post-test exit (out the arena). They have no rein meaning.
      if (seg.g === 'none' || (seg.t === 'grad' && seg.g1 === 'none' && seg.g2 === 'none')) {
        result.push({
          mvI, segI, segType: seg.t,
          rein: 'none', flips: [],
          reinBefore: carriedRein, reinAfter: carriedRein,
          events: [],
        });
        continue;
      }

      const dir = segDirection(seg);
      const segRein = (dir.rein === 'left' || dir.rein === 'right') ? dir.rein : null;
      const events = [];
      const reinBefore = carriedRein;
      let reinAfter = carriedRein;

      // ── BEZIER (loop): 2 soft changes returning to entry rein ──
      if (seg.t === 'bezier') {
        if (carriedRein) {
          const opp = carriedRein === 'left' ? 'right' : 'left';
          const t1 = 0.33, t2 = 0.67;
          events.push({
            type: 'rein-change', from: carriedRein, to: opp,
            softness: 'soft', tInSeg: t1,
            atMarker: ptToMarker(bezAt(seg.pts[0], seg.pts[1], seg.pts[2], t1))
                      || 'first quarterline',
          });
          events.push({
            type: 'rein-change', from: opp, to: carriedRein,
            softness: 'soft', tInSeg: t2,
            atMarker: ptToMarker(bezAt(seg.pts[0], seg.pts[1], seg.pts[2], t2))
                      || 'second quarterline',
          });
        }
        reinAfter = carriedRein;
      }

      // ── HALT ──
      else if (seg.t === 'halt') {
        reinAfter = carriedRein;
      }

      // ── LINE: detect rein changes ──
      // A line is straight; rein only changes at its endpoints (vertices).
      // We detect:
      //   (a) Internal vertex turns within a multi-point line (e.g. K→X→H
      //       has a sharp bend at X): emit at the bend vertex.
      //   (b) End-vertex turn (the line ends, the next seg starts in a
      //       different direction): emit at the line's end marker.
      else if (seg.t === 'line') {
        // (a) Internal vertices
        if (seg.pts.length >= 3) {
          for (let i = 1; i < seg.pts.length - 1; i++) {
            const a = seg.pts[i - 1], b = seg.pts[i], c = seg.pts[i + 1];
            const d1 = [b[0] - a[0], b[1] - a[1]];
            const d2 = [c[0] - b[0], c[1] - b[1]];
            const turnRein = turnDirection(d1, d2);
            if (turnRein && carriedRein && turnRein !== carriedRein) {
              events.push({
                type: 'rein-change', from: carriedRein, to: turnRein,
                softness: 'hard', atMarker: ptToMarker(b),
              });
              carriedRein = turnRein;
            }
          }
        }

        // (b) End-of-line turn (peek next seg's start direction)
        const nextSeg = peekNextSeg(testMoves, mvI, segI);
        const nextStartDir = segStartTangent(nextSeg);
        const myEndDir = lineDirAt(seg, 'end');
        if (nextStartDir && myEndDir && carriedRein) {
          const turnRein = turnDirection(myEndDir, nextStartDir);
          if (turnRein && turnRein !== carriedRein) {
            events.push({
              type: 'rein-change', from: carriedRein, to: turnRein,
              softness: 'hard',
              atMarker: ptToMarker(seg.pts[seg.pts.length - 1]),
            });
            carriedRein = turnRein;
          }
        }

        reinAfter = carriedRein;
      }

      // ── ARC / GRAD / CIRCLE: check for turn at start join ──
      else if (segRein) {
        // Establish rein on first turn after null.
        if (carriedRein === null) {
          events.push({
            type: 'rein-establish', rein: segRein,
            atMarker: ptToMarker(seg.pts ? seg.pts[0] : null),
          });
          reinAfter = segRein;
        }
        // Otherwise, if intrinsic rein differs from carried, that's a change
        // at the seg start (the marker the rider just arrived at).
        else if (carriedRein !== segRein) {
          events.push({
            type: 'rein-change', from: carriedRein, to: segRein,
            softness: 'hard', atMarker: segStartMarker(seg),
          });
          reinAfter = segRein;
        } else {
          reinAfter = segRein;
        }
      }

      // ── Update direction-tracking state for next iteration ──
      const tangentAtEnd = segEndTangent(seg);
      if (tangentAtEnd) lastDir = tangentAtEnd;
      const endPt = segEndPoint(seg);
      if (endPt) lastEndPt = endPt;

      result.push({
        mvI, segI, segType: seg.t,
        rein: dir.rein,
        flips: dir.flips,
        reinBefore, reinAfter,
        events,
      });
      carriedRein = reinAfter;
    }
  }
  return result;
}

// Direction of a line segment at start or end.
function lineDirAt(seg, where) {
  if (!seg.pts || seg.pts.length < 2) return null;
  if (where === 'start') {
    const a = seg.pts[0], b = seg.pts[1];
    return [b[0] - a[0], b[1] - a[1]];
  }
  const n = seg.pts.length;
  const a = seg.pts[n - 2], b = seg.pts[n - 1];
  return [b[0] - a[0], b[1] - a[1]];
}

// Determine the rein implied by turning from direction d1 to direction d2.
// Returns 'left' | 'right' | null (if essentially straight).
function turnDirection(d1, d2) {
  if (!d1 || !d2) return null;
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  // Normalize by magnitudes to get a comparable threshold
  const m1 = Math.hypot(d1[0], d1[1]);
  const m2 = Math.hypot(d2[0], d2[1]);
  if (m1 < 0.001 || m2 < 0.001) return null;
  const norm = cross / (m1 * m2);
  // |norm| is sin(angle). A turn of more than ~10° counts.
  if (Math.abs(norm) < 0.17) return null;
  return norm > 0 ? 'left' : 'right';
}

// Tangent vector at the end of a segment (direction of travel as the
// segment finishes). Used to detect turns at segment joins.
function segEndTangent(seg) {
  if (!seg) return null;
  if (seg.t === 'halt') return null;
  if (seg.t === 'line' || seg.t === 'arc' || seg.t === 'grad') {
    return lineDirAt(seg, 'end');
  }
  if (seg.t === 'bezier') {
    const t = 0.99;
    const a = bezAt(seg.pts[0], seg.pts[1], seg.pts[2], t);
    const b = bezAt(seg.pts[0], seg.pts[1], seg.pts[2], 1.0);
    return [b[0] - a[0], b[1] - a[1]];
  }
  if (seg.t === 'circle') {
    // Tangent at the end of a circle (after sweep degrees) — approximate.
    const sweep = seg.sweep || 360;
    const startRad = seg.startDeg * Math.PI / 180;
    const endRad = startRad + (seg.ccw ? +1 : -1) * sweep * Math.PI / 180;
    // Tangent direction at end angle (perpendicular to radius, in direction of motion)
    if (seg.ccw) {
      return [-Math.sin(endRad), Math.cos(endRad)];
    }
    return [Math.sin(endRad), -Math.cos(endRad)];
  }
  return null;
}

function segEndPoint(seg) {
  if (!seg) return null;
  if (seg.t === 'halt') return seg.pt;
  if (seg.pts) return seg.pts[seg.pts.length - 1];
  if (seg.t === 'circle') {
    const sweep = seg.sweep || 360;
    const startRad = seg.startDeg * Math.PI / 180;
    const endRad = startRad + (seg.ccw ? +1 : -1) * sweep * Math.PI / 180;
    return [seg.cx + seg.r * Math.cos(endRad), seg.cy + seg.r * Math.sin(endRad)];
  }
  return null;
}

// Look at the segment that comes after (mvI, segI), skipping halts.
// Returns null if at the end of the test.
function peekNextSeg(testMoves, mvI, segI) {
  let i = mvI, j = segI + 1;
  while (i < testMoves.length) {
    const mv = testMoves[i];
    while (j < mv.segs.length) {
      const s = mv.segs[j];
      if (s.t !== 'halt') return s;
      j++;
    }
    i++;
    j = 0;
  }
  return null;
}

// Tangent vector at the start of a segment (direction the rider heads
// as the segment begins). Used for lookahead at line endings.
function segStartTangent(seg) {
  if (!seg) return null;
  if (seg.t === 'halt') return null;
  if (seg.t === 'line' || seg.t === 'arc' || seg.t === 'grad') {
    return lineDirAt(seg, 'start');
  }
  if (seg.t === 'bezier') {
    const t = 0.01;
    const a = bezAt(seg.pts[0], seg.pts[1], seg.pts[2], 0);
    const b = bezAt(seg.pts[0], seg.pts[1], seg.pts[2], t);
    return [b[0] - a[0], b[1] - a[1]];
  }
  if (seg.t === 'circle') {
    const startRad = seg.startDeg * Math.PI / 180;
    if (seg.ccw) {
      return [-Math.sin(startRad), Math.cos(startRad)];
    }
    return [Math.sin(startRad), -Math.cos(startRad)];
  }
  return null;
}

// Return marker name for the start of a segment, if it lies on a named marker.
// Used to detect A/C null moments.
function segStartMarker(seg) {
  if (seg.t === 'halt') return null;
  if (seg.t === 'circle') return null;
  if (seg.t === 'bezier') return ptToMarker(seg.pts[0]);
  // arc, grad, line
  if (seg.pts && seg.pts.length) return ptToMarker(seg.pts[0]);
  return null;
}

// Reverse-lookup a coordinate to a marker name. Tolerant to small float diffs.
// MARKERS_REF is filled by the consumer at module init via setMarkers().
let MARKERS_REF = null;
function setMarkers(markers) { MARKERS_REF = markers; }

// Internal path-routing helpers that must never surface as rider-facing names.
// Compass sub-points collapse to their parent letter; corner waypoints → null.
const _MARKER_REMAP = {
  AE: 'A', AW: 'A',
  CS: 'C', CE: 'C', CW_: 'C',
  BL: null, BR: null, TL: null, TR: null,
  A0: null, START: null,
};

function ptToMarker(pt) {
  if (!MARKERS_REF || !pt) return null;
  for (const [name, coord] of Object.entries(MARKERS_REF)) {
    if (Math.abs(coord[0] - pt[0]) < 0.5 && Math.abs(coord[1] - pt[1]) < 0.5) {
      return name in _MARKER_REMAP ? _MARKER_REMAP[name] : name;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — EVENTS: structured coaching events, no text
// ═══════════════════════════════════════════════════════════════
//
// generateEvents(testMoves, reinTrace, testDefs) → events[]
//
// testDefs is required: 'transition' steps carry a 'between' field
// (e.g. between:['A','F']) naming the coaching zone. This differs from
// the step's from/to and is NOT preserved in the resolved grad seg.
//
// EVENT SCHEMA — fields present on every event:
//   type       — see event types below
//   mvI        — movement index in testMoves
//   atSeg      — segment index in moves[mvI].segs where event occurs
//   atT        — position within that segment: 0=start, 1=end, 0<t<1=within
//   atMarker   — named marker string, or null if event falls between markers
//   phase      — 'test' | 'post-test'
//                post-test: segments after the halt/salute in the final
//                movement. These are best-practice visualisation, not
//                EA-prescribed. Exit direction is rider's choice.
//
// Type-specific extra fields:
//   rein-change     : from, to, softness ('hard'|'soft')
//   gait-transition : fromGait, toGait, style ('at'|'between'),
//                     fromMarker, toMarker  (null when style='at')
//   circle-entry    : hand ('left'|'right'), rein ('left'|'right')
//   halt            : (no extras — atMarker = 'X')
//   mv-preview      : nextMvI, nextMvN, nextMvLabel, nextMvCoeff, nextCtx
//                     nextCtx: first significant event of next mv, pre-resolved
//                     so Layer 4 need not re-traverse
//   coeff-banner    : nextMvI, nextMvCoeff
// ═══════════════════════════════════════════════════════════════

// How many segments does each step type produce?
// Must stay in sync with translateStep() in ea_dressage_v14.html.
function countStepSegs(step) {
  if (step.type === 'splitcircle') return 2;
  if (step.type === 'exit')        return 3; // line + arc + line
  return 1;
}

// Map each step in a movement definition to its segment index range.
function buildStepSegMap(def) {
  const map = [];
  let si = 0;
  for (const step of def.steps) {
    const count = countStepSegs(step);
    map.push({ step, segStart: si, segCount: count });
    si += count;
  }
  return map;
}

// Reverse-lookup a circle segment to its named marker.
// E and B share centre (0,30) — startDeg distinguishes them.
const _CIRC_KEY = { '0,30,180':'E', '0,30,0':'B', '0,10,270':'A', '0,50,90':'C' };
function circleAtMarker(seg) {
  return _CIRC_KEY[`${seg.cx},${seg.cy},${seg.startDeg}`] || null;
}

// Index of last segment in a movement that is neither halt nor gait:'none'.
function lastActiveSeg(mv) {
  for (let i = mv.segs.length - 1; i >= 0; i--) {
    const s = mv.segs[i];
    if (s.t === 'halt') continue;
    if (s.g === 'none') continue;
    if (s.t === 'grad' && s.g1 === 'none') continue;
    return i;
  }
  return -1;
}

// Gait a segment ends in (used to detect boundary transitions).
function segEndGait(seg) {
  if (seg.t === 'halt') return 'halt';
  if (seg.t === 'grad') return seg.g2;
  return seg.g || null;
}

// Determine phase for a segment within a movement.
// Movements containing an 'exit' step are the final active movements;
// segments after the halt in such movements are 'post-test'.
function segPhase(si, mv, def) {
  const hasExit = def && def.steps.some(s => s.type === 'exit');
  if (!hasExit) return 'test';
  const haltIdx = mv.segs.findIndex(s => s.t === 'halt');
  if (haltIdx < 0) return 'test';
  return si > haltIdx ? 'post-test' : 'test';
}

// Pre-resolve the first significant coaching context of movement nextMvI
// so that mv-preview events carry enough data for Layer 4 templating
// without re-traversal.
function resolveNextMvCtx(testMoves, reinTrace, nextMvI, testDefs) {
  if (nextMvI >= testMoves.length) return null;
  const mv  = testMoves[nextMvI];
  const def = testDefs ? testDefs[nextMvI] : null;

  // Build segI → step map so grad segments get coaching-zone markers
  // (step.between) rather than raw segment endpoints.
  const segToStep = {};
  if (def) {
    for (const entry of buildStepSegMap(def)) {
      for (let k = 0; k < entry.segCount; k++) segToStep[entry.segStart + k] = entry;
    }
  }

  const reBySegI = {};
  for (const row of reinTrace) {
    if (row.mvI !== nextMvI) continue;
    if (row.events.length) reBySegI[row.segI] = row.events;
  }

  for (let si = 0; si < mv.segs.length; si++) {
    const seg = mv.segs[si];
    if (seg.g === 'none') continue;
    if (seg.t === 'grad' && seg.g1 === 'none') continue;

    for (const ev of (reBySegI[si] || [])) {
      if (ev.type === 'rein-change') {
        // Movements with multiple rein-changes (loops = 2 soft; K→X→H = 2 hard)
        // cannot be summarised by naming only the first. Return null so the
        // preview falls back to nextMvLabel, which names the whole figure.
        const totalChanges = Object.values(reBySegI).flat()
          .filter(e => e.type === 'rein-change').length;
        if (totalChanges > 1) return null;
        return { type:'rein-change', from:ev.from, to:ev.to,
                 softness:ev.softness, atMarker:ev.atMarker };
      }
    }
    if (seg.t === 'grad' && seg.g1 !== seg.g2 && seg.g1 !== 'none') {
      const entry      = segToStep[si];
      const step       = entry ? entry.step : null;
      const fromMarker = (step && step.between) ? step.between[0]
                       : ptToMarker(seg.pts[0]);
      const toMarker   = (step && step.between) ? step.between[1]
                       : ptToMarker(seg.pts[seg.pts.length - 1]);
      return { type:'gait-transition', fromGait:seg.g1, toGait:seg.g2,
               style:'between', fromMarker, toMarker };
    }
    if (seg.t === 'circle') {
      return { type:'circle-entry', atMarker:circleAtMarker(seg),
               hand: seg.ccw ? 'left' : 'right' };
    }
    if (seg.t === 'halt') {
      return { type:'halt', atMarker:ptToMarker(seg.pt) };
    }
  }
  return null;
}

function generateEvents(testMoves, reinTrace, testDefs) {
  const events = [];

  // Index rein trace by "mvI.segI" for O(1) lookup
  const traceIdx = {};
  for (const row of reinTrace) traceIdx[`${row.mvI}.${row.segI}`] = row;

  for (let mvI = 0; mvI < testMoves.length; mvI++) {
    const mv  = testMoves[mvI];
    const def = testDefs ? testDefs[mvI] : null;

    // Build segIdx → stepEntry so grad events can read step.between
    const segToStep = {};
    if (def) {
      for (const entry of buildStepSegMap(def)) {
        for (let k = 0; k < entry.segCount; k++) {
          segToStep[entry.segStart + k] = entry;
        }
      }
    }

    for (let si = 0; si < mv.segs.length; si++) {
      const seg   = mv.segs[si];
      const row   = traceIdx[`${mvI}.${si}`];
      const phase = segPhase(si, mv, def);

      // Skip gait:'none' — no coaching for approach/exit path segments
      if (!row || row.rein === 'none') continue;

      // ── 1. Rein-change events from Layer 2 trace ──────────────
      for (const ev of (row.events || [])) {
        if (ev.type !== 'rein-change') continue;
        const atT = ev.tInSeg != null ? ev.tInSeg : 1.0;
        events.push({ type:'rein-change', mvI, atSeg:si, atT, phase,
          atMarker:ev.atMarker, from:ev.from, to:ev.to, softness:ev.softness });
      }

      // ── 2. Gait-transition: grad segment (between X and Y) ────
      if (seg.t === 'grad' && seg.g1 !== 'none' && seg.g2 !== 'none' && seg.g1 !== seg.g2) {
        const entry      = segToStep[si];
        const step       = entry ? entry.step : null;
        const fromMarker = (step && step.between) ? step.between[0]
                         : ptToMarker(seg.pts[0]);
        const toMarker   = (step && step.between) ? step.between[1]
                         : ptToMarker(seg.pts[seg.pts.length - 1]);
        events.push({ type:'gait-transition', mvI, atSeg:si, atT:seg.f, phase,
          atMarker:null, fromGait:seg.g1, toGait:seg.g2,
          style:'between', fromMarker, toMarker });
      }

      // ── 3. Gait-transition: segment boundary (at a marker) ────
      // Emit on the earlier segment (atT=1.0) when gait changes between
      // consecutive non-grad segments within the same movement.
      if (si > 0 && seg.t !== 'grad') {
        const prev     = mv.segs[si - 1];
        const prevGait = segEndGait(prev);
        const thisGait = segEndGait(seg);
        if (prevGait && thisGait
            && prevGait !== thisGait
            && prevGait !== 'none' && thisGait !== 'none'
            && prevGait !== 'halt') {
          const atMarker = (seg.pts ? ptToMarker(seg.pts[0]) : null)
                        || (seg.t === 'circle' ? circleAtMarker(seg) : null)
                        || (seg.t === 'halt'   ? ptToMarker(seg.pt)  : null);
          events.push({ type:'gait-transition', mvI, atSeg:si - 1, atT:1.0,
            phase: segPhase(si - 1, mv, def),
            atMarker, fromGait:prevGait, toGait:thisGait,
            style:'at', fromMarker:null, toMarker:null });
        }
      }

      // ── 4. Circle-entry ───────────────────────────────────────
      // Suppress if the previous segment is also a circle at the same centre
      // (splitcircle second half — continuation, not a new entry).
      if (seg.t === 'circle') {
        const prevSeg = si > 0 ? mv.segs[si - 1] : null;
        const isDuplicate = prevSeg && prevSeg.t === 'circle'
                         && prevSeg.cx === seg.cx && prevSeg.cy === seg.cy;
        if (!isDuplicate) {
          events.push({ type:'circle-entry', mvI, atSeg:si, atT:0, phase,
            atMarker:circleAtMarker(seg),
            hand: seg.ccw ? 'left' : 'right',
            rein: seg.ccw ? 'left' : 'right' });
        }
      }

      // ── 5. Halt ───────────────────────────────────────────────
      if (seg.t === 'halt') {
        events.push({ type:'halt', mvI, atSeg:si, atT:0, phase,
          atMarker:ptToMarker(seg.pt) });
      }
    }

    // ── 6. End-of-movement: mv-preview + coeff-banner ─────────
    // Skip approach movement (gait:'none') and the last movement.
    if (mv.gait === 'none') continue;
    const nextMv = testMoves[mvI + 1];
    if (!nextMv) continue;

    const lastSeg = lastActiveSeg(mv);
    if (lastSeg < 0) continue;

    events.push({ type:'mv-preview', mvI, atSeg:lastSeg, atT:1.0,
      atMarker:null, phase: segPhase(lastSeg, mv, def),
      nextMvI:   mvI + 1,
      nextMvN:   nextMv.n,
      nextMvLabel: nextMv.label,
      nextMvCoeff: nextMv.coeff,
      nextCtx: resolveNextMvCtx(testMoves, reinTrace, mvI + 1, testDefs) });

    if (nextMv.coeff > 1) {
      events.push({ type:'coeff-banner', mvI, atSeg:lastSeg, atT:1.0,
        atMarker:null, phase: segPhase(lastSeg, mv, def),
        nextMvI:mvI + 1, nextMvCoeff:nextMv.coeff });
    }
  }

  return events;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 4a — COMMAND COMPILER: events → Command[]
//
// Consumes the Layer 3 event stream and emits a flat Command[].
// Each Command is self-contained — Layer 4b needs nothing else.
//
// COMMAND SCHEMA — common fields on every command:
//   action       string        — command type (see below)
//   mvI          number        — movement index
//   atSeg        number        — segment index within mvI
//   atT          number        — 0=start · 1=end · 0<t<1=mid
//   dist         number        — metres before end of atSeg (Layer 5 fills; stub 0)
//   visibleUpTo  1|2|3         — highest level that renders this command
//   phase        'test'|'post-test'  — post-test → visibleUpTo capped at 1
//
// Action-specific fields:
//   change-rein    : from, to, softness, marker, loopPhase?
//   gait-transition: fromGait, toGait, style, marker?, fromMarker?, toMarker?
//   circle         : marker, hand, diameter, gait, sweep?, endMarker?
//   shorten-reins  : marker
//   halt           : marker
//   preview        : nextMvN, nextMvLabel, nextMvCoeff, nextCtx
//   coeff          : nextMvCoeff   (UI signal — renderCommand returns null)
// ═══════════════════════════════════════════════════════════════

const GAIT_LABEL = {
  trot:         'Working trot',
  canter:       'Working canter',
  walk:         'Medium walk',
  freewalk:     'Free walk on long rein',
  stretch_trot: 'Stretch trot (rising)',
};

function _capPhase(visibleUpTo, phase) {
  return phase === 'post-test' ? Math.min(visibleUpTo, 1) : visibleUpTo;
}

// End marker of a partial-sweep circle (half circles in EVB).
function halfCircleEndMarker(seg) {
  if ((seg.sweep || 360) >= 360) return null;
  const endAngle = (seg.startDeg + (seg.ccw ? seg.sweep : -seg.sweep)) * Math.PI / 180;
  return ptToMarker([seg.cx + seg.r * Math.cos(endAngle),
                     seg.cy + seg.r * Math.sin(endAngle)]);
}

function generateCommands(testMoves, events) {
  const commands = [];

  for (const ev of events) {
    const mv = testMoves[ev.mvI];

    switch (ev.type) {

      case 'rein-change': {
        const cmd = {
          action: 'change-rein',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: ev.atT, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(2, ev.phase),
          from: ev.from, to: ev.to, softness: ev.softness,
          marker: ev.atMarker || null,
        };
        if (ev.softness === 'soft')
          cmd.loopPhase = ev.atT <= 0.5 ? 'first' : 'second';
        commands.push(cmd);
        break;
      }

      case 'gait-transition': {
        if (ev.toGait === 'halt') break;  // halt command covers trot→halt
        commands.push({
          action: 'gait-transition',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: ev.atT, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(2, ev.phase),
          fromGait: ev.fromGait, toGait: ev.toGait, style: ev.style,
          marker:     ev.style === 'at'      ? (ev.atMarker   || null) : null,
          fromMarker: ev.style === 'between' ? (ev.fromMarker || null) : null,
          toMarker:   ev.style === 'between' ? (ev.toMarker   || null) : null,
        });
        break;
      }

      case 'circle-entry': {
        const seg       = mv.segs[ev.atSeg];
        const sweep     = seg.sweep || 360;
        const isStretch = seg.g === 'stretch';

        const circCmd = {
          action: 'circle',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: 0, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(3, ev.phase),
          marker: ev.atMarker,
          hand: ev.hand,
          diameter: 20,
          gait: isStretch ? 'stretch_trot' : seg.g,
        };
        if (sweep < 360) {
          circCmd.sweep     = sweep;
          circCmd.endMarker = halfCircleEndMarker(seg);
        }
        commands.push(circCmd);

        // Stretch circles emit a second command for the shorten-reins cue.
        // Fires at end of the same segment (atT:1.0) — L1 only.
        if (isStretch) {
          commands.push({
            action: 'shorten-reins',
            mvI: ev.mvI, atSeg: ev.atSeg, atT: 1.0, dist: 0,
            phase: ev.phase,
            visibleUpTo: _capPhase(1, ev.phase),
            marker: ev.atMarker,
          });
        }
        break;
      }

      case 'halt': {
        commands.push({
          action: 'halt',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: 0, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(3, ev.phase),
          marker: ev.atMarker || 'X',
        });
        break;
      }

      case 'mv-preview': {
        commands.push({
          action: 'preview',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: 1.0, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(3, ev.phase),
          nextMvN:     ev.nextMvN,
          nextMvLabel: ev.nextMvLabel,
          nextMvCoeff: ev.nextMvCoeff,
          nextCtx:     ev.nextCtx,
        });
        break;
      }

      case 'coeff-banner': {
        commands.push({
          action: 'coeff',
          mvI: ev.mvI, atSeg: ev.atSeg, atT: 1.0, dist: 0,
          phase: ev.phase,
          visibleUpTo: _capPhase(3, ev.phase),
          nextMvCoeff: ev.nextMvCoeff,
        });
        break;
      }
    }
  }

  return commands;
}

// ═══════════════════════════════════════════════════════════════
// LAYER 4b — RENDERER: Command × level → string|null
//
// Level semantics:
//   1 = beginner — every waypoint + scaffolding
//   2 = coach    — EA test sheet phrasing, no scaffolding
//   3 = advanced — circles, halt, preview only
//   4 = silent   — nothing (caller short-circuits before here)
//
// Returns null for: level >= 4, level > visibleUpTo,
// post-test at level > 1, or action === 'coeff' (UI signal only).
//
// REIN-CHANGE RENDERING RULE:
//   Hard changes: "Change rein at [marker]" — no destination named; rider
//     knows what rein follows from context. cmd.to is preserved on the
//     command for future voice profiles that may want to speak it.
//   Soft changes (loop): "Transition to [toRein] rein at [loopPhase]
//     quarterline" — destination named because the bend-change is abstract.
// ═══════════════════════════════════════════════════════════════

function renderCommand(cmd, level) {
  if (level >= 4)                             return null;
  if (level > cmd.visibleUpTo)                return null;
  if (cmd.phase === 'post-test' && level > 1) return null;

  switch (cmd.action) {

    case 'change-rein':
      if (cmd.softness === 'soft')
        return `Transition to ${cmd.to} rein at ${cmd.loopPhase} quarterline`;
      return `Change rein at ${cmd.marker}`;

    case 'gait-transition': {
      const label = GAIT_LABEL[cmd.toGait] || cmd.toGait;
      if (cmd.style === 'at') {
        if (!cmd.marker) return null;
        return `${label} at ${cmd.marker}`;
      }
      return `${label} between ${cmd.fromMarker} and ${cmd.toMarker}`;
    }

    case 'circle': {
      const isHalf    = cmd.sweep && cmd.sweep < 360;
      const isStretch = cmd.gait === 'stretch_trot';
      const prefix    = isStretch ? 'Stretch trot — ' : '';
      if (isHalf && cmd.endMarker)
        return `${prefix}Half ${cmd.diameter}m circle ${cmd.hand} — ${cmd.marker} to ${cmd.endMarker}`;
      return `${prefix}${cmd.diameter}m circle ${cmd.hand} at ${cmd.marker}`;
    }

    case 'shorten-reins':
      return 'Shorten reins';

    case 'halt':
      return `Halt and salute at ${cmd.marker}`;

    case 'preview': {
      const coeff  = cmd.nextMvCoeff > 1 ? ` ×${cmd.nextMvCoeff}` : '';
      const phrase = _renderNextCtx(cmd.nextCtx) || cmd.nextMvLabel;
      return `Then${coeff}: ${phrase}`;
    }

    case 'coeff':
      return null;

    default:
      return null;
  }
}

function _renderNextCtx(ctx) {
  if (!ctx) return null;
  switch (ctx.type) {
    case 'rein-change':
      // NOTE: the soft branch is currently unreachable — resolveNextMvCtx returns
      // null for any movement with multiple rein-changes (including all loops, which
      // always have two soft changes), so a soft ctx never reaches this renderer.
      // Left in place for future voice profiles or single-soft-change edge cases.
      if (ctx.softness === 'soft') return 'loop';
      return `change rein at ${ctx.atMarker}`;
    case 'gait-transition': {
      const label = (GAIT_LABEL[ctx.toGait] || ctx.toGait).toLowerCase();
      if (ctx.style === 'between')
        return `${label} between ${ctx.fromMarker} and ${ctx.toMarker}`;
      return `${label} at ${ctx.atMarker}`;
    }
    case 'circle-entry':
      return `20m circle ${ctx.hand} at ${ctx.atMarker}`;
    case 'halt':
      return `halt and salute at ${ctx.atMarker || 'X'}`;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS (for both Node test harness and browser inline use)
// ═══════════════════════════════════════════════════════════════
const PromptGenerator = {
  // Layer 1
  segDirection,
  polylineRein,
  bezierCurvatureFlips,
  turnDirection,
  // Layer 2
  walkRein,
  setMarkers,
  // Layer 3
  generateEvents,
  // Layer 4
  generateCommands,
  renderCommand,
  GAIT_LABEL,
  // Constants
  GSPEED_MPS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptGenerator;
}
if (typeof window !== 'undefined') {
  window.PromptGenerator = PromptGenerator;
}
