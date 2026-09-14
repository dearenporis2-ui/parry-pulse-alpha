# PARRY-PULSE

A 2v2 top-down arena shooter. Revolver for ranged damage, katana for melee —
and if you time a slash exactly as a bullet reaches you, you reflect it back
at double speed. Slash a teammate's bullet instead and it comes out **supercharged**.

Built with vanilla HTML5 Canvas + JavaScript on the client and Node.js +
WebSockets (`ws`) on the server, which is fully authoritative (the server
decides who moved where, who shot what, and who got parried — clients only
render and send input).

---

## 1. Install & Run

Requires [Node.js](https://nodejs.org) 18+.

```bash
cd server
npm install
npm start
```

You should see:

```
PARRY-PULSE server listening on http://localhost:3000
```

## 2. Play

Open **http://localhost:3000** in up to **4 browser tabs/windows** (this is
currently a single fixed lobby — see "Multiplayer & Rooms" below for how to
extend it to shareable room codes). The first two connections become Team A,
the next two become Team B. A round auto-starts once at least 2 players have
joined, so you can also test 1v1 by opening just 2 tabs.

**Controls:**
| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Aim |
| `1` / `2`, or Mouse Wheel | Equip Revolver / Katana |
| Left Click (Revolver) | Fire revolver |
| Left Click (Katana) | Dash strike (uses Blade Energy; can be parried) |
| Right Click (Katana) | Katana slash / parry |
| Shift / Space | Directional dash (3 charges; each recharges after 5 seconds) |
| E | Use your selected ability (Blink or Kinetic Pulse) |

**How to parry:** right-click just as an enemy bullet is about to reach you.
If your katana connects with it (range + arc check happens server-side),
the bullet reverses and doubles in speed, dealing lethal damage back. Miss
the timing and you're staggered (slowed, visibly tinted) for a moment — so
it's a real risk/reward, not a free block. You can also parry your
teammate's bullets to supercharge them (even bigger speed/damage boost).

First team to 3 round wins takes the match.

### Gun pickups and abilities

Players begin each round with a katana. Pistols and rifles spawn at random safe
points around the arena; walk over one to equip it automatically, then use `1`
or the mouse wheel to select it. The pistol is deliberate and hard-hitting;
the rifle fires fast, lower-damage shots.

Before entering the arena, choose one ability. **Blink** teleports to a valid
point under your cursor within range. **Kinetic Pulse** knocks nearby enemies
away. Both are activated with `E` and share a 9-second cooldown.

---

## 3. Project Structure

```
parry-pulse/
├── server/                  Authoritative Node.js/WebSocket backend
│   ├── server.js            Express static server + WS message router + game loop
│   ├── GameRoom.js           Core simulation: movement, shooting, parry, rounds
│   ├── Player.js             Player entity/state machine
│   ├── Bullet.js             Bullet entity (supports mid-flight re-launch on parry)
│   ├── constants.js          ALL gameplay tuning numbers live here
│   └── package.json
│
└── client/                  Static front-end, no build step required
    ├── index.html            Join screen + canvas + HUD
    ├── style.css
    ├── js/
    │   ├── main.js            Orchestrator / game loop
    │   ├── network.js         WebSocket wrapper
    │   ├── input.js           Keyboard/mouse capture -> server intent
    │   ├── renderer.js        All canvas drawing (image-if-present, else shape)
    │   ├── juiceManager.js    Hit-stop, screen shake, flash, particle hooks
    │   ├── particles.js       Particle system (bursts, tracers, dust)
    │   ├── assetManager.js    Sprite/SFX registry + fallback logic (READ THIS FIRST)
    │   ├── audioManager.js    Real-audio playback + synthesized placeholder SFX
    │   └── constants.js       Cosmetic-only constants (colors, radii for drawing)
    └── assets/
        ├── sprites/{characters,weapons,bullets,effects}/  (each has a README)
        └── audio/{sfx,music}/                              (each has a README)
```

---

## 4. Dropping In Your Own Art & Sound

This is the whole reason `assetManager.js` and `audioManager.js` exist as
separate modules — **you should never need to touch rendering or gameplay
code to swap in real assets.**

1. Export your Aseprite sprite as a flat PNG (or a WAV/MP3 for sound).
2. Save it into the matching folder under `client/assets/...` using the
   **exact filename** listed in that folder's `README.md` (also documented
   in `IMAGE_MANIFEST` / `AUDIO_MANIFEST` inside `assetManager.js`).
3. Refresh the page.

That's it. `AssetManager` tries to load every manifest entry on startup;
anything missing just leaves the existing procedural fallback (colored
shapes for sprites, synthesized WebAudio tones for SFX) in place, so the
game is 100% playable before you've made a single asset and upgrades
piece-by-piece as you add them.

If you want to change *which* sprite renders where (e.g. add a weapon
overlay sprite, or swap the particle dots for a `spark.png`), that's a
one-line change in `renderer.js` / `particles.js` — the loading/fallback
plumbing is already done.

---

## 5. Tuning Game Feel

- **Gameplay numbers** (speed, damage, timers, arena/obstacle layout,
  parry window, round rules): `server/constants.js`.
- **Juice intensity** (hit-stop frame counts, shake magnitude/duration,
  flash color/duration, particle counts): the `juice.*` calls in
  `client/js/main.js`'s `handleEvent()` function.

---

## 6. Multiplayer & Rooms

Right now the server creates **one fixed `GameRoom`** and every connecting
socket joins it (good for local testing with browser tabs). `GameRoom.js`
was written so this is easy to extend later:

- Keep a `Map<roomCode, GameRoom>` in `server.js`.
- Generate a short code on a `create_room` message, `new GameRoom()` it, and
  reply with the code.
- On `join_room`, look up the room by code and call its existing
  `addPlayer()` — nothing inside `GameRoom` needs to change.

---

## 7. Known v1 Limitations (by design, to keep this buildable/testable today)

- No matchmaking/room codes yet (single lobby, see above).
- No client-side prediction/reconciliation — movement is fully server-driven
  with light interpolation, so on a real internet connection (not
  localhost) you'll feel some input latency. Fine for LAN/localhost testing;
  worth revisiting before a public deploy.
- Weapon/effect sprites are registered in the Asset Manager but not yet
  layered onto the character in `renderer.js` — only character, bullet, and
  arena-floor images are drawn today. Wiring up weapon sprites is a small,
  clearly-marked addition (see the weapons README).
