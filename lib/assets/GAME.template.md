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

When listing out of scope: ban the full map, licensed music, a GLB per building, and a full custom animation graph. Do **not** ban the one on-camera hero mesh if the camera is third-person, over-shoulder, or otherwise frames a character. Playing the bundled Quaternius Universal clips on that hero is in v1.

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

### Hero / on-camera identity (critical)

Name the objects the camera inspects every shot. Those are **identity objects**, not environment filler.

- Camera type: [first person / third person / top down / side scroll / board / cockpit]
- Identity objects (player body, signature vehicle, boss, unique NPC, chess army, etc.):
- Hero treatment for v1: [required GLB sculpt / painted texture atlas on smooth capsules / 2D sprite sheet]
- What may stay primitive: distant extras, crates, lamps, generic traffic, repeating props

Rules:
- If the camera frames a character or hero vehicle every shot, v1 **must** ship a readable silhouette. Untextured cube stacks are not a character.
- "Optional hero mesh later" is forbidden for identity objects. Agents skip later.
- First-person / cockpit games can skip a detailed body.
- 2D games: the hero is a sprite sheet or texture atlas, not a GLB.
- Simple idle/walk/run on one hero is in scope: play the Quaternius Universal clips already bound on the hero GLB (`Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, jump and combat clips). Do not invent keyframes. A full custom animation graph and a GLB-per-building pipeline are not in v1.

### Asset tiers (critical)

Classify by **camera proximity**, not by object type. Buildings can be boxes. The player cannot, if the camera is on them.

| Tier | Use for | How |
| --- | --- | --- |
| Procedural | terrain, buildings, roads, sky, water, VFX, repeating world dressing | code geometry, canvas or generated textures |
| Distant primitives | crowd extras, crates, lamps, generic parked cars, trees at range | composed capsules/boxes, only if the camera never inspects them |
| Hero mesh | player avatar, signature vehicle, boss, unique on-camera characters, board pieces that *are* the game | one (or a few) GLB sculpts, **or** a painted atlas on smooth capsules. Never a stack of flat-colored cubes for a third-person body. |
| Generated 2D | HUD, billboards, 2D sprites, clothing/face atlases for capsule heroes | image gen or canvas. Do not billboard a photo as a 3D person. |

**Do not** generate a mesh per building or tree. **Do not** block the *world* on Meshy/Tripo. **Do** ship the hero identity mesh in v1 when the camera requires it.

Do not invent download URLs. If a later pipeline attaches generated GLBs, they will appear as section 10 after this document is written.

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
4. [Player / vehicle feel, with a readable hero silhouette, not a box stack]
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
- Treat the on-camera hero as an identity mesh: GLB sculpt or painted capsules, never untextured cubes in third person

### Don't

- Rebuild the entire commercial map
- One GLB per building or tree
- Put the hero GLB in "out of scope" while also requiring a third-person character
- Ship an untextured box-person or box-car as the thing the camera follows
- Billboard a generated photo as a 3D character
- 2000 line monolithic main file
- Add wanted system / multiplayer before driving or movement feels good
- Invent mechanics with no evidence from the game name / genre

## Evidence Notes

Document what came from external evidence vs model knowledge. Leave blank in v1 name only mode.
