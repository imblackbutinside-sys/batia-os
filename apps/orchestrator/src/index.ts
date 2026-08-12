import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PolicyEngine } from "./policy/PolicyEngine.js";
import { LiveContextEngine } from "./core/LiveContextEngine.js";
import { TtsEngine } from "./voice/TtsEngine.js";
import { TikTokAdapter } from "./adapters/TikTokAdapter.js";
import { prisma } from "@batia/database";
import { WS_EVENTS } from "@batia/shared";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "4000");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(__dirname, "../../../policies/tiktok_my_2026.yaml");

const engine = new LiveContextEngine(new PolicyEngine(policyPath));
const tts = new TtsEngine();
const tiktok = new TikTokAdapter();
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

let audioSink: { id: string; label: string } | null = null;
function emitResponse(payload: any) {
  io.emit(WS_EVENTS.AI_RESPONSE_READY, { ...payload, audioFor: audioSink ? audioSink.id : null });
}

const liveStats = { viewers: 0, totalLikes: 0, comments: 0, gifts: 0 };
const likeTimes: number[] = [];
const commentTimes: number[] = [];
let lastCue = 0;
let currentMode = "REGULAR";
let pitchIdx = 0;
let lastPitch = Date.now() - 200000;
const PITCH_OPENERS = ["Korang, meh sini kejap!", "Eh eh, jangan lari dulu!", "Ha, ni special sikit..."];
let tick = 0;

setInterval(async () => {
  tick++;
  const now = Date.now();
  io.emit(WS_EVENTS.LIVE_STATS, { ...liveStats });
  if (tick % 3 === 0) {
    try {
      const vips = await prisma.viewerMemory.findMany({ where: { isVip: true }, take: 10 });
      io.emit(WS_EVENTS.LIVE_VIPS, vips.map((v: any) => v.username));
    } catch (e) {}
  }
  const keepLikes = likeTimes.filter((t) => now - t < 60000);
  likeTimes.length = 0;
  likeTimes.push(...keepLikes);
  const keepComments = commentTimes.filter((t) => now - t < 60000);
  commentTimes.length = 0;
  commentTimes.push(...keepComments);
  if (tiktok.connected && likeTimes.length === 0 && commentTimes.length >= 2 && now - lastCue > 180000) {
    lastCue = now;
    console.log("[CUE] like reminder fired");
    io.emit(WS_EVENTS.HOST_CUE, { text: "Penonton rancak borak tapi like slow ? boleh ajak tap screen sikit!" });
  }
  if (currentMode === "SHOPPABLE" && tiktok.connected && now - lastPitch > 240000) {
    lastPitch = now;
    try {
      const products = await prisma.product.findMany({ include: { skus: true } });
      if (products.length > 0) {
        const p = products[pitchIdx % products.length];
        pitchIdx++;
        const sku = p.skus[0];
        if (sku) {
          const opener = PITCH_OPENERS[pitchIdx % PITCH_OPENERS.length];
          const pitch = opener + " " + p.title + " kita hari ni ? RM" + sku.price + " je, stok tinggal " + sku.stock + "! Siapa minat, tekan beg kuning sekarang!";
          const audioUrl = await tts.speak(pitch);
          emitResponse({ type: "AUTO_PITCH", content: pitch, targetUser: "semua", audioUrl });
          console.log("[PITCH] auto-pitch fired:", p.title);
        }
      }
    } catch (e) { console.error("[PITCH] error:", e); }
  }
}, 5000);

httpServer.on("request", (req, res) => {
  if (req.url && req.url.startsWith("/audio/")) {
    const file = path.join(process.cwd(), "audio", path.basename(req.url));
    if (fs.existsSync(file)) {
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  }
});

async function ensureSession() {
  let host = await prisma.host.findFirst();
  if (!host) {
    host = await prisma.host.create({ data: { name: "Host BATIA", tiktokHandle: "@batia.demo" } });
  }
  let session = await prisma.liveSession.findFirst({ where: { status: "LIVE" } });
  if (!session) {
    session = await prisma.liveSession.create({ data: { hostId: host.id, mode: "REGULAR", status: "LIVE" } });
  }
  return session;
}

async function processComment(username: string, text: string) {
  try {
    const session = await ensureSession();
    commentTimes.push(Date.now());
    liveStats.comments++;
    io.emit(WS_EVENTS.COMMENT_LOG, { username, text });
    const { response, violations, approvalRequest } = await engine.handleComment(session.id, username, text);
    for (const v of violations) io.emit(WS_EVENTS.POLICY_VIOLATION, v);
    if (approvalRequest) io.emit(WS_EVENTS.APPROVAL_REQUEST, approvalRequest);
    if (response) {
      const audioUrl = await tts.speak(response);
      emitResponse({ type: "COMMENT_RESPONSE", content: response, targetUser: username, audioUrl });
    }
  } catch (e) {
    console.error("[WS] comment error:", e);
  }
}

async function processGift(username: string, giftName: string, giftValue: number) {
  try {
    const session = await ensureSession();
    liveStats.gifts++;
    const reaction = await engine.handleGift(session.id, username, giftName, giftValue);
    const audioUrl = await tts.speak(reaction);
    emitResponse({ type: "GIFT_REACTION", content: reaction, targetUser: username, audioUrl });
  } catch (e) {
    console.error("[WS] gift error:", e);
  }
}

io.on("connection", (socket) => {
  console.log("[WS] client connected:", socket.id);
  if (!audioSink) audioSink = { id: socket.id, label: "LAPTOP" };
  socket.on(WS_EVENTS.AUDIO_CLAIM, (data: { label: string }) => {
    audioSink = { id: socket.id, label: data.label };
    console.log("[WS] audio sink ->", data.label);
    io.emit(WS_EVENTS.AUDIO_ROUTE, { id: socket.id, label: data.label });
  });
  socket.on(WS_EVENTS.COMMENT_RECEIVED, (data: { username: string; text: string }) => {
    processComment(data.username, data.text);
  });
  socket.on(WS_EVENTS.GIFT_RECEIVED, (data: { username: string; giftName: string; giftValue: number }) => {
    processGift(data.username, data.giftName, data.giftValue);
  });
  socket.on(WS_EVENTS.TIKTOK_CONNECT, async (data: { username: string }) => {
    io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "CONNECTING..." });
    await tiktok.connect(data.username, {
      onComment: processComment,
      onGift: processGift,
      onLike: (n: number) => { likeTimes.push(Date.now()); liveStats.totalLikes += n; },
      onViewer: (v: number) => { liveStats.viewers = v; },
      onStatus: (s) => io.emit(WS_EVENTS.TIKTOK_STATUS, { status: s }),
    });
  });
  socket.on(WS_EVENTS.TIKTOK_DISCONNECT, () => {
    tiktok.disconnect();
    io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "DISCONNECTED" });
  });
  socket.on(WS_EVENTS.APPROVAL_DECISION, async (data: { id: string; decision: "approved" | "rejected"; finalText?: string; username?: string }) => {
    console.log("[WS] approval decision:", data.decision, data.id);
    let log: any = null;
    try { log = await prisma.violationLog.findUnique({ where: { id: data.id } }); } catch (e) { console.error("[WS] log lookup failed:", e); }
    try {
      if (data.decision === "approved") {
        const text = data.finalText || (log ? log.resolvedText : null) || (log ? log.triggeredText : null) || "ok, terima!";
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, resolvedText: text } }).catch(() => {});
        const audioUrl = await tts.speak(text);
        console.log("[WS] approved, audioUrl:", audioUrl);
        emitResponse({ type: "APPROVED_RESPONSE", content: text, targetUser: data.username || "viewer", audioUrl });
      } else {
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, action: "REJECTED_BY_HUMAN" } }).catch(() => {});
      }
    } catch (e) {
      console.error("[WS] approval error:", e);
    }
  });
  socket.on(WS_EVENTS.MODE_CHANGED, (data: { mode: "REGULAR" | "SHOPPABLE" }) => {
    engine.setMode(data.mode);
    currentMode = data.mode;
  });
  socket.on(WS_EVENTS.VOICE_CHANGED, async (data: { voice: string }) => {
    await tts.setVoice(data.voice);
  });
});

httpServer.listen(PORT, () => {
  console.log("BATIA Orchestrator on http://localhost:" + PORT);
});
