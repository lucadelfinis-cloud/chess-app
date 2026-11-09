// chess.js knows the rules; this file draws the board and handles clicks.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const game = new Chess();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECES = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

// The square picked with the first click, e.g. 'e2' (null = nothing picked)
let selected = null;

// row 0 is the top of the board (rank 8), col 0 is the left (file a)
function isLightSquare(row, col) {
  return (row + col) % 2 === 0;
}

// Rebuild all 64 squares from the current game state
function render() {
  boardEl.innerHTML = '';
  const board = game.board(); // 8x8 array, board[0] is rank 8

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = FILES[col] + (8 - row); // e.g. row 6, col 4 -> 'e2'
      const piece = board[row][col];         // null or { type, color }

      const el = document.createElement('div');
      el.className = 'square ' + (isLightSquare(row, col) ? 'light' : 'dark');
      if (square === selected) el.classList.add('selected');
      if (piece) el.textContent = PIECES[piece.color][piece.type];
      el.dataset.square = square;
      boardEl.appendChild(el);
    }
  }

  renderStatus();
}

function renderStatus() {
  const toMove = game.turn() === 'w' ? 'White' : 'Black';
  const other = toMove === 'White' ? 'Black' : 'White';

  if (game.isCheckmate()) {
    statusEl.textContent = `Checkmate: ${other} wins`;
  } else if (game.isDraw()) {
    statusEl.textContent = 'Draw';
  } else {
    statusEl.textContent = `${toMove} to move` + (game.inCheck() ? ' (check!)' : '');
  }
}

// One listener on the whole board instead of 64 separate ones
boardEl.addEventListener('click', (event) => {
  const square = event.target.closest('.square')?.dataset.square;
  if (!square || game.isGameOver()) return;

  if (selected === null) {
    // First click: only pick up a piece belonging to the side to move
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      selected = square;
      render();
    }
  } else {
    handleSecondClick(square);
  }
});

// Second click: try to move the selected piece to `square`.
function handleSecondClick(square) {
  // Clicking another of your own pieces switches the selection to it
  const piece = game.get(square);
  if (piece && piece.color === game.turn() && square !== selected) {
    selected = square;
    render();
    return;
  }

  try {
    // Pawns reaching the last rank always become queens for now.
    // chess.js ignores `promotion` on ordinary moves.
    game.move({ from: selected, to: square, promotion: 'q' });
  } catch {
    // chess.js throws on an illegal move: just drop the selection
  }

  selected = null;
  render();
}

render();
