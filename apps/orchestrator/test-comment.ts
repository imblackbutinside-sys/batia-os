import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket = io("http://localhost:4000");
socket.on("connect", () => {
  console.log("[TEST] connected:", socket.id);
  const text = process.argv[2] || "mainkan lagu sejati";
  console.log("[TEST] hantar komen:", text);
  socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_viewer", text });
  setTimeout(() => { console.log("[TEST] done"); process.exit(0); }, 10000);
});
socket.on("connect_error", (e) => { console.error("[TEST] error:", e.message); process.exit(1); });
