// The board on screen: draws squares and pieces, animates moves and captures,
// and turns clicks and drags into move attempts. It knows nothing about the
// rules; it asks main.js (through the callbacks) what's allowed.
//
// Smoothness rule: every animation here only changes `transform` (position, size,
// rotation) or `opacity`. Browsers can animate those on the graphics card without
// redrawing anything, so they stay smooth.

const FILES = 'abcdefgh';
const DRAG_THRESHOLD = 4;  // pixels the pointer must travel before a press becomes a drag
const SLIDE_MS = 300;      // keep in step with the .piece transition in style.css
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function div(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

// A piece drawing: points at one of the carved-stone symbols in index.html
const pieceSvg = (type) => `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#p-${type}"/></svg>`;

function squareToRowCol(square) {
  return { row: 8 - Number(square[1]), col: FILES.indexOf(square[0]) };
}

function distance(a, b) {
  const p = squareToRowCol(a);
  const q = squareToRowCol(b);
  return Math.hypot(p.row - q.row, p.col - q.col);
}

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * callbacks:
 *   canPickUp(square)     -> true if the player may pick up the piece on `square`
 *   legalTargets(square)  -> [{ to, capture }] squares that piece can move to
 *   onMove(from, to)      -> Promise<boolean>: try the move; false = refused/cancelled
 */
export function createBoard(root, { canPickUp, legalTargets, onMove }) {
  const squaresLayer = div('squares');
  const piecesLayer = div('pieces');
  root.prepend(squaresLayer, piecesLayer);

  const squareEls = new Map(); // 'e4' -> square element
  let pieces = [];             // [{ el, square, color, type }]
  let flipped = false;
  let selected = null;         // square of the picked-up piece
  let targets = [];            // legal targets of the selected piece
  let lastMove = null;         // { from, to }
  let checkSquare = null;      // king in check
  let hoverSquare = null;      // square under a dragged piece
  let drag = null;

  // ---- Coordinates -------------------------------------------------------

  // Where a square appears on screen (0-7 across and down), taking flipping into account
  function screenPos(square) {
    const { row, col } = squareToRowCol(square);
    return flipped ? { x: 7 - col, y: 7 - row } : { x: col, y: row };
  }

  const squareTransform = (square) => {
    const { x, y } = screenPos(square);
    return `translate(${x * 100}%, ${y * 100}%)`;
  };

  // Which square is under a point on screen (null if outside the board)
  function squareAt(clientX, clientY) {
    const r = root.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const col = flipped ? 7 - x : x;
    const row = flipped ? 7 - y : y;
    return FILES[col] + (8 - row);
  }

  // ---- Squares -----------------------------------------------------------

  function buildSquares() {
    squaresLayer.replaceChildren();
    squareEls.clear();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const col = flipped ? 7 - x : x;
        const row = flipped ? 7 - y : y;
        const square = FILES[col] + (8 - row);
        const el = div('square ' + ((row + col) % 2 === 0 ? 'light' : 'dark'));
        // Coordinate labels along the left and bottom edges
        if (x === 0) el.append(Object.assign(div('coord rank'), { textContent: 8 - row }));
        if (y === 7) el.append(Object.assign(div('coord file'), { textContent: FILES[col] }));
        squaresLayer.append(el);
        squareEls.set(square, el);
      }
    }
    paintSquares();
  }

  // Apply highlight classes: last move, selection, check, legal-move markers
  function paintSquares() {
    for (const [square, el] of squareEls) {
      const target = targets.find((t) => t.to === square);
      el.classList.toggle('last-move', !!lastMove && (square === lastMove.from || square === lastMove.to));
      el.classList.toggle('selected', square === selected);
      el.classList.toggle('check', square === checkSquare);
      el.classList.toggle('hint', !!target && !target.capture);
      el.classList.toggle('hint-capture', !!target && target.capture);
      el.classList.toggle('drag-over', square === hoverSquare);
    }
  }

  // ---- Pieces ------------------------------------------------------------

  // The piece rises, glides and settles: the outer element slides (CSS transition)
  // while the drawing inside does a small hop.
  function hop(piece) {
    piece.el.firstElementChild.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-12%) scale(1.08)', offset: 0.45 },
        { transform: 'translateY(0) scale(1.04, 0.95)', offset: 0.88 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: SLIDE_MS + 60, easing: 'ease-in-out' },
    );
  }

  // Move a piece's element to its square; with animate=true it glides there
  function place(piece, animate = true) {
    const next = squareTransform(piece.square);
    const moving = piece.el.style.transform !== next;
    piece.el.classList.toggle('no-anim', !animate);
    piece.el.style.transform = next;
    if (animate && moving && !reducedMotion.matches) hop(piece);
  }

  function createPiece({ square, color, type }, animate) {
    const el = div(`piece ${color}`);
    el.innerHTML = pieceSvg(type);
    piecesLayer.append(el);
    const piece = { el, square, color, type };
    place(piece, false);
    if (animate) {
      el.animate([{ opacity: 0, transform: `${el.style.transform} scale(0.8)` }, { opacity: 1 }],
        { duration: 250, easing: 'ease-out' });
    }
    return piece;
  }

  // A captured piece shakes, then bursts into stone fragments
  function crumble(piece) {
    const { el, color } = piece;
    el.classList.add('captured'); // drawn underneath the attacker
    const drawing = el.firstElementChild;
    const delay = SLIDE_MS * 0.4; // let the attacker get close first

    drawing.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5%) rotate(-4deg)' },
        { transform: 'translateX(5%) rotate(4deg)' },
        { transform: 'translateX(-3%) rotate(-2deg)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 160, delay },
    );
    drawing.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55) translateY(14%)' }],
      { duration: 200, delay: delay + 140, easing: 'ease-in', fill: 'forwards' },
    ).onfinish = () => el.remove();

    // Fragments: small stone shards flying out and falling, in a layer of their own
    const debris = div(`debris ${color}`);
    debris.style.transform = squareTransform(piece.square);
    piecesLayer.append(debris);
    for (let i = 0; i < 12; i++) {
      const shard = div('shard');
      const angle = rand(0, Math.PI * 2);
      const power = rand(150, 380);
      const dx = Math.cos(angle) * power;
      const dy = Math.sin(angle) * power * 0.6 - 120;
      shard.style.clipPath =
        `polygon(${rand(0, 40)}% 0%, 100% ${rand(0, 40)}%, ${rand(60, 100)}% 100%, 0% ${rand(50, 100)}%)`;
      debris.append(shard);
      shard.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1, offset: 0.05 },
          { transform: `translate(${dx * 0.6}%, ${dy * 0.6}%) rotate(${rand(-180, 180)}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}%, ${dy + 260}%) rotate(${rand(-360, 360)}deg)`, opacity: 0 },
        ],
        { duration: rand(500, 700), delay: delay + 120, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'both' },
      );
    }
    setTimeout(() => debris.remove(), delay + 900);
  }

  // how: 'none' (instant), 'fade' (new game / undo) or 'crumble' (captured in a move)
  function removePiece(piece, how) {
    if (how === 'none') return piece.el.remove();
    if (how === 'crumble' && !reducedMotion.matches) return crumble(piece);
    piece.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
      .onfinish = () => piece.el.remove();
  }

  /**
   * Show a position. `position` is chess.js's game.board() (8x8 array).
   * Existing piece elements are reused and slid to their new squares, so moves,
   * castling, undo and "new game" all animate. Pass the chess.js `move` that was
   * just played so the right piece is the one that slides.
   */
  function setPosition(position, { move = null, animate = true } = {}) {
    if (move) {
      // (A dragged piece has already been dropped on move.to)
      const mover = pieces.find((p) => p.square === move.from)
        ?? pieces.find((p) => p.square === move.to && p.color === move.color);
      if (mover) {
        mover.square = move.to;
        if (move.promotion) {
          mover.type = move.promotion;
          mover.el.querySelector('use').setAttribute('href', `#p-${move.promotion}`);
        }
      }
    }

    const wanted = [];
    position.forEach((cells, row) => cells.forEach((p, col) => {
      if (p) wanted.push({ square: FILES[col] + (8 - row), color: p.color, type: p.type });
    }));

    let spare = pieces.filter((p) => !(move && p.square === move.to && p.color !== move.color));
    const captured = pieces.filter((p) => !spare.includes(p));
    const next = [];
    const unmatched = [];

    // 1. Pieces already on the right square stay put (or finish sliding there)
    for (const w of wanted) {
      const i = spare.findIndex((p) => p.square === w.square && p.color === w.color && p.type === w.type);
      if (i >= 0) {
        const [p] = spare.splice(i, 1);
        place(p, animate);
        next.push(p);
      } else {
        unmatched.push(w);
      }
    }

    // 2. Everything else: slide the nearest matching piece over, or create one
    for (const w of unmatched) {
      let best = -1;
      let bestDist = Infinity;
      spare.forEach((p, i) => {
        if (p.color !== w.color || p.type !== w.type) return;
        const d = distance(p.square, w.square);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best >= 0) {
        const [p] = spare.splice(best, 1);
        p.square = w.square;
        place(p, animate);
        next.push(p);
      } else {
        next.push(createPiece(w, animate));
      }
    }

    // 3. Pieces no longer on the board: crumble if captured in a move, else fade
    const how = !animate ? 'none' : move ? 'crumble' : 'fade';
    for (const p of [...captured, ...spare]) removePiece(p, how);
    pieces = next;
  }

  // ---- Selection ---------------------------------------------------------

  function select(square) {
    selected = square;
    targets = legalTargets(square);
    paintSquares();
  }

  function clearSelection() {
    selected = null;
    targets = [];
    paintSquares();
  }

  const isTarget = (square) => targets.some((t) => t.to === square);
  const pieceAt = (square) => pieces.find((p) => p.square === square);

  async function attempt(from, to, draggedPiece) {
    clearSelection();
    const ok = await onMove(from, to);
    // Refused or cancelled (e.g. promotion dialog closed): slide the piece back
    if (!ok && draggedPiece) {
      draggedPiece.square = from;
      place(draggedPiece, true);
    }
  }

  // ---- Mouse / touch input ------------------------------------------------
  // Both styles work: click a piece then a square, or drag the piece.

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (!squaresLayer.contains(e.target)) return; // e.g. a click on the game-over card
    const square = squareAt(e.clientX, e.clientY);
    if (!square) return;

    // Second click of a click-click move
    if (selected && square !== selected && isTarget(square)) {
      e.preventDefault();
      attempt(selected, square, null);
      return;
    }

    if (canPickUp(square)) {
      e.preventDefault();
      const wasSelected = selected === square;
      select(square);
      drag = {
        from: square,
        piece: pieceAt(square),
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        wasSelected,
        pointerId: e.pointerId,
      };
      // Keep receiving pointer events even if the drag leaves the board
      try { root.setPointerCapture(e.pointerId); } catch { /* not supported for this pointer */ }
    } else {
      clearSelection();
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId || !drag.piece) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.moved = true;

    // The piece follows the pointer, centred under it
    const r = root.getBoundingClientRect();
    const size = r.width / 8;
    drag.piece.el.classList.add('dragging');
    drag.piece.el.style.transform =
      `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px)`;

    const over = squareAt(e.clientX, e.clientY);
    if (over !== hoverSquare) { hoverSquare = over; paintSquares(); }
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    hoverSquare = null;
    if (!d.piece) return;
    d.piece.el.classList.remove('dragging');

    if (!d.moved) {
      // A plain click: clicking the selected piece again puts it down
      if (d.wasSelected) clearSelection();
      return;
    }

    const to = cancelled ? null : squareAt(e.clientX, e.clientY);
    if (to && to !== d.from && isTarget(to)) {
      d.piece.square = to;      // drop it right where it was released
      place(d.piece, false);
      attempt(d.from, to, d.piece);
    } else {
      place(d.piece, true);     // not a legal square: slide back
      paintSquares();
    }
  }

  root.addEventListener('pointerup', (e) => endDrag(e, false));
  root.addEventListener('pointercancel', (e) => endDrag(e, true));

  buildSquares();

  // ---- What main.js can do with the board ----------------------------------
  return {
    setPosition,
    clearSelection,
    setHighlights({ lastMove: lm = null, check = null }) {
      lastMove = lm;
      checkSquare = check;
      paintSquares();
    },
    setFlipped(value) {
      flipped = value;
      buildSquares();
      for (const p of pieces) place(p, false);
    },
    get flipped() { return flipped; },
  };
}
