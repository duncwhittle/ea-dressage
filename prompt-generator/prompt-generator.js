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

function ptToMarker(pt) {
  if (!MARKERS_REF || !pt) return null;
  for (const [name, coord] of Object.entries(MARKERS_REF)) {
    if (Math.abs(coord[0] - pt[0]) < 0.5 && Math.abs(coord[1] - pt[1]) < 0.5) {
      return name;
    }
  }
  return null;
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
  // Constants
  GSPEED_MPS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptGenerator;
}
if (typeof window !== 'undefined') {
  window.PromptGenerator = PromptGenerator;
}
