# Lights Out at Ashgrove

A first-person horror game that runs in the browser, alone or with up to three friends online (4 players). Textures, monsters and all sound are generated in code. There is no build step.

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

You start each stage with at least one of each, and you can find more (up to 3 each). In co-op the whole team shares one kit.

- **Camera flash** stuns the monster you point it at for about 5 seconds. It tears the Hollow apart for a while, and pins the Mannequin in place. The Drowned is blind, so the click only tells it where you are.
- **Flare** burns for 10 seconds. Lit next to a monster, it sends the monster away for 35 seconds. It then comes back at a random spot at least 12 tiles from everyone and stands still for a few seconds before it moves. While it burns, monsters won't come near it. The Drowned is drawn to it instead, and sinks when it gets there.

## Co-op (up to 4 players, online)

1. One player taps **Host co-op** and gets a 4-character room code.
2. Up to three others tap **Join co-op** and type the code. The room shows how many players are in (for example 3 of 4). A fifth player is turned away, and nobody can join once the game has started.
3. The host presses **Start** when everyone is in.

Each player has a different coat colour. When the monster catches someone in co-op, that player goes down instead of dying, and any teammate can revive them by standing over them for 3 seconds. Downed teammates show on everyone's map. If everyone is down, the stage restarts. The exit only opens when every player still in the game is standing at it. If someone disconnects, the rest keep playing.

Online play uses [PeerJS](https://peerjs.com/) (`vendor/peerjs.min.js`, MIT license). The free PeerJS server matches the players, then each guest connects directly to the host's game (peer to peer). The host's device runs the monster and the world, so the player with the best connection should host. Some strict mobile or office networks block direct connections. If joining keeps failing, try Wi-Fi on both devices. Online play only works on the website or the installed app, not inside the Claude preview.

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

**Settings** (on the title screen and in the pause menu) switches the language between English (default), Japanese (日本語) and Traditional Chinese (繁體中文). The choice is remembered on the device. In co-op each player can use a different language, because the game sends message IDs between players, not text.

All text lives in `i18n.js`. To add a language, copy the `en` block, translate it, and add a button with `data-lang="<code>"` to the Settings screen in `index.html`.

## Play and install

- Open `index.html` through a web server (`python3 -m http.server`, then visit http://localhost:8000).
- To install it as an app: turn on GitHub Pages for this repo (**Settings → Pages → Deploy from a branch**, pick the branch, folder `/ (root)`), open `https://raybbb101.github.io/Horr/` in Chrome, and tap **Install app** or Chrome's **Add to Home screen**. On iPhone use Safari's **Share → Add to Home Screen**.

## Files

- `index.html`: screens and styling
- `game.js`: the game (raycaster, stages, monsters, weapons, audio, co-op netcode)
- `i18n.js`: all English, Japanese and Traditional Chinese text
- `sw.js`, `manifest.webmanifest`, `icons/`: installable app and offline support
- `vendor/peerjs.min.js`: PeerJS 1.5.4 for online play
