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
  const CS = 8         // gap between P1 col and P2 col within a leg
  const LS = 18        // gap between legs (edge of one pair to edge of next)
  const MARGIN_X = 10
  const MARGIN_Y = 22  // top margin (room for start/win area)
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
  const boardH = ys[39] + HS * 2 + 8  // a bit of bottom padding

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
    Phase 1 — B slides to new score position (transition on transform, no colour change yet)
    Phase 2 — after slide completes, both swap colours (B becomes front, A becomes back)

  Props carry the *committed* score state. The board manages animation phases internally.
  We use a ref-based timer to trigger phase 2 after the CSS transition duration.
*/
const ANIM_MS = 420

function CribbageBoard({ p1Score, p2Score, p1Prev, p2Prev }) {
  const { p1, p2, boardW, boardH, ys, x0, x1, x2, x3, x4, x5, MARGIN_Y, HS } = BOARD
  const HOLE_R = 2.6
  const PEG_R = 4.2
  const BACK_R = 3.3

  // Per-player visual state: where each peg is drawn and what colour it shows
  // pegA = the peg that was "front" last round (stays still during animation)
  // pegB = the peg that was "back" last round (moves to new position)
  const [p1Anim, setP1Anim] = useState({ posA: 0, posB: 0, swapped: false })
  const [p2Anim, setP2Anim] = useState({ posA: 0, posB: 0, swapped: false })
  const p1Timer = useRef(null)
  const p2Timer = useRef(null)

  // When props change, kick off the animation sequence for the changed player
  const prevP1 = useRef({ score: 0, prev: 0 })
  const prevP2 = useRef({ score: 0, prev: 0 })

  useEffect(() => {
    const changed = p1Score !== prevP1.current.score || p1Prev !== prevP1.current.prev
    prevP1.current = { score: p1Score, prev: p1Prev }
    if (!changed) return
    // Phase 1: B moves to new score, A stays at old score (prev)
    setP1Anim({ posA: p1Prev, posB: p1Score, swapped: false })
    clearTimeout(p1Timer.current)
    p1Timer.current = setTimeout(() => {
      // Phase 2: colours swap — B is now front, A is now back
      setP1Anim({ posA: p1Prev, posB: p1Score, swapped: true })
    }, ANIM_MS)
  }, [p1Score, p1Prev])

  useEffect(() => {
    const changed = p2Score !== prevP2.current.score || p2Prev !== prevP2.current.prev
    prevP2.current = { score: p2Score, prev: p2Prev }
    if (!changed) return
    setP2Anim({ posA: p2Prev, posB: p2Score, swapped: false })
    clearTimeout(p2Timer.current)
    p2Timer.current = setTimeout(() => {
      setP2Anim({ posA: p2Prev, posB: p2Score, swapped: true })
    }, ANIM_MS)
  }, [p2Score, p2Prev])

  const bottomY = ys[39] + HS * 0.8
  const topCapY = ys[0] - HS * 0.8
  const leg1midX = (x0 + x1) / 2
  const leg2midX = (x2 + x3) / 2
  const leg3midX = (x4 + x5) / 2
  const bottomCapRx = (leg2midX - leg1midX) / 2
  const bottomCapMidX = (leg1midX + leg2midX) / 2
  const topCapRx = (leg3midX - leg2midX) / 2
  const topCapMidX = (leg2midX + leg3midX) / 2

  function renderHoles(holes, color) {
    return holes.map((h, i) => {
      if (!h || i === 0 || i === 121) return null
      return (
        <circle key={i} cx={h.x} cy={h.y} r={HOLE_R}
          fill="#111" stroke={color + '60'} strokeWidth={0.6} />
      )
    })
  }

  // Render two pegs for one player using the animation state
  function renderPlayerPegs(holes, anim, frontColor, backColor) {
    // pegA: stationary, was front → becomes back after swap
    // pegB: moves to new position → becomes front after swap
    const colorA = anim.swapped ? backColor : frontColor
    const colorB = anim.swapped ? frontColor : backColor
    const rA = anim.swapped ? BACK_R : PEG_R
    const rB = anim.swapped ? PEG_R : BACK_R

    const hA = anim.posA > 0 ? holes[clamp(anim.posA, 1, 121)] : null
    const hB = anim.posB > 0 ? holes[clamp(anim.posB, 1, 121)] : null

    return (
      <>
        {hA && (
          <circle cx={0} cy={0} r={rA} fill={colorA}
            stroke="rgba(0,0,0,0.6)" strokeWidth={0.8}
            style={{
              transform: `translate(${hA.x}px,${hA.y}px)`,
              transition: anim.swapped ? `fill ${ANIM_MS * 0.3}ms ease` : 'none',
            }} />
        )}
        {hB && (
          <circle cx={0} cy={0} r={rB} fill={colorB}
            stroke="rgba(0,0,0,0.6)" strokeWidth={0.8}
            style={{
              transform: `translate(${hB.x}px,${hB.y}px)`,
              transition: anim.swapped
                ? `fill ${ANIM_MS * 0.3}ms ease`
                : `transform ${ANIM_MS}ms cubic-bezier(.4,0,.2,1)`,
            }} />
        )}
      </>
    )
  }

  // Skunk line at 91 — vertical across all legs at that y position
  const y91 = p1[91].y
  const y61 = p1[61].y

  return (
    <svg
      viewBox={`0 0 ${boardW} ${boardH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* Bottom end cap — P1 (outer arc) and P2 (inner arc) */}
      {/* P1 leg1→leg2 bottom arc */}
      <path d={`M ${x0} ${bottomY} Q ${bottomCapMidX} ${bottomY + bottomCapRx * 1.4} ${x3} ${bottomY}`}
        fill="none" stroke="#ef444450" strokeWidth={1} />
      {/* P2 leg1→leg2 bottom arc */}
      <path d={`M ${x1} ${bottomY} Q ${bottomCapMidX} ${bottomY + bottomCapRx * 1.1} ${x2} ${bottomY}`}
        fill="none" stroke="#3b82f650" strokeWidth={1} />

      {/* Top end cap — leg2→leg3 */}
      {/* P2 */}
      <path d={`M ${x2} ${topCapY} Q ${topCapMidX} ${topCapY - topCapRx * 1.1} ${x5} ${topCapY}`}
        fill="none" stroke="#3b82f650" strokeWidth={1} />
      {/* P1 */}
      <path d={`M ${x3} ${topCapY} Q ${topCapMidX} ${topCapY - topCapRx * 1.4} ${x4} ${topCapY}`}
        fill="none" stroke="#ef444450" strokeWidth={1} />

      {/* Skunk markers */}
      <line x1={x0 - 4} y1={y91} x2={x5 + 4} y2={y91}
        stroke="#7c3aed" strokeWidth={0.7} strokeDasharray="2 2" opacity={0.5} />
      <text x={boardW / 2} y={y91 - 1.5} fontSize={4.5} fill="#a78bfa"
        textAnchor="middle" fontFamily="monospace" opacity={0.7}>91</text>
      <line x1={x0 - 4} y1={y61} x2={x5 + 4} y2={y61}
        stroke="#7c3aed" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.35} />

      {/* Start/win area label */}
      <text x={(x0 + x1) / 2} y={MARGIN_Y - HS * 3}
        fontSize={4} fill="#f59e0b" textAnchor="middle" fontFamily="monospace">S/W</text>

      {/* Holes */}
      {renderHoles(p1, '#ef4444')}
      {renderHoles(p2, '#3b82f6')}

      {/* Start holes */}
      <circle cx={p1[0].x} cy={p1[0].y} r={HOLE_R + 1} fill="#fbbf24" stroke="#f59e0b" strokeWidth={1} />
      <circle cx={p2[0].x} cy={p2[0].y} r={HOLE_R + 1} fill="#fbbf24" stroke="#f59e0b" strokeWidth={1} />

      {/* Pegs: back peg slides to new position, then both swap colour */}
      {renderPlayerPegs(p1, p1Anim, '#ef4444', '#fca5a5')}
      {renderPlayerPegs(p2, p2Anim, '#3b82f6', '#93c5fd')}
    </svg>
  )
}

function ScoreControls({ player, name, score, onAddScore, onNameChange, flipped }) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(name)
  const [customVal, setCustomVal] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { setNameVal(name) }, [name])
  useEffect(() => { if (editingName && nameRef.current) nameRef.current.focus() }, [editingName])

  function submitName() {
    const t = nameVal.trim()
    if (t) onNameChange(t)
    setEditingName(false)
  }

  function submitCustom(e) {
    e.preventDefault()
    const n = parseInt(customVal, 10)
    if (!isNaN(n) && n > 0 && n <= 29) { onAddScore(player, n); setCustomVal('') }
  }

  const color = player === 1 ? '#ef4444' : '#3b82f6'

  return (
    <div className="controls-wrap" style={flipped ? { transform: 'rotate(180deg)' } : {}}>
      <div className="controls-inner">
        <div className="ctrl-header">
          <span className="score-num" style={{ color }}>{score}</span>
          {editingName ? (
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
        <div className="quick-grid">
          {QUICK_SCORES.map(n => (
            <button key={n} className="qbtn" style={{ '--accent': color }}
              onClick={() => onAddScore(player, n)} disabled={score >= MAX_SCORE}>
              +{n}
            </button>
          ))}
        </div>
        <form className="custom-row" onSubmit={submitCustom}>
          <input type="number" min="1" max="29" value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            placeholder="…" className="custom-input" disabled={score >= MAX_SCORE} />
          <button type="submit" className="custom-btn" disabled={score >= MAX_SCORE || !customVal}>+</button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [gameId, setGameId] = useState(null)
  const [p1Name, setP1Name] = useState('Player 1')
  const [p2Name, setP2Name] = useState('Player 2')
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
        setP1Prev(g.player1_score ?? 0); setP2Prev(g.player2_score ?? 0)
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
    if (player === 1) { setP1Prev(p1Score); ns1 = Math.min(MAX_SCORE, p1Score + pts); setP1Score(ns1) }
    else { setP2Prev(p2Score); ns2 = Math.min(MAX_SCORE, p2Score + pts); setP2Score(ns2) }
    persist({ p1Score: ns1, p2Score: ns2, winner: ns1 >= MAX_SCORE ? 1 : ns2 >= MAX_SCORE ? 2 : null })
  }

  function undo() {
    if (!history.length) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setP1Score(prev.p1Score); setP2Score(prev.p2Score)
    setP1Prev(prev.p1Prev); setP2Prev(prev.p2Prev)
    persist({ p1Score: prev.p1Score, p2Score: prev.p2Score, winner: null })
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
          <ScoreControls player={2} name={p2Name} score={p2Score}
            onAddScore={addScore} onNameChange={n => nameChange(2, n)} flipped={true} />
        </div>

        <div className="board-col">
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
        </div>

        <div className="ctrl-row ctrl-bottom">
          <ScoreControls player={1} name={p1Name} score={p1Score}
            onAddScore={addScore} onNameChange={n => nameChange(1, n)} flipped={false} />
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
