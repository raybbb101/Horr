# Lights Out at Ashgrove

A first-person horror game that runs in the browser, alone or with one friend online. Textures, monsters and all sound are generated in code. There is no build step.

Ashgrove Sanatorium closed in 1974. Each floor has a different monster with its own rules. Find what opens the way out, and don't let it reach you.

## Stages

| # | Stage | Monster | How it hunts | Objective |
| --- | --- | --- | --- | --- |
| 1 | The East Wing | The Night Patient | Sees your lamp from far away, hears you run | 5 fuses, then the service lift |
| 2 | Cold Storage | The Mannequin | Only moves when nobody is looking at it. The power cuts out without warning | 4 drawer keys, then the steel door |
| 3 | The Boiler Room | The Drowned | Blind. Hunts by sound: splashing, running and turning valves are loud | Turn 3 valves, then the drain hatch |
| 4 | The Chapel | The Hollow | Closes in fastest in the dark. Stops while a lamp beam is on it, which drains the battery fast. Won't cross a lit candle | Light 4 candles, then the chapel doors |

Each stage is a new random maze every time.

The map in the top right starts blank and fills in as you see the halls (farther with the lamp on). Objectives you have spotted show as outlined squares, collected ones as solid squares, and a downed partner as a pulsing red dot wherever they are. The monster never shows on the map. In co-op, objectives either player spots appear on both maps.
 Clearing a stage unlocks it on the title screen.

## Weapons

You start each stage with at least one of each, and you can find more (up to 3 each). In co-op the kit is shared.

- **Camera flash** stuns the monster you point it at. It tears the Hollow apart for a while, and pins the Mannequin in place. The Drowned is blind, so the click only tells it where you are.
- **Flare** burns for 10 seconds. Lit next to a monster, it sends the monster away for 15 seconds. While it burns, monsters won't come near it. The Drowned is drawn to it instead, and sinks when it gets there.

## Co-op (2 players, online)

1. One player taps **Host co-op** and gets a 4-character room code.
2. The other taps **Join co-op** and types the code.
3. The host presses **Start**.

When the monster catches someone in co-op, that player goes down instead of dying. The partner revives them by standing over them for 3 seconds. If both players are down, the stage restarts. The exit only opens when both players are standing at it.

Online play uses [PeerJS](https://peerjs.com/) (`vendor/peerjs.min.js`, MIT license). The free PeerJS server matches the two players, then the game connects them directly (peer to peer). Some strict mobile or office networks block direct connections. If joining keeps failing, try Wi-Fi on both devices. Online play only works on the website or the installed app, not inside the Claude preview.

## Controls

| Keyboard / mouse | Touch | Action |
| --- | --- | --- |
| W A S D | Left thumb | Walk (hold C, or push the stick only a little, to sneak) |
| Mouse, or ← → | Right thumb | Look around |
| Shift | Far push on the stick, or Run | Run |
| F, or right-click | Lamp | Lamp on or off |
| Q, or left-click | Flash | Camera flash |
| E | Flare | Light a flare |
| Esc / P | Pause button | Pause (in co-op the game keeps running) |

## Settings and language

**Settings** (on the title screen and in the pause menu) switches the language between English (default) and Japanese (日本語). The choice is remembered on the device. In co-op each player can use a different language, because the game sends message IDs between players, not text.

All text lives in `i18n.js`. To add a language, copy the `en` block, translate it, and add a button with `data-lang="<code>"` to the Settings screen in `index.html`.

## Play and install

- Open `index.html` through a web server (`python3 -m http.server`, then visit http://localhost:8000).
- To install it as an app: turn on GitHub Pages for this repo (**Settings → Pages → Deploy from a branch**, pick the branch, folder `/ (root)`), open `https://raybbb101.github.io/Horr/` in Chrome, and tap **Install app** or Chrome's **Add to Home screen**. On iPhone use Safari's **Share → Add to Home Screen**.

## Files

- `index.html`: screens and styling
- `game.js`: the game (raycaster, stages, monsters, weapons, audio, co-op netcode)
- `i18n.js`: all English and Japanese text
- `sw.js`, `manifest.webmanifest`, `icons/`: installable app and offline support
- `vendor/peerjs.min.js`: PeerJS 1.5.4 for online play
