# Game Spec: [Game Title]

## 1. Identity & Feel

Describe the game's mood, era, camera, and what one play session feels like.

- Title:
- Genre / subgenre:
- Era / setting:
- Core fantasy (what the player imagines they are):
- Session length target:
- Reference feel (not a clone disclaimer):

### Key Characteristics

- [Characteristic]
- [Characteristic]
- [Characteristic]

## 2. Vertical Slice (Honest Scope)

Define a **buildable** slice, not the full commercial game.

- What ships in v1:
- What is explicitly out of scope:
- Win / lose / fail states:
- Single player only unless evidence says otherwise:

## 3. Frozen Stack

Pick the smallest stack that fits the game. **Freeze it** so agents do not swap engines mid build.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | [Browser / Canvas 2D / Three.js / R3F] | |
| Language | TypeScript | |
| Bundler | Vite | |
| Physics | [None / custom arcade / Rapier only if required] | |
| Audio | Web Audio API | |
| State | module store or minimal zustand for HUD only | |

### Stack rules

- 2D platformers: Canvas 2D or lightweight Phaser, not Three.js.
- 3D open world / driving: Vite + TypeScript + **vanilla Three.js** (no React Three Fiber unless UI heavy).
- Do **not** add Rapier, Cannon, or Unity unless the game is literally a physics toy.
- No backend for v1. Static deploy.

## 4. Architecture

Simulation core must never import the renderer.

```
src/core/       math, input intent, fixed timestep loop (no three)
src/world/      procedural world / level data (pure where possible)
src/systems/    collision, AI, camera helpers
src/render/     three.js or canvas only here
src/ui/         DOM HUD overlay
src/main.ts     orchestrator
```

- Fixed timestep: 60 Hz simulation, render once per frame.
- No allocations in hot paths (reuse vectors, pool particles).
- One input abstraction: keyboard + touch feed the same intent struct.

## 5. Mechanics & Controls

| Verb | Input | Behavior |
| --- | --- | --- |
| [Move] | | |
| [Jump / accelerate] | | |
| [Interact] | | |

### Camera

- [Third person chase / top down / side scroll]
- Lag, look ahead, FOV vs speed if 3D

### Fail states

- [Death / wasted / game over flow]

## 6. World & Art Direction

### Palette

| Role | Color | Usage |
| --- | --- | --- |
| Sky / background | | |
| Ground / road | | |
| Accent | | |
| UI | | |

### Lighting & atmosphere

- Time of day:
- Fog / bloom / post FX level:
- Mood keywords:

### Asset tiers (critical)

| Tier | Use for | How |
| --- | --- | --- |
| Procedural | terrain, buildings, roads, VFX | code geometry, canvas textures |
| Primitives | cars, characters, props at v1 | composed meshes, not GLB per object |
| Generated GLB | optional hero mesh later | one character or vehicle max |

**Do not** generate a mesh per building. **Do not** block shipping on Meshy/Tripo.

## 7. Audio & HUD

### Audio

- Music: [style, loop, when it plays]
- SFX: [engine, impacts, UI — Web Audio synthesis preferred for v1]

### HUD

- Speed / health / score / minimap as needed
- Touch controls on coarse pointers
- Start screen + game over screen

## 8. Implementation Order

Build working code at each step before adding features.

1. [Scaffold + blank scene]
2. [Core loop + input]
3. [World / level]
4. [Player / vehicle feel]
5. [Camera]
6. [Collision + damage]
7. [NPCs / traffic / enemies if any]
8. [HUD + SFX]
9. [Mobile quality presets]

## 9. Do / Don't

### Do

- Ship a playable vertical slice first
- Tune **feel** (acceleration, camera, impact) before adding content
- Keep `core/` free of renderer imports
- Use seeded procedural generation for replayable worlds

### Don't

- Rebuild the entire commercial map
- One GLB per building or tree
- 2000 line monolithic main file
- Add wanted system / multiplayer before driving or movement feels good
- Invent mechanics with no evidence from the game name / genre

## Evidence Notes

Document what came from external evidence vs model knowledge. Leave blank in v1 name only mode.
