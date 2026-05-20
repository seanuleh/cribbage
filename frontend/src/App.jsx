import React, { useState, useEffect, useRef } from 'react'
import pb from './pb.js'

const MAX_SCORE = 121
const QUICK_SCORES = [1, 2, 3, 4, 6, 8, 12, 15, 16, 24, 29]

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

/*
  PORTRAIT board — 3-leg S-fold, two tracks side by side.

  The board has 3 vertical legs. Each leg = 40 holes per player.
  Two players run side-by-side: for every score position, P1's hole and P2's
  hole sit next to each other in the same leg.

  Leg layout (left→right columns):
    Leg 1:  [P1_a] [P2_a]      — holes 1–40,  goes DOWN
    Leg 2:  [P2_b] [P1_b]      — holes 41–80, goes UP   (reversed so the cap connects naturally)
    Leg 3:  [P1_c] [P2_c]      — holes 81–120,goes DOWN

  Note: in leg 2 the columns swap (P2 left, P1 right) so that each player's
  two columns are adjacent at the end-caps, forming a clean U for each player.

  End caps:
    Bottom cap: connects leg1 → leg2 (right side of leg1 sweeps to right side of leg2)
    Top cap:    connects leg2 → leg3 (left side of leg2 sweeps to left side of leg3)

  Start/Win holes sit above leg 1 (score 0 = start, score 121 = win).

  Hole spacing: HS vertically, with a small extra gap every 5 holes.
  Column spacing: CS between the two player columns within a leg, WS between legs.
*/

function buildBoard() {
  // --- geometry constants (SVG units) ---
  const HS = 7.5       // hole-to-hole vertical spacing
  const GG = 4         // extra gap between groups of 5
  const CS = 12        // gap between P1 col and P2 col within a leg
  const LS = 74        // gap between legs
  const MARGIN_X = 20
  const MARGIN_Y = 46  // top margin (room for start/win area + top cap arcs)
  const HOLES = 40     // holes per leg per player

  // x positions of the 6 columns
  // Leg1: P1=col0, P2=col1
  // Leg2: P2=col2, P1=col3  (swapped so caps work)
  // Leg3: P1=col4, P2=col5
  const colW = CS  // width of a pair
  const legW = colW  // one col per player, adjacent

  const x0 = MARGIN_X            // leg1 P1
  const x1 = x0 + CS             // leg1 P2
  const x2 = x1 + LS             // leg2 P2
  const x3 = x2 + CS             // leg2 P1
  const x4 = x3 + LS             // leg3 P1
  const x5 = x4 + CS             // leg3 P2

  const boardW = x5 + MARGIN_X

  // y positions for 40 holes, going down, with group gaps
  const ys = []
  for (let g = 0; g < 8; g++) {       // 8 groups of 5 = 40
    for (let h = 0; h < 5; h++) {
      ys.push(MARGIN_Y + g * (HS * 5 + GG) + h * HS)
    }
  }
  const boardH = ys[39] + 46  // bottom margin matches top (fits bottom cap arcs)

  // Build hole arrays [0..121] for each player: {x, y}
  const p1 = new Array(122).fill(null)
  const p2 = new Array(122).fill(null)

  // Start holes (score 0) — above leg 1
  p1[0] = { x: x0, y: MARGIN_Y - HS * 2 }
  p2[0] = { x: x1, y: MARGIN_Y - HS * 2 }

  // Win holes (score 121) — same position as start
  p1[121] = { x: x0, y: MARGIN_Y - HS * 2 }
  p2[121] = { x: x1, y: MARGIN_Y - HS * 2 }

  // Leg 1: scores 1–40, going DOWN
  for (let i = 1; i <= 40; i++) {
    p1[i] = { x: x0, y: ys[i - 1] }
    p2[i] = { x: x1, y: ys[i - 1] }
  }

  // Leg 2: scores 41–80, going UP (ys reversed)
  for (let i = 41; i <= 80; i++) {
    p1[i] = { x: x3, y: ys[80 - i] }
    p2[i] = { x: x2, y: ys[80 - i] }
  }

  // Leg 3: scores 81–120, going DOWN
  for (let i = 81; i <= 120; i++) {
    p1[i] = { x: x4, y: ys[i - 81] }
    p2[i] = { x: x5, y: ys[i - 81] }
  }

  return { p1, p2, boardW, boardH, ys, x0, x1, x2, x3, x4, x5, MARGIN_Y, HS }
}

const BOARD = buildBoard()

/*
  Animation model:
  Each player has two pegs: A (was front) and B (was back).
  On score:
    Phase 1 — B is driven by RAF along the track path to the new score position
    Phase 2 — after RAF completes, both swap colours (B becomes front, A becomes back)

  buildWaypoints generates hole positions plus elliptical arc interpolation points at
  the bottom cap (scores 40→41) and top cap (scores 80→81), so the peg follows the
  curved track instead of cutting through the board in a straight line.
*/
const ANIM_MS = 420

function arcWaypoints(cx, cy, rx, ry, thetaStart, thetaEnd, n = 16) {
  const pts = []
  for (let i = 1; i <= n; i++) {
    const theta = thetaStart + (thetaEnd - thetaStart) * (i / (n + 1))
    pts.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) })
  }
  return pts
}

function buildWaypoints(holes, fromScore, toScore, player) {
  const { ys, x0, x1, x2, x3, x4 } = BOARD
  const rxOuter = (x3 - x0) / 2
  const rxInner = (x2 - x1) / 2
  const ryOuter = Math.round(rxOuter * 0.75)
  const ryInner = ryOuter - (x1 - x0)
  // Both players' bottom caps share centre (x0+x3)/2; top caps share (x3+x4)/2
  const cxBot = (x0 + x3) / 2, cyBot = ys[39]
  const cxTop = (x3 + x4) / 2, cyTop = ys[0]

  const step = fromScore <= toScore ? 1 : -1
  const pts = []

  for (let s = fromScore; ; s += step) {
    const h = holes[clamp(s, 0, 121)]
    if (h) pts.push({ x: h.x, y: h.y })
    if (s === toScore) break

    if (step > 0) {
      if (s === 40) {
        // Bottom cap forward: CCW arc dips DOWN (θ π→0, sin positive)
        const [rx, ry] = player === 1 ? [rxOuter, ryOuter] : [rxInner, ryInner]
        pts.push(...arcWaypoints(cxBot, cyBot, rx, ry, Math.PI, 0))
      } else if (s === 80) {
        // Top cap forward: CW arc rises UP (θ π→2π, sin goes negative)
        const [rx, ry] = player === 1 ? [rxInner, ryInner] : [rxOuter, ryOuter]
        pts.push(...arcWaypoints(cxTop, cyTop, rx, ry, Math.PI, 2 * Math.PI))
      }
    } else {
      if (s === 41) {
        // Bottom cap backward: arc dips DOWN (θ 0→π)
        const [rx, ry] = player === 1 ? [rxOuter, ryOuter] : [rxInner, ryInner]
        pts.push(...arcWaypoints(cxBot, cyBot, rx, ry, 0, Math.PI))
      } else if (s === 81) {
        // Top cap backward: arc rises UP (θ 2π→π)
        const [rx, ry] = player === 1 ? [rxInner, ryInner] : [rxOuter, ryOuter]
        pts.push(...arcWaypoints(cxTop, cyTop, rx, ry, 2 * Math.PI, Math.PI))
      }
    }
  }

  return pts
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t }

function interpWaypoints(waypoints, t) {
  const n = waypoints.length
  if (n <= 1) return waypoints[0]
  const raw = t * (n - 1)
  const i = Math.min(Math.floor(raw), n - 2)
  const f = raw - i
  const a = waypoints[i], b = waypoints[i + 1]
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

function CribbageBoard({ p1Score, p2Score, p1Prev, p2Prev }) {
  const { p1, p2, boardW, boardH, ys, x0, x1, x2, x3, x4, x5, MARGIN_Y, HS } = BOARD
  const HOLE_R = 3.1
  const PEG_R = 4.6
  const BACK_R = 3.6

  // React state drives colours/sizes; transform on pegB is RAF-driven during animation
  const [p1Visual, setP1Visual] = useState({ posA: 0, posB: 0, swapped: false })
  const [p2Visual, setP2Visual] = useState({ posA: 0, posB: 0, swapped: false })

  // Refs to the moving peg (B) SVG elements — RAF writes their transform directly
  const p1BRef = useRef(null)
  const p2BRef = useRef(null)
  const p1AnimRef = useRef({ rafId: null })
  const p2AnimRef = useRef({ rafId: null })

  const prevP1 = useRef({ score: 0, prev: 0 })
  const prevP2 = useRef({ score: 0, prev: 0 })

  function startAnim(player, holes, fromScore, toScore) {
    const animRef = player === 1 ? p1AnimRef : p2AnimRef
    const pegBRef = player === 1 ? p1BRef : p2BRef
    const setVisual = player === 1 ? setP1Visual : setP2Visual

    cancelAnimationFrame(animRef.current.rafId)

    if (fromScore === toScore) {
      setVisual({ posA: fromScore, posB: toScore, swapped: false })
      return
    }

    const waypoints = buildWaypoints(holes, fromScore, toScore, player)
    const startTime = performance.now()
    // pegB starts at fromScore; RAF immediately overrides transform each frame
    setVisual({ posA: fromScore, posB: fromScore, swapped: false })

    function tick() {
      const elapsed = performance.now() - startTime
      const t = easeInOut(Math.min(1, elapsed / ANIM_MS))
      const pos = interpWaypoints(waypoints, t)
      if (pegBRef.current) {
        pegBRef.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      }
      if (elapsed < ANIM_MS) {
        animRef.current.rafId = requestAnimationFrame(tick)
      } else {
        setVisual({ posA: fromScore, posB: toScore, swapped: true })
      }
    }

    animRef.current.rafId = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const changed = p1Score !== prevP1.current.score || p1Prev !== prevP1.current.prev
    prevP1.current = { score: p1Score, prev: p1Prev }
    if (!changed) return
    startAnim(1, p1, p1Prev, p1Score)
  }, [p1Score, p1Prev])

  useEffect(() => {
    const changed = p2Score !== prevP2.current.score || p2Prev !== prevP2.current.prev
    prevP2.current = { score: p2Score, prev: p2Prev }
    if (!changed) return
    startAnim(2, p2, p2Prev, p2Score)
  }, [p2Score, p2Prev])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(p1AnimRef.current.rafId)
      cancelAnimationFrame(p2AnimRef.current.rafId)
    }
  }, [])

  // Concentric elliptical arcs — outer rx=49, inner rx=37, gap = CS = x1-x0
  const trackCS = x1 - x0   // column spacing, derived from returned coords
  const rxOuter = (x3 - x0) / 2
  const rxInner = (x2 - x1) / 2
  const ryOuter = Math.round(rxOuter * 0.75)
  const ryInner = ryOuter - trackCS

  // SVG arc flags: sweep=0 = CCW (curves outward DOWN), sweep=1 = CW (curves outward UP)
  const p1Track = [
    `M ${x0} ${ys[0]}`,
    `L ${x0} ${ys[39]}`,
    `A ${rxOuter} ${ryOuter} 0 0 0 ${x3} ${ys[39]}`,  // bottom outer arc, curves DOWN
    `L ${x3} ${ys[0]}`,
    `A ${rxInner} ${ryInner} 0 0 1 ${x4} ${ys[0]}`,   // top inner arc, curves UP
    `L ${x4} ${ys[39]}`,
  ].join(' ')

  const p2Track = [
    `M ${x1} ${ys[0]}`,
    `L ${x1} ${ys[39]}`,
    `A ${rxInner} ${ryInner} 0 0 0 ${x2} ${ys[39]}`,  // bottom inner arc, curves DOWN
    `L ${x2} ${ys[0]}`,
    `A ${rxOuter} ${ryOuter} 0 0 1 ${x5} ${ys[0]}`,   // top outer arc, curves UP
    `L ${x5} ${ys[39]}`,
  ].join(' ')

  function renderHoles(holes, color) {
    return holes.map((h, i) => {
      if (!h || i === 0 || i === 121) return null
      return (
        <circle key={i} cx={h.x} cy={h.y} r={HOLE_R}
          fill="#e2ddd2" stroke={color + '55'} strokeWidth={0.7} />
      )
    })
  }

  function renderPlayerPegs(holes, visual, frontColor, backColor, pegBRef) {
    const colorA = visual.swapped ? backColor : frontColor
    const colorB = visual.swapped ? frontColor : backColor
    const rA = visual.swapped ? BACK_R : PEG_R
    const rB = visual.swapped ? PEG_R : BACK_R

    const hA = holes[clamp(visual.posA, 0, 121)]
    const hB = holes[clamp(visual.posB, 0, 121)]

    return (
      <>
        {hA && (
          <circle cx={0} cy={0} r={rA} fill={colorA}
            stroke="rgba(0,0,0,0.6)" strokeWidth={0.8}
            style={{
              transform: `translate(${hA.x}px,${hA.y}px)`,
              transition: visual.swapped ? `fill ${ANIM_MS * 0.3}ms ease` : 'none',
            }} />
        )}
        {hB && (
          <circle ref={pegBRef} cx={0} cy={0} r={rB} fill={colorB}
            stroke="rgba(0,0,0,0.6)" strokeWidth={0.8}
            style={{
              transform: `translate(${hB.x}px,${hB.y}px)`,
              transition: visual.swapped ? `fill ${ANIM_MS * 0.3}ms ease` : 'none',
            }} />
        )}
      </>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${boardW} ${boardH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* Track backgrounds — full S-fold path per player */}
      <path d={p1Track} fill="none" stroke="#2563eb" strokeWidth={8}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.09} />
      <path d={p2Track} fill="none" stroke="#dc2626" strokeWidth={8}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.09} />

      {/* 10-hole interval markers: line in gap centre, numbers either side of line */}
      {(() => {
        // Gap boundaries: score N means the gap is between hole N and hole N+1.
        // Leg 1 (down, scores 1-40): gap after score 10→ys[9]/ys[10], 20→ys[19]/ys[20], 30→ys[29]/ys[30]
        // Leg 2 (up,  scores 41-80): score 50=ys[30],51=ys[29] → gap ys[29]/ys[30]; 60→ys[19]/ys[20]; 70→ys[9]/ys[10]
        // Leg 3 (down, scores 81-120): same as leg1 offsets; 90→ys[9]/ys[10]; 100→ys[19]/ys[20]; 110→ys[29]/ys[30]
        // Label x: near the leg where those holes live
        // Leg-end lines: just beyond the last hole since there's no gap between legs at the caps
        const yBot = ys[39] + HS * 0.75  // below bottom holes (leg1/leg2 turn)
        const yTop = ys[0]  - HS * 0.75  // above top holes (leg2/leg3 turn)
        const gaps = [
          { score: 10,  ya: ys[9],  yb: ys[10], lx: x0 - 12 },
          { score: 20,  ya: ys[19], yb: ys[20], lx: x0 - 12 },
          { score: 30,  ya: ys[29], yb: ys[30], lx: x0 - 12 },
          { score: 40,  y: yBot,                lx: x0 - 12 },
          { score: 50,  ya: ys[29], yb: ys[30], lx: x2 - 11 },
          { score: 60,  ya: ys[19], yb: ys[20], lx: x2 - 11 },
          { score: 70,  ya: ys[9],  yb: ys[10], lx: x2 - 11 },
          { score: 80,  y: yTop,                lx: x2 - 11 },
          { score: 90,  ya: ys[9],  yb: ys[10], lx: x5 + 12 },
          { score: 100, ya: ys[19], yb: ys[20], lx: x5 + 12 },
          { score: 110, ya: ys[29], yb: ys[30], lx: x5 + 12 },
          { score: 120, y: yBot,                lx: x5 + 12 },
        ]
        const fontSize = 5.2
        const pad = 2.2
        return gaps.map(({ score, ya, yb, y: yFixed, lx }) => {
          const y = yFixed ?? (ya + yb) / 2
          return (
            <g key={score}>
              <line x1={x0 - 5} y1={y} x2={x5 + 5} y2={y}
                stroke="#000" strokeWidth={0.6} strokeDasharray="2.5 2" opacity={0.35} />
              {/* P1-facing: above the line */}
              <text x={lx} y={y - pad} fontSize={fontSize} fill="#444"
                textAnchor="middle" fontFamily="monospace" dominantBaseline="middle">{score}</text>
              {/* P2-facing: below the line, rotated 180° around its own centre */}
              <text x={lx} y={y + pad} fontSize={fontSize} fill="#444"
                textAnchor="middle" fontFamily="monospace" dominantBaseline="middle"
                transform={`rotate(180,${lx},${y + pad})`}>{score}</text>
            </g>
          )
        })
      })()}

      {/* Start/win area label */}
      <text x={(x0 + x1) / 2} y={MARGIN_Y - HS * 3}
        fontSize={4} fill="#9ca3af" textAnchor="middle" fontFamily="monospace">S/W</text>

      {/* Holes */}
      {renderHoles(p1, '#2563eb')}
      {renderHoles(p2, '#dc2626')}

      {/* Start holes */}
      <circle cx={p1[0].x} cy={p1[0].y} r={HOLE_R + 1} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.8} />
      <circle cx={p2[0].x} cy={p2[0].y} r={HOLE_R + 1} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.8} />

      {/* Pegs: pegB driven by RAF along track path, then both swap colour */}
      {renderPlayerPegs(p1, p1Visual, '#2563eb', '#93c5fd', p1BRef)}
      {renderPlayerPegs(p2, p2Visual, '#dc2626', '#fca5a5', p2BRef)}
    </svg>
  )
}

function PlayerLabel({ player, name, score, onNameChange, align, readOnly }) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(name)
  const nameRef = useRef(null)

  useEffect(() => { setNameVal(name) }, [name])
  useEffect(() => { if (editingName && nameRef.current) nameRef.current.focus() }, [editingName])

  function submitName() {
    const t = nameVal.trim()
    if (t) onNameChange(t)
    setEditingName(false)
  }

  const color = player === 1 ? '#3b82f6' : '#ef4444'

  return (
    <div className={`player-label player-label-${align}`}>
      <span className="score-num" style={{ color }}>{score}</span>
      {readOnly ? (
        <div className="name-btn" style={{ cursor: 'default', opacity: 0.7 }}>
          <span className="peg-dot" style={{ background: color }} />
          {name}
        </div>
      ) : editingName ? (
        <form onSubmit={e => { e.preventDefault(); submitName() }}>
          <input ref={nameRef} value={nameVal} onChange={e => setNameVal(e.target.value)}
            onBlur={submitName} className="name-input" maxLength={16} />
        </form>
      ) : (
        <button className="name-btn" onClick={() => setEditingName(true)}>
          <span className="peg-dot" style={{ background: color }} />
          {name}<span className="edit-hint">✎</span>
        </button>
      )}
    </div>
  )
}

function ScoreControls({ player, score, onAddScore, flipped }) {
  const MAX_PTS = 29
  const [val, setVal] = useState(0)
  const [returning, setReturning] = useState(false)
  const color = player === 1 ? '#2563eb' : '#dc2626'
  const disabled = score >= MAX_SCORE

  function clampVal(n) { return Math.max(0, Math.min(MAX_PTS, n)) }

  function submit() {
    if (val === 0 || disabled) return
    onAddScore(player, val)
    // animate back to zero
    setReturning(true)
    setTimeout(() => { setVal(0); setReturning(false) }, 350)
  }

  function nudge(delta) {
    if (disabled) return
    setVal(v => clampVal(v + delta))
  }

  function handleSlider(e) {
    if (disabled) return
    setVal(clampVal(parseInt(e.target.value, 10)))
  }

  const pct = (val / MAX_PTS) * 100

  return (
    <div className="controls-wrap" style={flipped ? { transform: 'rotate(180deg)' } : {}}>
      <div className="slider-strip">
        {/* − button */}
        <button className="nudge-btn" onClick={() => nudge(-1)} disabled={disabled || val === 0}
          aria-label="Decrease">−</button>

        {/* Slider track */}
        <div className="slider-track-wrap">
          <div className="slider-fill" style={{ width: `${pct}%`, background: color, opacity: returning ? 0 : 0.18 }} />
          <input
            type="range" min={0} max={MAX_PTS} value={returning ? 0 : val}
            onChange={handleSlider}
            className="slider-input"
            style={{ '--thumb-color': color }}
            disabled={disabled}
          />
        </div>

        {/* + button */}
        <button className="nudge-btn" onClick={() => nudge(1)} disabled={disabled || val >= MAX_PTS}
          aria-label="Increase">+</button>

        {/* Value readout */}
        <div className="slider-readout" style={{ color: val > 0 ? color : 'var(--text-muted)' }}>
          <span className="slider-val" style={returning ? { transition: 'color 0.3s' } : {}}>
            {val > 0 ? `+${val}` : '·'}
          </span>
        </div>

        {/* Submit */}
        <button className="submit-btn" onClick={submit} disabled={disabled || val === 0}
          style={{ '--accent': color }} aria-label="Add score">
          ✓
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [gameId, setGameId] = useState(null)
  const [p1Name, setP1Name] = useState('Sean')
  const [p2Name, setP2Name] = useState('Gina')
  const [p1Score, setP1Score] = useState(0)
  const [p2Score, setP2Score] = useState(0)
  const [p1Prev, setP1Prev] = useState(0)
  const [p2Prev, setP2Prev] = useState(0)
  const [history, setHistory] = useState([])
  const [pbOk, setPbOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null) // 'undo' | 'new' | null

  const winner = p1Score >= MAX_SCORE ? 1 : p2Score >= MAX_SCORE ? 2 : null

  useEffect(() => {
    async function init() {
      try {
        const h = await fetch('/api/health')
        if (!h.ok) throw new Error()
        setPbOk(true)
        await loadGame()
      } catch { setPbOk(false) }
      finally { setLoading(false) }
    }
    init()
  }, [])

  async function loadGame() {
    try {
      if (!pb.authStore.isValid) return
      const r = await pb.collection('games').getList(1, 1, { filter: 'active = true', sort: '-created' })
      if (r.items.length) {
        const g = r.items[0]
        setGameId(g.id); setP1Name(g.player1_name); setP2Name(g.player2_name)
        setP1Score(g.player1_score ?? 0); setP2Score(g.player2_score ?? 0)
        setP1Prev(g.player1_prev ?? 0)
        setP2Prev(g.player2_prev ?? 0)
      }
    } catch (e) { handlePbErr(e) }
  }

  function handlePbErr(e) {
    if (e?.status === 401) { pb.authStore.clear(); setError('Session expired — please refresh.') }
  }

  async function persist(state) {
    if (!pbOk || !pb.authStore.isValid) return
    setSaving(true)
    try {
      const data = {
        player1_name: state.p1Name ?? p1Name, player2_name: state.p2Name ?? p2Name,
        player1_score: state.p1Score ?? p1Score, player2_score: state.p2Score ?? p2Score,
        player1_prev: state.p1Prev ?? p1Prev, player2_prev: state.p2Prev ?? p2Prev,
        active: !(state.winner ?? winner), user: pb.authStore.model?.id,
      }
      if (gameId) { await pb.collection('games').update(gameId, data) }
      else { const rec = await pb.collection('games').create(data); setGameId(rec.id) }
    } catch (e) { handlePbErr(e) }
    finally { setSaving(false) }
  }

  function addScore(player, pts) {
    if (winner) return
    setHistory(h => [...h, { p1Score, p2Score, p1Prev, p2Prev }])
    let ns1 = p1Score, ns2 = p2Score
    let np1Prev = p1Prev, np2Prev = p2Prev
    if (player === 1) { np1Prev = p1Score; setP1Prev(np1Prev); ns1 = Math.min(MAX_SCORE, p1Score + pts); setP1Score(ns1) }
    else { np2Prev = p2Score; setP2Prev(np2Prev); ns2 = Math.min(MAX_SCORE, p2Score + pts); setP2Score(ns2) }
    persist({ p1Score: ns1, p2Score: ns2, p1Prev: np1Prev, p2Prev: np2Prev, winner: ns1 >= MAX_SCORE ? 1 : ns2 >= MAX_SCORE ? 2 : null })
  }

  function undo() {
    if (!history.length) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setP1Score(prev.p1Score); setP2Score(prev.p2Score)
    setP1Prev(prev.p1Prev); setP2Prev(prev.p2Prev)
    persist({ p1Score: prev.p1Score, p2Score: prev.p2Score, p1Prev: prev.p1Prev, p2Prev: prev.p2Prev, winner: null })
  }

  async function resetGame() {
    if (pbOk && pb.authStore.isValid && gameId) {
      try { await pb.collection('games').update(gameId, { active: false }) } catch (e) { handlePbErr(e) }
    }
    setGameId(null); setP1Score(0); setP2Score(0); setP1Prev(0); setP2Prev(0)
    setHistory([]); setError(null)
  }

  function nameChange(player, name) {
    if (player === 1) setP1Name(name); else setP2Name(name)
    persist({ p1Name: player === 1 ? name : p1Name, p2Name: player === 2 ? name : p2Name })
  }

  const skunked = winner && ((winner === 1 && p2Score < 91) || (winner === 2 && p1Score < 91))
  const doubleSkunked = winner && ((winner === 1 && p2Score < 61) || (winner === 2 && p1Score < 61))

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="app">
      {error && <div className="errbar">{error}<button onClick={() => setError(null)}>×</button></div>}

      <div className="game-layout">
        <div className="ctrl-row ctrl-top">
          <ScoreControls player={2} score={p2Score} onAddScore={addScore} flipped={true} />
        </div>

        <div className="board-col">
          {/* P2 own label — top-right, upside down, editable */}
          <PlayerLabel player={2} name={p2Name} score={p2Score}
            onNameChange={n => nameChange(2, n)} align="top-right" />
          {/* P1 opponent view for P2 — top-left, upside down, read-only */}
          <PlayerLabel player={1} name={p1Name} score={p1Score}
            onNameChange={() => {}} align="top-left" readOnly />

          <button
            className="board-icon-btn undo-btn"
            onClick={() => setConfirm('undo')}
            disabled={!history.length}
            title="Undo"
          >↩</button>

          <CribbageBoard p1Score={p1Score} p2Score={p2Score} p1Prev={p1Prev} p2Prev={p2Prev} />

          <button
            className="board-icon-btn new-btn"
            onClick={() => setConfirm('new')}
            title="New game"
          >↺</button>

          {/* P1 own label — bottom-left, editable */}
          <PlayerLabel player={1} name={p1Name} score={p1Score}
            onNameChange={n => nameChange(1, n)} align="bottom-left" />
          {/* P2 opponent view for P1 — bottom-right, read-only */}
          <PlayerLabel player={2} name={p2Name} score={p2Score}
            onNameChange={() => {}} align="bottom-right" readOnly />
        </div>

        <div className="ctrl-row ctrl-bottom">
          <ScoreControls player={1} score={p1Score} onAddScore={addScore} flipped={false} />
        </div>
      </div>

      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>{confirm === 'undo' ? 'Undo last move?' : 'Start a new game?'}</p>
            <div className="confirm-btns">
              <button className="confirm-cancel" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="confirm-ok" onClick={() => {
                if (confirm === 'undo') undo()
                else resetGame()
                setConfirm(null)
              }}>
                {confirm === 'undo' ? 'Undo' : 'New Game'}
              </button>
            </div>
          </div>
        </div>
      )}

      {winner && (
        <div className="winner-overlay">
          <div className="winner-card">
            <div className="winner-crown">♛</div>
            <div className="winner-name">{winner === 1 ? p1Name : p2Name} wins!</div>
            {doubleSkunked && <div className="skunk-tag">DOUBLE SKUNKED</div>}
            {!doubleSkunked && skunked && <div className="skunk-tag">SKUNKED</div>}
            <button className="play-again-btn" onClick={resetGame}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  )
}
