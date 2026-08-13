import path from "path";
import fs from "fs";

const CASUAL_MAP: Array<[RegExp, string]> = [
  [/\btidak ada\b/gi, "takde"],
  [/\btiada\b/gi, "takde"],
  [/\btidak\b/gi, "tak"],
  [/\bsahaja\b/gi, "je"],
  [/\bhendak\b/gi, "nak"],
  [/\bmahu\b/gi, "nak"],
  [/\bseperti\b/gi, "macam"],
  [/\bapakah\b/gi, "apa"],
  [/\bbagaimana\b/gi, "macam mana"],
  [/\bmengapa\b/gi, "kenapa"],
  [/\bkenapakah\b/gi, "kenapa"],
  [/\bpergi\b/gi, "gi"],
  [/\bsudah\b/gi, "dah"],
  [/\bmari\b/gi, "jom"],
  [/\banda\b/gi, "korang"],
  [/\bkerana\b/gi, "sebab"],
  [/\bapabila\b/gi, "bila"],
  [/\bmerupakan\b/gi, "ni"],
  [/\badalah\b/gi, ""],
  [/\bini\b/gi, "ni"],
  [/\bitu\b/gi, "tu"],
];

const USERNAME_FIX: Array<[RegExp, string]> = [
  [/_/g, " "],
];

const PRONUNCIATION_FIX: Array<[RegExp, string]> = [
  [/\bMalaysia\b/gi, "Mah-lay-see-ah"],
  [/\bMalaysian\b/gi, "Mah-lay-see-an"],
  [/\bTikTok\b/gi, "Tick Tock"],
];

function casualize(text: string): string {
  let out = text;
  for (const [re, rep] of USERNAME_FIX) out = out.replace(re, rep);
  for (const [re, rep] of CASUAL_MAP) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

function englishize(text: string): string {
  let out = text;
  for (const [re, rep] of PRONUNCIATION_FIX) out = out.replace(re, rep);
  return out;
}

function detectLang(text: string): "MS" | "EN" {
  const ms = (text.match(/\b(tak|takde|nak|je|jom|korang|apa|macam|mana|kenapa|dah|ni|tu|kat|kita|saya|awak|aku|kamu|boleh|khabar|assalamualaikum|waalaikumussalam|santai|borak|cerita|harga|stok|beli|cantik|bang|kak|abang|malam|hari|esok|best|syok|memang|betul|kan|dengan|untuk|yang|dan|sila|maaf|lah|wei|woi|geng|member|lepak)\b/gi) || []).length;
  const words = Math.max(1, text.trim().split(/\s+/).length);
  return ms / words >= 0.1 ? "MS" : "EN";
}

const EN_VOICE: Record<string, string> = {
  "ms-MY-YasminNeural": "en-US-JennyNeural",
  "ms-MY-OsmanNeural": "en-US-GuyNeural",
};

export class TtsEngine {
  private instances: Record<string, any> = {};
  private voice: string;
  private dir: string;

  constructor() {
    this.voice = process.env.EDGE_TTS_VOICE || "ms-MY-YasminNeural";
    this.dir = path.join(process.cwd(), "audio");
    fs.mkdirSync(this.dir, { recursive: true });
    this.getInstance(this.voice).then(() => console.log("[TTS] ready:", this.voice)).catch((e) => console.error("[TTS] disabled:", e));
  }

  private async getInstance(voice: string): Promise<any> {
    if (!this.instances[voice]) {
      const mod: any = await import("node-edge-tts");
      const EdgeTTS = mod.EdgeTTS || (mod.default && mod.default.EdgeTTS) || mod.default;
      this.instances[voice] = new EdgeTTS({ voice, timeout: 10000 });
    }
    return this.instances[voice];
  }

  async setVoice(voice: string) {
    this.voice = voice;
    try { await this.getInstance(voice); console.log("[TTS] voice switched to:", voice); } catch (e) {}
  }

  async speak(text: string): Promise<string | null> {
    const lang = detectLang(text);
    const voice = lang === "EN" ? (EN_VOICE[this.voice] || "en-US-JennyNeural") : this.voice;
    const spoken = lang === "MS" ? casualize(text) : englishize(text);
    console.log("[TTS] lang=" + lang + " voice=" + voice + ":", spoken.slice(0, 80));
    const clean = spoken.replace(/[^\p{L}\p{N}\s.,!?'-]/gu, "");
    const id = "a" + Date.now();
    const file = path.join(this.dir, id + ".mp3");
    try {
      const tts = await this.getInstance(voice);
      await tts.ttsPromise(clean, file);
      return "http://localhost:4000/audio/" + id + ".mp3";
    } catch (e) {
      console.error("[TTS] speak error:", e);
      this.instances[voice] = null;
      return null;
    }
  }
}
