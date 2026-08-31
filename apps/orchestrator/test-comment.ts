import "dotenv/config";
import { io } from "socket.io-client";

// Ambil username dan text dari command line, atau guna default yang VALID
const username = process.argv[2] || "abam_test_user";
const text = process.argv[3] || "mainkan lagu sejati";

console.log(`\n[MENGHANTAR TEST] Username: "${username}" | Mesej: "${text}"\n`);

const socket = io("http://localhost:4000");

socket.on("connect", () => {
  console.log("✅ Berjaya connect ke backend");
  
  // Hantar event COMMENT_RECEIVED ke backend
  socket.emit("COMMENT_RECEIVED", { username, text });
  
  // Putus connection selepas 3 saat
  setTimeout(() => {
    socket.disconnect();
    console.log("✅ Test selesai. Sila check output backend atau dengar suara.\n");
  }, 3000);
});

socket.on("disconnect", () => {
  console.log("Disconnected from backend");
});