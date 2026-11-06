# Lights Out at Ashgrove

A short first-person horror game that runs in the browser. It is a single file (`index.html`) with no dependencies. The textures, the monster and all of the sound are generated in code.

The power has failed in the east wing of Ashgrove Sanatorium. Find the five fuses, restore power to the service lift, and get out. Something tall walks the halls. It notices your lamp and it hears you run.

## Play

Open `index.html` in a browser. To serve it locally instead:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

## Controls

| Input | Action |
| --- | --- |
| W A S D | Walk |
| Mouse, or ← → | Look around |
| Shift | Run (uses breath, and it can hear you) |
| F, or right-click | Lamp on or off |
| Esc / P | Pause |

On touch screens, drag with your left thumb to walk and your right thumb to look. Run and Lamp buttons are at the bottom right.

## How it works

- **Map**: every run generates a new maze. It adds loops and a few small rooms, puts the fuses in far-apart dead ends, and puts the lift on the outer wall farthest from where you start.
- **The monster**: it wanders toward your part of the ward. It starts hunting when it sees you (from about 11 tiles away with the lamp on, about 3 with it off) or hears you running. It follows you with grid pathfinding and gets faster with every fuse you pick up.
- **Lamp**: the battery drains while the lamp is on and flickers when it gets low. Spare batteries are scattered around.
- **Rendering**: a raycaster draws textured walls, floor and ceiling into a low-resolution buffer. The flashlight cone, distance falloff, vignette, film grain and red dread tint are all applied per pixel.
- **Audio**: Web Audio makes the ambient drone, footsteps, a heartbeat that speeds up as the monster gets close, growls panned toward the monster, background noises, and the jumpscare scream.
