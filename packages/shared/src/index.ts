export const WS_EVENTS = {
  COMMENT_RECEIVED: "comment:received",
  GIFT_RECEIVED: "gift:received",
  MODE_CHANGED: "mode:changed",
  VOICE_CHANGED: "voice:changed",
  APPROVAL_REQUEST: "approval:request",
  APPROVAL_DECISION: "approval:decision",
  TIKTOK_CONNECT: "tiktok:connect",
  TIKTOK_DISCONNECT: "tiktok:disconnect",
  TIKTOK_STATUS: "tiktok:status",
  AUDIO_CLAIM: "audio:claim",
  HOST_CUE: "host:cue",
  LIVE_STATS: "live:stats",
  LIVE_VIPS: "live:vips",
  AUDIO_ROUTE: "audio:route",
  AI_RESPONSE_READY: "ai:response:ready",
  POLICY_VIOLATION: "policy:violation",
  COMMENT_LOG: "comment:log",
} as const;

export type LiveMode = "REGULAR" | "SHOPPABLE";


