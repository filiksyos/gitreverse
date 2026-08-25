# Game reverse prompts (Quaternius kernel)

Branch: `cursor/quaternius-kernel-rig-dd1a` (game reverse + `autoRigToQuaterniusKernel`, not vanilla repo reverse).

LLM / Meshy keys were not present in this environment, so these were written in the **exact voice and shape** GitReverse emits:

1. A short synthetic user message (`GAME_REVERSE_SYSTEM_PROMPT`: conversational, outcome focused, honest slice, no hyphens in that opener).
2. The kernel appendix GitReverse would attach after Meshy + auto-rig (`appendHeroAssetInstructions` in `lib/game-hero-assets.ts`), expanded so a coding agent can build **from scratch** (no live Meshy GLB URLs).

Clip names, joint count, skin name, and both UAL files are taken from `lib/quaternius-kernel.ts` and the vendored CC0 files in `public/quaternius/`. Kernel contract tests on those GLBs passed (`UAL1_Standard.glb` / `UAL1_Standard_RM.glb`: 65-joint `Armature`, 43 clips; auto-rig keeps `Idle_Loop` / `Walk_Loop` / `Sprint_Loop`).

Original titles only. Do not use Rockstar or EA names, maps, teams, logos, or characters.

Copy everything inside each `PROMPT` fence into a follow-up cloud agent.

---

## 1. Cinder Bay (open-world crime sandbox)

Genre target: third person city, vehicles, missions, on foot plus driving. Original IP.

````text
Build me Cinder Bay, a browser game where I roam one sunbaked port city on foot and in cars. Third person camera over the shoulder, neighborhood crime sandbox, one district I can actually finish: Iron Wharf, Ridge Hill, and Market Cut. I play a stylish original hustler, not a stack of boxes, and they have to idle, walk, jog, sprint, jump, throw punches, crouch, and sit in a car instead of T posing. On foot it should feel punchy. Give me a few missions like deliver a bag, shake a tail, and boost a parked coupe. Driving should be arcade and a little loose, scooters and cheap cars, with my character in a driving pose while I steer. Keep buildings procedural. Original city, original people, no licensed names or maps. A playable slice in the browser is enough.

Movement system (do this first, before missions):

Auto-rig every on-camera humanoid onto the Quaternius Universal Animation Library [Standard] kernel. That kernel is a 65-joint skin named Armature (kernel id quaternius-ual1). Copy these two CC0 files into public/quaternius/ (from gitreverse public/quaternius/ on this branch, or the same Quaternius UAL1 Standard pack):

- UAL1_Standard.glb for in-place clips (you move the character transform in code).
- UAL1_Standard_RM.glb for traveling root-motion locomotion (same bone names).

Bind T-pose hero meshes the way gitreverse does in autoRigToQuaterniusKernel (lib/auto-rig-humanoid.ts): fit the mesh to Universal height (~1.829m, Y-up, feet on the ground), write JOINTS_0 / WEIGHTS_0 (4 influences), replace the kernel mannequin, keep all 43 embedded clips. Do not rebuild heroes from boxes. Do not T-pose in gameplay. A_TPose is bind pose only.

Download these 3D models into public/models/ and load them with GLTFLoader. Do not rebuild these heroes from boxes.
- player.glb (Quaternius Universal rig; play Idle_Loop / Walk_Loop / Sprint_Loop — do not T-pose)
Clip names: Idle_Loop (stand), Walk_Loop (move), Jog_Fwd_Loop, Sprint_Loop (run), Jump_Start then Jump_Loop then Jump_Land, Punch_Jab / Punch_Cross, Sword_Attack, Death01. Use AnimationMixer. Optional traveling locomotion: public/quaternius/UAL1_Standard_RM.glb (same skeleton). In-place kernel copy: public/quaternius/UAL1_Standard.glb.

Drive clips with Three.js AnimationMixer the way gitreverse previews them (fade ~0.18s, one action at a time). Never invent skeletal animation or a custom animation graph. Map verbs to real clip names only:

- idle → Idle_Loop
- walk → Walk_Loop
- jog → Jog_Fwd_Loop
- run / sprint → Sprint_Loop
- jump → Jump_Start then Jump_Loop then Jump_Land
- crouch → Crouch_Idle_Loop ; crouch walk → Crouch_Fwd_Loop
- punch → Punch_Jab / Punch_Cross
- hit → Hit_Chest / Hit_Head
- death → Death01
- enter / sit in car → Sitting_Enter then Sitting_Idle_Loop (or Driving_Loop once moving)
- drive → Driving_Loop
- exit car → Sitting_Exit
- pickup / talk → Interact / Idle_Talking_Loop
- dive → Roll
- taunt → Dance_Loop
- swim if you add water → Swim_Idle_Loop / Swim_Fwd_Loop

Pistol_* clips exist on the kernel if you add a simple firearm later. Sword_Attack is on the kernel; you do not need a melee weapon for v1.

v1 slice:
- Vite + TypeScript + vanilla Three.js. No React Three Fiber. No Rapier/Cannon. No backend.
- Split simulation from render: src/core (input, 60 Hz step), src/world (seeded procedural district), src/systems, src/render, src/ui, src/main.ts.
- One playable district, not a whole county. Roads, blocks, and buildings are procedural. Distant extras may be capsules. The player body is a readable auto-rigged GLB. One signature coupe can be a vehicle sculpt (do not bind cars onto the humanoid Armature).
- Arcade vehicles: accelerate, brake, steer, hop in/out. Camera chases on foot and sits a little higher while driving.
- Three missions with fail/retry: deliver a bag across the district, lose a chasing car, steal the parked coupe and bring it home.
- Keyboard + touch. Start screen + pause. Heat / wanted / multiplayer wait until walk and drive feel good.

Do not use licensed city names, gang names, character names, or vehicle names from commercial crime games. Original only.
````

---

## 2. Floodlight Eleven (football / soccer match)

Genre target: 11v11 or small-sided, match flow, players that actually run and kick. Original IP.

````text
Build me Floodlight Eleven, a browser soccer match I can actually play. One floodlit pitch, eleven versus eleven, or a tight five a side if eleven is too heavy. Two original kits, Harbor Rovers in teal versus Milltown Athletic in amber, no real clubs or players. Everyone on the pitch has to look like a person, not a stack of boxes, and they have to idle, walk, jog, sprint, jump for headers, and strike the ball instead of T posing. I want match flow: kickoff, pass, shot, save, a scoreboard, and a final whistle. Camera follows the ball from a broadcast angle. Let me shoot with one button, pass with another, and sprint with a modifier so it feels like a match, not a menu. Keep the pitch procedural. Make running and kicking feel good before you add career mode.

Movement system (do this first, before tactics):

Auto-rig every on-camera humanoid onto the Quaternius Universal Animation Library [Standard] kernel. That kernel is a 65-joint skin named Armature (kernel id quaternius-ual1). Copy these two CC0 files into public/quaternius/ (from gitreverse public/quaternius/ on this branch, or the same Quaternius UAL1 Standard pack):

- UAL1_Standard.glb for in-place clips (you move the player transform in code).
- UAL1_Standard_RM.glb for traveling root-motion locomotion (same bone names).

Bind T-pose player meshes the way gitreverse does in autoRigToQuaterniusKernel (lib/auto-rig-humanoid.ts): fit the mesh to Universal height (~1.829m, Y-up, feet on the ground), write JOINTS_0 / WEIGHTS_0 (4 influences), replace the kernel mannequin, keep all 43 embedded clips. Clone that one rigged humanoid for both teams and tint kits in code. Do not rebuild players from boxes. Do not T-pose in gameplay. A_TPose is bind pose only.

Download these 3D models into public/models/ and load them with GLTFLoader. Do not rebuild these heroes from boxes.
- player.glb (Quaternius Universal rig; play Idle_Loop / Walk_Loop / Sprint_Loop — do not T-pose)
Clip names: Idle_Loop (stand), Walk_Loop (move), Jog_Fwd_Loop, Sprint_Loop (run), Jump_Start then Jump_Loop then Jump_Land, Punch_Jab / Punch_Cross, Sword_Attack, Death01. Use AnimationMixer. Optional traveling locomotion: public/quaternius/UAL1_Standard_RM.glb (same skeleton). In-place kernel copy: public/quaternius/UAL1_Standard.glb.

Drive clips with Three.js AnimationMixer (fade ~0.18s, one action at a time). Never invent skeletal animation, never author a kick cycle, never build a custom animation graph. This kernel has no Kick clip. Strike the ball with arcade physics and play a real clip as the body beat:

- idle / keeper set → Idle_Loop
- walk into space → Walk_Loop
- jog → Jog_Fwd_Loop
- sprint chase → Sprint_Loop
- header / jump challenge → Jump_Start then Jump_Loop then Jump_Land
- pass / shot / tackle contact → Interact (generic use; this is the kernel strike beat, not a custom kick)
- foul / collision → Hit_Chest or Hit_Head or Roll
- goal celebration → Dance_Loop
- keeper save dive → Roll
- kickoff stand / whistle wait → Idle_Loop or Idle_Talking_Loop

Do not use Punch_Jab as a kick unless Interact is missing. Do not use Sword_Attack on the pitch.

v1 slice:
- Vite + TypeScript + vanilla Three.js. No React Three Fiber. No Rapier unless the ball truly needs it; arcade ball (impulse, friction, bounce) is enough.
- Split simulation from render: src/core (input, 60 Hz step, match clock), src/world (pitch, goals, ball), src/systems (AI runs, possession), src/render, src/ui, src/main.ts.
- One floodlit pitch, procedural grass and stands. Identity objects: 10 or 22 kernel-rigged players plus a sphere ball. Distant crowd can be primitives.
- Prefer 11v11 with simple AI (all share the same Armature and clips). If that is too heavy, ship 5v5 on the same pitch and keep the same movement system.
- Match flow: kickoff, possession, pass, shot, save, out of play restart, halftime optional, final whistle, scoreboard. Offside and career mode are out of scope.
- Camera: broadcast follow on the ball, slight lag, stay readable in the box.
- Keyboard + touch. Start screen that picks Harbor Rovers or Milltown Athletic.

Do not use licensed league names, club crests, player names, or commentary packs. Original kits only.
````
