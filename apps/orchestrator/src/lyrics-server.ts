// ✅ BATIA Lyrics Server v8.49 - port 4002
// Fast path + Whisper Malay prompt + post-correction + loose LRCLIB match
import http from "http";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { io as socketIoClient } from "socket.io-client";
import { Server as SocketServer } from "socket.io";
import dotenv from "dotenv";
const execFileAsync = promisify(execFile);

const SERVER_VERSION = "8.49";

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const LYRICS_PORT = 4002;
const LYRICS_OFFSET_MS = parseInt(process.env.LYRICS_OFFSET_MS || "0", 10);

const toolsDir = path.resolve(__dirname, "../../../tools");
const musicDir = path.resolve(__dirname, "../audio/music");
const lyricsDir = path.join(musicDir, "lyrics");
fs.mkdirSync(lyricsDir, { recursive: true });

const ytdlp = fs.existsSync(path.join(toolsDir, "yt-dlp.exe")) ? path.join(toolsDir, "yt-dlp.exe") : "yt-dlp";
const cookiesPath = path.join(toolsDir, "cookies.txt");

type Word = { w: string; a: number; b: number };
type Line = { a: number; b: number; text: string; words: Word[] };
type VideoMeta = { title: string; channel: string; duration: number };
type SongState = {
  title: string;
  videoId: string;
  t0: number;
  pausedAt: number;
  lines: Line[];
  hasLyrics: boolean;
  loading: boolean;
  offsetMs: number;
  leadIn: number;
  source: string;
  lang: string;
  frontendElapsed?: number;
  lastTickAt: number;
};

let current: SongState | null = null;

console.log("[LYRICS] 🎤 Lyrics server v" + SERVER_VERSION + " - port", LYRICS_PORT, "| Malay prompt + corrections");
console.log("[LYRICS] Lyrics cache:", lyricsDir);

function isWeirdScript(t: string): boolean {
  return /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(t);
}

const HALLUCINATION_RE = /\b(thanks? for (watching|listening|viewing)|thank you for (watching|listening|viewing)|terima kasih (telah|kerana|sudah) (menonton|mendengar|menyokong)|please (like|subscribe|share|follow)|subscribe to (my|our) channel|like and subscribe|subtitles? by|captions? by|transcribed by|amara\.org|everything will be (fine|okay|ok|alright)|stay in the heart|in the cool|i('?m)? not a fool|you('?re)? not a fool|don'?t be afraid|do not be afraid|see you (next time|soon)|until next time|have a nice day|good luck|www\.|https?:\/\/|please turn on|turn on (the )?(subtitles|captions)|^thank you\.?$|^thanks\.?$|^bye\.?$|^bye bye\.?$|^goodbye\.?$|^see you\.?$|^take care\.?$|^that'?s all\.?$|^the end\.?$|^ah ah ah|^oh oh oh|^la la la|^na na na)\b/i;

function isBadLine(t: string): boolean {
  if (isWeirdScript(t)) return true;
  if (HALLUCINATION_RE.test(t)) return true;
  const trimmed = t.trim();
  if (trimmed.length <= 12 && /^(ah|oh|la|na|bye|thanks?|thank you|goodbye|see you|take care|the end|that'?s all)$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length >= 4) {
    const first = words[0].toLowerCase();
    const sameCount = words.filter((w) => w.toLowerCase() === first).length;
    if (sameCount / words.length > 0.8) return true;
  }
  return false;
}

function isInsufficientLyrics(lines: Line[]): boolean {
  if (lines.length < 5) return true;
  if (lines.length === 0) return true;
  const lastB = Math.max(...lines.map((l) => l.b));
  if (lastB < 60000 && lines.length < 15) return true;
  return false;
}

function cleanLine(t: string): string {
  return t.replace(/<[^>]+>/g, "").replace(/[♪♫]/g, "").replace(/\s+/g, " ").trim();
}

const MS_WORDS_RE = /\b(yang|dan|aku|kau|kamu|dia|mereka|kita|kami|saya|tak|tiada|bukan|ini|itu|hati|cinta|jiwa|rindu|sayang|kasih|malam|hari|bulan|bintang|mimpi|nyata|abadi|sejati|kejora|purnama|senja|embun|bayu|melur|kenanga|cempaka|seroja|nilam|baiduri|permata|delima|ratna|gita|nada|irama|dendang|seruling|zapin|inang|joget|selendang|songket|keris|wau|kenangan|hujan|pagi|petang|selalu|bila|kenapa|mengapa|bagaimana|semoga|hingga|sampai|kembali|pergi|tinggal|ingat|lupa|antara|dalam|pada|untuk|dengan|telah|sudah|belum|masih|akan|jangan|pernah|hanya|saja|sahaja|juga|pun|lah|nya|dari|oleh|kerana|karena|sebab|agar|supaya|walau|walaupun|meski|meskipun|jika|kalau|tuan|puan|abang|kakak|adik|teman|kawan|sahabat|cintaku|cintamu|sayangku|hatiku|jiwaku|diriku|dirimu|pulang|kampung|angin|api|air|tanah|langit|bumi|peluk|cium|airmata|menangis|tersenyum|berjalan|berlari|terbang|jatuh|bangkit|hidup|mati|syurga|tuhan|doa|restu|ibu|bapa|emak|ayah|ananda|putera|puteri|raja|permaisuri|merdeka|tanahair|bangsa|negaraku|selamat|terima|mohon|ampun|maaf|syukur|alhamdulillah|assalamualaikum|waalaikumussalam|sinaran|matamu|bak|kedamaian|halusnya|lenganmu|sehalus|sutera|cina|melembutkan|setiap|kata|harum|kasturi|rambutmu|ingin|ku|belai|bertambah|indah|keperibadianmu|bicara|menyegarkan|semangat|daku|berada|di|sampingku|semuanya|menjadi|keindahan|hidupku|lumrah|mudah|muda|percaya|bersama|kerana)\b/gi;
const EN_WORDS_RE = /\b(the|and|you|your|yours|my|me|mine|we|us|our|they|them|their|he|she|him|her|is|are|was|were|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|must|shall|of|in|on|at|to|from|for|with|without|about|into|over|under|again|then|than|so|such|not|only|own|same|too|very|just|because|until|while|although|though|if|else|when|where|why|how|all|any|both|each|few|more|most|other|some|love|heart|eyes|night|day|dream|forever|always|never|together|away|back|home|life|world|sky|rain|sun|moon|star|remember|forget|stay|leave|hold|touch|feel|know|think|believe|hope|wish|wait|keep|give|take|make|break|fall|fly|run|walk|sing|dance|smile|cry|tears|kiss|warm|cold|bright|dark|light|shadow|silence|sound|voice|song|melody|music|beautiful|wonderful|amazing|broken|lost|found|free|wild|young|old|true|real|right|wrong|good|bad|better|best|worst|first|last|once|twice|every|another|enough|less|least|much|many|little|big|small|great|high|low|deep|wide|long|short|hard|soft|sweet|bitter|strong|weak|brave|afraid|scared|lonely|alone|happy|sad|glad|angry|calm|quiet|loud|slow|fast|quick|early|late|now|here|there|everywhere|nowhere|somewhere|anywhere|someone|somebody|anyone|anybody|everyone|everybody|nobody|nothing|something|anything|everything)\b/gi;

function textLang(text: string): "ms" | "en" | "?" {
  const ms = (text.match(MS_WORDS_RE) || []).length;
  const en = (text.match(EN_WORDS_RE) || []).length;
  if (ms === 0 && en === 0) return "?";
  if (ms > en) return "ms";
  if (en > ms) return "en";
  return "?";
}

function filterLinesByLang(lines: Line[], lang: "ms" | "en"): Line[] {
  return lines.filter((l) => {
    const ll = textLang(l.text);
    return ll === lang || ll === "?";
  });
}

function addWords(l: Line) {
  const ws = l.text.split(/\s+/).filter(Boolean);
  const dur = Math.max(600, l.b - l.a);
  const per = dur / Math.max(1, ws.length);
  l.words = ws.map((w, i) => ({ w, a: l.a + i * per, b: l.a + (i + 1) * per }));
}
function ensureWords(lines: Line[]): Line[] {
  for (const l of lines) if (!l.words || !l.words.length) addWords(l);
  return lines;
}

function normT(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ✅ v8.49: post-correction dictionary untuk Whisper Melayu
const MS_CORRECTIONS: [RegExp, string][] = [
  [/\bjumrah\b/gi, "lumrah"],
  [/\bjumrah dunia\b/gi, "lumrah dunia"],
  [/\bmuda\b(?=\s*[.,!?;:]|\s*$)/gi, "mudah"],
  [/\bdi mana\b/gi, "dimana"],
  [/\bke mana\b/gi, "kemana"],
  [/\bdi situ\b/gi, "disitu"],
  [/\bke situ\b/gi, "kesitu"],
  [/\bdi sana\b/gi, "disana"],
  [/\bke sana\b/gi, "kesana"],
  [/\bdi sini\b/gi, "disini"],
  [/\bke sini\b/gi, "kesini"],
  [/\bkuasa mu\b/gi, "kuasamu"],
  [/\bhati mu\b/gi, "hatimu"],
  [/\bdiri mu\b/gi, "dirimu"],
  [/\bcinta mu\b/gi, "cintamu"],
  [/\bsayang mu\b/gi, "sayangmu"],
  [/\bjiwa mu\b/gi, "jiwamu"],
  [/\brindu mu\b/gi, "rindumu"],
  [/\btana\b(?=\s*[.,!?;:]|\s*$)/gi, "tanah"],
  [/\bpecahaya\b/gi, "percaya"],
  [/\bbesama\b/gi, "bersama"],
  [/\bseorang diri\b/gi, "sendiri"],
  [/\bberjalan pergi\b/gi, "pergi"],
];

function applyCorrections(text: string, lang: string): string {
  if (lang !== "ms") return text;
  let out = text;
  for (const [re, rep] of MS_CORRECTIONS) out = out.replace(re, rep);
  return out;
}

function saveCache(videoId: string, data: {
  lines: Line[]; offsetMs?: number; source?: string; lang?: string; leadIn?: number; meta?: VideoMeta | null;
}) {
  try {
    fs.writeFileSync(path.join(lyricsDir, videoId + ".json"), JSON.stringify({
      v: 1,
      offsetMs: data.offsetMs || 0,
      source: data.source || "UNKNOWN",
      lang: data.lang || "?",
      leadIn: data.leadIn || 0,
      meta: data.meta || null,
      lines: data.lines,
    }));
  } catch (e) {}
}

function parseArtistTitle(raw: string, channel: string): { artist: string; title: string } {
  let t = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/official (music )?(video|audio|lyric(s)? video)?/gi, " ")
    .replace(/lyric(s)? video/gi, " ")
    .replace(/\bmv\b/gi, " ")
    .replace(/hq|hd|full (version|song)?/gi, " ")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let artist = "";
  let title = t;
  const dashMatch = t.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    artist = dashMatch[1].trim();
    title = dashMatch[2].trim();
  } else {
    artist = channel.replace(/VEVO|Official|Music|Channel/gi, "").replace(/Topic$/, "").trim();
  }
  return { artist, title };
}

async function fetchVideoMeta(videoId: string): Promise<VideoMeta | null> {
  try {
    const { stdout } = await execFileAsync(ytdlp, [
      "--skip-download", "--no-warnings", "--quiet",
      "--print", "%(title)s\t%(channel)s\t%(duration)s",
      "--cookies", cookiesPath,
      "https://www.youtube.com/watch?v=" + videoId,
    ], { timeout: 8000 });
    const line = (stdout || "").split("\n").find((l) => l.includes("\t"));
    if (!line) return null;
    const parts = line.split("\t");
    return {
      title: (parts[0] || "").trim(),
      channel: (parts[1] || "").trim(),
      duration: parseInt(parts[2] || "0", 10) || 0,
    };
  } catch (e: any) {
    return null;
  }
}

async function probeVideoLang(videoId: string): Promise<"ms" | "en" | "?"> {
  try {
    const { stdout } = await execFileAsync(ytdlp, [
      "--list-subs", "--skip-download", "--no-warnings",
      "--cookies", cookiesPath,
      "https://www.youtube.com/watch?v=" + videoId,
    ], { timeout: 8000 });
    const out = stdout || "";
    if (/\bms\b|Malay/i.test(out)) return "ms";
    if (/\ben\b|English/i.test(out)) return "en";
    return "?";
  } catch (e: any) {
    return "?";
  }
}

const socket = socketIoClient("http://localhost:4000", { query: { overlay: "1" } });
socket.on("connect", () => console.log("[LYRICS] 🔌 Connected ke orchestrator :4000"));
socket.on("disconnect", () => console.log("[LYRICS] ⚠️ Disconnect dari orchestrator"));

socket.on("music:status", (d: any) => {
  if (d.state === "PLAYING" && d.url) {
    const mpath = String(d.url);
    const idm = mpath.match(/\/music\/([^/?#]+)\./);
    const videoId = idm ? idm[1] : "";
    if (current && current.videoId === videoId && current.t0 > 0 && !current.pausedAt) return;
    console.log(`[LYRICS] 🎵 Now playing: "${d.q}" (${videoId})`);
    current = {
      title: String(d.q || ""),
      videoId,
      t0: Date.now(),
      pausedAt: 0,
      lines: [],
      hasLyrics: false,
      loading: true,
      offsetMs: 0,
      leadIn: 0,
      source: "",
      lang: "",
      lastTickAt: 0,
    };
    void loadLyrics(videoId, String(d.q || ""));
  }
  if (d.state === "PAUSED" && current && !current.pausedAt) {
    current.pausedAt = Date.now();
  }
  if (d.state === "RESUMED" && current && current.pausedAt) {
    current.t0 += Date.now() - current.pausedAt;
    current.pausedAt = 0;
  }
  if (d.state === "STOPPED" || d.state === "SKIPPED" || d.state === "FAILED") {
    current = null;
  }
});

socket.on("music:started", (d: any) => {
  if (!current) return;
  const now = Date.now();
  const elapsedNow = now - current.t0;
  if (elapsedNow >= 0 && elapsedNow < 2500) {
    current.t0 = now;
    current.pausedAt = 0;
    current.frontendElapsed = undefined;
    current.lastTickAt = 0;
  }
});

socket.on("music:tick", (d: any) => {
  if (current && typeof d?.elapsed === "number") {
    current.frontendElapsed = d.elapsed;
    current.lastTickAt = Date.now();
  }
});

socket.on("music:leadin", (d: any) => {
  if (!current || !d || current.videoId !== d.videoId) return;
  const ms = Math.max(0, Math.min(15000, Number(d.ms) || 0));
  current.leadIn = ms;
  console.log(`[LYRICS] ⏱️ Lead-in: ${ms}ms`);
  if (current.lines.length > 0) {
    saveCache(current.videoId, {
      lines: current.lines, offsetMs: current.offsetMs, source: current.source,
      lang: current.lang, leadIn: ms, meta: null,
    });
  }
});

socket.on("lyrics:offset", (d: any) => {
  if (!current) return;
  const delta = Number(d && d.delta) || 0;
  current.offsetMs = (current.offsetMs || 0) + delta;
  console.log(`[LYRICS] ⚙️ Offset "${current.title}": ${current.offsetMs > 0 ? "+" : ""}${current.offsetMs}ms`);
  if (current.lines.length > 0) {
    saveCache(current.videoId, {
      lines: current.lines, offsetMs: current.offsetMs, source: current.source,
      lang: current.lang, leadIn: current.leadIn, meta: null,
    });
  }
});

async function fetchWithRetry(url: string, options: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: any) {
    console.log(`[LYRICS] ⏳ ${label} fail - retry 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
    return await fetch(url, options);
  }
}

async function lrclibGetExact(track: string, artist: string, durationSec: number, guess: string): Promise<Line[] | null> {
  if (!track || !artist || !durationSec) return null;
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}&duration=${durationSec}`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "BATIA-OS/8.49" } }, "LRCLIB-GET");
    if (!res.ok) return null;
    const x: any = await res.json();
    if (!x || !x.syncedLyrics) return null;
    if (x.duration && Math.abs(x.duration - durationSec) > 30) return null;
    const lLang = textLang(String(x.syncedLyrics).slice(0, 600));
    if (guess === "ms" && lLang === "en") return null;
    if (guess === "en" && lLang === "ms") return null;
    const lines = parseLrc(String(x.syncedLyrics));
    if (lines.length > 0) console.log(`[LYRICS] ✅ LRCLIB-GET (exact): "${x.trackName}" - ${x.artistName} (${lines.length} baris)`);
    return lines;
  } catch (e: any) {}
  return null;
}

async function lrclibSearch(query: string, guess: string, videoDurationSec: number, expectedArtist: string): Promise<Line[]> {
  try {
    const res = await fetchWithRetry(
      "https://lrclib.net/api/search?q=" + encodeURIComponent(query),
      { headers: { "User-Agent": "BATIA-OS/8.49" } },
      "LRCLIB"
    );
    if (!res.ok) return [];
    const arr: any[] = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const nq = normT(query);
    const nExpected = normT(expectedArtist);
    let best: any = null;
    let bestScore = 0;
    for (const x of arr) {
      if (!x || !x.syncedLyrics) continue;
      const nt = normT(String(x.trackName || ""));
      const na = normT(String(x.artistName || ""));
      if (!nt) continue;
      if (videoDurationSec && x.duration && Math.abs(x.duration - videoDurationSec) > 30) continue;
      let score = 0;
      if (nt === nq) score = 4;
      else if (nq.includes(nt) && nt.length >= 3) score = 3;
      else if (nt.includes(nq) && nq.length >= 6) score = 2;
      else continue;
      // ✅ v8.49: longgar artist match - partial token match OK (lebih banyak match dari LRCLIB)
      if (nExpected && nExpected.length > 3) {
        const artistTokens = nExpected.split(" ").filter((t) => t.length > 2);
        const anyMatch = artistTokens.some((t) => na.includes(t));
        if (!anyMatch) continue;
      }
      const lLang = textLang(String(x.syncedLyrics).slice(0, 600));
      if (guess === "ms" && lLang === "en") continue;
      if (guess === "en" && lLang === "ms") continue;
      if (lLang === guess && guess !== "?") score += 2;
      if (nExpected && nExpected.length > 3) {
        const artistTokens = nExpected.split(" ").filter((t) => t.length > 2);
        if (artistTokens.some((t) => na.includes(t))) score += 2;
      }
      if (score > bestScore) { bestScore = score; best = x; }
    }
    if (!best || bestScore < 2) return [];
    const lines = parseLrc(String(best.syncedLyrics));
    if (lines.length > 0) console.log(`[LYRICS] ✅ LRCLIB search: "${best.trackName}" - ${best.artistName} (${lines.length} baris)`);
    return lines;
  } catch (e: any) {
    return [];
  }
}

function parseLrc(lrc: string): Line[] {
  const rows = lrc.replace(/\r/g, "").split("\n");
  const out: Line[] = [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
  const wordRe = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>(\S+)/g;
  for (const r of rows) {
    const m = r.match(re);
    if (!m) continue;
    const frac = m[3] || "0";
    const msFrac = frac.length === 1 ? +frac * 100 : frac.length === 2 ? +frac * 10 : +frac;
    const a = +m[1] * 60000 + +m[2] * 1000 + msFrac;
    const rawText = m[4].replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, "");
    const text = cleanLine(rawText);
    if (!text || isBadLine(text)) continue;
    const line: Line = { a, b: a + 4000, text, words: [] };
    const ws: Word[] = [];
    let wm: RegExpExecArray | null;
    wordRe.lastIndex = 0;
    while ((wm = wordRe.exec(m[4])) !== null) {
      const wf = wm[3] || "0";
      const wms = wf.length === 1 ? +wf * 100 : wf.length === 2 ? +wf * 10 : +wf;
      ws.push({ w: wm[4], a: +wm[1] * 60000 + +wm[2] * 1000 + wms, b: 0 });
    }
    if (ws.length > 0) {
      for (let i = 0; i < ws.length; i++) ws[i].b = i + 1 < ws.length ? ws[i + 1].a : a + 4000;
      line.words = ws;
    }
    out.push(line);
  }
  out.sort((x, y) => x.a - y.a);
  for (let i = 0; i < out.length - 1; i++) out[i].b = out[i + 1].a;
  return ensureWords(out);
}

async function fetchYtSubs(videoId: string): Promise<Line[]> {
  try {
    await execFileAsync(ytdlp, [
      "--skip-download", "--write-subs",
      "--sub-langs", "ms.*,en.*,en-orig,id.*", "--convert-subs", "vtt",
      "-o", path.join(lyricsDir, videoId),
      "--no-warnings", "--quiet", "--no-cache-dir", "--cookies", cookiesPath,
      "https://www.youtube.com/watch?v=" + videoId,
    ], { timeout: 20000 });
    const files = fs.readdirSync(lyricsDir).filter((f) => f.startsWith(videoId + ".") && f.endsWith(".vtt"));
    files.sort((a, b) => {
      const score = (f: string) => (f.includes(".ms") ? 0 : f.includes(".en") ? 1 : 2);
      return score(a) - score(b);
    });
    if (files.length > 0) {
      const lines = parseVtt(fs.readFileSync(path.join(lyricsDir, files[0]), "utf8"));
      if (lines.length > 0) console.log(`[LYRICS] ✅ YouTube subs: ${lines.length} baris`);
      return lines;
    }
  } catch (e: any) {}
  return [];
}

async function transcribeWhisper(videoId: string, guess: string): Promise<Line[]> {
  let file = "";
  try {
    const f = fs.readdirSync(musicDir).find((x) => x.startsWith(videoId + ".") && /\.(m4a|mp4|mp3|webm|opus)$/i.test(x));
    if (f) file = path.join(musicDir, f);
  } catch (e) {}
  if (!file || !fs.existsSync(file)) return [];
  const size = fs.statSync(file).size;
  if (size > 24 * 1024 * 1024) return [];
  const key = process.env.GROQ_API_KEY || "";
  if (!key) return [];
  try {
    const start = Date.now();
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".m4a" ? "audio/mp4" : ext === ".mp3" ? "audio/mpeg" : ext === ".webm" ? "audio/webm" : ext === ".opus" ? "audio/opus" : "audio/mp4";
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), videoId + ext);
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("timestamp_granularities[]", "segment");
    if (guess === "ms") form.append("language", "ms");
    else if (guess === "en") form.append("language", "en");
    // ✅ v8.49: initial_prompt untuk paksa Whisper fokus Melayu (elak hallucinate English)
    if (guess === "ms") {
      form.append("initial_prompt", "Lagu Melayu. Perkataan: yang, dan, aku, kau, hati, cinta, jiwa, rindu, dunia, hidup, mati, malam, siang, langit, bumi, angin, hujan, rindu, kasih, sayang, lumrah, mudah, bersama, percaya, kerana, selalu, sendiri, sepi, sunyi, indah, derita, luka, pedih, air mata, kenangan, jemari, bayangan, takdir, harapan.");
    }
    const res = await fetchWithRetry("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    }, "Whisper");
    if (!res.ok) return [];
    const data: any = await res.json();
    const segs: any[] = Array.isArray(data.segments) ? data.segments : [];
    let lines: Line[] = [];
    let skipped = 0;
    let corrected = 0;
    for (const s of segs) {
      const rawText = cleanLine(String(s.text || ""));
      if (!rawText || isBadLine(rawText)) { skipped++; continue; }
      // ✅ v8.49: apply corrections
      const text = applyCorrections(rawText, guess);
      if (text !== rawText) corrected++;
      const a = Math.round((s.start || 0) * 1000);
      const b = Math.round((s.end || s.start || 0) * 1000);
      const prev = lines[lines.length - 1];
      if (prev && prev.text === text) prev.b = b;
      else lines.push({ a, b, text, words: [] });
    }
    if (skipped > 0) console.log(`[LYRICS] 🧹 Buang ${skipped} hallucination`);
    if (corrected > 0) console.log(`[LYRICS] ✏️ Post-corrected ${corrected} baris (Whisper Malay)`);

    let songLang: "ms" | "en" | "?" = guess !== "?" ? guess : textLang(lines.map((l) => l.text).join(" "));
    if (songLang === "?") {
      const dl = String(data.language || "").toLowerCase();
      songLang = dl.startsWith("ms") || dl.startsWith("id") ? "ms" : dl === "en" ? "en" : "?";
    }
    if (songLang !== "?") {
      const before = lines.length;
      lines = filterLinesByLang(lines, songLang);
      if (before !== lines.length) console.log(`[LYRICS] 🧹 Buang ${before - lines.length} baris campur (kekalkan ${songLang})`);
    }

    if (isInsufficientLyrics(lines)) {
      console.log(`[LYRICS] ❌ Whisper insufficient selepas tapis (${lines.length} baris) - reject`);
      return [];
    }
    console.log(`[LYRICS] ✅ Whisper: ${lines.length} baris (lang=${songLang})`);
    return ensureWords(lines);
  } catch (e: any) {
    return [];
  }
}

async function loadLyrics(videoId: string, dashboardQuery: string) {
  if (!videoId) { if (current) current.loading = false; return; }
  const cacheJson = path.join(lyricsDir, videoId + ".json");

  // ========== PHASE 0: Cache check (FAST PATH) ==========
  try {
    if (fs.existsSync(cacheJson)) {
      const rawJson = JSON.parse(fs.readFileSync(cacheJson, "utf8"));
      const isObj = rawJson && !Array.isArray(rawJson) && Array.isArray(rawJson.lines);
      const cachedLines: Line[] = isObj ? (rawJson.lines || []) : (Array.isArray(rawJson) ? rawJson : []);
      const cachedMeta: VideoMeta | null = isObj ? (rawJson.meta || null) : null;
      const cachedOffset = isObj ? (rawJson.offsetMs || 0) : 0;
      const cachedLead = isObj ? (rawJson.leadIn || 0) : 0;
      const cachedSource = isObj ? (rawJson.source || "CACHE") : "CACHE";
      const cachedLang: string = isObj ? (rawJson.lang || "?") : "?";

      let cleaned = ensureWords(cachedLines.filter((l) => !isBadLine(l.text)));
      if (!isInsufficientLyrics(cleaned)) {
        if (current && current.videoId === videoId) {
          current.lines = cleaned;
          current.hasLyrics = cleaned.length > 0;
          current.offsetMs = cachedOffset;
          current.leadIn = cachedLead;
          current.source = cachedSource;
          current.lang = cachedLang;
          current.loading = false;
          if (cachedMeta) {
            const parsed = parseArtistTitle(cachedMeta.title, cachedMeta.channel);
            current.title = parsed.artist ? `${parsed.artist} - ${parsed.title}` : cachedMeta.title;
          }
        }
        console.log(`[LYRICS] ⚡ INSTANT cache hit: ${videoId} (${cleaned.length} baris, src ${cachedSource})`);
        return;
      }
    }
  } catch (e) {}

  // ========== PHASE 1: PARALLEL fetch ==========
  console.log(`[LYRICS] 🔄 Fetch parallel: meta + probe lang untuk ${videoId}...`);
  const [meta, probeLang] = await Promise.all([
    fetchVideoMeta(videoId),
    probeVideoLang(videoId),
  ]);

  const rawTitle = meta?.title || dashboardQuery || videoId;
  const channel = meta?.channel || "";
  const videoDuration = meta?.duration || 0;
  const { artist, title } = parseArtistTitle(rawTitle, channel);
  if (current) current.title = artist ? `${artist} - ${title}` : title;
  console.log(`[LYRICS] 📼 Meta: "${artist || "?"} - ${title}" | duration: ${videoDuration}s`);

  let guess: "ms" | "en" | "?" = textLang(title + " " + artist);
  if (guess === "?") guess = probeLang;
  if (current) current.lang = guess;

  // ========== PHASE 2: Chain lirik ==========
  let lines: Line[] = [];
  let source = "";

  if (artist && title && videoDuration > 0) {
    const got = await lrclibGetExact(title, artist, videoDuration, guess);
    if (got && got.length > 0) { lines = got; source = "LRCLIB"; }
  }
  if (lines.length === 0) {
    const queries: string[] = [];
    if (artist && title) { queries.push(`${artist} ${title}`); queries.push(`${title} ${artist}`); queries.push(title); }
    else queries.push(title);
    for (const q of queries) {
      if (lines.length > 0) break;
      const got = await lrclibSearch(q, guess, videoDuration, artist);
      if (got && got.length > 0) { lines = got; source = "LRCLIB"; }
    }
  }
  if (lines.length === 0) { lines = await fetchYtSubs(videoId); if (lines.length > 0) source = "YT-SUBS"; }
  if (lines.length === 0) { lines = await transcribeWhisper(videoId, guess); if (lines.length > 0) source = "WHISPER"; }

  if (lines.length > 0 && source === "WHISPER" && guess !== "?") {
    const before = lines.length;
    lines = filterLinesByLang(lines, guess);
    if (before !== lines.length) console.log(`[LYRICS] 🧹 Buang ${before - lines.length} baris campur (kekalkan ${guess})`);
  }

  if (lines.length > 0) {
    saveCache(videoId, {
      lines,
      offsetMs: current ? current.offsetMs : 0,
      source,
      lang: guess,
      leadIn: current ? current.leadIn : 0,
      meta,
    });
    if (current && current.videoId === videoId) current.source = source;
  }
  if (current && current.videoId === videoId) {
    current.lines = lines;
    current.hasLyrics = lines.length > 0;
    current.loading = false;
  }
  if (lines.length === 0) console.log(`[LYRICS] ❌ Tiada lirik untuk ${videoId}`);
}

function tsToMs(t: string): number {
  const p = t.trim().split(":");
  const sec = parseFloat(p[p.length - 1]);
  const mins = p.length === 3 ? +p[0] * 60 + +p[1] : p.length === 2 ? +p[0] : 0;
  return (mins * 60 + sec) * 1000;
}

function parseVtt(vtt: string): Line[] {
  const rows = vtt.replace(/\r/g, "").split("\n");
  const out: Line[] = [];
  let i = 0;
  while (i < rows.length) {
    const m = rows[i].match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (m) {
      let text = "";
      i++;
      while (i < rows.length && rows[i].trim() !== "") { text += (text ? " " : "") + rows[i].trim(); i++; }
      text = cleanLine(text);
      if (text && !isBadLine(text)) {
        const a = tsToMs(m[1]); const b = tsToMs(m[2]);
        const prev = out[out.length - 1];
        if (prev && prev.text === text) prev.b = b;
        else out.push({ a, b, text, words: [] });
      }
    } else i++;
  }
  return ensureWords(out);
}

function computePayload(): any {
  if (!current) {
    return { v: SERVER_VERSION, playing: false, title: "", elapsed: 0, hasLyrics: false, loading: false, prev: null, line: null, next: null, sync: false, offsetMs: 0, leadIn: 0, source: "", lang: "" };
  }
  const now = Date.now();
  const tickFresh = current.lastTickAt && (now - current.lastTickAt) < 3000;
  let elapsed: number;
  if (tickFresh && current.frontendElapsed !== undefined) elapsed = current.frontendElapsed;
  else if (current.pausedAt) elapsed = current.frontendElapsed ?? (current.pausedAt - current.t0);
  else elapsed = now - current.t0;
  const lead = current.source === "LRCLIB" ? (current.leadIn || 0) : 0;
  elapsed = Math.max(0, elapsed - LYRICS_OFFSET_MS - (current.offsetMs || 0) - lead);

  let prev: Line | null = null;
  let line: Line | null = null;
  let next: Line | null = null;
  if (current.hasLyrics) {
    const idx = current.lines.findIndex((l) => elapsed >= l.a && elapsed < l.b);
    if (idx >= 0) {
      line = current.lines[idx];
      prev = current.lines[idx - 1] || null;
      next = current.lines[idx + 1] || null;
    }
  }
  return { v: SERVER_VERSION, playing: true, title: current.title, elapsed, hasLyrics: current.hasLyrics, loading: current.loading, prev, line, next, sync: tickFresh, offsetMs: current.offsetMs || 0, leadIn: lead, source: current.source || "", lang: current.lang || "" };
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/now")) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(JSON.stringify(computePayload()));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>BATIA Lyrics v${SERVER_VERSION}</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:system-ui,sans-serif}
  #lyrBox{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:88%;text-align:center;pointer-events:none;opacity:0;transition:opacity .6s}
  #lyrBox.on{opacity:1}
  #title{display:none;width:fit-content;margin:0 auto 26px;color:#fff;background:rgba(0,0,0,.75);border:3px solid #22d3ee;border-radius:999px;padding:14px 40px;font-size:36px;font-weight:900;letter-spacing:1px;white-space:nowrap;text-shadow:0 3px 6px #000,0 0 18px rgba(34,211,238,.5)}
  #prev{color:rgba(255,255,255,.35);font-size:22px;font-weight:600;text-shadow:0 1px 5px #000;min-height:30px;margin-bottom:16px}
  #line{font-size:54px;font-weight:900;line-height:1.2;min-height:66px;text-shadow:0 3px 12px #000}
  #line.on{animation:lyrIn .4s ease forwards}
  #line.out{animation:lyrOut .5s ease forwards}
  .w{display:inline-block;color:rgba(255,255,255,.35);transition:color .12s,text-shadow .12s,transform .12s;margin:0 .14em}
  .w.done{color:#e0f2fe;text-shadow:0 0 12px rgba(34,211,238,.75)}
  .w.now{color:#fbbf24;text-shadow:0 0 26px rgba(251,146,60,.95),0 0 10px rgba(255,255,255,.6);transform:scale(1.12)}
  #next{color:rgba(255,255,255,.5);font-size:24px;font-weight:600;text-shadow:0 1px 6px #000;min-height:32px;margin-top:18px}
  #hint{color:rgba(34,211,238,.7);font-size:18px;font-weight:700;margin-top:8px;display:none;text-shadow:0 1px 4px #000}
  #load{position:fixed;left:50%;top:70%;transform:translateX(-50%);color:#22d3ee;font-size:17px;font-weight:700;display:none;text-shadow:0 1px 4px #000;z-index:100}
  #ver{position:fixed;bottom:8px;left:10px;color:rgba(255,255,255,.35);font-size:11px;z-index:100}
  @keyframes lyrIn{0%{opacity:0;transform:translateY(18px) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes lyrOut{0%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}
</style></head>
<body>
<div id="ver">v${SERVER_VERSION}</div>
<div id="lyrBox">
  <div id="title"></div>
  <div id="prev"></div>
  <div id="line"></div>
  <div id="next"></div>
  <div id="hint"></div>
</div>
<div id="load">⏳ ambil lirik...</div>
<script src="/socket.io/socket.io.js"></script>
<script>
  const PAGE_VERSION = "${SERVER_VERSION}";
  const q = new URLSearchParams(location.search);
  if (q.get("bg") === "green") document.body.style.background = "#00ff00";
  const elBox = document.getElementById("lyrBox");
  const elPrev = document.getElementById("prev");
  const elLine = document.getElementById("line");
  const elNext = document.getElementById("next");
  const elTitle = document.getElementById("title");
  const elHint = document.getElementById("hint");
  const elLoad = document.getElementById("load");
  const elVer = document.getElementById("ver");
  let lastText = "";
  let wordSpans = [];
  let fadeTimer = null;

  function buildWords(words) {
    elLine.innerHTML = "";
    wordSpans = (words || []).map((w) => {
      const sp = document.createElement("span");
      sp.className = "w";
      sp.textContent = w.w;
      elLine.appendChild(sp);
      return sp;
    });
  }

  const s = io();
  s.on("lyrics:update", (d) => {
    if (d.v && d.v !== PAGE_VERSION) { location.reload(); return; }
    elVer.textContent = "v" + PAGE_VERSION + (d.source ? " | " + d.source : "") + (d.lang ? " | " + d.lang : "") + (d.leadIn ? " | lead " + d.leadIn + "ms" : "") + (d.offsetMs ? " | off " + (d.offsetMs > 0 ? "+" : "") + d.offsetMs + "ms" : "");
    if (!d.playing) {
      elBox.classList.remove("on");
      elTitle.style.display = "none";
      elLine.className = ""; elLine.innerHTML = "";
      elPrev.textContent = ""; elNext.textContent = "";
      elHint.style.display = "none";
      elLoad.style.display = "none";
      lastText = ""; wordSpans = [];
      return;
    }
    elTitle.style.display = "block";
    elTitle.textContent = "🎵 " + d.title;
    elBox.classList.add("on");
    elLoad.style.display = d.loading ? "block" : "none";
    if (!d.hasLyrics) {
      elLine.innerHTML = ""; elLine.className = "";
      elPrev.textContent = ""; elNext.textContent = "";
      elHint.textContent = "♪ instrumental ♪";
      elHint.style.display = "block";
      lastText = ""; wordSpans = [];
      return;
    }
    elHint.style.display = "none";
    elPrev.textContent = d.prev ? d.prev.text : "";
    elNext.textContent = d.next ? d.next.text : "";
    const text = d.line ? d.line.text : "";
    if (text) {
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      if (text !== lastText) {
        lastText = text;
        buildWords(d.line.words);
        elLine.className = ""; void elLine.offsetWidth; elLine.className = "on";
      }
      const ws = d.line.words || [];
      wordSpans.forEach((sp, i) => {
        const w = ws[i]; if (!w) return;
        sp.className = "w" + (d.elapsed >= w.b ? " done" : d.elapsed >= w.a ? " now" : "");
      });
    } else if (lastText) {
      if (!fadeTimer) {
        elLine.className = "out";
        fadeTimer = setTimeout(() => {
          elLine.innerHTML = ""; elLine.className = "";
          lastText = ""; wordSpans = []; fadeTimer = null;
        }, 500);
      }
    }
  });
</script>
</body></html>`);
});

const ioLyrics = new SocketServer(server, { cors: { origin: "*" } });
ioLyrics.on("connection", (cli) => {
  cli.emit("lyrics:update", computePayload());
});

setInterval(() => {
  ioLyrics.emit("lyrics:update", computePayload());
}, 400);

server.listen(LYRICS_PORT, () => console.log(`[LYRICS] 🌐 Overlay lirik: http://localhost:${LYRICS_PORT}  (green: ?bg=green)`));