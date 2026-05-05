# EA Dressage Animator — Project Brief
**Current file:** `ea_dressage_v14.html` — single self-contained HTML file
**Plus:** `prompt-generator.js` (session 8, in progress) — auto-prompt generator
**Last updated:** Session 8 (Opus)
**Purpose:** Paste this into the first message of any new session alongside the HTML file.

---

## What This Is

An animated dressage test viewer for Equestrian Australia preliminary tests. A horse cursor travels a geometrically accurate path around a 60×20m (or 40×20m) arena. Three tests: Prelim 1.2, Prelim 1.3, Eventing Test B (EVB). Two purposes: (1) visual learning tool, (2) coaching prompt system that calls out instructions ahead of each movement.

---

## CONVENTIONS — LOCKED IN. DO NOT RE-DERIVE.

These conventions are domain truth. Re-checking them costs hours every session. Take them as given.

### Bird's Eye Direction → Rein

**Always view the arena from above (bird's eye). +y is up the page = north (toward C). +x is right = east (toward F/B/M wall).**

| Rein | Direction (bird's eye) |
|---|---|
| **Right rein** | **CW** (clockwise) |
| **Left rein** | **CCW** (counter-clockwise) |

These are not interchangeable, not invertible, not perspective-dependent. **Right = CW. Left = CCW. Always.**

### Rotation reference — there is no fixed reference point

The horse can rotate around ANY point — a marker, a corner, an implicit centre point. There is **no single reference point** like "the arena centre". The truth is **local curvature**: at every vertex of the path, compute the signed cross product of consecutive direction vectors. Positive = left turn = left rein. Negative = right turn = right rein.

Earlier sessions wrongly anchored on the arena centre (0, 30); that was scrapped. Local curvature is the only correct measure.

### Rein State (Carried)

- The rider has a rein at all times AFTER the test starts.
- **Null rein exists ONLY ONCE per test:** entering on the centreline, before the first turn at C.
- Once a rein is established (first turn at C), it is **always carried** until explicitly changed.
- A and C are NOT special cases. The rider passes through A and C ON THE REIN they had — A and C do not "re-null" anything.
- A path back over the centreline does NOT re-engage null rein.

### What Causes a Rein Change

1. **Hard turn at a vertex** (line→line, line→arc, arc→line). When the path bends at a vertex, compute the signed turn. If its sign opposes carried rein, that's a rein change at that vertex.
   - Single diagonal K→X→M: line is geometrically straight at X (cross=0). Turn happens at M (line→arc join). One rein change at M.
   - Same-wall figure K→X→H: two lines bent at X (cross≠0). Two rein changes — at X (going onto the second leg) AND at H (going onto the next corner arc).
2. **Curving segment with intrinsic rein opposite to carried.** E.g. a left circle when on right rein. Change happens at start of segment.
3. **Bezier loop (e.g. H→X→K).** Two SOFT rein changes at the first and second quarterlines (t=0.33 and t=0.67 along the curve). Net rein after a loop is the same as before. Quadratic beziers have constant geometric curvature, so these are emitted by convention, not detected from geometry.

### What Does NOT Cause a Rein Change

- Riding straight along a wall (carries rein).
- Centreline rides X→C, A→X (carries rein after the first one).
- Halts.
- Approach (gait:'none' before A) and exit (gait:'none' after halt) — these are skipped entirely.

---

## Architecture — Data Layer

### Translator Engine (Session 7)

Movement data is generated from compact test definitions via `translateTest()`. The hand-coded `MOVES_12`/`MOVES_13`/`MOVES_EVB` arrays are replaced by translator calls at page load.

**Boundary ring:** 14 waypoints in math-CW order. Direction is always explicit (`dir:1` or `dir:-1`) — no auto-shortest fallback. Collinear helper waypoints (BR, TL, BL, TR) are filtered; named markers (K, E, H, M, B, F) and reference points (Ao, Co) are always kept.

**Step types:** `approach` · `centreline` · `halt` · `boundary` · `diagonal` · `circle` · `transition` (grad) · `loop` (bezier) · `splitcircle` (developing trot→canter) · `exit` · `_arc_pts` · `_line_pts`

### Movement (Mv)
```js
{
  n: 3,             // movement number from test sheet
  label: 'K → X → M · change rein', // abbreviated, for sidebar
  desc: '...',      // readable explanation (not yet displayed in UI)
  raw: '',          // verbatim test sheet instruction (stub)
  gait: 'trot',     // primary gait
  coeff: 2,         // scoring coefficient (1 or 2)
  dir: '...',       // judge's directive
  prompts: [...],   // coaching callouts
  segs: [...],      // animation primitives
}
```

### Segment (Seg)
Types: `arc(pts,g)` · `line(pts,g)` · `circ(cx,cy,r,startDeg,ccw,g,sweep?)` · `grad(pts,g1,g2,f)` · `bezier(p0,ctrl,p2,g)` · `halt(pt)`

### Prompt (Pt)
Full schema: `{text, seg, dist, anchor?, pre?, level?}`

### Coaching Callout Structure
Every prompt follows: **WHERE** → **WHAT** → **HOW** → **WHERE TO**. Only prompt at waypoints where the rider needs to *do something*.

---

## Coordinate System

- A=[0,0], C=[0,60]. `OB=9.25` (boundary offset), `O=0.75` (fence offset)
- Named pts: `Ao=[0,0.75]` `Co=[0,59.25]` `Eo=[-9.25,30]` `Bo=[9.25,30]` `Fo=[9.25,6]` `Ko=[-9.25,6]` `Ho=[-9.25,54]` `Mo=[9.25,54]` `Xo=[0,30]`
- Corners: `BL=[-9.25,0.75]` `BR=[9.25,0.75]` `TL=[-9.25,59.25]` `TR=[9.25,59.25]`
- A approach pts: `AE=[0.75,0.75]` `AW=[-0.75,0.75]` `CS=[0,58.5]`
- AE/AW: centreline turn animation only, not boundary corner rounding.
- **Arena center: (0, 30)** for 60m arenas — reference point for rein detection.

---

## Prompt Generator (Session 8 — IN PROGRESS)

Standalone module: `prompt-generator.js`. Pure function: `(testDef, segs) → prompts[]`. No DOM, no globals, no animation state.

### Layered architecture
1. **Geometry** — `segDirection(seg) → {rein, flips, crossing}`. Per-segment intrinsic rein. Pure math.
2. **State** — `walkRein(testMoves) → trace[]`. Walks the test, carries rein, emits events: `rein-establish`, `rein-change` (softness: `hard|crossing|soft`).
3. **Events** *(not yet built)* — emit movement events: `mv-preview`, `transition`, `marker-arrival`, `coeff-banner`.
4. **Templates** *(not yet built)* — events × level → prompt text.
5. **Distance** *(not yet built)* — auto-calc `dist` from geometry + gait speed.

### Layer 2 status: VALIDATED against all 3 tests

**1.2 — all 4 crossings detected correctly.** One brief-table correction: Mv 12 is left→right (rider was on left from Mv 11), not right→left as the brief said.

**1.3 — detector reveals brief-table errors and adds correctness for K→X→H:**
- Mv 2 loop: detector emits 2 soft changes returning to left. (Brief was wrong: loops are transient.)
- Mv 5 diagonal: detector emits left→right at F. (Brief direction wrong.)
- Mv 7 K→X→H: detector emits TWO hard rein changes — at X (right→left) and at H (left→right). This matches dressage truth: the rider's body bends right turning toward X, reverses at X to bend left, reverses again at H to bend right for the corner. (Earlier session 8 thinking incorrectly had this as "no change" because it stayed on the same wall — that was wrong. Walls are not the reference; local curvature is.)
- Mv 8 loop: 2 soft changes returning to right. (Brief was wrong: loops are transient.)

**EVB — perfect match.** Single rein change at H from F→X→H diagonal.

### Layer 1 details: rein detection rules
- **Circle:** `seg.ccw=true` → left rein; `false` → right rein. (Standard convention: left circle is ridden CCW from above.)
- **Arc / grad:** local curvature. Sum signed cross products at interior vertices of the polyline. Net positive = left rein; net negative = right rein.
- **Line:** straight (intrinsic rein). Vertex turns within a multi-point line (K→X→H) and end-of-line turns into the next segment are detected by `walkRein` to fire rein-change events at the bend marker.
- **Bezier:** treated as loop. Emits 2 soft rein-change events at t=0.33 and t=0.67. Net rein unchanged.
- **Halt:** carries rein.
- **`gait: 'none'`:** skipped entirely (approach + exit segments).

### Layer 2 detection algorithm (vertex-turn based)
For each segment, in order:
1. If `bezier`: emit 2 soft rein changes (loop convention).
2. If `line`: scan internal vertices (cross product at each); at each vertex with a hard turn opposing carried rein, emit a rein-change. Also check the line's end-vertex by peeking at the next segment's start-tangent — if the join bends opposite to carried, emit at the line's end marker.
3. If `arc`/`grad`/`circle`: if intrinsic rein opposes carried, emit a rein-change at the segment start marker. If carried is null (test start), emit `rein-establish`.
4. If `halt`: carries rein.

### Test harness: `validate-rein.js` and `diff-vs-brief.js`
Run via `node validate-rein.js {1.2|1.3|EVB|all}` for full per-segment trace.
Run `node diff-vs-brief.js` for detector-vs-brief comparison summary.

### Files
- `prompt-generator.js` — the generator module
- `translator-shim.js` — Node-runnable extract of translator (DOM-stripped)
- `validate-rein.js` — full trace harness
- `diff-vs-brief.js` — comparison summary

---

## Test Status

| Test | Movements | Translator | Rein detection | Prompt Text | Tested |
|---|---|---|---|---|---|
| Prelim 1.2 | 17 | ✅ | ✅ all 4 changes detected | ⚠️ Needs SME review | v14 tested |
| Prelim 1.3 | 14 | ✅ | ✅ detector found 3 brief errors | ⚠️ Needs SME review | v14 tested |
| EVB | 15 | ✅ | ✅ perfect match | ⚠️ Needs SME review | v14 tested |

Coeff×2: 1.2→Mv3,4,8,9,12,13 · 1.3→Mv2,6,7,8,12 · EVB→none

---

## Known Issues / Next Priorities

1. **Soft-loop atMarker labels** — currently "first quarterline" / "second quarterline" as text. SIR/VLP marker names available but not yet wired in (these are 12m letters on the 60m arena long sides, only present in 60m). Need to handle 40m arena (no quarterline letters).
2. **Layer 3 — events** — emit movement-level events (mv-preview, transition, marker-arrival, coeff-banner). Should consume both rein-trace and test definition.
3. **Layer 4 — templates** — turn events into text. Architecture rules from session 7 (WHERE→WHAT→HOW→WHERE-TO). Drop "boundary"/"left lead" defaults.
4. **Layer 5 — auto-distance** — calc `dist` from segment length, gait speed, and event role (preview/transition/arrival). Default ≈ 2.5s lead time at gait pace, clamped to [4, 12]m.
5. **Difficulty levels** — emit all prompts tagged with `minLevel`; display layer filters. L1 beginner = every meaningful waypoint. L2 intermediate (current target) = coach-style. L3 advanced = one preview per movement.
6. **Brief table corrections** — already applied implicitly in this brief (the rein-change list in old brief had 4 errors that the detector caught). Don't re-add the old table.
7. **Rotational direction indicator (canvas)** — same `walkRein()` output drives both prompt-gen and the visual indicator. Build once.
8. **`raw:` field** — stub `—` everywhere. Populate from EA test sheets when convenient (now optional, since rein-change is geometric).
9. **`desc` field** — populated but not displayed. Wire into side panel.

---

## Session History

| Session | Key work |
|---|---|
| 1–3 | Initial build, path drawing, animation engine, proximity prompts (replaced) |
| 4 | Path-distance engine `{text,seg,dist}`, UX floating boxes, coeff visuals, transport fixes |
| 5 | `anchor` field, smart hold/crossfade, 1.2+1.3 fully prompted, text corrected, coeff banner, speed cursor fix, `rewindPrompts`, translation engine architecture |
| 6 (Opus) | Prompt engine v2 — pure function `evaluatePrompts()`, per-prompt fire tracking. 1.3 full audit. Coaching callout template. |
| 7 (Opus) | **Translator engine built.** Boundary ring + path resolver, step→segment translator, circle geometry, grad fraction calculator. Compact test definitions for all 3 tests. All directions explicit. Validated. |
| 8 (Opus) | **Prompt generator started.** Standalone module `prompt-generator.js`. Layers 1+2 built and validated against all 3 tests. **Conventions locked in (right rein = CW, left = CCW, bird's eye, local curvature only — no fixed reference point).** Vertex-turn algorithm handles single diagonals, gait-split diagonals, consecutive diagonals, K→X→H same-wall figures (correctly emits 2 hard rein changes at X and H), and loops (2 soft changes at quarterlines). **Detector found 4 errors in old brief's change-of-rein table** — corrected here. Layers 3-5 are next. |

---

## How to Keep Current

End of session: paste brief, ask "update project brief". Keep under 2 printed pages.
