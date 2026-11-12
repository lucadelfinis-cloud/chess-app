// Runs the computer opponent in a background thread (a "Web Worker"), so the page
// stays smooth while it thinks. main.js sends a position; this sends back a move.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { chooseMove } from './engine.js';

self.onmessage = (event) => {
  const { id, fen, level } = event.data;
  const move = chooseMove(new Chess(fen), level);
  self.postMessage({ id, move });
};
