import { io } from "socket.io-client";

const username = process.argv[2] || "kak_ros";
const text = process.argv[3] || "Wah bestnya live malam ni member";

console.log(`\n🚀 Menghantar test komen...`);
console.log(`👤 Username: "${username}"`);
console.log(`💬 Komen: "${text}"\n`);

const socket = io("http://localhost:4000", {
  reconnection: false,
  timeout: 5000
});

socket.on("connect", () => {
  console.log("✅ Connected to backend Socket.IO");
  
  // Kita hantar dengan 2 nama event berbeza untuk pastikan satu pun masuk
  console.log("📤 Menghantar event 'COMMENT_RECEIVED'...");
  socket.emit("COMMENT_RECEIVED", { username, text });
  
  console.log("📤 Menghantar event 'comment:received' (fallback)...");
  socket.emit("comment:received", { username, text });

  // Dengar semua possible response
  socket.on("AI_RESPONSE_READY", (data: any) => {
    console.log("\n🎉 BERJAYA! Backend balas dengan audio:", data.audioUrl);
  });

  socket.on("disconnect", (reason) => {
    console.log(`\n⚠️ Disconnected: ${reason}`);
  });
  
  socket.on("connect_error", (err) => {
    console.error("\n❌ Connection error:", err.message);
  });
});

// Tunggu 10 saat supaya backend ada masa proses TTS
setTimeout(() => {
  console.log("\n⏱️ Masa tamat (10 saat). Menutup sambungan...");
  socket.disconnect();
  process.exit(0);
}, 10000);