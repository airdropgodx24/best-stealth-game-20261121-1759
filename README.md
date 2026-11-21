# best-stealth-game-20261121-1759

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/airdropgodx24/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/airdropgodx24/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

The Quiet Archive: a top-down stealth game. You are Wren, a courier in a night archive. Slip past patrolling wardens and their amber vision cones, hide in shadow pools, take every seal-stamp, and reach the east door unseen — across three rooms that get busier, darker and less forgiving.

## How it plays

- **Move** with WASD or the arrow keys; **click** anywhere to walk there.
- **Hold Shift to sneak**: slower, silent, and harder to spot. Running is loud — nearby wardens turn to look.
- **Vision cones** are what a warden can see. **Shelves block sight.** Standing in a **dark pool** hides you even inside a cone.
- A warden who grows suspicious turns to look, then gives chase. Get fully spotted and the room starts over.
- Take **every seal-stamp** and the exit door opens. Reach it to clear the room. Three rooms: The Reading Room, The Map Room, The Vault Stair.

All art is drawn in code and all sounds are synthesised in the browser — no assets, no network, nothing to download.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
python3 -m http.server --directory out/game 8000
```

Then open http://localhost:8000 in a desktop browser. `main.ts` (Node 22) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `vendor/makefun-game.ts` library; running it twice writes identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ty7xpzdw&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
