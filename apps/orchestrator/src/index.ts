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
import { ScriptQueue } from "./core/ScriptQueue.js";
import { routeAIRequest, detectLang } from "./router/AIRouter.js";
import { prisma } from "@batia/database";
import { WS_EVENTS } from "@batia/shared";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "4000");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(__dirname, "../../../policies/tiktok_my_2026.yaml");

const engine = new LiveContextEngine(new PolicyEngine(policyPath));
function normalizeMs(t: string): string {
  if (detectLang(t) === "EN") return t;
  const map: [RegExp, string][] = [
    [/\b[Yy]e\b/g, "ya"],
    [/\b[Bb]ole\b/g, "boleh"],
    [/\b[Tt]akpe\b/g, "tak apa"],
    [/\b[Ll]ive\b/g, "laiv"],
    [/\b[Oo]nline\b/g, "onlain"],
    [/\b[Ee]arbuds?\b/g, "erbad"],
    [/\b[Bb]luetooth\b/g, "blutut"],
    [/\b[Nn]oise [Cc]ancelling\b/g, "nois kenseling"],
    [/\b[Bb]attery [Ll]ife\b/g, "betri laif"],
    [/\b[Bb]attery\b/g, "betri"],
    [/\b[Ww]aterproof\b/g, "woterpruf"],
    [/\b[Cc]harging [Cc]ase\b/g, "carging kes"],
    [/\b[Cc]rystal [Cc]lear\b/g, "kristal klier"],
    [/\b[Gg]aming\b/g, "geiming"],
    [/\b[Cc]all\b/g, "kol"],
    [/\b[Ss]hare\b/g, "syer"],
    [/\b[Ff]ollow\b/g, "folo"],
    [/\b[Ss]upport\b/g, "saport"],
    [/\b[Ww]elcome\b/g, "welkam"],
    [/\b[Ff]lash [Ss]ale\b/g, "fles seil"],
    [/\b[Ww]ireless\b/g, "wairles"],
    [/\b[Ss]creen\b/g, "skrin"],
    [/\b[Dd]isplay\b/g, "displei"],
    [/\b[Rr]ating\b/g, "reiting"],
    [/\b[Ee]xercise\b/g, "eksersais"],
    [/\b[Cc]onnection\b/g, "koneksyen"],
    [/\b[Ll]ink\b/g, "lingk"],
  ];
  let out = t;
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}
const tts = new TtsEngine();
const tiktok = new TikTokAdapter();
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

let audioSink: { id: string; label: string } | null = null;
function emitResponse(payload: any) {
  io.emit(WS_EVENTS.AI_RESPONSE_READY, { ...payload, audioFor: audioSink ? audioSink.id : null });
}

let scriptQueue: ScriptQueue;
scriptQueue = new ScriptQueue(
  async (text) => {
    const audioUrl = await tts.speak(normalizeMs(text));
    emitResponse({ type: "QUEUE_SPEAK", content: text, targetUser: "semua", audioUrl });
    return audioUrl;
  },
  () => io.emit("script:update", scriptQueue.snapshot())
);

const liveStats = { viewers: 0, totalLikes: 0, comments: 0, gifts: 0 };
const likeTimes: number[] = [];
const commentTimes: number[] = [];
let lastCue = 0;
let currentMode = "REGULAR";
let pitchIdx = 0;
let lastPitch = Date.now() - 200000;
let lastGreet = 0;

function handleJoin(uname: string) {
  const now = Date.now();
  if (now - lastGreet < 25000) return;
  lastGreet = now;
  void (async () => {
    try {
      const r = await routeAIRequest("CHITCHAT", [
        { role: "system", content: "Kau host TikTok Live Malaysia yang mesra. Sapa penonton baru dengan nama dia. 1 ayat pendek santai Bahasa Melayu pasar. JANGAN emoji, markdown, asterisk. Guna ya bukan ye." },
        { role: "user", content: "Penonton baru join: " + uname },
      ]);
      if (scriptQueue.running) {
        scriptQueue.addGreet(r.content, uname);
      } else {
        const audioUrl = await tts.speak(normalizeMs(r.content));
        emitResponse({ type: "GREET", content: r.content, targetUser: uname, audioUrl });
      }
      console.log("[GREET] ->", uname);
    } catch (e) { console.error("[GREET] error:", e); }
  })();
}
let tick = 0;

async function genPitch(p: any) {
  const sku = p.skus && p.skus[0];
  const info = "PRODUK: " + p.title +
    " | DESKRIPSI: " + (p.description || "") +
    " | SELLING POINTS: " + (p.sellingPoints || []).join("; ") +
    " | PROMO: " + (p.promoType && p.promoType !== "NONE" ? p.promoType + " " + (p.promoValue || "") + (p.promoCode ? " kod " + p.promoCode : "") : "tiada") +
    " | HARGA: RM" + (sku ? sku.price : "") + " | STOK: " + (sku ? sku.stock : "");
  const r = await routeAIRequest("PRODUCT_PITCH", [
    { role: "system", content: "Kau host TikTok Live Malaysia yang sporting. Buat pitch jualan 2-3 ayat dalam BAHASA MELAYU PASAR santai. Sebut satu selling point, sebut promo/harga kalau ada, ajak tekan beg kuning. JANGAN emoji, markdown, asterisk, hashtag. Ejaan Melayu Malaysia: khabar, tak, nak, je, ni, tu, dah. JANGAN bahasa Indonesia (kabar, tidak, mahu, saja, ini)." },
    { role: "user", content: info },
  ]);
  return r.content;
}

async function emitProduct() {
  try {
    const p = await prisma.product.findFirst({ where: { isActive: true }, include: { skus: true }, orderBy: { sortOrder: "asc" } });
    if (p) io.emit("shop:product", p);
  } catch (e) { console.error("[SHOP] emitProduct error:", e); }
}

setInterval(async () => {
  tick++;
  const now = Date.now();
  io.emit(WS_EVENTS.LIVE_STATS, { ...liveStats });
  emitProduct();
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
  if (currentMode === "SHOPPABLE" && scriptQueue.running && !scriptQueue.paused) {
    const hasQueued = scriptQueue.snapshot().items.some((i) => i.type === "PITCH" && i.status === "QUEUED");
    if (!hasQueued && now - lastPitch > 30000) {
      lastPitch = now;
      try {
        const products = await prisma.product.findMany({ include: { skus: true }, where: { isActive: true }, orderBy: { sortOrder: "asc" } });
        if (products.length > 0) {
          const p = products[pitchIdx % products.length];
          pitchIdx++;
          const pitch = await genPitch(p);
          scriptQueue.addPitch(pitch);
          console.log("[PITCH] queued:", p.title);
        }
      } catch (e) { console.error("[PITCH] error:", e); }
    }
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
      if (currentMode === "SHOPPABLE" && scriptQueue.running) {
        scriptQueue.addResponse(response, username + ": " + text);
      } else {
        const audioUrl = await tts.speak(normalizeMs(response));
        emitResponse({ type: "COMMENT_RESPONSE", content: response, targetUser: username, audioUrl });
      }
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
    const audioUrl = await tts.speak(normalizeMs(reaction));
    emitResponse({ type: "GIFT_REACTION", content: reaction, targetUser: username, audioUrl });
  } catch (e) {
    console.error("[WS] gift error:", e);
  }
}

io.on("connection", (socket) => {
  console.log("[WS] client connected:", socket.id);
  if (!audioSink) audioSink = { id: socket.id, label: "LAPTOP" };
  socket.emit("script:update", scriptQueue.snapshot());
  emitProduct();
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
  socket.on(WS_EVENTS.TIKTOK_CONNECT, (data: { username: string }) => {
    io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "CONNECTING..." });
    tiktok.connect(data.username, {
      onComment: processComment,
      onGift: processGift,
      onLike: (n: number) => { likeTimes.push(Date.now()); liveStats.totalLikes += n; },
      onViewer: (v: number) => { liveStats.viewers = v; },
      onStatus: (s) => io.emit(WS_EVENTS.TIKTOK_STATUS, { status: s }),
      onJoin: (u) => handleJoin(u),
    });
  });
  socket.on(WS_EVENTS.TIKTOK_DISCONNECT, () => {
    tiktok.disconnect();
    io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "DISCONNECTED" });
  });
  socket.on("shop:start", async () => {
    try {
      const products = await prisma.product.findMany({ include: { skus: true }, where: { isActive: true }, orderBy: { sortOrder: "asc" } });
      scriptQueue.start(products[0] ? products[0].title : "Produk");
      for (const p of products.slice(0, 2)) {
        const pitch = await genPitch(p);
        scriptQueue.addPitch(pitch);
      }
    } catch (e) { console.error("[SHOP] start error:", e); }
  });
  socket.on("shop:stop", () => scriptQueue.stop());
  socket.on("shop:pause", () => scriptQueue.pause());
  socket.on("shop:resume", () => scriptQueue.resume());
  socket.on("shop:settings", (d: any) => scriptQueue.setSettings(d || {}));
  socket.on("shop:interject", (d: any) => {
    const t = String((d && d.text) || "").trim();
    if (t) { scriptQueue.addPitch(t); console.log("[INTERJECT] queued:", t); }
  });
  socket.on("test:join", () => handleJoin("abam_test_join"));
  socket.on("shop:config", async (d: { description: string; sellingPoints: string[]; promoValue?: string; promoCode?: string }) => {
    try {
      const p = await prisma.product.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
      if (p) {
        await prisma.product.update({ where: { id: p.id }, data: { description: d.description, sellingPoints: d.sellingPoints, promoValue: d.promoValue || null, promoCode: d.promoCode || null } });
        io.emit("shop:configured", { ok: true });
        emitProduct();
      }
    } catch (e) { console.error("[SHOP] config error:", e); }
  });
  socket.on(WS_EVENTS.APPROVAL_DECISION, async (data: { id: string; decision: "approved" | "rejected"; finalText?: string; username?: string }) => {
    console.log("[WS] approval decision:", data.decision, data.id);
    let log: any = null;
    try { log = await prisma.violationLog.findUnique({ where: { id: data.id } }); } catch (e) { console.error("[WS] log lookup failed:", e); }
    try {
      if (data.decision === "approved") {
        const text = data.finalText || (log ? log.resolvedText : null) || (log ? log.triggeredText : null) || "ok, terima!";
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, resolvedText: text } }).catch(() => {});
        const audioUrl = await tts.speak(normalizeMs(text));
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




