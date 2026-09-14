# Weapon Sprites

Not yet wired into the renderer (v1 shows weapons implicitly via the
facing wedge / swing arc), but registered in the Asset Manager for when
you're ready to layer them onto the character sprite:

- `revolver.png`
- `katana.png`

To actually draw these, add a draw call in `renderer.js` -> `drawPlayer()`
using `assetManager.getImage('revolver')` / `'katana'`.
# Weapon Art Drop Zone

Export transparent PNGs from Aseprite and place them here with these exact names:

| Filename | Use |
| --- | --- |
| `katana.png` | Sword held by every player |
| `pistol.png` | Pistol held after a pistol pickup |
| `rifle.png` | Rifle held after a rifle pickup |
| `pistol_pickup.png` | Pistol floating on the arena floor |
| `rifle_pickup.png` | Rifle floating on the arena floor |
| `revolver.png` | Legacy fallback gun sprite |

Recommended: export each weapon facing right, with a transparent background.
The renderer rotates it toward the player aim. Pickup art can be wider than held
art; both have procedural fallbacks until you add your PNGs.
