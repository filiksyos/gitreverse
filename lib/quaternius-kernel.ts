/** Quaternius Universal Animation Library (Standard) clip names, from UAL1_Standard.glb. */
export const QUATERNIUS_CLIPS = [
  "A_TPose",
  "Crouch_Fwd_Loop",
  "Crouch_Idle_Loop",
  "Dance_Loop",
  "Death01",
  "Driving_Loop",
  "Fixing_Kneeling",
  "Hit_Chest",
  "Hit_Head",
  "Idle_Loop",
  "Idle_Talking_Loop",
  "Idle_Torch_Loop",
  "Interact",
  "Jog_Fwd_Loop",
  "Jump_Land",
  "Jump_Loop",
  "Jump_Start",
  "PickUp_Table",
  "Pistol_Aim_Down",
  "Pistol_Aim_Neutral",
  "Pistol_Aim_Up",
  "Pistol_Idle_Loop",
  "Pistol_Reload",
  "Pistol_Shoot",
  "Punch_Cross",
  "Punch_Jab",
  "Push_Loop",
  "Roll",
  "Sitting_Enter",
  "Sitting_Exit",
  "Sitting_Idle_Loop",
  "Sitting_Talking_Loop",
  "Spell_Simple_Enter",
  "Spell_Simple_Exit",
  "Spell_Simple_Idle_Loop",
  "Spell_Simple_Shoot",
  "Sprint_Loop",
  "Swim_Fwd_Loop",
  "Swim_Idle_Loop",
  "Sword_Attack",
  "Sword_Idle",
  "Walk_Formal_Loop",
  "Walk_Loop",
] as const;

export type QuaterniusClip = (typeof QUATERNIUS_CLIPS)[number];

export const QUATERNIUS_JOINTS = [
  "root",
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "Head",
  "clavicle_l",
  "upperarm_l",
  "lowerarm_l",
  "hand_l",
  "index_01_l",
  "index_02_l",
  "index_03_l",
  "index_04_leaf_l",
  "middle_01_l",
  "middle_02_l",
  "middle_03_l",
  "middle_04_leaf_l",
  "pinky_01_l",
  "pinky_02_l",
  "pinky_03_l",
  "pinky_04_leaf_l",
  "ring_01_l",
  "ring_02_l",
  "ring_03_l",
  "ring_04_leaf_l",
  "thumb_01_l",
  "thumb_02_l",
  "thumb_03_l",
  "thumb_04_leaf_l",
  "clavicle_r",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
  "index_01_r",
  "index_02_r",
  "index_03_r",
  "index_04_leaf_r",
  "middle_01_r",
  "middle_02_r",
  "middle_03_r",
  "middle_04_leaf_r",
  "pinky_01_r",
  "pinky_02_r",
  "pinky_03_r",
  "pinky_04_leaf_r",
  "ring_01_r",
  "ring_02_r",
  "ring_03_r",
  "ring_04_leaf_r",
  "thumb_01_r",
  "thumb_02_r",
  "thumb_03_r",
  "thumb_04_leaf_r",
  "thigh_l",
  "calf_l",
  "foot_l",
  "ball_l",
  "ball_leaf_l",
  "thigh_r",
  "calf_r",
  "foot_r",
  "ball_r",
  "ball_leaf_r",
] as const;

export const QUATERNIUS_KERNEL_ID = "quaternius-ual1";
export const QUATERNIUS_SKIN_NAME = "Armature";
export const QUATERNIUS_JOINT_COUNT = 65;
export const QUATERNIUS_CLIP_COUNT = 43;

/** In-place kernel (no root motion) — default for UI playback. */
export const QUATERNIUS_STANDARD_PUBLIC_PATH = "/quaternius/UAL1_Standard.glb";
/** Root-motion kernel — locomotion that travels. */
export const QUATERNIUS_ROOT_MOTION_PUBLIC_PATH = "/quaternius/UAL1_Standard_RM.glb";

export const KERNEL_PREVIEW_CLIPS: QuaterniusClip[] = [
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Crouch_Idle_Loop",
  "Crouch_Fwd_Loop",
  "Punch_Jab",
  "Punch_Cross",
  "Sword_Attack",
  "Death01",
  "Dance_Loop",
];

/** Map game verbs to Quaternius clip names. Agents should use these, not invented motion. */
export const GAME_ACTION_TO_CLIP: Record<string, QuaterniusClip | QuaterniusClip[]> = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  run: "Sprint_Loop",
  sprint: "Sprint_Loop",
  jump: ["Jump_Start", "Jump_Loop", "Jump_Land"],
  crouch: "Crouch_Idle_Loop",
  crouchWalk: "Crouch_Fwd_Loop",
  punch: ["Punch_Jab", "Punch_Cross"],
  sword: "Sword_Attack",
  hit: ["Hit_Chest", "Hit_Head"],
  death: "Death01",
  swim: "Swim_Fwd_Loop",
  sit: "Sitting_Idle_Loop",
  drive: "Driving_Loop",
  enterSeat: "Sitting_Enter",
  exitSeat: "Sitting_Exit",
  interact: "Interact",
  talk: "Idle_Talking_Loop",
  pickup: "Interact",
  dance: "Dance_Loop",
  taunt: "Dance_Loop",
  dive: "Roll",
  header: ["Jump_Start", "Jump_Loop", "Jump_Land"],
  pass: "Interact",
  shot: "Interact",
  tackle: "Interact",
  foul: ["Hit_Chest", "Hit_Head", "Roll"],
  celebration: "Dance_Loop",
  keeperDive: "Roll",
};

/** POSIX join so this module stays browser-safe (no node:path). */
function joinPosix(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
}

export function quaterniusKernelDir(cwd = process.cwd()): string {
  return joinPosix(cwd, "public", "quaternius");
}

export function quaterniusStandardDiskPath(cwd = process.cwd()): string {
  return joinPosix(quaterniusKernelDir(cwd), "UAL1_Standard.glb");
}

export function quaterniusRootMotionDiskPath(cwd = process.cwd()): string {
  return joinPosix(quaterniusKernelDir(cwd), "UAL1_Standard_RM.glb");
}

export function isDeformJoint(name: string): boolean {
  if (name === "root" || name === "Armature") return false;
  if (name.includes("_leaf_")) return false;
  return true;
}

export function resolveGameClip(
  action: string
): QuaterniusClip | QuaterniusClip[] | null {
  return GAME_ACTION_TO_CLIP[action] ?? null;
}
