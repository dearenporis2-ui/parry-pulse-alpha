# Character Sprites

Drop your Aseprite exports here as flat PNGs (single frame or a simple
sprite you're happy rendering un-animated for now):

- `player_A.png` — Team A character (rendered rotated to face aim direction)
- `player_B.png` — Team B character

Recommended size: 64x64 (will be scaled to the player's hitbox automatically).
Until these exist, players render as colored circles with a facing wedge —
see `client/js/renderer.js` -> `drawPlayer()`.
