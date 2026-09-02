import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const args = process.argv.slice(2);
const isJoin = args[0] === "--join";
const username = isJoin ? "abam_test_join" : (args[0] || "kak_ros");
const text = args[1] || "Wah bestnya live malam ni member";

console.log("📛 WS_EVENTS.COMMENT_RECEIVED =", JSON.stringify((WS_EVENTS as any).COMMENT_RECEIVED));
console.log("🚀 Connecting...");
const socket = io("http://localhost:4000", { reconnection: false });

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);
  if (isJoin) { socket.emit("test:join", {}); console.log("👋 test:join dihantar"); return; }
  const names = Array.from(new Set([(WS_EVENTS as any).COMMENT_RECEIVED, "COMMENT_RECEIVED"].filter(Boolean)));
  console.log("📤 Emit:", names.join(" + "));
  for (const n of names) socket.emit(n, { username, text });
});

socket.onAny((event: string, data: any) => {
  console.log("📥 [EVENT]", event, "|", JSON.stringify(data).slice(0, 150));
});

setTimeout(() => { console.log("⏰ Selesai (15s)"); socket.disconnect(); process.exit(0); }, 15000);