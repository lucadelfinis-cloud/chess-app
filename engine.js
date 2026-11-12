// The computer opponent's "brain": looks ahead a few moves and picks the best one.
//
// It works on a chess.js game object. For speed it calls chess.js's internal
// functions (_moves, _makeMove, _undoMove, _board). The public ones also work out
// move names and board descriptions for every move, which is far too slow when
// trying thousands of moves. These internals belong to chess.js 1.4.0; the version
// is pinned in the import URL, so they can't change underneath us.

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Position bonuses from White's side; index = row * 8 + col, row 0 = rank 8.
// They encourage central pieces, pawn advances and a safe king.
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [ // middlegame: stay tucked away behind pawns
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
  kEnd: [ // endgame: come to the centre and help
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

// The computer's skill levels, named after common rating bands. For each one:
//   maxDepth       how many moves ahead it looks
//   noise          random error added to its judgement of each move (in centipawns)
//   mistakeChance  how often it plays a random move instead (like a careless blunder)
//   timeMs         thinking time limit
// These strengths are estimates, not measured ratings.
export const LEVELS = {
  new:          { name: 'New',          range: '100–300',   maxDepth: 1, noise: 300, mistakeChance: 0.5,  timeMs: 1000 },
  beginner:     { name: 'Beginner',     range: '300–600',   maxDepth: 1, noise: 150, mistakeChance: 0.25, timeMs: 1000 },
  novice:       { name: 'Novice',       range: '600–1000',  maxDepth: 2, noise: 60,  mistakeChance: 0.1,  timeMs: 2000 },
  intermediate: { name: 'Intermediate', range: '1000–1500', maxDepth: 3, noise: 20,  mistakeChance: 0.03, timeMs: 2500 },
  club:         { name: 'Club Player',  range: '1500–2000', maxDepth: 4, noise: 0,   mistakeChance: 0,    timeMs: 3000 },
};

const MATE = 100000;
const INF = 1e9;
const QUIESCE_DEPTH = 4;
const TIMEOUT = Symbol('timeout');

let deadline = 0;
let nodes = 0;

// Score the position in "centipawns" (100 = one pawn). Positive = good for White.
function evaluateWhite(game) {
  const board = game._board;
  let score = 0;
  let heavy = 0; // non-pawn material, to detect the endgame
  const kings = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row * 16 + col];
      if (!piece) continue;
      if (piece.type === 'k') { kings.push({ piece, row, col }); continue; }
      if (piece.type !== 'p') heavy += VALUE[piece.type];
      const idx = piece.color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
      const value = VALUE[piece.type] + PST[piece.type][idx];
      score += piece.color === 'w' ? value : -value;
    }
  }

  const table = heavy <= 1300 ? PST.kEnd : PST.k;
  for (const { piece, row, col } of kings) {
    const idx = piece.color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
    score += piece.color === 'w' ? table[idx] : -table[idx];
  }
  return score;
}

// Same score, but from the point of view of whoever's turn it is
function evaluate(game) {
  const s = evaluateWhite(game);
  return game._turn === 'w' ? s : -s;
}

// Look at the most promising moves first (captures of big pieces by small ones,
// promotions). This lets the search skip bad lines much sooner.
function orderMoves(moves) {
  for (const m of moves) {
    m.order = (m.captured ? 10 * VALUE[m.captured] - VALUE[m.piece] : 0)
            + (m.promotion ? VALUE[m.promotion] : 0);
  }
  return moves.sort((a, b) => b.order - a.order);
}

function checkTime() {
  if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;
}

// After the planned look-ahead runs out, keep following captures, so the computer
// doesn't stop in the middle of a trade and misjudge it.
function quiesce(game, alpha, beta, depth) {
  checkTime();
  const standPat = evaluate(game);
  if (depth === 0 || standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;

  const captures = orderMoves(game._moves({ legal: true }).filter((m) => m.captured));
  for (const m of captures) {
    game._makeMove(m);
    const score = -quiesce(game, -beta, -alpha, depth - 1);
    game._undoMove();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Minimax with alpha-beta pruning: "if I play this, what's the best they can do
// back?", repeated `depth` moves ahead, skipping lines that can't matter.
function search(game, depth, alpha, beta, ply) {
  checkTime();
  if (depth === 0) return quiesce(game, alpha, beta, QUIESCE_DEPTH);

  const moves = game._moves({ legal: true });
  if (moves.length === 0) {
    // No legal moves: checkmate (prefer quicker mates) or stalemate (a draw)
    return game._isKingAttacked(game._turn) ? -(MATE - ply) : 0;
  }
  if (game._halfMoves >= 100) return 0; // 50-move rule draw

  let best = -INF;
  for (const m of orderMoves(moves)) {
    game._makeMove(m);
    const score = -search(game, depth - 1, -beta, -alpha, ply + 1);
    game._undoMove();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const toSquare = (sq) => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));

// Pick a move for the side to move. Returns { from, to, promotion } or null.
// Looks 1 move ahead, then 2, then 3..., keeping the best answer from the last
// completed look-ahead if time runs out.
export function chooseMove(game, levelName = 'novice') {
  const level = LEVELS[levelName] ?? LEVELS.novice;
  let rootMoves = orderMoves(shuffle(game._moves({ legal: true })));
  if (rootMoves.length === 0) return null;

  // Weaker levels sometimes just play something random, like a careless player
  if (Math.random() < level.mistakeChance) {
    const m = rootMoves[Math.floor(Math.random() * rootMoves.length)];
    return { from: toSquare(m.from), to: toSquare(m.to), promotion: m.promotion };
  }

  deadline = Date.now() + level.timeMs;
  nodes = 0;
  let best = rootMoves[0];

  if (rootMoves.length > 1) {
    for (let depth = 1; depth <= level.maxDepth; depth++) {
      try {
        let alpha = -INF;
        let bestScore = -INF;
        let bestThisDepth = null;
        for (const m of rootMoves) {
          game._makeMove(m);
          let score;
          try {
            // With randomness every move needs an exact score, so use a full window
            score = level.noise
              ? -search(game, depth - 1, -INF, INF, 1)
              : -search(game, depth - 1, -INF, -alpha, 1);
          } finally {
            game._undoMove();
          }
          if (level.noise) score += (Math.random() * 2 - 1) * level.noise;
          // Promote now rather than "later": a deeper look can see both as equal,
          // and without this nudge the randomness can keep putting it off
          if (m.promotion) score += 50;
          if (score > bestScore) { bestScore = score; bestThisDepth = m; }
          if (score > alpha) alpha = score;
        }
        best = bestThisDepth;
        // Try the best move first next time round; it speeds up the deeper search
        rootMoves = [best, ...rootMoves.filter((m) => m !== best)];
        if (bestScore > MATE - 100) break; // found a forced mate, no need to look further
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
    }
  }

  return { from: toSquare(best.from), to: toSquare(best.to), promotion: best.promotion };
}
