// The game itself: keeps the rules (chess.js), connects the board to them,
// runs the computer opponent, and updates the status, move list and buttons.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { createBoard } from './board.js';
import { LEVELS } from './engine.js';

const MIN_THINK_MS = 400; // the computer waits at least this long, so its reply doesn't feel instant

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const movesEl = $('moves');
const undoBtn = $('undo');
const setupForm = $('setup');
const resultEl = $('result');
const promotionDialog = $('promotion');

const game = new Chess();
let moveLog = [];          // every move played, for the move list and highlights
const DEFAULT_LEVEL = 'novice';
let settings = { mode: 'computer', level: DEFAULT_LEVEL, humanColor: 'w' };
let thinking = false;
let requestId = 0;
let thinkStart = 0;
let worker = startWorker();

const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const isHumanTurn = () => settings.mode === 'friend' || game.turn() === settings.humanColor;

// ---- The board --------------------------------------------------------------

const board = createBoard($('board'), {
  canPickUp(square) {
    if (game.isGameOver() || thinking || !isHumanTurn()) return false;
    return game.get(square)?.color === game.turn();
  },

  legalTargets(square) {
    return game.moves({ square, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured }));
  },

  async onMove(from, to) {
    const options = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (options.length === 0) return false;

    let promotion;
    if (options[0].promotion) {
      promotion = await askPromotion(game.turn());
      if (!promotion) return false; // dialog closed without choosing
    }
    playMove({ from, to, promotion });
    return true;
  },
});

// ---- Playing moves ----------------------------------------------------------

function playMove(moveRequest) {
  const move = game.move(moveRequest);
  moveLog.push(move);
  board.setPosition(game.board(), { move });
  update();
  askComputer();
}

// If it's the computer's turn, send the position to the background worker
function askComputer() {
  if (settings.mode !== 'computer' || game.isGameOver() || isHumanTurn()) return;
  thinking = true;
  thinkStart = performance.now();
  requestId++;
  worker.postMessage({ id: requestId, fen: game.fen(), level: settings.level });
  update();
}

function startWorker() {
  const w = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });

  w.onmessage = ({ data }) => {
    if (data.id !== requestId || !data.move) return; // an answer for an old position
    const wait = Math.max(0, MIN_THINK_MS - (performance.now() - thinkStart));
    setTimeout(() => {
      if (data.id !== requestId) return;
      thinking = false;
      playMove(data.move);
    }, wait);
  };

  w.onerror = (e) => {
    console.error(e);
    thinking = false;
    statusEl.textContent = 'The computer opponent failed to load. Try refreshing the page.';
  };
  return w;
}

// Stop the computer mid-thought (new game or undo). Restarting the worker is
// the only way to interrupt a search that's already running.
function cancelThinking() {
  requestId++;
  if (thinking) {
    worker.terminate();
    worker = startWorker();
    thinking = false;
  }
}

// ---- Promotion picker -------------------------------------------------------

function askPromotion(color) {
  promotionDialog.className = `promotion ${color}`;
  promotionDialog.returnValue = '';
  promotionDialog.showModal();
  return new Promise((resolve) => {
    promotionDialog.addEventListener('close', () => resolve(promotionDialog.returnValue || null), { once: true });
  });
}

// Clicking outside the picker (on the dimmed backdrop) cancels it
promotionDialog.addEventListener('click', (e) => {
  if (e.target === promotionDialog) promotionDialog.close('');
});

// ---- Screen updates ---------------------------------------------------------

function findKing(color) {
  const rows = game.board();
  for (const row of rows) {
    for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  }
  return null;
}

function resultText() {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w';
    if (settings.mode === 'computer') {
      return winner === settings.humanColor ? 'Checkmate. You win!' : 'Checkmate. The computer wins.';
    }
    return `Checkmate. ${colorName(winner)} wins!`;
  }
  if (game.isStalemate()) return 'Stalemate. It’s a draw.';
  if (game.isInsufficientMaterial()) return 'Draw: not enough pieces left to checkmate.';
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.';
  if (game.isDrawByFiftyMoves()) return 'Draw by the 50-move rule.';
  return null;
}

function statusText() {
  const result = resultText();
  if (result) return result;
  if (thinking) return 'Computer is thinking…';
  const check = game.inCheck() ? ' Check!' : '';
  if (settings.mode === 'computer') return (isHumanTurn() ? 'Your move.' : 'Computer’s move.') + check;
  return `${colorName(game.turn())} to move.${check}`;
}

function renderMoves() {
  movesEl.replaceChildren();
  for (let i = 0; i < moveLog.length; i += 2) {
    const li = document.createElement('li');
    for (const move of moveLog.slice(i, i + 2)) {
      const span = document.createElement('span');
      span.textContent = move.san;
      if (move === moveLog.at(-1)) span.className = 'latest';
      li.append(span);
    }
    movesEl.append(li);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

function renderPlayers() {
  let top;
  let bottom;
  if (settings.mode === 'computer') {
    const level = LEVELS[settings.level];
    const you = `You (${colorName(settings.humanColor)})`;
    const cpu = `Computer · ${level.name} (${level.range})`;
    // Your side of the board is at the bottom unless you've flipped it
    [bottom, top] = board.flipped === (settings.humanColor === 'b') ? [you, cpu] : [cpu, you];
  } else {
    [bottom, top] = board.flipped ? ['Black', 'White'] : ['White', 'Black'];
  }
  $('player-top').textContent = top;
  $('player-bottom').textContent = bottom;
}

function update() {
  const last = moveLog.at(-1);
  board.setHighlights({
    lastMove: last ? { from: last.from, to: last.to } : null,
    check: game.inCheck() ? findKing(game.turn()) : null,
  });

  statusEl.textContent = statusText();
  statusEl.classList.toggle('thinking', thinking);
  renderMoves();
  renderPlayers();
  undoBtn.disabled = moveLog.length === 0;

  const result = resultText();
  resultEl.hidden = !result;
  if (result) $('result-text').textContent = result;
}

// ---- Buttons ----------------------------------------------------------------

// One option per computer level, e.g. "Novice   600–1000"
function buildLevelOptions() {
  const box = $('level-options');
  for (const [key, level] of Object.entries(LEVELS)) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="level" value="${key}"><span>${level.name}<small>${level.range}</small></span>`;
    label.querySelector('input').checked = key === DEFAULT_LEVEL;
    box.append(label);
  }
}

function newGame() {
  cancelThinking();
  const form = new FormData(setupForm);
  const color = form.get('color');
  settings = {
    mode: form.get('mode'),
    level: form.get('level'),
    humanColor: color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color,
  };

  game.reset();
  moveLog = [];
  board.clearSelection();
  board.setFlipped(settings.mode === 'computer' && settings.humanColor === 'b');
  board.setPosition(game.board());
  update();
  askComputer(); // if you chose Black, the computer opens
}

function undo() {
  if (moveLog.length === 0) return;
  cancelThinking();
  game.undo();
  moveLog.pop();
  // Against the computer, take back its reply too so it's your turn again
  if (settings.mode === 'computer') {
    while (moveLog.length && !isHumanTurn()) {
      game.undo();
      moveLog.pop();
    }
  }
  board.clearSelection();
  board.setPosition(game.board());
  update();
  askComputer();
}

setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  newGame();
});

// Hide difficulty and colour when playing a friend
setupForm.addEventListener('change', () => {
  const vsComputer = new FormData(setupForm).get('mode') === 'computer';
  for (const el of setupForm.querySelectorAll('.computer-only')) el.hidden = !vsComputer;
});

undoBtn.addEventListener('click', undo);
$('flip').addEventListener('click', () => {
  board.setFlipped(!board.flipped);
  renderPlayers();
});
$('result-new').addEventListener('click', newGame);
$('result-close').addEventListener('click', () => { resultEl.hidden = true; });

buildLevelOptions();
newGame();
