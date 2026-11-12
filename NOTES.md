# Project map

One line per file: what it is and why it's there.

- `index.html`: the page layout, plus the carved-stone piece drawings (defined once, reused by every piece). It holds the board in its stone frame, the name bars, the side panel (status, move list, Undo/Flip, new-game setup), the game-over card and the promotion picker.
- `style.css`: the "enchanted stone" look. Marble and slate squares with stone grain, the carved frame, candle-glow highlights, marble and granite pieces, the flickering background glow, and the panel and button styles.
- `main.js`: the game's "referee". It keeps the game state with chess.js, decides whose turn it is, asks the computer for moves, and updates the status, move list and buttons.
- `board.js`: the board on screen. It draws squares and pieces, animates moves (lift, glide, settle) and captures (shake and crumble into fragments), and turns clicks and drags into move attempts. It doesn't know the rules; it asks `main.js`.
- `engine.js`: the computer opponent's brain. It looks a few moves ahead and scores positions to pick a move. It has five rating levels: New (100–300), Beginner (300–600), Novice (600–1000), Intermediate (1000–1500) and Club Player (1500–2000). They differ in how far ahead the computer looks, how much randomness it adds, and how often it plays a random "blunder". The ratings are estimates. The level list here also feeds the options on the page.
- `ai-worker.js`: runs `engine.js` in a background thread so the page stays smooth while the computer thinks.
- `serve.py`: starts a local web server (`python3 serve.py`, then open http://localhost:8000) that always gives the browser the latest files.
- `NOTES.md`: this file, a map of the project.
- `CLAUDE.md`: instructions for Claude on how to work with me on this project.
- `.claude/settings.json`: Claude Code settings for this project (currently the Explanatory output style).
- `.gitignore`: files git should never save, such as macOS `.DS_Store` clutter and `node_modules/`.

chess.js isn't stored in the project. `main.js` and `ai-worker.js` download it from a CDN (a public file server) when the page opens.
