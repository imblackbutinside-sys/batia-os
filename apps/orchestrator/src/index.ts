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
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "4000");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(__dirname, "../../../policies/tiktok_my_2026.yaml");

const engine = new LiveContextEngine(new PolicyEngine(policyPath));

try {
  const audioDir = path.join(process.cwd(), "audio");
  if (fs.existsSync(audioDir)) {
    let cleared = 0;
    for (const fn of fs.readdirSync(audioDir)) {
      if (fn.endsWith(".webm") || fn.endsWith(".mp3") || fn.endsWith(".opus")) {
        try { fs.unlinkSync(path.join(audioDir, fn)); cleared++; } catch (e) {}
      }
    }
    console.log(`[STARTUP] Cleared ${cleared} old audio files - no replay`);
  }
} catch (e) {}

const recentComments = new Map<string, { text: string; at: number }>();
function isDuplicateComment(username: string, text: string): boolean {
  const now = Date.now();
  const prev = recentComments.get(username);
  if (prev && prev.text === text.trim() && now - prev.at < 10000) {
    console.log(`[DEDUP] Skip repeated comment from ${username}`);
    return true;
  }
  recentComments.set(username, { text: text.trim(), at: now });
  return false;
}

const recentResponses = new Map<string, number>();
function isDuplicateResponse(text: string): boolean {
  const now = Date.now();
  for (const [key, at] of recentResponses.entries()) {
    if (now - at > 5000) recentResponses.delete(key);
  }
  const clean = text.trim().toLowerCase();
  if (recentResponses.has(clean)) {
    console.log(`[DEDUP] Skip repeated response: ${clean.slice(0, 60)}`);
    return true;
  }
  recentResponses.set(clean, now);
  return false;
}

const recentTtsRequests = new Map<string, number>();

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const longerLength = longer.length;
  if (longerLength === 0) return 1;
  if (Math.abs(s1.length - s2.length) > longerLength * 0.2) return 0;
  const words1 = new Set(s1.split(' '));
  const words2 = new Set(s2.split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

function isDuplicateTts(text: string, lang: string): boolean {
  const now = Date.now();
  const normalized = normalizeForDedup(text);
  for (const [key, at] of recentTtsRequests.entries()) {
    if (now - at > 10000) recentTtsRequests.delete(key);
  }
  const exactKey = `${lang}::${normalized}`;
  if (recentTtsRequests.has(exactKey)) {
    console.log(`[TTS DEDUP] BLOCKED exact duplicate: ${text.slice(0, 50)}`);
    return true;
  }
  for (const [key, at] of recentTtsRequests.entries()) {
    const [keyLang, keyText] = key.split('::');
    if (keyLang === lang) {
      const similarity = calculateSimilarity(normalized, keyText);
      if (similarity > 0.85) {
        console.log(`[TTS DEDUP] Skip similar audio (${Math.round(similarity * 100)}% match)`);
        return true;
      }
    }
  }
  recentTtsRequests.set(exactKey, now);
  return false;
}

function normalizeMs(t: string): string {
  const map: [RegExp, string][] = [
    [/\b[Yy]e\b/g, "ya"],
    [/\b[Yy]er\b/g, "ya"],
    [/\b[Bb]ole\b/g, "boleh"],
    [/\b[Tt]akpe\b/g, "tak apa"],
    [/\b[Xx]\s*tau\b/g, "tak tau"],
    [/\b[Xx]\s*nak\b/g, "tak nak"],
    [/\b[Xx]\s*leh\b/g, "tak boleh"],
  ];
  let out = t;
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}

function cleanAiOutput(text: string): string {
  let clean = text;
  clean = clean.replace(/Mah-lay-see-ah/gi, "Malaysia");
  clean = clean.replace(/Mah-lay-sia/gi, "Malaysia");
  clean = clean.replace(/Ma-lay-see-ah/gi, "Malaysia");
  clean = clean.replace(/Tick[\s-]*Tock/gi, "TikTok");
  clean = clean.replace(/Tik-tok/gi, "TikTok");
  clean = clean.replace(/Tik-Tok/gi, "TikTok");
  clean = clean.replace(/Live-stream/gi, "live stream");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

function isValidUsername(uname: string): boolean {
  if (!uname || uname === "0" || uname === "unknown" || uname.length < 3) {
    return false;
  }
  return true;
}

function cleanSongTitle(q: string): string {
  let clean = q
    .replace(/^["'""''\s]+|["'""''\s]+$/g, "")
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*oleh\s+.+$/i, "")
    .replace(/\s*by\s+.+$/i, "")
    .replace(/\s*feat\.?\s+.+$/i, "")
    .replace(/\s*-\s*.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

const tts = new TtsEngine();
let currentTtsVoice = "ms-MY-YasminNeural";

function getVoiceForLang(lang: "MS" | "EN"): string {
  const isMale = /osman|guy|male/i.test(currentTtsVoice);
  if (lang === "EN") return isMale ? "en-US-GuyNeural" : "en-US-JennyNeural";
  return isMale ? "ms-MY-OsmanNeural" : "ms-MY-YasminNeural";
}

const ttsQueue: Array<{ 
  text: string; 
  voiceName: string; 
  lang: string;
  resolve: (url: string) => void; 
  reject: (e: any) => void 
}> = [];
let ttsBusy = false;

async function processTtsQueue() {
  if (ttsBusy) return;
  ttsBusy = true;
  while (ttsQueue.length > 0) {
    const job = ttsQueue.shift();
    if (job) {
      try {
        console.log(`[TTS QUEUE] Setting voice to: ${job.voiceName}`);
        await tts.setVoice(job.voiceName);
        currentTtsVoice = job.voiceName;
        await new Promise(r => setTimeout(r, 200));
        const audioUrl = await tts.speak(job.text);
        job.resolve(audioUrl);
      } catch (e) {
        job.reject(e);
      }
    }
  }
  ttsBusy = false;
}

async function speakMixed(text: string, forceLang?: "MS" | "EN"): Promise<string> {
  const cleanedText = cleanAiOutput(text);
  let lang: "MS" | "EN";
  if (forceLang) {
    lang = forceLang;
  } else {
    const englishKeywords = /\b(I'm|you|we|they|he|she|it|from|have|has|the|a|an|is|are|was|were|will|would|can|could|should|must)\b/i;
    const hasEnglishKeywords = englishKeywords.test(cleanedText);
    const words = cleanedText.split(/\s+/);
    const englishWords = words.filter(w => /^[A-Za-z]+$/.test(w) && w.length > 2);
    const englishRatio = englishWords.length / words.length;
    lang = (hasEnglishKeywords || englishRatio > 0.6) && words.length > 3 ? "EN" : "MS";
  }
  if (isDuplicateTts(cleanedText, lang)) {
    return "";
  }
  return new Promise((resolve, reject) => {
    const normalizedText = lang === "MS" ? normalizeMs(cleanedText) : cleanedText;
    const voiceName = getVoiceForLang(lang);
    ttsQueue.push({ text: normalizedText, voiceName, lang, resolve, reject });
    processTtsQueue();
  });
}

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
    const audioUrl = await speakMixed(text);
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

const lastCommentTime: Record<string, number> = {};

function handleJoin(uname: string) {
  if (!isValidUsername(uname)) {
    return;
  }
  const now = Date.now();
  if (now - lastGreet < 25000) {
    return;
  }
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
        let cleanGreet = r.content;
        const usernamePatterns = [
          new RegExp(uname.replace(/_/g, "[\\s_]*"), "gi"),
          new RegExp(uname.replace(/_/g, " "), "gi"),
          /abam[_\s]*(test[_\s]*)?join/gi,
          /test[_\s]*user/gi,
        ];
        for (const pattern of usernamePatterns) {
          cleanGreet = cleanGreet.replace(pattern, "member");
        }
        cleanGreet = cleanGreet.replace(/\s+/g, " ").trim();
        if (isDuplicateResponse(cleanGreet)) return;
        const audioUrl = await speakMixed(cleanGreet, "MS");
        if (audioUrl) {
          emitResponse({ type: "GREET", content: cleanGreet, targetUser: uname, audioUrl });
        }
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
    { role: "system", content: "Kau host TikTok Live Malaysia yang sporting. Buat pitch jualan 2-3 ayat dalam BAHASA MELAYU PASAR santai. Sebut satu selling point, sebut promo/harga kalau ada, ajak tekan beg kuning. JANGAN emoji, markdown, asterisk, hashtag." },
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
  if (tick % 60 === 0) {
    try {
      if (fs.existsSync(musicDir)) {
        const cutoff = Date.now() - 15 * 60 * 1000;
        for (const fn of fs.readdirSync(musicDir)) {
          const p = path.join(musicDir, fn);
          if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); console.log("[MUSIC] cache cleanup:", fn); }
        }
      }
    } catch (e) {}
  }
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

const musicDir = path.join(process.cwd(), "audio", "music");

async function fetchMusic(q: string): Promise<string | null> {
  try {
    const cacheDir = path.join(musicDir, ".cache");
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  } catch (e) {}
  try {
    if (fs.existsSync(musicDir)) {
      for (const fn of fs.readdirSync(musicDir)) {
        if (fn.endsWith(".part")) { try { fs.unlinkSync(path.join(musicDir, fn)); } catch (e) {} }
      }
    }
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 300));
  try {
    fs.mkdirSync(musicDir, { recursive: true });
    const isUrl = /https?:\/\//.test(q);
    const ytdlp = fs.existsSync(path.join(process.cwd(), "..", "..", "tools", "yt-dlp.exe")) ? path.join(process.cwd(), "..", "..", "tools", "yt-dlp.exe") : "yt-dlp";
    const args = [isUrl ? q : "ytsearch1:" + q, "-f", "bestaudio/best", "-o", path.join(musicDir, "%(id)s.%(ext)s"), "--no-playlist", "--quiet", "--no-warnings", "--no-part", "--no-cache-dir"];
    await execFileAsync(ytdlp, args, { timeout: 60000 });
    const files = fs.readdirSync(musicDir).map((fn) => ({ fn, t: fs.statSync(path.join(musicDir, fn)).mtimeMs })).sort((a, b) => b.t - a.t);
    return files[0] ? "/music/" + files[0].fn : null;
  } catch (e: any) { 
    const errMsg = e.message || String(e);
    if (errMsg.includes("Video unavailable") || errMsg.includes("disabled by the video owner")) {
      console.warn("[MUSIC] Video disekat, skip:", q);
    } else if (errMsg.includes("HTTP Error 416") || errMsg.includes("cache")) {
      console.warn("[MUSIC] Cache issue, clearing...");
      try {
        const cacheDir = path.join(musicDir, ".cache");
        if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
      } catch (e2) {}
    } else if (errMsg.includes("Unable to rename file") || errMsg.includes("WinError 32")) {
      console.warn("[MUSIC] File locked, cleanup .part files...");
      try {
        if (fs.existsSync(musicDir)) {
          for (const fn of fs.readdirSync(musicDir)) {
            if (fn.endsWith(".part")) { try { fs.unlinkSync(path.join(musicDir, fn)); } catch (e) {} }
          }
        }
      } catch (e) {}
    } else {
      console.error("[MUSIC] fetch error:", errMsg);
    }
    return null; 
  }
}

let lastSong = 0;
let currentMusicFile: string | null = null;
let lastMusicQ = "";
let musicVolume = 1.0;
let isDucking = false;
let autoTapEnabled = false;
let autoTapInterval: NodeJS.Timeout | null = null;
let autoTapCount = 0;
let autoTapThisMinute = 0;
setInterval(() => { autoTapThisMinute = 0; }, 60000);

function startAutoTap() {
  if (autoTapInterval) clearInterval(autoTapInterval);
  const tick = async () => {
    if (!autoTapEnabled) return;
    try {
      const r = await routeAIRequest("CHITCHAT", [
        { role: "system", content: "Kau host TikTok Live Malaysia yang sporting. Ajak penonton tap screen atau bagi like, 1 ayat pendek santai Bahasa Melayu pasar. JANGAN emoji, markdown, asterisk." },
        { role: "user", content: "Ajak penonton tap screen sekarang" },
      ]);
      const audioUrl = await speakMixed(r.content, "MS");
      if (audioUrl) {
        emitResponse({ type: "AUTO_TAP", content: r.content, targetUser: "SEMUA", audioUrl });
      }
      autoTapCount++;
      io.emit("autoTap:tick", { count: autoTapCount, perMin: 0 });
    } catch (e) {}
    const next = 45000 + Math.floor(Math.random() * 45000);
    autoTapInterval = setTimeout(tick, next) as unknown as NodeJS.Timeout;
  };
  const first = 5000;
  autoTapInterval = setTimeout(tick, first) as unknown as NodeJS.Timeout;
}

function stopAutoTap() {
  if (autoTapInterval) { clearTimeout(autoTapInterval); clearInterval(autoTapInterval); autoTapInterval = null; }
}

let songQueue: { q: string; by: string }[] = [];
let songPlaying = false;

function emitSongQueue() { 
  io.emit("music:queue", songQueue); 
}

function skipCurrentSong() {
  if (!songPlaying && songQueue.length === 0) return;
  try {
    if (currentMusicFile && fs.existsSync(currentMusicFile)) {
      fs.unlinkSync(currentMusicFile);
      console.log("[MUSIC] Skip - deleted:", path.basename(currentMusicFile));
    }
  } catch (e) {}
  currentMusicFile = null;
  songPlaying = false;
  io.emit("music:status", { state: "SKIPPED" });
  setTimeout(() => void playNextInQueue(), 300);
}

async function playNextInQueue() {
  if (songPlaying) return;
  if (songQueue.length === 0) return;
  const next = songQueue.shift();
  if (!next) return;
  songPlaying = true;
  emitSongQueue();
  console.log(`[MUSIC] Now playing: ${next.q} (requested by ${next.by})`);
  const sink = audioSink ? audioSink.id : null;
  io.emit("music:status", { state: "FETCHING", q: next.q, audioFor: sink });
  const url = await fetchMusic(next.q);
  if (url) { 
    currentMusicFile = path.join(musicDir, path.basename(url)); 
    lastMusicQ = next.q; 
    io.emit("music:status", { 
      state: "PLAYING", 
      q: next.q, 
      url: "http://localhost:4000" + url, 
      audioFor: sink,
      requestedBy: next.by
    });
  } else {
    io.emit("music:status", { state: "FAILED", q: next.q, audioFor: sink }); 
    console.log("[MUSIC] Lagu gagal download, skip ke seterusnya...");
    songPlaying = false;
    setTimeout(() => void playNextInQueue(), 1000);
  }
}

async function enqueueSong(q: string, by: string) {
  const cleanQ = cleanSongTitle(q);
  console.log(`[MUSIC] Input: "${q}" → Clean: "${cleanQ}"`);
  
  if (!cleanQ || cleanQ.length < 2) {
    console.log(`[MUSIC] Skip - invalid title after clean`);
    return;
  }
  if (songQueue.length >= 5) {
    console.log(`[MUSIC] Queue penuh (5), discard: ${cleanQ}`);
    return;
  }
  if (songQueue.some(s => s.q.toLowerCase() === cleanQ.toLowerCase())) {
    console.log(`[MUSIC] Duplicate skipped: ${cleanQ}`);
    return;
  }
  songQueue.push({ q: cleanQ, by });
  emitSongQueue();
  console.log(`[MUSIC] Queued: "${cleanQ}" by ${by}. Size: ${songQueue.length}`);
  if (!songPlaying) void playNextInQueue();
}

httpServer.on("request", (req, res) => {
  if (req.url && req.url.startsWith("/music/")) {
    const file = path.join(musicDir, path.basename(req.url));
    if (fs.existsSync(file)) {
      const ext = path.extname(file).toLowerCase();
      const mime = ext === ".webm" ? "audio/webm" : ext === ".m4a" ? "audio/mp4" : ext === ".opus" ? "audio/opus" : ext === ".mp3" ? "audio/mpeg" : "audio/mpeg";
      const stat = fs.statSync(file);
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { "Content-Range": "bytes " + start + "-" + end + "/" + stat.size, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": mime });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stat.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
        fs.createReadStream(file).pipe(res);
      }
      return;
    }
    res.writeHead(404);
    res.end("not found");
  }
  if (req.url && req.url.startsWith("/audio/")) {
    const file = path.join(process.cwd(), "audio", path.basename(req.url));
    if (fs.existsSync(file)) {
      const ext = path.extname(file).toLowerCase();
      const mime = ext === ".webm" ? "audio/webm" : ext === ".m4a" ? "audio/mp4" : ext === ".opus" ? "audio/opus" : ext === ".mp3" ? "audio/mpeg" : "audio/mpeg";
      const stat = fs.statSync(file);
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { "Content-Range": "bytes " + start + "-" + end + "/" + stat.size, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": mime });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stat.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
        fs.createReadStream(file).pipe(res);
      }
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

function isValidSongTitle(title: string): boolean {
  if (!title || title.trim().length < 3) return false;
  const lowerTitle = title.toLowerCase().trim();
  const uncertaintyWords = /\b(tak tau|x tau|tau apa|apa tah|random|kot|entah|mana|tak pasti|confuse|buntu)\b/i;
  if (uncertaintyWords.test(lowerTitle)) return false;
  const commandWords = /\b(nak|boleh|tolong|sila|please|bagi|minta|request|mahu|hendak|nak minta)\b/i;
  if (commandWords.test(lowerTitle)) return false;
  const words = lowerTitle.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1 && /^(apa|mana|bila|siapa|kenapa|macam|bagaimana|ya|tak|ok)$/i.test(words[0])) return false;
  return true;
}

function sanitizeForRegularMode(text: string): string {
  let clean = text;
  const salesPatterns = [
    /tekan beg kuning/gi, /beg kuning/gi, /beg hijau/gi, /keranjang kuning/gi,
    /jualan/gi, /jual\b/gi, /produk/gi, /beli\b/gi, /membeli/gi, /order\b/gi,
    /shopping/gi, /checkout/gi, /promo/gi, /diskaun/gi, /harga/gi, /stok/gi,
    /beg\b/gi, /cart\b/gi, /troli/gi, /kod\s+\w+/gi, /baucar/gi, /voucher/gi,
    /flash\s+sale/gi, /sale\b/gi,
  ];
  for (const pattern of salesPatterns) {
    clean = clean.replace(pattern, "");
  }
  clean = clean.replace(/\s+/g, " ");
  clean = clean.replace(/\s+([,.!?])/g, "$1");
  clean = clean.replace(/^[\s,.!?]+/, "");
  clean = clean.trim();
  if (!clean || clean.length < 8) {
    clean = "Ok member, jom kita borak santai malam ni!";
  }
  return clean;
}

async function processComment(username: string, text: string) {
  if (!username || username === "unknown" || username === "0" || username.length < 3) {
    return;
  }
  
  const now = Date.now();
  if (lastCommentTime[username] && now - lastCommentTime[username] < 500) {
    return;
  }
  lastCommentTime[username] = now;
  
  try {
    if (isDuplicateComment(username, text)) return;
    const session = await ensureSession();
    commentTimes.push(Date.now());
    liveStats.comments++;
    io.emit(WS_EVENTS.COMMENT_LOG, { username, text });
    if (songPlaying && !isDucking) {
      isDucking = true;
      io.emit("music:duck", {});
      setTimeout(() => { 
        if (isDucking) { 
          isDucking = false; 
          io.emit("music:unduck", {}); 
        } 
      }, 8000);
    }
    const lowerText = text.toLowerCase().trim();
    const skipPatterns = /^(skip|cancel|taknak|tak nak|next|stop lagu|batal|batal kan|next song|skip lagu)$/i;
    if (skipPatterns.test(lowerText) || lowerText.includes("skip") || lowerText.includes("cancel lagu") || lowerText.includes("taknak lagu")) {
      if (songPlaying || songQueue.length > 0) {
        const skipMsg = `Ok ${username}, lagu di-skip!`;
        const audioUrl = await speakMixed(skipMsg, "MS");
        if (audioUrl) {
          emitResponse({ type: "SKIP_CONFIRM", content: skipMsg, targetUser: username, audioUrl });
        }
        skipCurrentSong();
        return;
      }
    }
    
    // FIXED: Song request - await extraction, respond kalau tiada tajuk
    let handledByMusic = false;
    const nowS = Date.now();
    const explicitRequestPattern = /\b(mainkan|play|pasang|putar|nyanyi|request|req|minta lagu|nak dengar lagu|bagi lagu|on kan lagu|bukak lagu)\s+(lagu\s+)?[a-zA-Z0-9]/i;
    const directRequestPattern = /\blagu\s+[a-zA-Z0-9][a-zA-Z0-9\s'-]{2,}/i;
    if (nowS - lastSong > 10000 && (explicitRequestPattern.test(text) || directRequestPattern.test(text))) {
      lastSong = nowS;
      let q = "";
      try {
        const r = await routeAIRequest("CHITCHAT", [{ 
          role: "system", 
          content: "Ekstrak tajuk lagu daripada komen penonton. Jawab DENGAN tajuk lagu sahaja (serta artis jika disebut). Tiada ayat lain, tiada tanda petik. Jika TIADA tajuk lagu spesifik disebut, jawab tepat: NONE" 
        }, { role: "user", content: text }]);
        q = r.content
          .replace(/^["'""''\s]+|["'""''\s]+$/g, "")
          .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
          .replace(/\s*\([^)]*\)\s*/g, " ")
          .replace(/\s*oleh\s+.+$/i, "")
          .replace(/\s*by\s+.+$/i, "")
          .replace(/\s*feat\.?\s+.+$/i, "")
          .replace(/\s+/g, " ")
          .trim();
        console.log("[MUSIC] AI extracted:", JSON.stringify(q));
      } catch (e) {
        console.error("[MUSIC] AI extraction error:", e);
      }
      
      if (q && q !== "NONE" && q.length >= 2 && isValidSongTitle(q)) {
        handledByMusic = true;
        enqueueSong(q, username);
        const confirmMsg = `Ok ${username}, lagu ${q} masuk queue!`;
        const audioUrl = await speakMixed(confirmMsg, "MS");
        if (audioUrl) {
          emitResponse({ type: "SONG_CONFIRM", content: confirmMsg, targetUser: username, audioUrl });
        }
      }
    }
    
    const simplePatterns = /^(haha+|hehe+|hihi+|lol|lmao|ok|okay|yes|no|ya|tak|yeap|yup|nice|good|best|mantap|power|ngam+)$/i;
    if (simplePatterns.test(text.trim())) {
      return;
    }
    if (handledByMusic) {
      return;
    }
    const commentLang = detectLang(text);
    const { response, violations, approvalRequest } = await engine.handleComment(session.id, username, text);
    for (const v of violations) io.emit(WS_EVENTS.POLICY_VIOLATION, v);
    if (approvalRequest) io.emit(WS_EVENTS.APPROVAL_REQUEST, approvalRequest);
    if (response) {
      let cleanResponse = response;
      if (commentLang === "EN") {
        const malayMarkers = /\b(takde|tak ada|jom|malam ni|member|kita|borak|khabar|waalaikumussalam|santai|lah|je|ni|tu|dah)\b/i;
        if (malayMarkers.test(cleanResponse)) {
          try {
            const r = await routeAIRequest("CHITCHAT", [
              { role: "system", content: "You are a friendly Malaysian TikTok Live host. Reply in NATURAL ENGLISH ONLY. 1-2 short sentences. No Malay words. No emoji, no markdown, no asterisk." },
              { role: "user", content: text },
            ]);
            cleanResponse = r.content;
          } catch (e) {}
        }
      }
      if (currentMode === "REGULAR") {
        cleanResponse = sanitizeForRegularMode(cleanResponse);
      }
      if (isDuplicateResponse(cleanResponse)) return;
      if (currentMode === "SHOPPABLE" && scriptQueue.running) {
        scriptQueue.addResponse(cleanResponse, username + ": " + text);
      } else {
        const audioUrl = await speakMixed(cleanResponse, commentLang);
        if (audioUrl) {
          emitResponse({ type: "COMMENT_RESPONSE", content: cleanResponse, targetUser: username, audioUrl });
        }
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
    let reaction = await engine.handleGift(session.id, username, giftName, giftValue);
    if (currentMode === "REGULAR") {
      reaction = sanitizeForRegularMode(reaction);
    }
    if (isDuplicateResponse(reaction)) return;
    const audioUrl = await speakMixed(reaction);
    if (audioUrl) {
      emitResponse({ type: "GIFT_REACTION", content: reaction, targetUser: username, audioUrl });
    }
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
    if (t) { scriptQueue.addPitch(t); }
  });
  socket.on("test:join", () => handleJoin("abam_test_join"));
  socket.on("music:play", (d: any) => { 
    const q = String((d && d.q) || "").trim(); 
    if (q) void enqueueSong(q, "host"); 
  });
  socket.on("music:skip", () => {
    skipCurrentSong();
  });
  socket.on("autoTap:toggle", (d: any) => {
    autoTapEnabled = !!(d && d.enabled);
    if (autoTapEnabled) { autoTapCount = 0; startAutoTap(); }
    else { stopAutoTap(); }
    io.emit("autoTap:status", { enabled: autoTapEnabled, count: autoTapCount });
  });
  socket.on("music:pause", () => io.emit("music:status", { state: "PAUSED" }));
  socket.on("music:resume", () => io.emit("music:status", { state: "PLAYING" }));
  socket.on("music:volume", (d: any) => { musicVolume = Math.max(0, Math.min(1, Number(d && d.vol) || 1)); io.emit("music:status", { state: "VOLUME", vol: musicVolume }); });
  socket.on("music:unduck", () => {
    if (isDucking) {
      isDucking = false;
      io.emit("music:unduck", {});
    }
  });
  socket.on("music:stop", () => {
    try { 
      if (currentMusicFile && fs.existsSync(currentMusicFile)) { 
        fs.unlinkSync(currentMusicFile); 
      } 
    } catch (e) {}
    currentMusicFile = null;
    songQueue = [];
    songPlaying = false;
    emitSongQueue();
    io.emit("music:status", { state: "STOPPED" });
  });
  socket.on("music:ended", (d: any) => {
    try {
      if (!songPlaying) return;
      if (d && d.file) { 
        const p = path.join(musicDir, path.basename(String(d.file))); 
        if (fs.existsSync(p)) { 
          fs.unlinkSync(p); 
          io.emit("music:status", { state: "CACHE_CLEARED", q: lastMusicQ }); 
        } 
      }
      songPlaying = false;
      setTimeout(() => void playNextInQueue(), 500);
    } catch (e) {
      console.error("[MUSIC] music:ended error:", e);
    }
  });
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
    let log: any = null;
    try { log = await prisma.violationLog.findUnique({ where: { id: data.id } }); } catch (e) {}
    try {
      if (data.decision === "approved") {
        const text = data.finalText || (log ? log.resolvedText : null) || (log ? log.triggeredText : null) || "ok, terima!";
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, resolvedText: text } }).catch(() => {});
        const audioUrl = await speakMixed(text);
        if (audioUrl) {
          emitResponse({ type: "APPROVED_RESPONSE", content: text, targetUser: data.username || "viewer", audioUrl });
        }
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
    currentTtsVoice = data.voice;
  });
});

httpServer.listen(PORT, () => {
  console.log("BATIA Orchestrator on http://localhost:" + PORT);
});