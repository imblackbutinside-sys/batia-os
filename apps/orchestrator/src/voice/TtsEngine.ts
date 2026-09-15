import path from "path";
import fs from "fs";

const FANCY_RANGES: Array<[number, number, number]> = [
  [0x1D400, 0x1D419, 65], [0x1D41A, 0x1D433, 97],
  [0x1D434, 0x1D44D, 65], [0x1D44E, 0x1D467, 97],
  [0x1D468, 0x1D481, 65], [0x1D482, 0x1D49B, 97],
  [0x1D49C, 0x1D4B5, 65], [0x1D4B6, 0x1D4CF, 97],
  [0x1D4D0, 0x1D4E9, 65], [0x1D4EA, 0x1D503, 97],
  [0x1D504, 0x1D51D, 65], [0x1D51E, 0x1D537, 97],
  [0x1D538, 0x1D551, 65], [0x1D552, 0x1D56B, 97],
  [0x1D56C, 0x1D585, 65], [0x1D586, 0x1D59F, 97],
  [0x1D5A0, 0x1D5B9, 65], [0x1D5BA, 0x1D5D3, 97],
  [0x1D5D4, 0x1D5ED, 65], [0x1D5EE, 0x1D607, 97],
  [0x1D608, 0x1D621, 65], [0x1D622, 0x1D63B, 97],
  [0x1D63C, 0x1D655, 65], [0x1D656, 0x1D66F, 97],
  [0x1D670, 0x1D689, 65], [0x1D68A, 0x1D6A3, 97],
  [0x1D7CE, 0x1D7D7, 48], [0x1D7D8, 0x1D7E1, 48],
  [0x1D7E2, 0x1D7EB, 48], [0x1D7EC, 0x1D7F5, 48],
  [0x1D7F6, 0x1D7FF, 48],
];

function normalizeFancyUnicode(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    let mapped = false;
    for (const [start, end, base] of FANCY_RANGES) {
      if (cp >= start && cp <= end) {
        out += String.fromCharCode(base + (cp - start));
        mapped = true;
        break;
      }
    }
    if (!mapped) out += ch;
  }
  out = out.replace(/[\uFF21-\uFF3A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 65));
  out = out.replace(/[\uFF41-\uFF5A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF41 + 97));
  out = out.replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48));
  out = out.replace(/[\u24B6-\u24CF]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x24B6 + 65));
  out = out.replace(/[\u24D0-\u24E9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x24D0 + 97));
  return out;
}

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
  [/[-.]/g, " "],
  [/@/g, ""],
  [/\s+/g, " "],
];

const USERNAME_PRONUNCIATION: Array<[RegExp, string]> = [
  [/\babam\b/gi, "Abang"],
  [/\bjoin\b/gi, "join"],
  [/\bplayer\b/gi, "pleyer"],
  [/\bgamer\b/gi, "geymer"],
  [/\bbro\b/gi, "bro"],
  [/\bsis\b/gi, "sis"],
];

const PRONUNCIATION_FIX: Array<[RegExp, string]> = [
  [/\bstay tuned\b/gi, "stei tund"],
  [/\bla\b/gi, "lah"],
  [/\bRose\b/g, "ros"],
  [/\brose\b/g, "ros"],
  [/\bRoses\b/g, "ros"],
  [/\broses\b/g, "ros"],
  [/\bLion\b/g, "laion"],
  [/\blion\b/g, "laion"],
  [/\bGalaxy\b/g, "geleksi"],
  [/\bgalaxy\b/g, "geleksi"],
  [/\bHeart Me\b/gi, "hart mi"],
  [/\bHeart\b/g, "hart"],
  [/\bheart\b/g, "hart"],
  [/\bEncore\b/gi, "enkor"],
  [/\bPunch Card\b/gi, "panch kad"],
  [/\bClap Clap\b/gi, "klep klep"],
  [/\bClap\b/g, "klep"],
  [/\bclap\b/g, "klep"],
  [/\bFlower\b/gi, "flauer"],
  [/\bSunshine\b/gi, "sansyain"],
  [/\bDrama Queen\b/gi, "drama kuin"],
  [/\bTicket\b/gi, "tiket"],
  [/\bMalaysia\b/gi, "Mah-lay-see-ah"],
  [/\bMalaysian\b/gi, "Mah-lay-see-an"],
  [/\bTikTok\b/gi, "Tick Tock"],
  [/\bfollow\b/gi, "folo"],
  [/\bshare\b/gi, "syer"],
  [/\bqueue\b/gi, "kiu"],
  [/\bqueues\b/gi, "kiu"],
  [/\bhost\b/gi, "hos"],
];

function casualizeMs(text: string): string {
  let out = text;
  out = normalizeFancyUnicode(out);
  for (const [re, rep] of USERNAME_FIX) out = out.replace(re, rep);
  for (const [re, rep] of CASUAL_MAP) out = out.replace(re, rep);
  for (const [re, rep] of PRONUNCIATION_FIX) out = out.replace(re, rep);
  for (const [re, rep] of USERNAME_PRONUNCIATION) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

function casualizeEn(text: string): string {
  let out = text;
  out = normalizeFancyUnicode(out);
  for (const [re, rep] of USERNAME_FIX) out = out.replace(re, rep);
  out = out.replace(/\bTikTok\b/gi, "Tik Tok");
  out = out.replace(/\bMalaysia\b/gi, "Malaysia");
  return out.replace(/\s+/g, " ").trim();
}

const MS_RE_TTS = /\b(tak|takde|xde|nak|nk|kat|dah|dh|boleh|ble|berapa|pukul|harga|stok|korang|korg|kita|aku|sy|saya|awak|awk|kau|ko|jom|sebab|kenapa|nape|macam|mcm|betul|cantik|murah|mahal|beli|malam|mlm|esok|tadi|selalu|bila|mana|mane|apa|ape|siapa|sape|assalamualaikum|waalaikumussalam|khabar|santai|borak|kongsi|cerita|sokong|tengok|tgk|jumpa|sayang|syg|weh|wei|woi|bang|abang|kak|kakak|adik|hos|lagu|lg|nyanyi|dengar|dgr|tau|tahu|ajar|nanti|nnti|nti|hati|jiwa|cinta|rindu|dalam|dlm|pak|mak|la|lah|kan|ek|eh|nye|dia|die|orang|org|buat|bagi|bg|minta|tolong|sila|salah|takpe|je|jer|pun|pn|ni|nih|tu|tuh|ini|itu|dan|atau|untuk|utk|dengan|dgn|yang|yg|pada|kalau|kalo|sudah|sdh|akan|akn|sini|situ|sana|habis|banyak|sikit|skt|besar|kecil|comel|lawak|lucu|gila|gile|sangat|sgt|amat|paling|benar|tipu|jujur|serius|srs|gurau|main|pasang|putar|mantap|ngam|syok|kena|kne|hari|ari|member|geng|abam|terima|kasih|memang)\b/i;
const EN_RE_TTS = /\b(the|you|your|you're|are|is|was|were|am|im|i'm|it's|its|this|that|these|those|what|when|where|which|who|why|how|please|thanks|thank|sorry|hello|good|great|nice|cool|love|want|need|can|could|will|would|should|have|has|had|do|does|did|not|don't|cant|can't|won't|yes|maybe|really|very|too|also|and|but|because|if|then|than|about|with|from|for|my|me|mine|our|their|he|she|him|her|them|they|we|us|let|lets|here|there|now|today|tonight|tomorrow|friend|friends|song|music|sing|play|watch|help|know|think|sure|fine|well|better|awesome|amazing|beautiful|wonderful|funny|laugh|laughing|enjoy|miss|wait|come|go|get|make|take|give|send|buy|sell|pay|price|money|coin|coins|gift|gifts|follow|share|stream|live|host)\b/i;
function detectLang(text: string): "MS" | "EN" {
  if (MS_RE_TTS.test(text)) return "MS";
  if (EN_RE_TTS.test(text)) return "EN";
  return "MS";
}

export class TtsEngine {
  private instances: Record<string, any> = {};
  private voice: string;
  private dir: string;

  constructor() {
    this.voice = process.env.EDGE_TTS_VOICE || "ms-MY-YasminNeural";
    this.dir = path.join(process.cwd(), "audio");
    fs.mkdirSync(this.dir, { recursive: true });
    console.log("[TTS] Audio directory:", this.dir);
    this.getInstance(this.voice)
      .then(() => console.log("[TTS] ready:", this.voice))
      .catch((e) => console.error("[TTS] disabled:", e));
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
    try {
      await this.getInstance(voice);
      console.log("[TTS] voice switched to:", voice);
    } catch (e: any) {
      console.error("[TTS] setVoice error:", e.message);
    }
  }

  async speak(text: string, overrideVoice?: string): Promise<string | null> {
    const voice = overrideVoice || this.voice;
    const lang = detectLang(text);
    const spoken = lang === "MS" ? casualizeMs(text) : casualizeEn(text);
    console.log(`[TTS] lang=${lang} voice=${voice}:`, spoken.slice(0, 100));

    const clean = spoken
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g, "")
      .replace(/[\u0600-\u06ff]+/g, "")
      .replace(/[\uac00-\ud7af]+/g, "")
      .replace(/[^\p{L}\p{N}\s.,!?']/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) {
      console.warn("[TTS] ⚠️ Empty clean text, skip");
      return null;
    }

    const id = "a" + Date.now();
    const file = path.join(this.dir, id + ".mp3");

    console.log("[TTS] Generating file:", file);
    console.log("[TTS] Clean text:", clean.slice(0, 120));

    try {
      const tts = await this.getInstance(voice);
      console.log("[TTS] Calling ttsPromise...");
      await tts.ttsPromise(clean, file);

      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log("[TTS] ✅ File created, size:", stats.size, "bytes");
        if (stats.size < 1000) {
          console.warn("[TTS] ⚠️ File size very small, may be empty");
          return null;
        }
        return "http://localhost:4000/audio/" + id + ".mp3";
      } else {
        console.error("[TTS] ❌ File not created by ttsPromise");
        return null;
      }
    } catch (e: any) {
      console.error("[TTS] ❌ speak error:", e.message);
      this.instances[voice] = null;
      return null;
    }
  }
}