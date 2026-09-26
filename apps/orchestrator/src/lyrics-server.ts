// ✅ BATIA Lyrics Server v8.73 - port 4002
// v8.73: tick validation + elapsed cross-check (fix lirik lari laju)
// v8.72: anti-throttle gesture | v8.71: caption prior | v8.70: tajuk center | v8.69: album detect
import http from "http";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { io as socketIoClient } from "socket.io-client";
import { Server as SocketServer } from "socket.io";
import dotenv from "dotenv";
const execFileAsync = promisify(execFile);

const SERVER_VERSION = "8.73";
const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const LYRICS_PORT = 4002;
const LYRICS_OFFSET_MS = parseInt(process.env.LYRICS_OFFSET_MS || "0", 10);
const toolsDir = path.resolve(__dirname, "../../../tools");
const musicDir = path.resolve(__dirname, "../audio/music");
const lyricsDir = path.join(musicDir, "lyrics");
try { fs.mkdirSync(lyricsDir, { recursive: true }); } catch (e) {}
const ytdlp = fs.existsSync(path.join(toolsDir, "yt-dlp.exe")) ? path.join(toolsDir, "yt-dlp.exe") : "yt-dlp";
const cookiesPath = path.join(toolsDir, "cookies.txt");

const EP_LRCLIB_GET = "https://lrclib.net/api/get";
const EP_LRCLIB_SEARCH = "https://lrclib.net/api/search";
const EP_LYRIST = "https://lyrist.vercel.app/api";
const EP_OVH = "https://api.lyrics.ovh/v1";
const EP_GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const EP_YT = "https://www.youtube.com/watch?v=";
const UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const UA_APP = "BATIA-OS/8.73 (lyrics bot; contact: local)";

type Word = { w: string; a: number; b: number };
type Line = { a: number; b: number; text: string; words: Word[] };
type VideoMeta = { title: string; channel: string; duration: number };
type SongState = {
  title: string; videoId: string; t0: number; pausedAt: number;
  lines: Line[]; hasLyrics: boolean; loading: boolean;
  offsetMs: number; leadIn: number; source: string; lang: string;
  frontendElapsed?: number; lastTickAt: number;
};

let current: SongState | null = null;
console.log("[LYRICS] 🎤 Lyrics server v" + SERVER_VERSION + " - port", LYRICS_PORT);
console.log("[LYRICS] 🧪 Test semua link: http://localhost:" + LYRICS_PORT + "/test");

const HALLUCINATION_RE = /\b(thanks? for (watching|listening|viewing)|thank you for (watching|listening|viewing)|terima kasih (telah|kerana|sudah) (menonton|mendengar|menyokong)|please (like|subscribe|share|follow)|subscribe to (my|our) channel|like and subscribe|subtitles? by|captions? by|transcribed by|amara\.org|everything will be (fine|okay|ok|alright)|stay in the heart|in the cool|i('?m)? not a fool|you('?re)? not a fool|don'?t be afraid|see you (next time|soon)|until next time|have a nice day|good luck|www\.|https?:\/\/|please turn on|turn on (the )?(subtitles|captions)|^thank you\.?$|^thanks\.?$|^bye\.?$|^goodbye\.?$|^see you\.?$|^take care\.?$|^that'?s all\.?$|^the end\.?$|^ah ah ah|^oh oh oh|^la la la|^na na na)\b/i;

function isBadLine(t: string): boolean {
  if (/[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(t)) return true;
  if (HALLUCINATION_RE.test(t)) return true;
  const trimmed = t.trim();
  if (trimmed.length <= 12 && /^(ah|oh|la|na|bye|thanks?|thank you|goodbye|see you|take care|the end|that'?s all)$/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length >= 4) {
    const first = words[0].toLowerCase();
    if (words.filter((w) => w.toLowerCase() === first).length / words.length > 0.8) return true;
  }
  return false;
}

function isInsufficientLyrics(lines: Line[]): boolean {
  if (lines.length < 5 || lines.length === 0) return true;
  const lastB = Math.max(...lines.map((l) => l.b));
  return lastB < 60000 && lines.length < 15;
}

function cleanLine(t: string): string {
  return t.replace(/<[^>]+>/g, "").replace(/[♪♫]/g, "").replace(/\s+/g, " ").trim();
}

const MS_WORDS_RE = /\b(yang|dan|aku|kau|kamu|dia|mereka|kita|kami|saya|tak|tiada|bukan|ini|itu|hati|cinta|jiwa|rindu|sayang|kasih|malam|hari|bulan|bintang|mimpi|nyata|abadi|sejati|kejora|purnama|senja|embun|bayu|melur|kenanga|cempaka|seroja|nilam|baiduri|permata|delima|ratna|gita|nada|irama|dendang|seruling|zapin|inang|joget|selendang|songket|keris|wau|kenangan|hujan|pagi|petang|selalu|bila|kenapa|mengapa|bagaimana|semoga|hingga|sampai|kembali|pergi|tinggal|ingat|lupa|antara|dalam|pada|untuk|dengan|telah|sudah|belum|masih|akan|jangan|pernah|hanya|saja|sahaja|juga|pun|lah|nya|dari|oleh|kerana|karena|sebab|agar|supaya|walau|walaupun|meski|meskipun|jika|kalau|tuan|puan|abang|kakak|adik|teman|kawan|sahabat|cintaku|cintamu|sayangku|hatiku|jiwaku|diriku|dirimu|pulang|kampung|angin|api|air|tanah|langit|bumi|peluk|cium|airmata|menangis|tersenyum|berjalan|berlari|terbang|jatuh|bangkit|hidup|mati|syurga|tuhan|doa|restu|ibu|bapa|emak|ayah|merdeka|selamat|terima|mohon|ampun|maaf|syukur|lumrah|mudah|percaya|bersama|teratai|bunga|berseri|terpikat|alasanmu|mahligai|pujuk|selamanya|untukmu|meniti|suratan|setia|janji|hakikat|khianat|sanggup|takdir)\b/gi;
const EN_WORDS_RE = /\b(the|and|you|your|yours|my|me|mine|we|us|our|they|them|their|he|she|him|her|is|are|was|were|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|must|shall|of|in|on|at|to|from|for|with|without|about|into|over|under|again|then|than|so|such|not|only|own|same|too|very|just|because|until|while|although|though|if|else|when|where|why|how|all|any|both|each|few|more|most|other|some|love|heart|eyes|night|day|dream|forever|always|never|together|away|back|home|life|world|sky|rain|sun|moon|star|remember|forget|stay|leave|hold|touch|feel|know|think|believe|hope|wish|wait|keep|give|take|make|break|fall|fly|run|walk|sing|dance|smile|cry|tears|kiss|warm|cold|bright|dark|light|shadow|silence|sound|voice|song|melody|music|beautiful|wonderful|amazing|broken|lost|found|free|wild|young|old|true|real|right|wrong|good|bad|better|best|worst|first|last|once|twice|every|another|enough|less|least|much|many|little|big|small|great|high|low|deep|wide|long|short|hard|soft|sweet|bitter|strong|weak|brave|afraid|scared|lonely|alone|happy|sad|glad|angry|calm|quiet|loud|slow|fast|quick|early|late|now|here|there|everywhere|nowhere|somewhere|anywhere|someone|somebody|anyone|anybody|everyone|everybody|nobody|nothing|something|anything|everything|person|gaze|morning)\b/gi;

function textLang(text: string): "ms" | "en" | "?" {
  const ms = (text.match(MS_WORDS_RE) || []).length;
  const en = (text.match(EN_WORDS_RE) || []).length;
  if (ms === 0 && en === 0) return "?";
  if (ms > en) return "ms";
  if (en > ms) return "en";
  return "?";
}

function filterLinesByLang(lines: Line[], lang: "ms" | "en"): Line[] {
  return lines.filter((l) => { const ll = textLang(l.text); return ll === lang || ll === "?"; });
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

const MS_CORRECTIONS: [RegExp, string][] = [
  [/\bjumrah\b/gi, "lumrah"],
  [/\bmuda\b(?=\s*[.,!?;:]|\s*$)/gi, "mudah"],
  [/\btana\b(?=\s*[.,!?;:]|\s*$)/gi, "tanah"],
  [/\bpecahaya\b/gi, "percaya"],
  [/\bbesama\b/gi, "bersama"],
  [/\bkuasa mu\b/gi, "kuasamu"],
  [/\bhati mu\b/gi, "hatimu"],
  [/\bdiri mu\b/gi, "dirimu"],
  [/\bcinta mu\b/gi, "cintamu"],
  [/\bsayang mu\b/gi, "sayangmu"],
  [/\bjiwa mu\b/gi, "jiwamu"],
  [/\brindu mu\b/gi, "rindumu"],
  [/\bimnang\b/gi, "kenangan"],
  [/\bmelepasmu\b/gi, "melepaskanmu"],
  [/\bmelepas mu\b/gi, "melepaskanmu"],
];

function applyCorrections(text: string, lang: string): string {
  if (lang !== "ms") return text;
  let out = text;
  for (const [re, rep] of MS_CORRECTIONS) out = out.replace(re, rep);
  return out;
}

function sim(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  let hit = 0;
  for (const t of tb) if (setA.has(t)) hit++;
  return (2 * hit) / (setA.size + tb.length);
}

function alignText(whisperLines: Line[], plainLines: string[]): { lines: Line[]; replaced: number } {
  if (!plainLines.length || !whisperLines.length) return { lines: whisperLines, replaced: 0 };
  const w = whisperLines.map((l) => normT(l.text));
  const p = plainLines.map((s) => normT(s)).filter(Boolean);
  if (Math.abs(w.length - p.length) > Math.max(4, Math.floor(w.length * 0.35))) return { lines: whisperLines, replaced: 0 };
  let pi = 0;
  let replaced = 0;
  const out = whisperLines.map((l, wi) => {
    let bestJ = -1;
    let bestScore = 0;
    const hi = Math.min(p.length, pi + 4);
    for (let j = pi; j < hi; j++) {
      const sc = sim(w[wi], p[j]);
      if (sc > bestScore) { bestScore = sc; bestJ = j; }
    }
    if (bestJ >= 0 && bestScore >= 0.45) {
      pi = bestJ + 1;
      if (plainLines[bestJ].trim() !== l.text.trim()) replaced++;
      return { ...l, text: cleanLine(plainLines[bestJ]) };
    }
    return l;
  });
  return { lines: out, replaced };
}

function saveLyricsCache(videoId: string, data: { lines: Line[]; offsetMs: number; leadIn: number; source: string; lang: string }) {
  try {
    fs.writeFileSync(path.join(lyricsDir, videoId + ".json"), JSON.stringify({ v: 1, ...data }));
  } catch (e) {}
}

function parseArtistTitle(raw: string, channel: string): { artist: string; title: string } {
  let t = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/@[a-zA-Z0-9_]+/g, " ")
    .replace(/official (music )?(video|audio|lyric(s)? video)?/gi, " ")
    .replace(/lyric(s)? (video|on screen)?/gi, " ")
    .replace(/\blirik\b/gi, " ")
    .replace(/\bmv\b/gi, " ")
    .replace(/hq|hd|full (version|song)?/gi, " ")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let artist = "";
  let title = t;
  const dashMatch = t.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) { artist = dashMatch[1].trim(); title = dashMatch[2].trim(); }
  else { artist = channel.replace(/VEVO|Official|Music|Channel/gi, "").replace(/Topic$/, "").trim(); }
  return { artist, title };
}

async function fetchVideoMeta(videoId: string): Promise<VideoMeta | null> {
  try {
    const { stdout } = await execFileAsync(ytdlp, [
      "--skip-download", "--no-warnings", "--quiet",
      "--print", "%(title)s\t%(channel)s\t%(duration)s",
      "--cookies", cookiesPath,
      EP_YT + videoId,
    ], { timeout: 6000 });
    const line = (stdout || "").split("\n").find((l) => l.includes("\t"));
    if (!line) return null;
    const parts = line.split("\t");
    return { title: (parts[0] || "").trim(), channel: (parts[1] || "").trim(), duration: parseInt(parts[2] || "0", 10) || 0 };
  } catch (e: any) { return null; }
}

async function fetchWithRetry(url: string, options: RequestInit, label: string, timeoutMs = 10000, maxRetries = 4): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 503 || res.status === 502 || res.status === 429) && attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 4000);
        console.log(`[LYRICS] ⏳ ${label}: HTTP ${res.status} - retry ${attempt}/${maxRetries} (${delay}ms)...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e: any) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 4000);
        await new Promise((r) => setTimeout(r, delay));
      } else throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

function extractCaptionTracks(html: string): any[] | null {
  const idx = html.indexOf('"captionTracks":');
  if (idx < 0) return null;
  const start = html.indexOf("[", idx);
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(start, end + 1)); } catch (e) { return null; }
}

async function fetchYouTubeTranscript(videoId: string, preferredLang: "ms" | "en" | "?"): Promise<{ lines: Line[] | null; langs: string[] }> {
  try {
    const pageRes = await fetchWithRetry(EP_YT + videoId, { headers: { "User-Agent": UA_BROWSER } }, "YT-page", 8000, 2);
    if (!pageRes.ok) return { lines: null, langs: [] };
    const html = await pageRes.text();
    const tracks = extractCaptionTracks(html);
    if (!tracks || tracks.length === 0) return { lines: null, langs: [] };
    const langs: string[] = tracks.map((t: any) => String(t.languageCode || ""));
    let chosen: any = null;
    if (preferredLang !== "?") chosen = tracks.find((t) => (t.languageCode || "").startsWith(preferredLang));
    if (!chosen) chosen = tracks.find((t) => (t.languageCode || "").startsWith("ms"));
    if (!chosen) chosen = tracks.find((t) => (t.languageCode || "").startsWith("en"));
    if (!chosen) chosen = tracks[0];
    let captionUrl = chosen?.baseUrl;
    if (!captionUrl) return { lines: null, langs };
    captionUrl = captionUrl.replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    const capRes = await fetchWithRetry(captionUrl + "&fmt=json3", {}, "YT-captions", 8000, 2);
    if (!capRes.ok) return { lines: null, langs };
    const data = await capRes.json();
    const events: any[] = data.events || [];
    const lines: Line[] = [];
    for (const ev of events) {
      if (!ev.segs) continue;
      const text = ev.segs.map((s: any) => s.utf8 || "").join("").trim();
      const cleaned = cleanLine(text);
      if (!cleaned || isBadLine(cleaned)) continue;
      const startMs = Math.round(ev.tStartMs || 0);
      const durMs = Math.round(ev.dDurationMs || 3000);
      lines.push({ a: startMs, b: startMs + durMs, text: cleaned, words: [] });
    }
    if (lines.length >= 5) {
      console.log(`[LYRICS] ✅ YT Transcript: ${lines.length} baris`);
      return { lines: ensureWords(lines), langs };
    }
    return { lines: null, langs };
  } catch (e: any) { return { lines: null, langs: [] }; }
}

async function lrclibGetExact(track: string, artist: string, durationSec: number, guess: string): Promise<Line[] | null> {
  if (!track || !artist || !durationSec) return null;
  try {
    const url = `${EP_LRCLIB_GET}?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}&duration=${durationSec}`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": UA_APP } }, "LRCLIB-GET", 8000, 4);
    if (!res.ok) return null;
    const x: any = await res.json();
    if (!x) return null;
    if (x.duration && Math.abs(x.duration - durationSec) > 60) return null;
    const lLang = textLang(String(x.syncedLyrics || x.plainLyrics || "").slice(0, 600));
    if ((guess === "ms" && lLang === "en") || (guess === "en" && lLang === "ms")) return null;
    if (x.syncedLyrics) {
      const lines = parseLrc(String(x.syncedLyrics));
      if (lines.length > 0) { console.log(`[LYRICS] ✅ LRCLIB GET: ${lines.length} baris`); return lines; }
    }
    return null;
  } catch (e: any) { return null; }
}

async function lrclibSearch(query: string, guess: string, videoDurationSec: number, expectedArtist: string, minScore = 2, requireExact = false): Promise<Line[]> {
  try {
    const res = await fetchWithRetry(EP_LRCLIB_SEARCH + "?q=" + encodeURIComponent(query), { headers: { "User-Agent": UA_APP } }, "LRCLIB", 8000, 4);
    if (!res.ok) { console.log(`[LYRICS] ⚠️ LRCLIB: HTTP ${res.status}`); return []; }
    const arr: any[] = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const nq = normT(query);
    const nExpected = normT(expectedArtist);
    if (requireExact) {
      const exactArtists = new Set<string>();
      for (const x of arr) {
        const nt2 = normT(String(x.trackName || ""));
        if (nt2 === nq && x.syncedLyrics) exactArtists.add(normT(String(x.artistName || "")));
      }
      if (exactArtists.size > 1) {
        console.log(`[LYRICS] ⚠️ Fast path skip: "${query}" ada ${exactArtists.size} artis berbeza - guna meta YouTube`);
        return [];
      }
    }
    let best: any = null;
    let bestScore = 0;
    for (const x of arr) {
      if (!x) continue;
      const nt = normT(String(x.trackName || ""));
      const na = normT(String(x.artistName || ""));
      if (!nt) continue;
      if (videoDurationSec && x.duration && Math.abs(x.duration - videoDurationSec) > 60) continue;
      let score = 0;
      if (nt === nq) score = 4;
      else if (nq.includes(nt) && nt.length >= 3) score = 3;
      else if (nt.includes(nq) && nq.length >= 6) score = 2;
      else continue;
      if (requireExact && score < 4) continue;
      if (nExpected && nExpected.length > 3) {
        const artistTokens = nExpected.split(" ").filter((t) => t.length > 2);
        if (!artistTokens.some((t) => na.includes(t))) continue;
      }
      const lyricsText = String(x.syncedLyrics || x.plainLyrics || "");
      const lLang = textLang(lyricsText.slice(0, 600));
      if ((guess === "ms" && lLang === "en") || (guess === "en" && lLang === "ms")) continue;
      if (lLang === guess && guess !== "?") score += 2;
      if (nExpected && nExpected.length > 3) {
        const artistTokens = nExpected.split(" ").filter((t) => t.length > 2);
        if (artistTokens.some((t) => na.includes(t))) score += 2;
      }
      if (score > bestScore) { bestScore = score; best = x; }
    }
    if (!best || bestScore < minScore) return [];
    if (best.syncedLyrics) {
      const lines = parseLrc(String(best.syncedLyrics));
      if (lines.length > 0) { console.log(`[LYRICS] ✅ LRCLIB: "${best.trackName}" - ${best.artistName}`); return lines; }
    }
    return [];
  } catch (e: any) { return []; }
}

async function fetchLyrist(artist: string, title: string, guess: string): Promise<string | null> {
  if (!title) return null;
  try {
    const url = artist ? `${EP_LYRIST}/${encodeURIComponent(title)}/${encodeURIComponent(artist)}` : `${EP_LYRIST}/${encodeURIComponent(title)}`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": UA_BROWSER, "Accept": "application/json" } }, "Lyrist", 8000, 2);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.lyrics) return null;
    const lLang = textLang(String(data.lyrics).slice(0, 600));
    if ((guess === "ms" && lLang === "en") || (guess === "en" && lLang === "ms")) return null;
    console.log(`[LYRICS] ✅ Lyrist: "${data.title || title}"`);
    return String(data.lyrics);
  } catch (e: any) { return null; }
}

async function fetchLyricsOvh(artist: string, title: string, guess: string): Promise<string | null> {
  if (!title) return null;
  try {
    const url = `${EP_OVH}/${encodeURIComponent(artist || "unknown")}/${encodeURIComponent(title)}`;
    const res = await fetchWithRetry(url, { headers: { "User-Agent": UA_BROWSER } }, "LyricsOVH", 8000, 2);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.lyrics) return null;
    const lLang = textLang(String(data.lyrics).slice(0, 600));
    if ((guess === "ms" && lLang === "en") || (guess === "en" && lLang === "ms")) return null;
    console.log(`[LYRICS] ✅ LyricsOVH: "${title}"`);
    return String(data.lyrics);
  } catch (e: any) { return null; }
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

async function transcribeWhisper(videoId: string, guess: string): Promise<Line[]> {
  let file = "";
  try {
    const f = fs.readdirSync(musicDir).find((x) => x.startsWith(videoId + ".") && /\.(m4a|mp4|mp3|webm|opus)$/i.test(x));
    if (f) file = path.join(musicDir, f);
  } catch (e) {}
  if (!file || !fs.existsSync(file)) return [];
  const size = fs.statSync(file).size;
  if (size > 24 * 1024 * 1024) { console.log(`[LYRICS] ⏭️ Whisper skip: file ${(size / 1024 / 1024).toFixed(1)}MB > 24MB (limit Groq) - biasa untuk album/compilation`); return []; }
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
    if (guess === "ms") form.append("initial_prompt", "Lagu Melayu. Perkataan: yang, dan, aku, kau, hati, cinta, jiwa, rindu, dunia, hidup, mati, malam, siang, langit, bumi, angin, hujan, kasih, sayang, lumrah, mudah, bersama, percaya, kerana, selalu, sendiri, sepi, sunyi, indah, derita, luka, pedih, air mata, kenangan, jemari, bayangan, takdir, harapan, teratai, bunga, berseri, terpikat, alasanmu, mahligai, pujuk, melepaskanmu, selamanya, untukmu, meniti, suratan, setia, janji.");
    const res = await fetchWithRetry(EP_GROQ, {
      method: "POST", headers: { Authorization: "Bearer " + key }, body: form,
    }, "Whisper", 45000, 2);
    if (!res.ok) { console.log(`[LYRICS] ❌ Whisper: HTTP ${res.status}`); return []; }
    const data: any = await res.json();
    const segs: any[] = Array.isArray(data.segments) ? data.segments : [];
    let lines: Line[] = [];
    let skipped = 0;
    for (const s of segs) {
      const rawText = cleanLine(String(s.text || ""));
      if (!rawText || isBadLine(rawText)) { skipped++; continue; }
      const text = applyCorrections(rawText, guess);
      const a = Math.round((s.start || 0) * 1000);
      const b = Math.round((s.end || s.start || 0) * 1000);
      const prev = lines[lines.length - 1];
      if (prev && prev.text === text) prev.b = b;
      else lines.push({ a, b, text, words: [] });
    }
    let songLang: "ms" | "en" | "?" = guess !== "?" ? guess : textLang(lines.map((l) => l.text).join(" "));
    if (songLang === "?") {
      const dl = String(data.language || "").toLowerCase();
      songLang = dl.startsWith("ms") || dl.startsWith("id") ? "ms" : dl === "en" ? "en" : "?";
    }
    if (songLang !== "?") {
      const before = lines.length;
      lines = filterLinesByLang(lines, songLang);
      if (before !== lines.length) console.log(`[LYRICS] 🧹 Buang ${before - lines.length} baris campur`);
    }
    const msCount = lines.filter((l) => textLang(l.text) === "ms").length;
    const enCount = lines.filter((l) => textLang(l.text) === "en").length;
    if (msCount > 0 && enCount > 0 && (enCount / Math.max(1, lines.length)) > 0.25) {
      console.log(`[LYRICS] ❌ Whisper REJECT: campur bahasa (${msCount} MS, ${enCount} EN)`);
      return [];
    }
    if (guess === "ms" && msCount === 0 && enCount > 0) {
      console.log(`[LYRICS] ❌ Whisper REJECT: output full English walau context MS`);
      return [];
    }
    if (isInsufficientLyrics(lines)) return [];
    console.log(`[LYRICS] ✅ Whisper: ${lines.length} baris (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return ensureWords(lines);
  } catch (e: any) { return []; }
}

async function loadLyrics(videoId: string, dashboardQuery: string) {
  if (!videoId) { if (current) current.loading = false; return; }
  const myId = videoId;
  const alive = () => current !== null && current.videoId === myId;
  const finish = (lines: Line[], source: string, lang: string, save: boolean) => {
    if (!alive()) return;
    current!.lines = lines; current!.hasLyrics = lines.length > 0;
    current!.loading = false; current!.source = source; current!.lang = lang;
    if (save && lines.length > 0) {
      saveLyricsCache(videoId, { lines, offsetMs: current!.offsetMs, leadIn: current!.leadIn, source, lang });
    }
  };

  // ========== PHASE 0: CACHE LIRIK (+ auto-correct) ==========
  try {
    const cf = path.join(lyricsDir, videoId + ".json");
    if (fs.existsSync(cf)) {
      const raw = JSON.parse(fs.readFileSync(cf, "utf8"));
      if (raw.source === "LYRIST") {
        try { fs.unlinkSync(cf); } catch (e) {}
        console.log(`[LYRICS] 🧹 Cache LYRIST dibuang (timing rata) - fetch semula`);
      } else {
        const cachedLines: Line[] = Array.isArray(raw.lines) ? raw.lines : [];
        const correctedLines = cachedLines.map((l: Line) => ({ ...l, text: applyCorrections(l.text, raw.lang === "en" ? "en" : "ms") }));
        const changed = correctedLines.some((l, i) => l.text !== cachedLines[i].text);
        const cleaned = ensureWords(correctedLines.filter((l) => !isBadLine(l.text)));
        if (changed && !isInsufficientLyrics(cleaned)) {
          saveLyricsCache(videoId, { lines: cleaned, offsetMs: raw.offsetMs || 0, leadIn: raw.leadIn || 0, source: raw.source || "CACHE", lang: raw.lang || "?" });
          console.log(`[LYRICS] 🔧 Cache auto-corrected (${videoId})`);
        }
        if (!isInsufficientLyrics(cleaned)) {
          if (alive()) {
            current!.offsetMs = raw.offsetMs || 0;
            current!.leadIn = raw.leadIn || 0;
            finish(cleaned, raw.source || "CACHE", raw.lang || "?", false);
            console.log(`[LYRICS] ⚡ CACHE lirik hit: ${cleaned.length} baris (src ${raw.source}, off ${raw.offsetMs || 0}ms, lead ${raw.leadIn || 0}ms) - INSTANT | baris1: "${(cleaned[0]?.text || "").slice(0, 50)}"`);
          }
          return;
        }
      }
    }
  } catch (e) {}

  let guess: "ms" | "en" | "?" = textLang(dashboardQuery);
  const fast = await lrclibSearch(dashboardQuery, guess, 0, "", 3, true);
  if (fast.length > 0 && alive()) { finish(fast, "LRCLIB", guess, true); console.log(`[LYRICS] ⚡ FAST PATH hit`); return; }
  if (!alive()) return;

  const [ytRes, meta] = await Promise.all([fetchYouTubeTranscript(videoId, guess), fetchVideoMeta(videoId)]);
  if (!alive()) return;
  const ytLines = ytRes.lines;
  const captionLangs = ytRes.langs || [];
  // ✅ v8.71: caption languages sebagai prior bila guess masih "?"
  if (guess === "?" && captionLangs.length > 0) {
    if (captionLangs.some((c) => c.startsWith("ms") || c.startsWith("id"))) { guess = "ms"; console.log(`[LYRICS] 🌐 Caption prior: ms`); }
    else if (captionLangs.every((c) => c.startsWith("en"))) { guess = "en"; console.log(`[LYRICS] 🌐 Caption prior: en`); }
  }
  const rawTitle = meta?.title || dashboardQuery || videoId;
  const channel = meta?.channel || "";
  const videoDuration = meta?.duration || 0;
  const { artist, title } = parseArtistTitle(rawTitle, channel);
  if (current) current.title = artist ? `${artist} - ${title}` : title;
  // ✅ v8.69: album/compilation detection
  if (/\b(full album|album penuh|compilation|koleksi|playlist|lagu-lagu|best of|greatest hits|nonstop|non-stop|medley)\b/i.test(rawTitle + " " + dashboardQuery)) {
    finish([], "ALBUM", guess, false);
    console.log(`[LYRICS] 💿 Album/compilation dikesan ("${rawTitle.slice(0, 50)}") - request lagu single untuk lirik`);
    return;
  }
  if (guess === "?") guess = textLang(title + " " + artist);
  if (current) current.lang = guess;

  if (ytLines && ytLines.length > 0) {
    const filtered = guess !== "?" ? filterLinesByLang(ytLines, guess) : ytLines;
    if (!isInsufficientLyrics(filtered)) { finish(filtered, "YT-TRANSCRIPT", guess, true); return; }
  }

  if (artist && title && videoDuration > 0) {
    const got = await lrclibGetExact(title, artist, videoDuration, guess);
    if (got && got.length > 0 && alive()) { finish(got, "LRCLIB", guess, true); return; }
  }
  if (!alive()) return;

  const queries: string[] = [];
  if (artist && title) { queries.push(`${artist} ${title}`); queries.push(`${title} ${artist}`); queries.push(title); }
  else queries.push(title);
  for (const q of queries) {
    if (!alive()) return;
    const got = await lrclibSearch(q, guess, videoDuration, artist, 2);
    if (got.length > 0) { finish(got, "LRCLIB", guess, true); return; }
  }
  if (!alive()) return;

  const [lyristPlain, ovhPlain, whisperLines] = await Promise.all([
    fetchLyrist(artist, title, guess),
    fetchLyricsOvh(artist, title, guess),
    transcribeWhisper(videoId, guess),
  ]);
  if (!alive()) return;
  const plainText = lyristPlain || ovhPlain;

  if (whisperLines.length > 0) {
    let finalLines = whisperLines;
    if (plainText) {
      const plainLines = plainText.split("\n").map((s) => cleanLine(s)).filter((s) => s.length > 0);
      const { lines: fixed, replaced } = alignText(whisperLines, plainLines);
      if (replaced > 0) { console.log(`[LYRICS] 🔧 Text-replacement: ${replaced} baris dibetulkan`); finalLines = ensureWords(fixed); }
    }
    finish(finalLines, "WHISPER", guess, true);
    return;
  }

  if (plainText) {
    const plainLines = plainText.split("\n").map((s) => cleanLine(s)).filter((s) => s.length > 0);
    if (plainLines.length >= 5) {
      const perLine = Math.max(3000, (videoDuration * 1000) / plainLines.length);
      finish(ensureWords(plainLines.map((text, i) => ({ a: i * perLine, b: (i + 1) * perLine, text, words: [] }))), "LYRIST", guess, true);
      return;
    }
  }

  finish([], "", guess, false);
  console.log(`[LYRICS] ❌ Tiada lirik untuk ${videoId}`);
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
    current = { title: String(d.q || ""), videoId, t0: Date.now(), pausedAt: 0, lines: [], hasLyrics: false, loading: true, offsetMs: 0, leadIn: 0, source: "", lang: "", lastTickAt: 0 };
    void loadLyrics(videoId, String(d.q || ""));
  }
  if (d.state === "PAUSED" && current && !current.pausedAt) current.pausedAt = Date.now();
  if (d.state === "RESUMED" && current && current.pausedAt) { current.t0 += Date.now() - current.pausedAt; current.pausedAt = 0; }
  if (d.state === "STOPPED" || d.state === "SKIPPED" || d.state === "FAILED") current = null;
});
socket.on("music:started", (d: any) => {
  if (!current) return;
  const now = Date.now();
  const elapsedNow = now - current.t0;
  if (elapsedNow >= 0 && elapsedNow < 2500) { current.t0 = now; current.pausedAt = 0; current.frontendElapsed = undefined; current.lastTickAt = 0; }
});
// ✅ v8.73: tick validation - reject elapsed yang kelajuan tak masuk akal
socket.on("music:tick", (d: any) => {
  if (current && typeof d?.elapsed === "number") {
    const now = Date.now();
    if (current.lastTickAt && current.frontendElapsed !== undefined) {
      const dWall = now - current.lastTickAt;
      const dEl = d.elapsed - current.frontendElapsed;
      if (dWall > 400 && dEl >= 0 && (dEl / dWall > 2 || dEl / dWall < 0.5)) {
        console.log(`[LYRICS] 🛡️ Tick reject: ratio ${(dEl / dWall).toFixed(2)}x (elapsed lari dari masa sebenar)`);
        return;
      }
    }
    current.frontendElapsed = d.elapsed;
    current.lastTickAt = now;
  }
});
socket.on("music:leadin", (d: any) => {
  if (!current || !d || current.videoId !== d.videoId) return;
  current.leadIn = Math.max(0, Math.min(15000, Number(d.ms) || 0));
  console.log(`[LYRICS] ⏱️ Lead-in diterima: ${current.leadIn}ms`);
  if (current.lines.length > 0) saveLyricsCache(current.videoId, { lines: current.lines, offsetMs: current.offsetMs, leadIn: current.leadIn, source: current.source, lang: current.lang });
});
socket.on("lyrics:offset", (d: any) => {
  if (!current) return;
  const delta = Number(d && d.delta) || 0;
  current.offsetMs = (current.offsetMs || 0) + delta;
  console.log(`[LYRICS] ⚙️ Offset: ${current.offsetMs > 0 ? "+" : ""}${current.offsetMs}ms`);
  if (current.lines.length > 0) saveLyricsCache(current.videoId, { lines: current.lines, offsetMs: current.offsetMs, leadIn: current.leadIn, source: current.source, lang: current.lang });
});

function computePayload(): any {
  if (!current) return { v: SERVER_VERSION, playing: false, title: "", elapsed: 0, hasLyrics: false, loading: false, prev: null, line: null, next: null, sync: false, offsetMs: 0, leadIn: 0, source: "", lang: "" };
  const now = Date.now();
  const tickFresh = current.lastTickAt && (now - current.lastTickAt) < 3000;
  // ✅ v8.73: cross-check tick vs jam server - kalau beza >20s, guna jam server (speed sentiasa 1x)
  const wall = current.pausedAt ? (current.pausedAt - current.t0) : now - current.t0;
  let elapsed: number;
  if (tickFresh && current.frontendElapsed !== undefined && Math.abs(current.frontendElapsed - wall) < 20000) elapsed = current.frontendElapsed;
  else elapsed = wall;
  const lead = current.source === "LRCLIB" ? (current.leadIn || 0) : 0;
  elapsed = Math.max(0, elapsed - LYRICS_OFFSET_MS - (current.offsetMs || 0) - lead);
  let prev: Line | null = null;
  let line: Line | null = null;
  let next: Line | null = null;
  if (current.hasLyrics) {
    const idx = current.lines.findIndex((l) => elapsed >= l.a && elapsed < l.b);
    if (idx >= 0) { line = current.lines[idx]; prev = current.lines[idx - 1] || null; next = current.lines[idx + 1] || null; }
  }
  return { v: SERVER_VERSION, playing: true, title: current.title, elapsed, hasLyrics: current.hasLyrics, loading: current.loading, prev, line, next, sync: tickFresh, offsetMs: current.offsetMs || 0, leadIn: lead, source: current.source || "", lang: current.lang || "" };
}

const OVERLAY_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>BATIA Lyrics</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;font-family:system-ui,sans-serif}
  #lyrBox{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:88%;text-align:center;pointer-events:none;opacity:0;transition:opacity .6s}
  #lyrBox.on{opacity:1}
  #title{display:none;max-width:86%;margin:0 auto 26px;color:#fff;background:rgba(0,0,0,.75);border:3px solid #22d3ee;border-radius:28px;padding:14px 34px;font-size:clamp(22px,3.2vw,36px);font-weight:900;letter-spacing:1px;line-height:1.25;text-align:center;word-break:break-word;text-shadow:0 3px 6px #000,0 0 18px rgba(34,211,238,.5)}
  #prev{color:rgba(255,255,255,.35);font-size:22px;font-weight:600;text-shadow:0 1px 5px #000;min-height:30px;margin-bottom:16px}
  #line{font-size:54px;font-weight:900;line-height:1.2;min-height:66px;text-shadow:0 3px 12px #000}
  #line.on{animation:lyrIn .4s ease forwards}
  #line.out{animation:lyrOut .5s ease forwards}
  .w{display:inline-block;color:rgba(255,255,255,.35);transition:color .12s,text-shadow .12s,transform .12s;margin:0 .22em}
  .w.done{color:#e0f2fe;text-shadow:0 0 12px rgba(34,211,238,.75)}
  .w.now{color:#fbbf24;text-shadow:0 0 26px rgba(251,146,60,.95),0 0 10px rgba(255,255,255,.6);transform:scale(1.06)}
  #next{color:rgba(255,255,255,.5);font-size:24px;font-weight:600;text-shadow:0 1px 6px #000;min-height:32px;margin-top:18px}
  #hint{color:#fff;background:rgba(0,0,0,.65);border:2px solid #22d3ee;border-radius:999px;padding:10px 26px;font-size:18px;font-weight:700;margin:8px auto 0;width:fit-content;max-width:86%;display:none;text-shadow:0 1px 4px #000}
  #load{position:fixed;left:50%;top:70%;transform:translateX(-50%);color:#22d3ee;font-size:17px;font-weight:700;display:none;text-shadow:0 1px 4px #000;z-index:100}
  #ver{position:fixed;bottom:8px;left:10px;color:rgba(255,255,255,.7);background:rgba(0,0,0,.45);padding:2px 8px;border-radius:6px;font-size:11px;z-index:100}
  #anti{position:fixed;top:12px;left:50%;transform:translateX(-50%);color:#fff;background:#b91c1c;border:2px solid #fff;border-radius:999px;padding:10px 26px;font-size:16px;font-weight:800;display:none;z-index:200;pointer-events:none;animation:blink 1s infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.45}}
  @keyframes lyrIn{0%{opacity:0;transform:translateY(18px) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes lyrOut{0%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}
</style></head>
<body>
<div id="ver">v@@V@@</div>
<div id="anti">⚠️ KLIK SEKALI UNTUK AKTIFKAN ANTI-THROTTLE</div>
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
  const PAGE_VERSION = "@@V@@";
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
  const elAnti = document.getElementById("anti");
  let lastText = "";
  let wordSpans = [];
  let fadeTimer = null;

  // ✅ v8.72: anti-throttle robust - AudioContext perlu gesture untuk resume
  let keepCtx = null;
  function startKeepAlive() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!keepCtx) {
        keepCtx = new AC();
        const osc = keepCtx.createOscillator();
        const gain = keepCtx.createGain();
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(keepCtx.destination);
        osc.start();
      }
      if (keepCtx.state === "suspended") keepCtx.resume().catch(() => {});
      return keepCtx.state === "running";
    } catch (e) { return false; }
  }
  function updateAnti() {
    const ok = startKeepAlive();
    if (elAnti) elAnti.style.display = ok ? "none" : "block";
    return ok;
  }
  updateAnti();
  setInterval(updateAnti, 5000);
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { startKeepAlive(); updateAnti(); }));

  try {
    if (navigator.wakeLock && !window._wakeLock) {
      navigator.wakeLock.request("screen").then(wl => { window._wakeLock = wl; }).catch(() => {});
    }
  } catch (e) {}

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

  let lastPayload = null;
  function renderPayload(d) {
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
    elTitle.textContent = "🎵 " + (d.title.length > 70 ? d.title.slice(0, 70) + "…" : d.title);
    elBox.classList.add("on");
    elLoad.style.display = d.loading ? "block" : "none";
    if (!d.hasLyrics) {
      elLine.innerHTML = ""; elLine.className = "";
      elPrev.textContent = ""; elNext.textContent = "";
      elHint.textContent = d.source === "ALBUM" ? "💿 album mode - request lagu single untuk lirik" : "♪ instrumental ♪";
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
  }

  const s = io();
  s.on("lyrics:update", (d) => { lastPayload = d; renderPayload(d); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateAnti();
      if (lastPayload) renderPayload(lastPayload);
    }
  });
  s.on("connect", () => { if (lastPayload) renderPayload(lastPayload); });
</script>
</body></html>`;

async function runLinkTest(): Promise<any> {
  const results: any = { version: SERVER_VERSION, lrclib: "?", lyrist: "?", lyricsOvh: "?", youtube: "?", groqKey: !!process.env.GROQ_API_KEY };
  try {
    const r1 = await fetchWithRetry(EP_LRCLIB_SEARCH + "?q=kejora", { headers: { "User-Agent": UA_APP } }, "test-lrclib", 8000, 2);
    results.lrclib = r1.ok ? "OK" : "HTTP " + r1.status;
  } catch (e: any) { results.lrclib = "FAIL: " + (e.message || e); }
  try {
    const r2 = await fetchWithRetry(EP_LYRIST + "/kejora/search", { headers: { "User-Agent": UA_BROWSER, "Accept": "application/json" } }, "test-lyrist", 8000, 2);
    results.lyrist = r2.ok ? "OK" : "HTTP " + r2.status;
  } catch (e: any) { results.lyrist = "FAIL: " + (e.message || e); }
  try {
    const r4 = await fetchWithRetry(EP_OVH + "/Search/Kejora", { headers: { "User-Agent": UA_BROWSER } }, "test-ovh", 8000, 2);
    results.lyricsOvh = r4.ok ? "OK" : "HTTP " + r4.status;
  } catch (e: any) { results.lyricsOvh = "FAIL: " + (e.message || e); }
  try {
    const r3 = await fetch("https://www.youtube.com", { signal: AbortSignal.timeout(8000) });
    results.youtube = r3.ok ? "OK" : "HTTP " + r3.status;
  } catch (e: any) { results.youtube = "FAIL: " + (e.message || e); }
  return results;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/offset")) {
    const u = new URL(url, "http://x");
    const delta = parseInt(u.searchParams.get("delta") || "0", 10);
    if (current && delta) {
      current.offsetMs = (current.offsetMs || 0) + delta;
      if (current.lines.length > 0) saveLyricsCache(current.videoId, { lines: current.lines, offsetMs: current.offsetMs, leadIn: current.leadIn, source: current.source, lang: current.lang });
      console.log(`[LYRICS] ⚙️ Offset via URL: ${current.offsetMs > 0 ? "+" : ""}${current.offsetMs}ms`);
    }
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("offset=" + (current ? current.offsetMs : 0) + "ms");
    return;
  }
  if (url.startsWith("/test")) {
    const results = await runLinkTest();
    console.log("[LYRICS] 🧪 Link test:", JSON.stringify(results));
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(results, null, 2));
    return;
  }
  if (url.startsWith("/now")) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(JSON.stringify(computePayload()));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(OVERLAY_HTML.split("@@V@@").join(SERVER_VERSION));
});

const ioLyrics = new SocketServer(server, { cors: { origin: "*" } });
ioLyrics.on("connection", (cli) => { cli.emit("lyrics:update", computePayload()); });
setInterval(() => { ioLyrics.emit("lyrics:update", computePayload()); }, 400);
server.listen(LYRICS_PORT, () => console.log(`[LYRICS] 🌐 Overlay lirik: http://localhost:${LYRICS_PORT}  (green: ?bg=green)`));