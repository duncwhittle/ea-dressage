# EA Dressage Animator — Project Brief
**Current file:** `ea_dressage_v13.html` — single self-contained HTML file  
**Last updated:** Session 6 (Opus)  
**Purpose:** Paste this into the first message of any new session alongside the HTML file.

---

## What This Is

An animated dressage test viewer for Equestrian Australia preliminary tests. A horse cursor travels a geometrically accurate path around a 60×20m (or 40×20m) arena. Three tests: Prelim 1.2, Prelim 1.3, Eventing Test B (EVB). Two purposes: (1) visual learning tool, (2) coaching prompt system that calls out instructions ahead of each movement.

---

## Architecture — Data Layer

### Movement (Mv)
```js
{
  n: 3,             // movement number from test sheet
  label: 'K → X → M · change rein', // arrows always →
  raw: '',          // verbatim test sheet instruction (stub — not populated)
  gait: 'trot',     // primary gait
  coeff: 2,         // scoring coefficient (1 or 2)
  dir: '...',       // judge's directive
  prompts: [...],   // coaching callouts
  segs: [...],      // animation primitives
}
```

**Key principle:** One movement object per scored movement (as the judge sees it). Segments within a movement can be split freely at transition waypoints — segments are animation instructions, not test sheet items.

### Segment (Seg)
Types: `arc(pts,g)` · `line(pts,g)` · `circ(cx,cy,r,startDeg,ccw,g,sweep?)` · `grad(pts,g1,g2,f)` · `bezier(p0,ctrl,p2,g)` · `halt(pt)`

New segment types can be added (e.g. `serpentine`, `halfpass`). The contract: implement `segLenM()` for distance, `getSegPos(seg, progress)` for position, `drawSeg()` for rendering. The animation engine, prompt engine, and trail system work automatically.

**Segment splitting at waypoints:** When a transition happens at an intermediate marker (e.g. trot at X on diagonal H→X→F), split into two segments at the waypoint rather than using one long `grad`. This gives the prompt engine natural segment boundaries with predictable `dist` values. See 1.3 Mv5 as the reference implementation.

**`grad` segments and "between" transitions:** The fraction `f` controls where the gait colour changes. For two-point segments (E→K, B→F) `f:0.5` is correct. For longer segments passing through A (e.g. `[Ko,BL,Ao,BR,Fo]`), calculate the fraction where the midpoint of the "between" zone falls — typically `f:0.75` when A is the path midpoint and the transition is "between A and F/K".

### Prompt (Pt)
Full schema: `{text, seg, dist, anchor?, pre?, level?}`

| Field | Values | Meaning |
|---|---|---|
| `seg` | number | Index into this movement's `segs[]` |
| `dist` | number | Metres (meaning depends on anchor) |
| `anchor` | `'before_end'` (default) | Fires `dist` m before end of `segs[seg]` |
| `anchor` | `'at_start'` | Fires `dist` m after start of `segs[seg]` (0 = on entry) |
| `pre` | `true` | Fires from movement start; seals when horse passes seg 0 |
| `level` | `1/2/3` | Difficulty filter (stub — not yet wired to UI) |

### Coaching Callout Structure
Every prompt follows a template:
- **WHERE** it fires (before a marker — the rider's preparation point)
- **WHAT** changes — **AT** a marker or **BETWEEN** two markers
- **HOW** they ride it (shape/skill — circle, diagonal, loop, boundary)
- **WHERE TO** (destination marker)

Only prompt at waypoints where the rider needs to *do something*. Passing through X on a diagonal with no transition doesn't warrant a callout (but may at beginner difficulty level).

### Dist Guidelines
- Circles (~58m): 8–10m
- Short segs <15m: 6–8m
- Medium segs 15–40m: 8–10m
- Long segs >40m: calibrate to the coaching point, not the segment end. If the action happens at the midpoint, use `dist ≈ segLen/2 + 5`.

---

## Prompt Engine (v2 — Session 6 rewrite)

**Architecture:** Extracted as a pure function `evaluatePrompts(mv, sI, sP, now)` → `{text, opacity}`. No DOM access. Testable without a browser.

**Per-prompt fire tracking:** Each prompt has its own fire timestamp (`promptFireTimes[pi]`). Replaces the old single-slot model that caused race conditions.

**Latest-fired-wins:** Every frame, all non-sealed prompts are evaluated. The most recently fired prompt that's still within its hold window wins display. This fixes the bug where a held prompt blocked the next one.

**Hold:** `computeHoldMs(pi)` — `min(3000ms, gap to next prompt − 500ms)`. For `at_start` prompts, clamped to 80% of segment duration.

**Sealing:** `promptSealed[pi]` — set when hold+fade expires, or horse passes the prompt zone without it ever firing.

**Display bridge:** `displayPrompt(result)` handles all DOM updates — side panel + bubble.

**Coeff pre-warning:** Separate gold banner element (never competes with prompt box). Auto-fires at ≥85% of preceding movement. Same 3s hold/fade.

---

## Coordinate System

- A=[0,0], C=[0,60]. `OB=9.25` (boundary offset), `O=0.75` (fence offset)
- Named pts: `Ao=[0,0.75]` `Co=[0,59.25]` `Eo=[-9.25,30]` `Bo=[9.25,30]` `Fo=[9.25,6]` `Ko=[-9.25,6]` `Ho=[-9.25,54]` `Mo=[9.25,54]` `Xo=[0,30]`
- Corners: `BL=[-9.25,0.75]` `BR=[9.25,0.75]` `TL=[-9.25,59.25]` `TR=[9.25,59.25]`
- A approach pts: `AE=[0.75,0.75]` `AW=[-0.75,0.75]` `CS=[0,58.5]`

---

## Drawing Layer

```
drawSeg(seg, progress, alpha, pulse, now)   — pulse = mv.coeff (numeric)
drawHorse(pos, gait, coeff, now)            — coeff numeric, not boolean
drawCircleSegW(seg, progress, alpha, lw, color)  — color needed for gold pulse
```

**Coeff visuals:** Gold underlay 8px → gait colour 4px on top. Horse R=9px (normal 7px) + gold ring + ×N bubble above. Normal path 2.5px, trail 1.5px.

---

## UI

**Two draggable floating boxes** (handle bar to drag):
- **Bubble** — top-right of canvas. Mv info, coeff banner (gold, above prompt), prompt box, gait pills, directive
- **Controls** — below bubble, bottom-aligned with canvas. Transport, scrubbable progress bar, speed snaps (2×/8×) + slider, legend

**Side panel (fixed):** Movement info card + scrollable list.

**Transport:** All buttons preserve `isPlaying`. Mv‹‹/›› navigate movements (CD-player logic). Tr‹/› navigate segments. Speed change preserves cursor position.

---

## Test Status

| Test | Movements | Prompts | Text | Tested |
|---|---|---|---|---|
| Prelim 1.2 | 17 | All prompted | Corrected — Mv7 merged callout | ✅ Full pass |
| Prelim 1.3 | 14 | All prompted | Corrected — Mv3/9 grad fractions, Mv5 split at X, Mv6-12 text/dist | ✅ Full pass |
| EVB | 15 | All prompted | First-pass text | ✅ Tested 2× — timing good |

Coeff×2: 1.2→Mv3,4,8,9,12,13 · 1.3→Mv2,6,7,8,12 · EVB→none

---

## Known Issues / Next Priorities

1. **Translation engine** — not built. Architecture: Test→Mv→Sequence→Skills→Transitions→auto-prompts. Should auto-calculate `dist` from geometry and generate prompt text from the coaching template. Designed in session 5.
2. **`raw:` field** — stub `—` everywhere. Populate in translation engine session.
3. **Difficulty levels** — `level` on prompts (1/2/3), user filter. Beginner: prompt at every marker. Intermediate: transitions only. Advanced: previews only with longer holds. Deferred.
4. **EVB/1.3 label arrows** — some `–` remain, need `→`.
5. **Full-test scrub bar** — discussed, not built.
6. **Prompt text refinement** — 1.3 and EVB text is functional but needs coaching review. Build translator before hand-editing further.

---

## Development Workflow

**Source control:** GitHub repository (entry-level, established in session 5).

**Editing:** Claude Code (CLI) preferred for live file edits — `str_replace` on specific sections rather than regenerating the full file. File: single self-contained HTML.

**Testing:** Open HTML locally in browser. Test at 2× and 8× speed. Check prompt timing at segment boundaries and on long segments.

**Session handoff:** Paste this brief + current HTML file into first message of any new session.

---

## Testing Checklists

Files: `prompt_checklist.pdf` (EVB) · `prompt_checklist_1213.pdf` (1.2 + 1.3)  
Columns: Mv · Pt · Seg · Dist · Text · Early / Correct / Late / Absent / Flash / Hang  
Regenerate on request only.

---

## Session History

| Session | Key work |
|---|---|
| 1–3 | Initial build, path drawing, animation engine, proximity prompts (replaced) |
| 4 | Path-distance engine `{text,seg,dist}`, UX floating boxes, coeff visuals, transport fixes |
| 5 | `anchor` field (`before_end`/`at_start`), smart hold/crossfade, 1.2+1.3 fully prompted, text corrected, coeff banner separated, speed cursor fix, `rewindPrompts`, translation engine architecture |
| 6 (Opus) | **Prompt engine v2** — extracted as pure function `evaluatePrompts()`, per-prompt fire tracking, latest-fired-wins model. Fixed Mv7 mixed-anchor race condition. **1.2 Mv7** merged "shorten reins + working trot" callout. **1.3 full audit** — Mv3/Mv9 grad fractions fixed (0.5→0.75 for BETWEEN transitions through A), Mv5 diagonal split at X, Mv6-12 prompt text and dist values corrected, removed incorrect "change rein" references. **Architecture decisions:** segments split at transition waypoints, coaching callout template (WHERE/WHAT/HOW/WHERE TO), `grad` reserved for genuinely gradual transitions. Float box positioning refined. |

---

## How to Keep Current

End of session: paste brief, ask "update project brief". Keep under 2 printed pages.
