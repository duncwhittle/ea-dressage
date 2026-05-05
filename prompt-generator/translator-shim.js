// AUTO-GENERATED Node shim — extracted from ea_dressage_v14.html
// Strips DOM dependencies so translator can run in Node.
// Used by prompt-generator test harness only.

let arenaLen = 60;  // default 60m arena for tests
const RENDER={
  offset:0.75,
  cornerRadius:{
    walk:0.75,freewalk:0.75,trot:0.75,
    canter:0.75,stretch:0.75,halt:0.75,none:0.75,
  },
  circleOffset:0.75,
  arenaWidth:20,
  circleRadius:{
    r20:10-0.75,   // 9.25 — 20m diameter circle
    r10:5-0.75,    // 4.25 — 10m diameter circle
    r5:2.5-0.75,   // 1.75 —  5m diameter circle
  },
};

// ═══════════════════════════════════════════════════
// COORDINATE SYSTEM
// Real world: A=(0,0) bottom, C=(0,60) top, 20m wide
// Left long side x=−10, Right x=+10
// Canvas Y flipped: canvasY = OY + (60−realY)*SC
// ═══════════════════════════════════════════════════
let SC=1,OX=0,OY=0;
function toC(x,y){return[OX+x*SC, OY+(arenaLen-y)*SC];}

// ─── KEY OFFSET COORDINATES ─────────────────────────
// All horse path coords — 0.75m inside boundary
// Boundary fence at x=±10, y=0, y=60
// Horse path at x=±9.25, y=0.75, y=59.25
const O=RENDER.offset;                       // offset from boundary (0.75)
const OB=RENDER.arenaWidth/2-RENDER.offset;  // offset boundary x   (9.25)

// Offset corner points of the horse path rectangle
const BL=[-OB, O];      // bottom-left
const BR=[ OB, O];      // bottom-right
const TL=[-OB, 60-O];   // top-left
const TR=[ OB, 60-O];   // top-right

// Offset A and C (on centreline, offset in Y only)
const Ao=[0, O];        // A offset  (0, 0.75)
const Co=[0, 60-O];     // C offset  (0, 59.25)

// Compass waypoints around A — for clean corner arcing at A
const AE=[ O,  O];      // A-East  (0.75, 0.75)  — right side approach to A
const AW=[-O,  O];      // A-West  (-0.75, 0.75) — left side approach to A
const AN=[ 0,  O*2];    // A-North (0, 1.5)       — departure north from A (direction hint)

// Compass waypoints around C — for clean corner arcing at C
const CE=[ O,  60-O];   // C-East  (0.75, 59.25)
const CW_=[-O, 60-O];   // C-West  (-0.75, 59.25) (CW_ to avoid clash with Math reserved names)
const CS=[ 0,  60-O*2]; // C-South (0, 58.5)       — departure south from C

// Named marker offset positions (on long sides, x already at ±9.25)
const Ko=[-OB, 6];
const Eo=[-OB, 30];
const Ho=[-OB, 54];
const Mo=[ OB, 54];
const Bo=[ OB, 30];
const Fo=[ OB, 6];
const Xo=[ 0,  30];

// Additional centreline markers
const Do=[ 0,  6];   // D — same Y as K and F
const Lo=[ 0,  18];  // L
const Io=[ 0,  42];  // I
const Go=[ 0,  54];  // G — same Y as H and M

// Additional long side markers
const Vo=[-OB, 18];  // V — left, 18m from A
const Po=[ OB, 18];  // P — right, 18m from A
const So=[-OB, 42];  // S — left, 42m from A
const Ro=[ OB, 42];  // R — right, 42m from A

// Display positions (on fence, for marker squares)
const FENCE={
  // Primary
  A:[0,0],K:[-10,6],E:[-10,30],H:[-10,54],
  C:[0,60],M:[10,54],B:[10,30],F:[10,6],
  // Secondary centreline
  X:[0,30],G:[0,54],I:[0,42],L:[0,18],D:[0,6],
  // Secondary long side
  V:[-10,18],S:[-10,42],R:[10,42],P:[10,18]
};

// ─── 40m ARENA OFFSET COORDINATES ───────────────────
// Same x-axis, C moves to y=40, H/M→y=34, E/B/X→y=20, K/F stay at y=6
const BL40=[-OB, O];    const BR40=[ OB, O];
const TL40=[-OB,40-O];  const TR40=[ OB,40-O];
const Ao40=[0,   O];    const Co40=[0,  40-O];
const AE40=[ O,  O];    const AW40=[-O,  O];
const CS40=[ 0, 40-O*2];
const Ko40=[-OB,  6];   const Fo40=[ OB,  6];
const Eo40=[-OB, 20];   const Bo40=[ OB, 20];
const Ho40=[-OB, 34];   const Mo40=[ OB, 34];
const Xo40=[ 0,  20];

const FENCE_40={
  A:[0,0],K:[-10,6],E:[-10,20],H:[-10,34],
  C:[0,40],M:[10,34],B:[10,20],F:[10,6],X:[0,20]
};

// ─── GAIT COLOURS & SPEEDS ──────────────────────────
const GC={
  trot:'#2563eb',canter:'#16a34a',walk:'#d97706',
  freewalk:'#ea580c',halt:'#db2777',stretch:'#7c3aed',none:'#aaa'
};
const GL={
  trot:'Working trot',canter:'Working canter',walk:'Medium walk',
  freewalk:'Free walk on long rein',halt:'Halt / Salute',
  stretch:'Stretch trot (rising)',none:'Approach'
};
const GS={trot:'trot',canter:'canter',walk:'walk',freewalk:'freewalk',halt:'halt',stretch:'stretch',none:'none'};
// m/s
const GSPEED={walk:1.111,freewalk:1.111,trot:2.222,canter:3.333,stretch:2.222,halt:0,none:1.5};

// ─── SEGMENT BUILDERS ───────────────────────────────
// arc: path with corner arcs (boundary riding)
// line: straight line (diagonals, centreline)
// grad: path that transitions gait colour along it (for "between" transitions)
// circle: parametric circle
// halt: pause at point

function arc(pts,g){return{t:'arc',pts,g};}
function line(pts,g){return{t:'line',pts,g};}
function grad(pts,g1,g2,f){return{t:'grad',pts,g1,g2,f};}
function circ(cx,cy,r,startDeg,ccw,g,sweep){return{t:'circle',cx,cy,r,startDeg,ccw,g,sweep:sweep||360};}
function halt(pt){return{t:'halt',pt};}
// Quadratic bezier: start, control, end — for smooth loops (H→K, M→F)
function bezier(start,ctrl,end,g){return{t:'bezier',pts:[start,ctrl,end],g};}


// ═══════════════════════════════════════════════════
// TRANSLATOR ENGINE
// Converts compact test definitions → full MOVES arrays
// ═══════════════════════════════════════════════════
const CIRCLE_R20 = RENDER.circleRadius.r20;
const MARKERS = {
  A:Ao, C:Co, X:Xo, K:Ko, E:Eo, H:Ho, M:Mo, B:Bo, F:Fo,
  D:Do, L:Lo, I:Io, G:Go, BL, BR, TL, TR, AE, AW, CS,
  A0:[0,0], START:[0,-5],
};

// ─── BOUNDARY RING ──────────────────────────────────────────
// Ring in math-CW order from bird's eye
// +1 = tracking left from A (K/E/H side first)
// -1 = tracking right from A (F/B/M side first)
// We use 'right'/'left' as direction to mean "go via right/left side of arena"

const RING = [
  ['Ao',Ao,1],['AE',AE,0],['BR',BR,0],['F',Fo,1],['B',Bo,1],['M',Mo,1],['TR',TR,0],
  ['Co',Co,1],['TL',TL,0],['H',Ho,1],['E',Eo,1],['K',Ko,1],['BL',BL,0],['AW',AW,0],
];
// 3rd element: 1 = always keep in path, 0 = drop if collinear with neighbours
// Ao/Co kept because they're reference points for "between A/C and X" transitions
// Going from Ao +1: AE→BR→F→B→M→TR→Co = right side ✓
// Going from Ao -1: AW→BL→K→E→H→TL→Co = left side ✓
// Going from Co +1: TL→H→E→K = left side (from rider perspective at C)
// Going from Co -1: TR→M→B→F = right side (from rider perspective at C)
//
// So: from bottom half (near A), "right side" = +1 direction
//     from top half (near C), "right side" = -1 direction
//
const RI = {};
RING.forEach(([n],i)=>RI[n]=i);
const TO_RING = {A:'Ao',C:'Co',K:'K',E:'E',H:'H',M:'M',B:'B',F:'F',
  BL:'BL',BR:'BR',TL:'TL',TR:'TR',AE:'AE',AW:'AW'};
const VIRTUAL = { CS:{coord:CS,ringNode:'Co'} };

function boundaryPath(from,to,dir){
  const fv=VIRTUAL[from], tv=VIRTUAL[to];
  const fr=fv?fv.ringNode:TO_RING[from], tr=tv?tv.ringNode:TO_RING[to];
  if(!fr||!tr) throw new Error(`boundaryPath: unknown "${from}" or "${to}"`);
  const fi=RI[fr], ti=RI[tr], N=RING.length;
  const plusDist=(ti-fi+N)%N;
  const minusDist=(fi-ti+N)%N;
  // dir: 1 = go +1 in ring, -1 = go -1 in ring
  // Direction is always explicit — no auto-shortest fallback
  let goPlus;
  if(dir===1) goPlus=true;
  else if(dir===-1) goPlus=false;
  else throw new Error(`boundaryPath ${from}→${to}: dir must be 1 or -1, got ${dir}`);
  const steps=goPlus?plusDist:minusDist;
  const raw=[];   // [{pt, keep}]
  for(let i=0;i<=steps;i++){
    const idx=goPlus?(fi+i)%N:(fi-i+N)%N;
    raw.push({pt:RING[idx][1], keep:!!RING[idx][2]});
  }
  if(fv) raw.unshift({pt:fv.coord, keep:false});
  if(tv) raw.push({pt:tv.coord, keep:false});
  // Filter: drop helper points (keep=false) that are collinear with neighbours
  return filterHelpers(raw);
}

function filterHelpers(items){
  if(items.length<=2) return items.map(i=>i.pt);
  const out=[items[0].pt];
  for(let i=1;i<items.length-1;i++){
    if(items[i].keep){ out.push(items[i].pt); continue; }
    // Helper point — check collinearity
    const p=items[i-1].pt, c=items[i].pt, n=items[i+1].pt;
    const cross=(c[0]-p[0])*(n[1]-p[1])-(c[1]-p[1])*(n[0]-p[0]);
    if(Math.abs(cross)>0.001) out.push(c); // keep if not collinear
  }
  out.push(items[items.length-1].pt);
  return out;
}

// ─── CIRCLE GEOMETRY ────────────────────────────────────────
const CIRC_DEF = {
  E:{cx:0,cy:30,sd:180}, B:{cx:0,cy:30,sd:0},
  A:{cx:0,cy:10,sd:270}, C:{cx:0,cy:50,sd:90},
};
function makeCircle(mk,hand,gait,sweep){
  const d=CIRC_DEF[mk]; if(!d) throw new Error(`No circle for "${mk}"`);
  return circ(d.cx,d.cy,CIRCLE_R20,d.sd,hand==='left',gait,sweep||360);
}

// ─── GRAD FRACTION ──────────────────────────────────────────
function ptsEq(a,b){return Math.abs(a[0]-b[0])<0.01&&Math.abs(a[1]-b[1])<0.01;}
function calcGradF(pts,bStart,bEnd){
  const sc=MARKERS[bStart], ec=MARKERS[bEnd];
  let si=-1,ei=-1;
  for(let i=0;i<pts.length;i++){
    if(ptsEq(pts[i],sc)) si=i;
    if(ptsEq(pts[i],ec)) ei=i;
  }
  if(si===-1||ei===-1) return 0.5;
  return ((si+ei)/2)/(pts.length-1);
}

// ─── STEP → SEGMENTS ───────────────────────────────────────
function translateStep(step){
  switch(step.type){
    case 'approach': return [line([[0,-5],[0,0]],'none')];
    case 'centreline': return [line([MARKERS[step.from],MARKERS[step.to]],step.gait)];
    case 'halt': return [halt(MARKERS[step.at])];
    case 'boundary': return [arc(boundaryPath(step.from,step.to,step.dir),step.gait)];
    case 'diagonal': {
      const pts=[MARKERS[step.from]];
      if(step.via)(Array.isArray(step.via)?step.via:[step.via]).forEach(v=>pts.push(MARKERS[v]));
      else if(step.throughX!==false) pts.push(Xo);
      pts.push(MARKERS[step.to]);
      return [line(pts,step.gait)];
    }
    case 'circle': return [makeCircle(step.at,step.hand,step.gait,step.sweep)];
    case 'transition': {
      const pts=boundaryPath(step.from,step.to,step.dir);
      return [grad(pts,step.fromGait,step.toGait,calcGradF(pts,step.between[0],step.between[1]))];
    }
    case '_arc_pts': {
      const pts = step.pts.map(m => MARKERS[m]);
      return [arc(pts, step.gait)];
    }

    case '_line_pts': {
      const pts = step.pts.map(m => MARKERS[m]);
      return [line(pts, step.gait)];
    }

    case 'loop': {
      // Bezier loop: from→ctrl→to (e.g. H→B→K for a loop from H to K via B)
      return [bezier(MARKERS[step.from], MARKERS[step.ctrl], MARKERS[step.to], step.gait)];
    }

    case 'splitcircle': {
      // Two half-circles at same marker with different gaits (developing transition)
      // e.g. trot first half, canter second half
      const def = CIRC_DEF[step.at]; if(!def) throw new Error(`No circle for "${step.at}"`);
      const ccw = step.hand === 'left';
      const s1 = circ(def.cx, def.cy, CIRCLE_R20, def.sd, ccw, step.gait1, 180);
      // Second half starts 180° from first
      const sd2 = (def.sd + (ccw ? 180 : -180) + 360) % 360;
      const s2 = circ(def.cx, def.cy, CIRCLE_R20, sd2, ccw, step.gait2, 180);
      return [s1, s2];
    }

    case 'exit': {
      const d=step.dir||'cw', segs=[];
      segs.push(line([[0,30],CS],'walk'));
      if(d==='cw'){
        segs.push(arc(boundaryPath('CS','AE',-1),'walk'));
        segs.push(line([AE,[0,0],[0,-5]],'none'));
      } else {
        segs.push(arc(boundaryPath('CS','AW',1),'walk'));
        segs.push(line([AW,[0,0],[0,-5]],'none'));
      }
      return segs;
    }
    default: throw new Error(`Unknown step: ${step.type}`);
  }
}

function translateMovement(def){
  const segs=[];
  for(const step of def.steps) segs.push(...translateStep(step));
  return {n:def.n,label:def.label,desc:def.desc||'',raw:def.raw||'—',
    gait:def.gait,coeff:def.coeff||1,dir:def.dir||'',prompts:def.prompts||[],segs};
}
function translateTest(defs){return defs.map(translateMovement);}

// ═══════════════════════════════════════════════════════════════
// TEST DEFINITION: PRELIMINARY 1.2
// ═══════════════════════════════════════════════════════════════
const TEST_12_DEF = [
  {n:0,label:'Approach',gait:'none',coeff:1,dir:'',
   steps:[{type:'approach'}],
   prompts:[{text:'Enter at A — working trot up the centreline to X, halt and salute',seg:0,dist:5,pre:true}]},

  {n:1,label:'A → X · Halt, salute',gait:'trot',coeff:1,
   dir:'Regularity and quality of trot; willing, calm transitions; straightness; attentiveness; immobility (min. 3 seconds).',
   steps:[{type:'centreline',from:'A0',to:'X',gait:'trot'},{type:'halt',at:'X'}],
   prompts:[{text:'Halt and salute at X',seg:0,dist:6}]},

  {n:2,label:'C → M → B · circle right 20m · B → F → A → K',gait:'trot',coeff:1,
   dir:'Regularity and quality of trot; shape and size of circle; bend; balance.',
   steps:[
     {type:'centreline',from:'X',to:'CS',gait:'trot'},
     {type:'boundary',from:'CS',to:'B',gait:'trot',dir:-1},
     {type:'circle',at:'B',hand:'right',gait:'trot'},
     {type:'boundary',from:'B',to:'K',gait:'trot',dir:-1},
   ],
   prompts:[
     {text:'Track right at C — boundary to M then B',seg:0,dist:8},
     {text:'Circle right 20m at B',seg:1,dist:10},
     {text:'Continue boundary B → F → A to K',seg:2,dist:10},
     {text:'Diagonal K → X → M — change rein at M',seg:3,dist:10},
   ]},

  {n:3,label:'K → X → M · change rein at M · M → C',gait:'trot',coeff:2,
   dir:'Regularity and quality of trot; straightness; bend and balance in corner.',
   steps:[
     {type:'diagonal',from:'K',to:'M',gait:'trot'},
     {type:'boundary',from:'M',to:'C',gait:'trot',dir:1},
   ],
   prompts:[
     {text:'Change rein at M — prepare',seg:0,dist:8},
     {text:'Canter transition between C and H — left lead',seg:1,dist:8},
   ]},

  {n:4,label:'Between C & H · canter left · H → E',gait:'canter',coeff:2,
   dir:'Willing, calm transition; regularity and quality of canter; bend and balance in corner; straightness.',
   steps:[
     {type:'transition',from:'C',to:'H',fromGait:'trot',toGait:'canter',between:['C','H'],dir:1},
     {type:'boundary',from:'H',to:'E',gait:'canter',dir:1},
   ],
   prompts:[
     {text:'Canter left between C and H — continue to E',seg:0,dist:6},
     {text:'20m circle left at E',seg:1,dist:10},
   ]},

  {n:5,label:'E · 20m circle left',gait:'canter',coeff:1,
   dir:'Regularity and quality of canter; shape and size of circle; bend; balance.',
   steps:[{type:'circle',at:'E',hand:'left',gait:'canter'}],
   prompts:[{text:'Trot transition between E and K — continue to A',seg:0,dist:10}]},

  {n:6,label:'Between E & K · working trot · K → A',gait:'trot',coeff:1,
   dir:'Willing, calm transition; regularity and quality of trot; straightness, bend and balance in corner.',
   steps:[
     {type:'transition',from:'E',to:'K',fromGait:'canter',toGait:'trot',between:['E','K'],dir:1},
     {type:'boundary',from:'K',to:'AW',gait:'trot',dir:1},
   ],
   prompts:[{text:'20m stretch trot circle at A — shorten reins on return',seg:1,dist:8}]},

  {n:7,label:'A · 20m circle left (stretch) · A → F',gait:'stretch',coeff:1,
   dir:'Forward and downward stretch over the back into a light contact; bend; shape and size of circle; willing, calm transitions.',
   steps:[
     {type:'circle',at:'A',hand:'left',gait:'stretch'},
     {type:'boundary',from:'AE',to:'F',gait:'trot',dir:1},
   ],
   prompts:[
     {text:'Shorten reins — working trot at A to F',seg:0,dist:8},
     {text:'Medium walk transition at F',seg:1,dist:6},
   ]},

  {n:8,label:'F · medium walk · diagonal F → E',gait:'walk',coeff:2,
   dir:'Willing, calm transition; regularity and quality of walk.',
   steps:[{type:'diagonal',from:'F',to:'E',gait:'walk',throughX:false}],
   prompts:[{text:'Change rein at E — free walk E → M',seg:0,dist:8}]},

  {n:9,label:'E · change rein · free walk E → M · medium walk M → C',gait:'freewalk',coeff:2,
   dir:'Regularity and quality of walks; reach, overtrack and ground cover; straightness; clear, balanced transitions.',
   steps:[
     {type:'diagonal',from:'E',to:'M',gait:'freewalk',throughX:false},
     {type:'boundary',from:'M',to:'C',gait:'walk',dir:1},
   ],
   prompts:[
     {text:'Change rein at M — medium walk to C',seg:0,dist:8},
     {text:'Working trot at C — boundary C → H → E',seg:1,dist:8},
   ]},

  {n:10,label:'C · working trot · C → H → E',gait:'trot',coeff:1,
   dir:'Willing, calm transition; regularity and quality of trot; bend and balance in corner; straightness.',
   steps:[{type:'boundary',from:'C',to:'E',gait:'trot',dir:1}],
   prompts:[{text:'20m circle left at E — continue E → K → A → F',seg:0,dist:8}]},

  {n:11,label:'E · 20m circle left · E → K → A → F',gait:'trot',coeff:1,
   dir:'Regularity and quality of trot; shape and size of circle; bend; balance.',
   steps:[
     {type:'circle',at:'E',hand:'left',gait:'trot'},
     {type:'boundary',from:'E',to:'F',gait:'trot',dir:1},
   ],
   prompts:[
     {text:'Continue boundary E → K → A → F',seg:0,dist:10},
     {text:'Diagonal F → X → H — change rein at H',seg:1,dist:10},
   ]},

  {n:12,label:'F → X → H · change rein at H · H → C',gait:'trot',coeff:2,
   dir:'Regularity and quality of trot; straightness; bend and balance in corner.',
   steps:[
     {type:'diagonal',from:'F',to:'H',gait:'trot'},
     {type:'boundary',from:'H',to:'C',gait:'trot',dir:-1},
   ],
   prompts:[
     {text:'Change rein at H — prepare',seg:0,dist:8},
     {text:'Canter transition between C and M — right lead',seg:1,dist:8},
   ]},

  {n:13,label:'Between C & M · canter right · M → B',gait:'canter',coeff:2,
   dir:'Willing, calm transition; regularity and quality of canter; bend and balance in corner; straightness.',
   steps:[
     {type:'transition',from:'C',to:'M',fromGait:'trot',toGait:'canter',between:['C','M'],dir:-1},
     {type:'boundary',from:'M',to:'B',gait:'canter',dir:-1},
   ],
   prompts:[
     {text:'Canter right between C and M — continue to B',seg:0,dist:6},
     {text:'20m circle right at B',seg:1,dist:10},
   ]},

  {n:14,label:'B · 20m circle right',gait:'canter',coeff:1,
   dir:'Regularity and quality of canter; shape and size of circle; bend; balance.',
   steps:[{type:'circle',at:'B',hand:'right',gait:'canter'}],
   prompts:[{text:'Trot transition between B and F — continue to A',seg:0,dist:10}]},

  {n:15,label:'Between B & F · working trot · F → A',gait:'trot',coeff:1,
   dir:'Willing, calm transition; regularity and quality of trot; straightness, bend and balance in corner.',
   steps:[
     {type:'transition',from:'B',to:'F',fromGait:'canter',toGait:'trot',between:['B','F'],dir:-1},
     {type:'boundary',from:'F',to:'AE',gait:'trot',dir:-1},
   ],
   prompts:[
     {text:'Working trot between B and F — continue to A',seg:0,dist:8},
     {text:'Turn up centreline at A — halt and salute at X',seg:1,dist:8},
   ]},

  {n:16,label:'A → X · Halt, salute · Exit CW',gait:'halt',coeff:1,
   dir:'Bend and balance in turn; regularity and quality of trot; willing, calm transition; straightness; immobility.',
   steps:[
     {type:'_arc_pts',pts:['AE','A','X'],gait:'trot'},
     {type:'halt',at:'X'},
     {type:'exit',dir:'cw'},
   ],
   prompts:[
     {text:'Halt and salute at X',seg:0,dist:6},
     {text:'Walk to C — track right, exit CW on long rein',seg:1,dist:2},
   ]},
];

// ═══════════════════════════════════════════════════════════════
// TEST DEFINITION: PRELIMINARY 1.3
// ═══════════════════════════════════════════════════════════════
const TEST_13_DEF = [
  {n:0,label:'Approach',gait:'none',coeff:1,dir:'',
   steps:[{type:'approach'}],
   prompts:[{text:'Enter at A — working trot up the centreline to X, halt and salute',seg:0,dist:5,pre:true}]},

  {n:1,label:'A → X · Halt, salute',gait:'trot',coeff:1,
   dir:'Regularity and quality of trot; willing, calm transitions; straightness; attentiveness; immobility (min. 3 seconds).',
   steps:[{type:'centreline',from:'A0',to:'X',gait:'trot'},{type:'halt',at:'X'}],
   prompts:[
     {text:'Halt and salute at X — then working trot to C, track left',seg:0,dist:10},
     {text:'Next is ×2 — working trot C → H, loop H to K',seg:0,dist:6},
   ]},

  {n:2,label:'C → H · loop H → K',gait:'trot',coeff:2,
   dir:'Regularity and quality of trot; changes of bend; shape of loop; balance.',
   steps:[
     {type:'centreline',from:'X',to:'CS',gait:'trot'},
     {type:'boundary',from:'CS',to:'H',gait:'trot',dir:1},
     {type:'loop',from:'H',ctrl:'B',to:'K',gait:'trot'},
   ],
   prompts:[
     {text:'Track left at C — boundary to H',seg:0,dist:10},
     {text:'Loop from H to K',seg:1,dist:8},
     {text:'Canter transition between A and F — continue to B',seg:2,dist:10},
   ]},

  {n:3,label:'Between A & F · canter left · F → B',gait:'canter',coeff:1,
   dir:'Willing, calm transition; regularity and quality of canter; bend and balance in corner; straightness.',
   steps:[
     {type:'transition',from:'K',to:'F',fromGait:'trot',toGait:'canter',between:['A','F'],dir:1},
     {type:'boundary',from:'F',to:'B',gait:'canter',dir:1},
   ],
   prompts:[
     {text:'Canter left between A and F — continue to B',seg:0,dist:10},
     {text:'20m circle left at B',seg:1,dist:10},
   ]},

  {n:4,label:'B · 20m circle left · B → M→C',gait:'canter',coeff:1,
   dir:'Regularity and quality of canter; shape and size of circle; bend; balance.',
   steps:[
     {type:'circle',at:'B',hand:'left',gait:'canter'},
     {type:'boundary',from:'B',to:'C',gait:'canter',dir:1},
   ],
   prompts:[
     {text:'Continue boundary B→M to C',seg:0,dist:10},
     {text:'Boundary C→H — diagonal H→X→F, trot transition at X',seg:1,dist:10},
   ]},

  {n:5,label:'C → H · diagonal H → X→F',gait:'canter',coeff:1,
   dir:'Regularity and quality of canter; straightness; willing, calm transition.',
   steps:[
     {type:'boundary',from:'C',to:'H',gait:'canter',dir:1},
     {type:'centreline',from:'H',to:'X',gait:'canter'},
     {type:'centreline',from:'X',to:'F',gait:'trot'},
   ],
   prompts:[
     {text:'Diagonal H → X → F — trot transition at X',seg:0,dist:8},
     {text:'Trot at X — continue to F',seg:1,dist:8},
     {text:'Medium walk at A',seg:2,dist:8},
   ]},

  {n:6,label:'F → A (trot) · A → K (walk)',gait:'walk',coeff:2,
   dir:'Willing, calm transition; regularity and quality of walk.',
   steps:[
     {type:'boundary',from:'F',to:'A',gait:'trot',dir:-1},
     {type:'boundary',from:'A',to:'K',gait:'walk',dir:-1},
   ],
   prompts:[
     {text:'Medium walk at A — continue to K',seg:0,dist:8},
     {text:'Free walk K → X → H',seg:1,dist:8},
   ]},

  {n:7,label:'K → X→H · free walk · H→C',gait:'freewalk',coeff:2,
   dir:'Regularity and quality of walks; reach, overtrack and ground cover; straightness; clear, balanced transitions.',
   steps:[
     {type:'centreline',from:'K',to:'X',gait:'freewalk'},
     {type:'centreline',from:'X',to:'H',gait:'freewalk'},
     {type:'boundary',from:'H',to:'C',gait:'walk',dir:-1},
   ],
   prompts:[
     {text:'Free walk — continuing to H',seg:0,dist:8},
     {text:'Medium walk at H to C',seg:1,dist:8},
     {text:'Working trot at C — loop M to F',seg:2,dist:8},
   ]},

  {n:8,label:'C → M · loop M → X→F',gait:'trot',coeff:2,
   dir:'Regularity and quality of trot; changes of bend; shape of loop; balance.',
   steps:[
     {type:'boundary',from:'C',to:'M',gait:'trot',dir:-1},
     {type:'loop',from:'M',ctrl:'E',to:'F',gait:'trot'},
   ],
   prompts:[
     {text:'Working trot to M — loop M to F',seg:0,dist:8},
     {text:'Canter right between A and K',seg:1,dist:10},
   ]},

  {n:9,label:'Between A & K · canter right · K → E',gait:'canter',coeff:1,
   dir:'Willing, calm transition; regularity and quality of canter; bend and balance in corner; straightness.',
   steps:[
     {type:'transition',from:'F',to:'K',fromGait:'trot',toGait:'canter',between:['A','K'],dir:-1},
     {type:'boundary',from:'K',to:'E',gait:'canter',dir:-1},
   ],
   prompts:[
     {text:'Canter right between A and K — continue to E',seg:0,dist:10},
     {text:'20m circle right at E',seg:1,dist:10},
   ]},

  {n:10,label:'E · 20m circle right · E → H→C',gait:'canter',coeff:1,
   dir:'Regularity and quality of canter; shape and size of circle; bend; balance.',
   steps:[
     {type:'circle',at:'E',hand:'right',gait:'canter'},
     {type:'boundary',from:'E',to:'C',gait:'canter',dir:-1},
   ],
   prompts:[
     {text:'Continue boundary E → H to C',seg:0,dist:10},
     {text:'Working trot at C — boundary to B',seg:1,dist:10},
   ]},

  {n:11,label:'C → M → B · working trot',gait:'trot',coeff:1,
   dir:'Willing, calm transition; regularity and quality of trot; bend and balance in corner; straightness.',
   steps:[{type:'boundary',from:'C',to:'B',gait:'trot',dir:-1}],
   prompts:[{text:'Stretch trot circle right at B — shorten reins on return',seg:0,dist:10}]},

  {n:12,label:'B · 20m circle right (stretch) · B → F→A',gait:'stretch',coeff:2,
   dir:'Forward and downward stretch over the back into a light contact; bend; shape and size of circle; willing, calm transitions.',
   steps:[
     {type:'circle',at:'B',hand:'right',gait:'stretch'},
     {type:'boundary',from:'B',to:'A',gait:'trot',dir:-1},
   ],
   prompts:[
     {text:'Shorten reins — working trot at B to A',seg:0,dist:8},
     {text:'Turn up centreline — halt and salute at X',seg:1,dist:10},
   ]},

  {n:13,label:'A → X · Halt, salute · Exit CCW',gait:'halt',coeff:1,
   dir:'Bend and balance in turn; regularity and quality of trot; willing, calm transition; straightness; immobility.',
   steps:[
     {type:'_arc_pts',pts:['AE','A','X'],gait:'trot'},
     {type:'halt',at:'X'},
     {type:'exit',dir:'ccw'},
   ],
   prompts:[
     {text:'Halt and salute at X',seg:0,dist:6},
     {text:'Walk to C — track left, exit CCW on long rein',seg:1,dist:2},
   ]},
];

// ═══════════════════════════════════════════════════════════════
// TEST DEFINITION: EVENTING TEST B
// ═══════════════════════════════════════════════════════════════
const TEST_EVB_DEF = [
  {n:0,label:'Approach',gait:'none',coeff:1,dir:'',
   steps:[{type:'_line_pts',pts:['START','A'],gait:'none'}],
   prompts:[{text:'Enter at A — working trot up the centreline to C',seg:0,dist:5,pre:true}]},

  {n:1,label:'A → C · working trot',gait:'trot',coeff:1,
   dir:'Straightness on centreline, regularity and quality of trot.',
   steps:[{type:'_line_pts',pts:['A0','X','C'],gait:'trot'}],
   prompts:[{text:'Track left at C — boundary to E',seg:0,dist:8}]},

  {n:2,label:'C → H → E · circle left 20m · E → K → A',gait:'trot',coeff:1,
   dir:'Quality and regularity of trot, bend, balance and shape of circle.',
   steps:[
     {type:'boundary',from:'C',to:'E',gait:'trot',dir:1},
     {type:'circle',at:'E',hand:'left',gait:'trot'},
     {type:'boundary',from:'E',to:'A',gait:'trot',dir:1},
   ],
   prompts:[
     {text:'Circle left 20m at E',seg:0,dist:8},
     {text:'Continue on boundary to A',seg:1,dist:10},
     {text:'At A — circle left, developing canter in second half',seg:2,dist:12},
   ]},

  {n:3,label:'A · circle left (trot→canter) · A→F→B',gait:'canter',coeff:1,
   dir:'Quality of trot and canter, willing transition, shape of circle.',
   steps:[
     {type:'splitcircle',at:'A',hand:'left',gait1:'trot',gait2:'canter'},
     {type:'boundary',from:'A',to:'B',gait:'canter',dir:1},
   ],
   prompts:[
     {text:'Developing canter — second half of circle',seg:0,dist:8},
     {text:'Continue on boundary to B',seg:1,dist:7},
     {text:'Half 20m circle left — B to E',seg:2,dist:8},
   ]},

  {n:4,label:'B → E · half circle left',gait:'canter',coeff:1,
   dir:'Quality and regularity of canter, bend, balance, shape of half circle.',
   steps:[{type:'circle',at:'B',hand:'left',gait:'canter',sweep:180}],
   prompts:[{text:'Trot transition between E and K',seg:0,dist:10}]},

  {n:5,label:'Between E & K · working trot',gait:'trot',coeff:1,
   dir:'Willing transition, quality of canter and trot.',
   steps:[{type:'transition',from:'E',to:'K',fromGait:'canter',toGait:'trot',between:['E','K'],dir:1}],
   prompts:[{text:'Working trot — medium walk at A',seg:0,dist:6}]},

  {n:6,label:'K → A · working trot → walk at A',gait:'trot',coeff:1,
   dir:'Quality of trot, willing transition.',
   steps:[{type:'boundary',from:'K',to:'A',gait:'trot',dir:1}],
   prompts:[{text:'Medium walk to F',seg:0,dist:8}]},

  {n:7,label:'A → F · medium walk',gait:'walk',coeff:1,
   dir:'Calm transition, regularity and quality of walk.',
   steps:[{type:'boundary',from:'A',to:'F',gait:'walk',dir:1}],
   prompts:[{text:'Free walk on long rein — F through X to H, then medium walk to C',seg:0,dist:10}]},

  {n:8,label:'F → X→H · free walk · H→C · medium walk',gait:'freewalk',coeff:1,
   dir:'Quality of walk, horse stretches forward and downward.',
   steps:[
     {type:'diagonal',from:'F',to:'H',gait:'freewalk'},
     {type:'boundary',from:'H',to:'C',gait:'walk',dir:-1},
   ],
   prompts:[
     {text:'Medium walk from H to C',seg:0,dist:8},
     {text:'Working trot at C — boundary to B',seg:1,dist:8},
   ]},

  {n:9,label:'C → M → B · working trot',gait:'trot',coeff:1,
   dir:'Willing transition, quality of trot.',
   steps:[{type:'boundary',from:'C',to:'B',gait:'trot',dir:-1}],
   prompts:[{text:'Circle right 20m at B — then continue to A',seg:0,dist:12}]},

  {n:10,label:'B · circle right 20m · B→F→A',gait:'trot',coeff:1,
   dir:'Quality and regularity of trot, bend, balance, shape of circle.',
   steps:[
     {type:'circle',at:'B',hand:'right',gait:'trot'},
     {type:'boundary',from:'B',to:'A',gait:'trot',dir:-1},
   ],
   prompts:[
     {text:'Continue on boundary to A',seg:0,dist:10},
     {text:'At A — circle right, developing canter in second half',seg:1,dist:12},
   ]},

  {n:11,label:'A · circle right (trot→canter) · A→K→E',gait:'canter',coeff:1,
   dir:'Quality of trot and canter, willing transition, shape of circle.',
   steps:[
     {type:'splitcircle',at:'A',hand:'right',gait1:'trot',gait2:'canter'},
     {type:'boundary',from:'A',to:'E',gait:'canter',dir:-1},
   ],
   prompts:[
     {text:'Developing canter — second half of circle',seg:0,dist:8},
     {text:'Continue on boundary to E',seg:1,dist:7},
     {text:'Half 20m circle right — E to B',seg:2,dist:8},
   ]},

  {n:12,label:'E → B · half circle right',gait:'canter',coeff:1,
   dir:'Quality and regularity of canter, bend, balance, shape of half circle.',
   steps:[{type:'circle',at:'E',hand:'right',gait:'canter',sweep:180}],
   prompts:[{text:'Trot transition between B and F — continue to A',seg:0,dist:10}]},

  {n:13,label:'Between B & F · working trot · F→A',gait:'trot',coeff:1,
   dir:'Willing transition, quality of canter and trot.',
   steps:[
     {type:'transition',from:'B',to:'F',fromGait:'canter',toGait:'trot',between:['B','F'],dir:-1},
     {type:'boundary',from:'F',to:'A',gait:'trot',dir:-1},
   ],
   prompts:[{text:'At A — working trot up centreline, halt and salute at X',seg:1,dist:10}]},

  {n:14,label:'A → X · Halt, salute · Exit CW',gait:'halt',coeff:1,
   dir:'Bend in turn, straightness, willing transition, immobility.',
   steps:[
     {type:'_arc_pts',pts:['AE','A','X'],gait:'trot'},
     {type:'halt',at:'X'},
     {type:'exit',dir:'cw'},
   ],
   prompts:[
     {text:'Halt and salute at X',seg:0,dist:5},
     {text:'Walk to C — track right, exit CW on long rein',seg:1,dist:2},
   ]},
];

// ═══════════════════════════════════════════════════
// TRANSLATE DEFINITIONS → MOVEMENT ARRAYS
// ═══════════════════════════════════════════════════
const MOVES_12 = translateTest(TEST_12_DEF);
const MOVES_13 = translateTest(TEST_13_DEF);
const MOVES_EVB = translateTest(TEST_EVB_DEF);
module.exports = {
  MARKERS,
  TEST_12_DEF, TEST_13_DEF, TEST_EVB_DEF,
  MOVES_12, MOVES_13, MOVES_EVB,
  translateTest,
};
