# Project map

One line per file: what it is and why it's there.

- `index.html`: the page itself. It sets up the title, the status line and an empty board, and loads the other two files.
- `style.css`: the look. It draws the board as an 8×8 grid of light and dark squares and highlights the selected piece.
- `main.js`: the behaviour. It uses the chess.js rules library to track the game, draws the pieces, and turns clicks into moves.
- `NOTES.md`: this file, a map of the project.
- `CLAUDE.md`: instructions for Claude on how to work with me on this project.
- `.claude/settings.json`: Claude Code settings for this project (currently the Explanatory output style).
- `.gitignore`: files git should never save, such as macOS `.DS_Store` clutter and `node_modules/`.

chess.js isn't stored in the project. `main.js` downloads it from a CDN (a public file server) when the page opens.
