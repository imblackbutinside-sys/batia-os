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

console.log("[EVENTS] WS_EVENTS =", JSON.stringify(WS_EVENTS));
console.log("[BUILD] BATIA v8.18b - grace timer start before connect");

try {
  const audioDir = path.join(process.cwd(), "audio");
  if (fs.existsSync(audioDir)) {
    let cleared = 0;
    for (const fn of fs.readdirSync(audioDir)) {
      if (fn.endsWith(".webm") || fn.endsWith(".mp3") || fn.endsWith(".opus")) { try { fs.unlinkSync(path.join(audioDir, fn)); cleared++; } catch (e) {} }
    }
    console.log(`[STARTUP] Cleared ${cleared} old audio files - no replay`);
  }
} catch (e) {}

const recentComments = new Map<string, { text: string; at: number }>();
function isDuplicateComment(username: string, text: string): boolean {
  const now = Date.now();
  const prev = recentComments.get(username);
  if (prev && prev.text === text.trim() && now - prev.at < 10000) return true;
  recentComments.set(username, { text: text.trim(), at: now });
  return false;
}
const recentResponses = new Map<string, number>();
function isDuplicateResponse(text: string): boolean {
  const now = Date.now();
  for (const [k, at] of recentResponses.entries()) if (now - at > 3000) recentResponses.delete(k);
  const clean = text.trim().toLowerCase();
  if (recentResponses.has(clean)) return true;
  recentResponses.set(clean, now);
  return false;
}
const recentTtsRequests = new Map<string, number>();
function normalizeForDedup(t: string): string { return t.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim(); }
function isDuplicateTts(text: string, lang: string): boolean {
  const now = Date.now();
  const norm = normalizeForDedup(text);
  for (const [k, at] of recentTtsRequests.entries()) if (now - at > 5000) recentTtsRequests.delete(k);
  const exact = `${lang}::${norm}`;
  if (recentTtsRequests.has(exact)) return true;
  recentTtsRequests.set(exact, now);
  return false;
}
function normalizeMs(t: string): string {
  const map: [RegExp, string][] = [
    [/\b[Yy]e\b/g, "ya"], [/\b[Yy]er\b/g, "ya"], [/\b[Bb]ole\b/g, "boleh"],
    [/\b[Tt]akpe\b/g, "tak apa"], [/\b[Xx]\s*tau\b/g, "tak tau"],
    [/\b[Xx]\s*nak\b/g, "tak nak"], [/\b[Xx]\s*leh\b/g, "tak boleh"],
  ];
  let out = t;
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}
function cleanAiOutput(text: string): string {
  let c = text;
  c = c.replace(/([a-zA-ZÀ-ÿ])\s*-\s*([a-zA-ZÀ-ÿ])/g, "$1$2");
  c = c.replace(/Mah-lay-see-ah|Mah-lay-sia|Ma-lay-see-ah/gi, "Malaysia");
  c = c.replace(/Tick[\s-]*Tock|Tik-tok|Tik-Tok/gi, "TikTok");
  c = c.replace(/Live-stream/gi, "live stream");
  c = c.replace(/\s+/g, " ").trim();
  return c;
}
function isValidUsername(u: string): boolean { return !(!u || u === "0" || u === "unknown" || u.length < 3); }
function cleanSongTitle(q: string): string {
  return q.replace(/^["'""''\s]+|["'""''\s]+$/g, "").replace(/^[-–—:\s]+|[-–—:\s]+$/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*oleh\s+.+$/i, "").replace(/\s*by\s+.+$/i, "")
    .replace(/\s*feat\.?\s+.+$/i, "").replace(/\s*-\s*.*$/, "").replace(/\s+/g, " ").trim();
}

const SLANG_RE = /\b(punch\s*card|pc|heart\s*me|heartme|hati\s*oren|love\s*oren|tap\s*tap\s*love|tap\s*skrin|tap\s*screen|beg\s*kuning|beg\s*shopping|fyp|f4f|l4l|pk\s*battle|join\s*battle)\b/gi;
const SLANG_MAP: Record<string, string> = {
  "punch card": "gift Heart Me (tanda kehadiran dan sokongan untuk host)",
  "pc": "gift Heart Me (tanda kehadiran dan sokongan untuk host)",
  "heart me": "gift Heart Me (hati oren, tanda kehadiran)",
  "heartme": "gift Heart Me (hati oren, tanda kehadiran)",
  "hati oren": "gift Heart Me (hati oren, tanda kehadiran)",
  "love oren": "gift Heart Me (hati oren, tanda kehadiran)",
  "tap tap love": "tap screen bagi like",
  "tap skrin": "tap screen untuk bagi like",
  "tap screen": "tap screen untuk bagi like",
  "beg kuning": "shopping bag",
  "beg shopping": "shopping bag",
  "fyp": "For You Page",
  "f4f": "follow for follow",
  "l4l": "like for like",
  "pk battle": "PK battle",
  "join battle": "join PK battle",
};
function expandTikTokSlang(text: string): string {
  return text.replace(SLANG_RE, (m) => SLANG_MAP[m.toLowerCase().replace(/\s+/g, " ")] || m);
}

const TIKTOK_MY_CONTEXT = "KONTEKS TIKTOK LIVE MALAYSIA: 'PC'/'Punch Card'/'Heart Me'/'hati oren'/'love oren' = gift hati oren (1 coin) yang penonton hantar sebagai TANDA KEHADIRAN & SOKONGAN kepada host, BUKAN kad fizikal atau loyalty card. Balas dengan terima kasih atas sokongan dan sapaan mesra. 'Tap screen' = tekan skrin untuk bagi like. 'Beg kuning' = shopping bag. 'PK battle' = pertandingan antara host.";

const tts = new TtsEngine();
let currentTtsVoice = "ms-MY-YasminNeural";
const ttsQueue: Array<{ text: string; voiceName: string; lang: string; resolve: (u: string) => void; reject: (e: any) => void }> = [];
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
        await new Promise(r => setTimeout(r, 150));
        job.resolve(await tts.speak(job.text, job.voiceName));
      } catch (e) { job.reject(e); }
    }
  }
  ttsBusy = false;
}

function ttsNormalize(t: string): string {
  return t
    .replace(/[@_.]/g, " ")
    .replace(/\bqueues?\b/gi, "kiu")
    .replace(/\babam\b/gi, "Abang")
    .replace(/\s+/g, " ")
    .trim();
}

async function speakMixed(text: string, forceLang?: "MS" | "EN"): Promise<string> {
  const cleaned = ttsNormalize(cleanAiOutput(text));
  const lang = forceLang || "MS";
  if (isDuplicateTts(cleaned, lang)) return "";
  
  let voiceToUse = currentTtsVoice;
  if (lang === "EN") {
    voiceToUse = /osman|guy|male/i.test(currentTtsVoice) ? "en-US-GuyNeural" : "en-US-JennyNeural";
  }
  
  console.log("[TTS SPEAK]", lang, "voice=" + voiceToUse + ":", cleaned.slice(0, 100));
  return new Promise((resolve, reject) => {
    ttsQueue.push({ 
      text: lang === "MS" ? normalizeMs(cleaned) : cleaned, 
      voiceName: voiceToUse,
      lang, 
      resolve, 
      reject 
    });
    processTtsQueue();
  });
}

const tiktok = new TikTokAdapter();
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

let audioSink: { id: string; label: string } | null = null;
let musicVolume = 1.0;
let isDucking = false;
let songPlaying = false;

function triggerDuck() {
  if (!songPlaying || isDucking) return;
  isDucking = true;
  console.log("[DUCKING] 🔇 Muzik dikecilkan untuk AI response");
  io.emit("music:duck", {});
  setTimeout(() => {
    if (isDucking) {
      isDucking = false;
      console.log("[DUCKING] 🔊 Kembalikan volume muzik");
      io.emit("music:unduck", {});
    }
  }, 8000);
}

function emitResponse(payload: any) {
  if (payload.audioUrl) triggerDuck();
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
// ✅ Grace period untuk discard backlog TikTok lepas reconnect
let tiktokConnectTime = 0;
const BACKLOG_GRACE_MS = 8000;

let autoTapEnabled = false;
let autoTapInterval: NodeJS.Timeout | null = null;
let autoTapCount = 0;
function startAutoTap() {
  if (autoTapInterval) clearTimeout(autoTapInterval);
  const tick = async () => {
    if (!autoTapEnabled) return;
    try {
      const r = await routeAIRequest("CHITCHAT", [
        { role: "system", content: "Kau host TikTok Live Malaysia yang sporting. Ajak penonton tap screen atau bagi like, 1 ayat pendek santai Bahasa Melayu pasar. JANGAN emoji, markdown, asterisk." },
        { role: "user", content: "Ajak penonton tap screen sekarang" },
      ]);
      const audioUrl = await speakMixed(r.content, "MS");
      if (audioUrl) emitResponse({ type: "AUTO_TAP", content: r.content, targetUser: "SEMUA", audioUrl });
      autoTapCount++;
      io.emit("autoTap:tick", { count: autoTapCount });
      io.emit("autoTap:status", { enabled: autoTapEnabled, count: autoTapCount });
    } catch (e) {}
    autoTapInterval = setTimeout(tick, 45000 + Math.floor(Math.random() * 45000)) as unknown as NodeJS.Timeout;
  };
  autoTapInterval = setTimeout(tick, 5000) as unknown as NodeJS.Timeout;
}
function stopAutoTap() { if (autoTapInterval) { clearTimeout(autoTapInterval); clearInterval(autoTapInterval); autoTapInterval = null; } }

function clearAllCaches() {
  recentComments.clear();
  recentResponses.clear();
  recentTtsRequests.clear();
  Object.keys(lastCommentTime).forEach(k => delete lastCommentTime[k]);
  console.log("[CACHE] ✅ All caches cleared - fresh responses ready");
}

function handleJoin(uname: string) {
  if (!isValidUsername(uname)) return;
  const now = Date.now();
  if (now - lastGreet < 25000) return;
  lastGreet = now;
  void (async () => {
    try {
      const r = await routeAIRequest("CHITCHAT", [
        { role: "system", content: "Kau host TikTok Live Malaysia yang mesra. Sapa penonton baru dengan nama dia. 1 ayat pendek santai Bahasa Melayu pasar. JANGAN emoji, markdown, asterisk. Guna ya bukan ye." },
        { role: "user", content: "Penonton baru join: " + uname },
      ]);
      if (scriptQueue.running) { scriptQueue.addGreet(r.content, uname); }
      else {
        let g = r.content;
        const pats = [new RegExp(uname.replace(/_/g, "[\\s_]*"), "gi"), new RegExp(uname.replace(/_/g, " "), "gi")];
        for (const p of pats) g = g.replace(p, "member");
        g = g.replace(/\s+/g, " ").trim();
        if (isDuplicateResponse(g)) return;
        const audioUrl = await speakMixed(g, "MS");
        if (audioUrl) emitResponse({ type: "GREET", content: g, targetUser: uname, audioUrl });
      }
      console.log("[GREET] ->", uname);
    } catch (e) {}
  })();
}

let tick = 0;
async function genPitch(p: any) {
  const sku = p.skus && p.skus[0];
  const info = "PRODUK: " + p.title + " | DESKRIPSI: " + (p.description || "") +
    " | SELLING POINTS: " + (p.sellingPoints || []).join("; ") +
    " | PROMO: " + (p.promoType && p.promoType !== "NONE" ? p.promoType + " " + (p.promoValue || "") + (p.promoCode ? " kod " + p.promoCode : "") : "tiada") +
    " | HARGA: RM" + (sku ? sku.price : "") + " | STOK: " + (sku ? sku.stock : "");
  const r = await routeAIRequest("PRODUCT_PITCH", [
    { role: "system", content: "Kau host TikTok Live Malaysia yang sporting. Buat pitch jualan 2-3 ayat dalam BAHASA MELAYU PASAR santai. JANGAN emoji, markdown, asterisk, hashtag." },
    { role: "user", content: info },
  ]);
  return r.content;
}
async function emitProduct() {
  try {
    const p = await prisma.product.findFirst({ where: { isActive: true }, include: { skus: true }, orderBy: { sortOrder: "asc" } });
    if (p) io.emit("shop:product", p);
  } catch (e) {}
}

setInterval(async () => {
  tick++;
  const now = Date.now();
  io.emit(WS_EVENTS.LIVE_STATS, { ...liveStats });
  emitProduct();
  if (tick % 60 === 0) {
    try {
      const mDir = path.join(process.cwd(), "audio", "music");
      if (fs.existsSync(mDir)) for (const fn of fs.readdirSync(mDir)) {
        if (fn.endsWith(".part") || fn.endsWith(".ytdl")) { try { fs.unlinkSync(path.join(mDir, fn)); } catch (e) {} }
      }
    } catch (e) {}
  }
  if (tick % 3 === 0) {
    try {
      const vips = await prisma.viewerMemory.findMany({ where: { isVip: true }, take: 10 });
      io.emit(WS_EVENTS.LIVE_VIPS, vips.map((v: any) => v.username));
    } catch (e) {}
  }
  const kl = likeTimes.filter(t => now - t < 60000); likeTimes.length = 0; likeTimes.push(...kl);
  const kc = commentTimes.filter(t => now - t < 60000); commentTimes.length = 0; commentTimes.push(...kc);
  if (tiktok.connected && likeTimes.length === 0 && commentTimes.length >= 2 && now - lastCue > 180000) {
    lastCue = now;
    io.emit(WS_EVENTS.HOST_CUE, { text: "Penonton rancak borak tapi like slow ? boleh ajak tap screen sikit!" });
  }
  if (currentMode === "SHOPPABLE" && scriptQueue.running && !scriptQueue.paused) {
    const hasQ = scriptQueue.snapshot().items.some(i => i.type === "PITCH" && i.status === "QUEUED");
    if (!hasQ && now - lastPitch > 30000) {
      lastPitch = now;
      try {
        const products = await prisma.product.findMany({ include: { skus: true }, where: { isActive: true }, orderBy: { sortOrder: "asc" } });
        if (products.length > 0) { const p = products[pitchIdx % products.length]; pitchIdx++; scriptQueue.addPitch(await genPitch(p)); }
      } catch (e) {}
    }
  }
}, 5000);

const musicDir = path.join(process.cwd(), "audio", "music");
const songFileCache = new Map<string, { filename: string; lastUsed: number }>();
const failedDownloads = new Map<string, number>();
const cacheFile = path.join(musicDir, "cache.json");

function loadCache() {
  try {
    fs.mkdirSync(musicDir, { recursive: true });
    if (fs.existsSync(cacheFile)) {
      const obj = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      for (const k of Object.keys(obj)) {
        if (obj[k] && obj[k].filename && fs.existsSync(path.join(musicDir, obj[k].filename))) {
          songFileCache.set(k, obj[k]);
        }
      }
      console.log(`[MUSIC] Loaded ${songFileCache.size} cached songs from disk`);
    }
  } catch (e) {}
}
function saveCache() {
  try {
    const obj: any = {};
    for (const [k, v] of songFileCache.entries()) obj[k] = v;
    fs.writeFileSync(cacheFile, JSON.stringify(obj));
  } catch (e) {}
}
loadCache();

function findCachedSong(title: string): string | null {
  const key = title.toLowerCase();
  const c = songFileCache.get(key);
  if (c && fs.existsSync(path.join(musicDir, c.filename))) {
    c.lastUsed = Date.now();
    console.log(`[MUSIC] ⚡ Cache hit (verified): ${c.filename}`);
    saveCache();
    return "/music/" + c.filename;
  }
  return null;
}

async function fetchMusic(q: string): Promise<string | null> {
  const cleanTitle = cleanSongTitle(q);
  const key = cleanTitle.toLowerCase();
  const lf = failedDownloads.get(key);
  if (lf && Date.now() - lf < 60000) { console.log(`[MUSIC] ⏭️ Throttle: "${cleanTitle}"`); return null; }
  const cached = findCachedSong(cleanTitle);
  if (cached) return cached;
  try {
    if (fs.existsSync(musicDir)) for (const fn of fs.readdirSync(musicDir)) {
      if (fn.endsWith(".part") || fn.endsWith(".ytdl")) { try { fs.unlinkSync(path.join(musicDir, fn)); } catch (e) {} }
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 300));
  try {
    fs.mkdirSync(musicDir, { recursive: true });

    const before = new Map<string, number>();
    for (const fn of fs.readdirSync(musicDir)) {
      if (!fn.endsWith(".json")) before.set(fn, fs.statSync(path.join(musicDir, fn)).mtimeMs);
    }

    const isUrl = /https?:\/\//.test(q);
    const ytdlp = fs.existsSync(path.join(process.cwd(), "..", "..", "tools", "yt-dlp.exe"))
      ? path.join(process.cwd(), "..", "..", "tools", "yt-dlp.exe") : "yt-dlp";
    console.log(`[MUSIC] Downloading: ${cleanTitle}...`);

    const cookiesPath = path.join(process.cwd(), "..", "..", "tools", "cookies.txt");
    const args = [
      isUrl ? q : "ytsearch1:" + q,
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", path.join(musicDir, "%(id)s.%(ext)s"),
      "--no-playlist", "--quiet", "--no-warnings", "--no-cache-dir",
      "--cookies", cookiesPath,
      "--print", "after_move:filepath"
    ];

    const start = Date.now();
    const { stdout } = await execFileAsync(ytdlp, args, { timeout: 12000 });
    console.log(`[MUSIC] ✅ yt-dlp done in ${((Date.now() - start) / 1000).toFixed(1)}s`);

    let filename = "";
    const lines = (stdout || "").trim().split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const p = lines[i].trim();
      if (p && fs.existsSync(p) && path.resolve(path.dirname(p)) === path.resolve(musicDir)) {
        filename = path.basename(p);
        break;
      }
    }

    if (!filename) {
      for (const fn of fs.readdirSync(musicDir)) {
        if (fn.endsWith(".json") || fn.endsWith(".part") || fn.endsWith(".ytdl")) continue;
        const t = fs.statSync(path.join(musicDir, fn)).mtimeMs;
        if (!before.has(fn) || t > (before.get(fn) || 0)) filename = fn;
      }
    }

    if (filename) {
      songFileCache.set(key, { filename, lastUsed: Date.now() });
      saveCache();
      console.log(`[MUSIC] 🎵 File tepat: ${filename}`);
      return "/music/" + filename;
    }
    console.error(`[MUSIC] ❌ No new file for "${cleanTitle}" - tak main lagu salah`);
    failedDownloads.set(key, Date.now());
    return null;
  } catch (e: any) {
    const errMsg = (e.message || "").split("\n").slice(0, 5).join("\n  ");
    console.error(`[MUSIC] ❌ Failed "${cleanTitle}":`);
    console.error(`  ${errMsg}`);
    failedDownloads.set(key, Date.now());
    return null;
  }
}

let lastSong = 0;
let currentMusicFile: string | null = null;
let currentlyPlayingQ = "";
let songQueue: { q: string; by: string }[] = [];
function emitSongQueue() { io.emit("music:queue", songQueue); }

function skipCurrentSong() {
  if (!songPlaying && songQueue.length === 0) return;
  currentMusicFile = null; songPlaying = false; currentlyPlayingQ = "";
  io.emit("music:status", { state: "SKIPPED" });
  if (songQueue.length > 0) setTimeout(() => void playNextInQueue(), 300);
}

async function playNextInQueue() {
  if (songPlaying || songQueue.length === 0) return;
  const next = songQueue.shift();
  if (!next) return;
  songPlaying = true;
  currentlyPlayingQ = next.q;
  emitSongQueue();
  console.log(`[MUSIC] Now playing: ${next.q} (requested by ${next.by})`);
  const sink = audioSink ? audioSink.id : null;
  io.emit("music:status", { state: "FETCHING", q: next.q, audioFor: sink });
  const url = await fetchMusic(next.q);
  if (!songPlaying) { console.log("[MUSIC] ⛔ Stop semasa download - dibatalkan"); return; }
  if (url) {
    currentMusicFile = path.join(musicDir, path.basename(url));
    io.emit("music:status", { state: "PLAYING", q: next.q, url: "http://localhost:4000" + url, audioFor: sink, requestedBy: next.by });
  } else {
    io.emit("music:status", { state: "FAILED", q: next.q, audioFor: sink });
    songPlaying = false; currentlyPlayingQ = "";
    setTimeout(() => void playNextInQueue(), 2000);
  }
}

async function enqueueSong(q: string, by: string) {
  const cleanQ = cleanSongTitle(q);
  if (!cleanQ || cleanQ.length < 2) return;
  const keyLower = cleanQ.toLowerCase();
  if (currentlyPlayingQ && currentlyPlayingQ.toLowerCase() === keyLower) {
    console.log(`[MUSIC] 🔄 Replay: "${cleanQ}" (restart dari awal)`);
    if (currentMusicFile && fs.existsSync(currentMusicFile)) {
      io.emit("music:status", {
        state: "PLAYING", q: cleanQ,
        url: "http://localhost:4000/music/" + path.basename(currentMusicFile),
        audioFor: audioSink ? audioSink.id : null, requestedBy: by, replay: true
      });
    }
    return;
  }
  if (songQueue.some(s => s.q.toLowerCase() === keyLower)) { console.log(`[MUSIC] ⏭️ Duplicate in queue: "${cleanQ}"`); return; }
  if (songQueue.length >= 5) { console.log(`[MUSIC] Queue penuh, discard: "${cleanQ}"`); return; }
  songQueue.push({ q: cleanQ, by });
  emitSongQueue();
  console.log(`[MUSIC] Queued: "${cleanQ}" by ${by}. Size: ${songQueue.length}`);
  if (!songPlaying) void playNextInQueue();
}

httpServer.on("request", (req, res) => {
  const serve = (dir: string) => {
    const file = path.join(dir, path.basename(req.url || ""));
    if (fs.existsSync(file)) {
      const ext = path.extname(file).toLowerCase();
      const mime = ext === ".webm" ? "audio/webm" : ext === ".m4a" ? "audio/mp4" : ext === ".opus" ? "audio/opus" : "audio/mpeg";
      const stat = fs.statSync(file);
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": mime });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Length": stat.size, "Content-Type": mime, "Accept-Ranges": "bytes" });
        fs.createReadStream(file).pipe(res);
      }
      return true;
    }
    return false;
  };
  if (req.url && req.url.startsWith("/music/")) { if (serve(musicDir)) return; res.writeHead(404); res.end("not found"); return; }
  if (req.url && req.url.startsWith("/audio/")) { if (serve(path.join(process.cwd(), "audio"))) return; res.writeHead(404); res.end("not found"); return; }
});

async function ensureSession() {
  let host = await prisma.host.findFirst();
  if (!host) host = await prisma.host.create({ data: { name: "Host BATIA", tiktokHandle: "@batia.demo" } });
  let session = await prisma.liveSession.findFirst({ where: { status: "LIVE" } });
  if (!session) session = await prisma.liveSession.create({ data: { hostId: host.id, mode: "REGULAR", status: "LIVE" } });
  return session;
}

function isValidSongTitle(t: string): boolean {
  if (!t || t.trim().length < 3) return false;
  const l = t.toLowerCase().trim();
  if (/\b(tak tau|x tau|tau apa|apa tah|random|kot|entah|mana|tak pasti|confuse|buntu)\b/i.test(l)) return false;
  if (/\b(nak|boleh|tolong|sila|please|bagi|minta|request|req|mahu|hendak|nak minta)\b/i.test(l)) return false;
  if (/\b(tadi|semalam|malam|pagi|petang|best|sedap|syok|mantap|slow|laju)\b/i.test(l)) return false;
  const w = l.split(/\s+/).filter(x => x.length > 0);
  if (w.length === 1 && /^(apa|mana|bila|siapa|kenapa|macam|bagaimana|ya|tak|ok)$/i.test(w[0])) return false;
  return true;
}

function sanitizeForRegularMode(text: string): string {
  let c = text;
  const pats = [/tekan beg kuning/gi, /beg kuning/gi, /beg hijau/gi, /keranjang kuning/gi, /jualan/gi, /jual\b/gi, /produk/gi, /beli\b/gi, /membeli/gi, /order\b/gi, /shopping/gi, /checkout/gi, /promo/gi, /diskaun/gi, /harga/gi, /stok/gi, /beg\b/gi, /cart\b/gi, /troli/gi, /kod\s+\w+/gi, /baucar/gi, /voucher/gi, /flash\s+sale/gi, /sale\b/gi];
  for (const p of pats) c = c.replace(p, "");
  c = c.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/^[\s,.!?]+/, "").trim();
  if (!c || c.length < 8) c = "Ok member, jom kita borak santai malam ni!";
  return c;
}

async function processComment(username: string, text: string) {
  console.log(`[DEBUG processComment] DITERIMA: username="${username}", text="${text}"`);
  const t0 = Date.now();
  if (!isValidUsername(username)) { console.log(`[DEBUG] DITOLAK: username tidak sah`); return; }
  const now = Date.now();
  if (lastCommentTime[username] && now - lastCommentTime[username] < 500) { console.log(`[DEBUG] DITOLAK: Spam`); return; }
  lastCommentTime[username] = now;
  try {
    if (isDuplicateComment(username, text)) { console.log(`[DEBUG] DITOLAK: Duplicate`); return; }
    // ✅ Discard backlog TikTok lepas reconnect
    if (tiktokConnectTime && now - tiktokConnectTime < BACKLOG_GRACE_MS) {
      console.log(`[BACKLOG] ⏭️ Discard komen lama (${username}): "${text.slice(0, 40)}"`);
      return;
    }
    const session = await ensureSession();
    commentTimes.push(Date.now());
    liveStats.comments++;
    io.emit(WS_EVENTS.COMMENT_LOG, { username, text });

    const expandedText = expandTikTokSlang(text);
    if (expandedText !== text) {
      console.log(`[SLANG] 🔄 "${text}" → "${expandedText}"`);
    }
    const aiText = (expandedText === expandedText.toUpperCase() && expandedText.length > 4)
      ? expandedText.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : expandedText;
    const aiInput = expandedText !== text ? `${TIKTOK_MY_CONTEXT}\nKomen penonton: ${aiText}` : aiText;

    const lower = aiText.toLowerCase().trim();
    const skipPat = /^(skip|cancel|taknak|tak nak|next|stop lagu|batal|batal kan|next song|skip lagu)$/i;
    if (skipPat.test(lower) || lower.includes("skip") || lower.includes("cancel lagu")) {
      if (songPlaying || songQueue.length > 0) {
        const msg = `Ok ${ttsNormalize(username)}, lagu di-skip!`;
        const audioUrl = await speakMixed(msg, "MS");
        if (audioUrl) emitResponse({ type: "SKIP_CONFIRM", content: msg, targetUser: username, audioUrl });
        skipCurrentSong();
        return;
      }
    }

    let handledByMusic = false;
    const nowS = Date.now();
    const strongReq = /\b(mainkan|play|pasang|putar|nyanyi|request|req)\b/i;
    const softReq = /\b(minta|nak|bagi|boleh)\s+lagu\b/i;
    const directReq = /\blagu\s+[a-zA-Z0-9]/i;
    const isReq = strongReq.test(aiText) || softReq.test(aiText) || directReq.test(aiText);
    if (isReq) console.log(`[MUSIC] 🎯 Request pattern match: "${aiText}"`);
    if (nowS - lastSong > 10000 && isReq) {
      lastSong = nowS;
      let q = "";
      try {
        const r = await routeAIRequest("SONG_EXTRACT", [
          { role: "system", content: "Ekstrak tajuk lagu daripada komen penonton. Jawab DENGAN tajuk lagu sahaja (serta artis jika disebut). Tiada ayat lain, tiada tanda petik. Jika TIADA tajuk lagu spesifik disebut, jawab tepat: NONE" },
          { role: "user", content: aiText }]);
        q = cleanSongTitle(r.content);
        console.log("[MUSIC] AI extracted:", JSON.stringify(q));
      } catch (e) {}
      if (!q || q === "NONE") {
        const mRule = aiText.match(/\blagu\s+([a-zA-Z0-9][a-zA-Z0-9\s'&.-]{2,})/i);
        if (mRule) {
          const cand = cleanSongTitle(mRule[1]);
          if (cand && isValidSongTitle(cand)) {
            q = cand;
            console.log("[MUSIC] 📏 Rule fallback extracted:", JSON.stringify(q));
          }
        }
      }
      if (q && q !== "NONE" && q.length >= 2 && isValidSongTitle(q)) {
        handledByMusic = true;
        enqueueSong(q, username);
        const msg = `Ok ${ttsNormalize(username)}, lagu ${q} masuk queue!`;
        const audioUrl = await speakMixed(msg, "MS");
        if (audioUrl) emitResponse({ type: "SONG_CONFIRM", content: msg, targetUser: username, audioUrl });
      }
    }

    const simple = /^(haha+|hehe+|hihi+|lol|lmao|ok|okay|yes|no|ya|tak|yeap|yup|nice|good|best|mantap|power|ngam+)$/i;
    if (simple.test(aiText.trim())) return;
    if (handledByMusic) return;

    const commentLang = detectLang(aiText);
    const { response, violations, approvalRequest } = await engine.handleComment(session.id, username, aiInput);
    for (const v of violations) io.emit(WS_EVENTS.POLICY_VIOLATION, v);
    if (approvalRequest) io.emit(WS_EVENTS.APPROVAL_REQUEST, approvalRequest);

    if (response) {
      let clean = response;
      if (commentLang === "EN") {
        const malay = /\b(takde|tak ada|jom|malam ni|member|kita|borak|khabar|waalaikumussalam|santai|lah|je|ni|tu|dah)\b/i;
        if (malay.test(clean)) {
          try {
            const r = await routeAIRequest("CHITCHAT", [
              { role: "system", content: "You are a friendly Malaysian TikTok Live host. Reply in NATURAL ENGLISH ONLY. 1-2 short sentences. No Malay words. No emoji, no markdown." },
              { role: "user", content: aiText }]);
            clean = r.content;
          } catch (e) {}
        }
      }
      if (currentMode === "REGULAR") clean = sanitizeForRegularMode(clean);
      if (isDuplicateResponse(clean)) return;
      if (currentMode === "SHOPPABLE" && scriptQueue.running) scriptQueue.addResponse(clean, username + ": " + text);
      else {
        const audioUrl = await speakMixed(clean, commentLang);
        console.log(`[LATENCY] ${Date.now() - t0}ms dari komen ke response`);
        if (audioUrl) emitResponse({ type: "COMMENT_RESPONSE", content: clean, targetUser: username, audioUrl });
      }
    }
  } catch (e) { console.error("[WS] comment error:", e); }
}

async function processGift(username: string, giftName: string, giftValue: number) {
  try {
    // ✅ Discard gift backlog lepas reconnect
    if (tiktokConnectTime && Date.now() - tiktokConnectTime < BACKLOG_GRACE_MS) {
      console.log(`[BACKLOG] ⏭️ Discard gift lama (${username}): ${giftName}`);
      return;
    }
    const session = await ensureSession();
    liveStats.gifts++;
    let reaction = await engine.handleGift(session.id, username, giftName, giftValue);
    if (currentMode === "REGULAR") reaction = sanitizeForRegularMode(reaction);
    if (isDuplicateResponse(reaction)) return;
    const audioUrl = await speakMixed(reaction);
    if (audioUrl) emitResponse({ type: "GIFT_REACTION", content: reaction, targetUser: username, audioUrl });
  } catch (e) {}
}

io.on("connection", (socket) => {
  console.log("[WS] client connected:", socket.id);
  const oldSink = audioSink ? io.sockets.sockets.get(audioSink.id) : null;
  if (!audioSink || !oldSink) {
    audioSink = { id: socket.id, label: "LAPTOP" };
    console.log("[WS] audio sink auto-claim:", socket.id);
    clearAllCaches();
  }
  socket.on("disconnect", () => {
    if (audioSink && audioSink.id === socket.id) { audioSink = null; console.log("[WS] audio sink released"); }
  });

  socket.emit("script:update", scriptQueue.snapshot());
  emitProduct();
  socket.emit("autoTap:status", { enabled: autoTapEnabled, count: autoTapCount });

  socket.on(WS_EVENTS.AUDIO_CLAIM, (data: { label: string }) => {
    audioSink = { id: socket.id, label: data.label };
    io.emit(WS_EVENTS.AUDIO_ROUTE, { id: socket.id, label: data.label });
  });

  const onComment = (data: { username: string; text: string }) => processComment(data.username, data.text);
  socket.on(WS_EVENTS.COMMENT_RECEIVED, onComment);
  if ((WS_EVENTS as any).COMMENT_RECEIVED !== "COMMENT_RECEIVED") socket.on("COMMENT_RECEIVED", onComment);

  socket.on(WS_EVENTS.GIFT_RECEIVED, (data: { username: string; giftName: string; giftValue: number }) => processGift(data.username, data.giftName, data.giftValue));

  socket.on(WS_EVENTS.TIKTOK_CONNECT, (data: { username: string }) => {
    io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "CONNECTING..." });
    try {
      // ✅ v8.18b: grace mula SEBELUM connect (backlog masuk masa connecting lagi)
      tiktokConnectTime = Date.now();
      tiktok.connect(data.username, {
        onComment: processComment,
        onGift: processGift,
        onLike: (n: number) => { likeTimes.push(Date.now()); liveStats.totalLikes += n; },
        onViewer: (v: number) => { liveStats.viewers = v; },
        onStatus: (s) => {
          console.log(`[TikTok] status -> ${s}`);
          io.emit(WS_EVENTS.TIKTOK_STATUS, { status: s });
        },
        onJoin: (u) => handleJoin(u),
      });
      let tries = 0;
      const poll = setInterval(() => {
        tries++;
        if (tiktok.connected) {
          clearInterval(poll);
          tiktokConnectTime = Date.now();
          songQueue = [];
          songPlaying = false;
          currentlyPlayingQ = "";
          emitSongQueue();
          io.emit("music:status", { state: "STOPPED" });
          console.log("[TikTok] CONNECTED | backlog grace 8s + music queue cleared");
          io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "CONNECTED" });
        } else if (tries > 30) {
          clearInterval(poll);
        }
      }, 1000);
    } catch (e: any) {
      console.error("[TikTok] connect error:", (e && e.message) || e);
      io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "DISCONNECTED" });
    }
  });
  socket.on(WS_EVENTS.TIKTOK_DISCONNECT, () => { tiktok.disconnect(); io.emit(WS_EVENTS.TIKTOK_STATUS, { status: "DISCONNECTED" }); });

  socket.on("autoTap:toggle", (data: any) => {
    autoTapEnabled = data.enabled || false;
    if (autoTapEnabled) startAutoTap(); else stopAutoTap();
    io.emit("autoTap:status", { enabled: autoTapEnabled, count: autoTapCount });
  });

  socket.on("shop:start", async () => {
    try {
      const products = await prisma.product.findMany({ include: { skus: true }, where: { isActive: true }, orderBy: { sortOrder: "asc" } });
      scriptQueue.start(products[0] ? products[0].title : "Produk");
      for (const p of products.slice(0, 2)) scriptQueue.addPitch(await genPitch(p));
    } catch (e) {}
  });
  socket.on("shop:stop", () => scriptQueue.stop());
  socket.on("shop:pause", () => scriptQueue.pause());
  socket.on("shop:resume", () => scriptQueue.resume());
  socket.on("shop:settings", (d: any) => scriptQueue.setSettings(d || {}));
  socket.on("shop:interject", (d: any) => { if (d && d.text) scriptQueue.addPitch(String(d.text).trim()); });
  socket.on("test:join", () => handleJoin("abam_test_join"));

  socket.on("cache:clear", () => {
    clearAllCaches();
    socket.emit("cache:cleared", { ok: true });
  });

  socket.on("music:started", (d: any) => {
    songPlaying = true;
    currentlyPlayingQ = String(d?.q || "").toLowerCase();
    console.log("[MUSIC] sync frontend playing:", currentlyPlayingQ);
  });

  socket.on("music:play", (d: any) => { const q = String((d && d.q) || "").trim(); if (q) void enqueueSong(q, "host"); });
  socket.on("music:skip", () => skipCurrentSong());
  socket.on("music:stop", () => {
    console.log("[MUSIC] Stop received - hentikan serta-merta");
    currentMusicFile = null; songPlaying = false; currentlyPlayingQ = "";
    emitSongQueue();
    io.emit("music:status", { state: "STOPPED" });
    if (songQueue.length > 0) setTimeout(() => void playNextInQueue(), 500);
    else console.log("[MUSIC] Stop: queue kosong, tak auto-play");
  });
  socket.on("music:pause", () => {
    console.log("[MUSIC] ⏸️ Pause received");
    songPlaying = false;
    io.emit("music:status", { state: "PAUSED" });
  });
  socket.on("music:resume", () => {
    console.log("[MUSIC] ▶️ Resume received");
    if (currentMusicFile && fs.existsSync(currentMusicFile)) {
      songPlaying = true;
      io.emit("music:status", { state: "RESUMED" });
    }
  });
  socket.on("music:volume", (d: any) => { musicVolume = Math.max(0, Math.min(1, Number(d.vol) || 1)); io.emit("music:status", { state: "VOLUME", vol: musicVolume }); });
  socket.on("music:duck", () => io.emit("music:volume", { vol: 0.3 }));
  socket.on("music:unduck", () => io.emit("music:volume", { vol: musicVolume }));
  socket.on("music:ended", () => {
    if (!songPlaying) return;
    songPlaying = false; currentlyPlayingQ = "";
    setTimeout(() => void playNextInQueue(), 500);
  });

  socket.on("shop:config", async (d: any) => {
    try {
      const p = await prisma.product.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
      if (p) {
        await prisma.product.update({ where: { id: p.id }, data: { description: d.description, sellingPoints: d.sellingPoints, promoValue: d.promoValue || null, promoCode: d.promoCode || null } });
        io.emit("shop:configured", { ok: true });
        emitProduct();
      }
    } catch (e) {}
  });

  socket.on(WS_EVENTS.APPROVAL_DECISION, async (data: any) => {
    let log: any = null;
    try { log = await prisma.violationLog.findUnique({ where: { id: data.id } }); } catch (e) {}
    try {
      if (data.decision === "approved") {
        const text = data.finalText || (log ? log.resolvedText : null) || (log ? log.triggeredText : null) || "ok, terima!";
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, resolvedText: text } }).catch(() => {});
        const audioUrl = await speakMixed(text);
        if (audioUrl) emitResponse({ type: "APPROVED_RESPONSE", content: text, targetUser: data.username || "viewer", audioUrl });
      } else {
        if (log) await prisma.violationLog.update({ where: { id: data.id }, data: { humanResolved: true, action: "REJECTED_BY_HUMAN" } }).catch(() => {});
      }
    } catch (e) {}
  });

  socket.on(WS_EVENTS.MODE_CHANGED, (data: { mode: "REGULAR" | "SHOPPABLE" }) => { engine.setMode(data.mode); currentMode = data.mode; });
  socket.on(WS_EVENTS.VOICE_CHANGED, async (data: { voice: string }) => { await tts.setVoice(data.voice); currentTtsVoice = data.voice; });
});

httpServer.listen(PORT, () => console.log("BATIA Orchestrator on http://localhost:" + PORT));