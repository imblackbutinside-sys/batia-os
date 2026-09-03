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
  [/[-.]/g, " "],
  [/@/g, ""],
  [/\s+/g, " "],
];

const USERNAME_PRONUNCIATION: Array<[RegExp, string]> = [
  [/\babam\b/gi, "Abang"],
  [/\btest\b/gi, "Tes"],
  [/\bjoin\b/gi, "Join"],
  [/\buser\b/gi, "Yuser"],
  [/\bplayer\b/gi, "Pleyer"],
  [/\bgamer\b/gi, "Geymer"],
  [/\bbro\b/gi, "Bro"],
  [/\bsis\b/gi, "Sis"],
  [/\bking\b/gi, "King"],
  [/\bqueen\b/gi, "Kuin"],
  [/\bboss\b/gi, "Bos"],
  [/\bboy\b/gi, "Boi"],
  [/\bgirl\b/gi, "Gel"],
  [/\bstar\b/gi, "Star"],
  [/\blion\b/gi, "Laion"],
  [/\btiger\b/gi, "Taiger"],
  [/\bbear\b/gi, "Ber"],
  [/\bdragon\b/gi, "Dregen"],
];

// ✅ Fonetik Melayu untuk perkataan EN - suara Yasmin/Osman sebut betul
const PRONUNCIATION_FIX: Array<[RegExp, string]> = [
  [/\bMalaysia\b/gi, "Malaysia"],
  [/\bTikTok\b/gi, "Tik Tok"],
  [/\blive\b/gi, "Laiv"],
  [/\blives\b/gi, "Laivs"],
  [/\bfollow\b/gi, "Folo"],
  [/\bfollows\b/gi, "Folos"],
  [/\bbattery\b/gi, "Betri"],
  [/\bshare\b/gi, "Syer"],
  [/\bsharer\b/gi, "Syerer"],
  [/\blink\b/gi, "Lingk"],
  [/\bchill\b/gi, "Cil"],
  [/\bchilling\b/gi, "Ciling"],
  [/\blike\b/gi, "Laik"],
  [/\blikes\b/gi, "Laiks"],
  [/\bscreen\b/gi, "Skrin"],
  [/\bvibes?\b/gi, "Vaibs"],
  [/\bhangout\b/gi, "Hengaut"],
  [/\bsales\b/gi, "Seil"],
  [/\bsale\b/gi, "Seil"],
  [/\bcheckout\b/gi, "Cekaut"],
  [/\bdiscount\b/gi, "Diskaun"],
  [/\bcod\b/gi, "Si Ou Di"],
  [/\bdm\b/gi, "Di Em"],
  [/\bbio\b/gi, "Baio"],
  [/\bstream\b/gi, "Strim"],
  [/\bstreaming\b/gi, "Striming"],
  [/\btap\b/gi, "Tep"],
  [/\btaps\b/gi, "Teps"],
  [/\bbest\b/gi, "Bes"],
  [/\bcool\b/gi, "Kul"],
  [/\bqueue\b/gi, "Kiu"],
  [/\bqueues\b/gi, "Kius"],
  [/\bgift\b/gi, "Gift"],
  [/\bgifts\b/gi, "Gifts"],
  [/\bsupport\b/gi, "Suport"],
  [/\bthanks\b/gi, "Tenks"],
  [/\bthank\b/gi, "Tenk"],
  [/\bawesome\b/gi, "Awesom"],
  [/\bgreat\b/gi, "Gret"],
  [/\bnice\b/gi, "Nais"],
  [/\bhello\b/gi, "Helo"],
  [/\bwelcome\b/gi, "Welkam"],
  [/\bmember\b/gi, "Member"],
  [/\bmembers\b/gi, "Members"],
  [/\bfriend\b/gi, "Fren"],
  [/\bfriends\b/gi, "Frens"],
  [/\btoday\b/gi, "Tudei"],
  [/\btonight\b/gi, "Tunait"],
  [/\btomorrow\b/gi, "Tumoro"],
  [/\bmorning\b/gi, "Moning"],
  [/\bnight\b/gi, "Nait"],
  [/\bgood\b/gi, "Gud"],
  [/\bgreat\b/gi, "Gret"],
  [/\bprice\b/gi, "Prais"],
  [/\border\b/gi, "Order"],
  [/\bpromo\b/gi, "Promo"],
  [/\bcode\b/gi, "Kod"],
  [/\bcodes\b/gi, "Kods"],
  [/\bvideo\b/gi, "Video"],
  [/\bvideos\b/gi, "Videos"],
  [/\bmusic\b/gi, "Musik"],
  [/\bsong\b/gi, "Song"],
  [/\bsongs\b/gi, "Songs"],
  [/\bplease\b/gi, "Plis"],
  [/\bsorry\b/gi, "Sori"],
  [/\bsure\b/gi, "Syur"],
  [/\bcheck\b/gi, "Cek"],
  [/\bclick\b/gi, "Klik"],
  [/\bclicks\b/gi, "Kliks"],
  [/\btrend\b/gi, "Tren"],
  [/\btrending\b/gi, "Trending"],
  [/\bviral\b/gi, "Vairal"],
  [/\bshare\b/gi, "Syer"],
  [/\bfamous\b/gi, "Feimos"],
  [/\bpopular\b/gi, "Popiular"],
  [/\bview\b/gi, "Viu"],
  [/\bviews\b/gi, "Vius"],
  [/\bfollower\b/gi, "Foloer"],
  [/\bfollowers\b/gi, "Foloers"],
];

function casualize(text: string): string {
  let out = text;
  for (const [re, rep] of USERNAME_FIX) out = out.replace(re, rep);
  for (const [re, rep] of CASUAL_MAP) out = out.replace(re, rep);
  for (const [re, rep] of PRONUNCIATION_FIX) out = out.replace(re, rep);
  for (const [re, rep] of USERNAME_PRONUNCIATION) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

function detectLang(text: string): "MS" | "EN" {
  const normalized = text.replace(/_/g, " ");
  const hasGreeting = /(^|\s)(salam|hai|hye|hey|assalam|waalaikum|selamat|jumpa|welkam|welcome)/i.test(normalized);      
  const ms = (normalized.match(/\b(tak|takde|nak|je|jom|korang|apa|macam|mana|kenapa|dah|ni|tu|kat|kita|saya|awak|aku|kamu|boleh|khabar|assalamualaikum|waalaikumussalam|santai|borak|cerita|harga|stok|beli|cantik|bang|kak|abang|malam|hari|esok|best|syok|memang|betul|kan|dengan|untuk|yang|dan|sila|maaf|lah|wei|woi|geng|member|lepak|salam|hai|hye|jumpa|lagi|terima kasih|tq|ok|oke|okay|eh|ehh|selamat|welkam|welcome|ya|yeah|yup|haah|haha|weh|bro|sis|bang|kak|encik|cik|abam|adik)\b/gi) || []).length;
  const words = Math.max(1, normalized.trim().split(/\s+/).length);
  if (hasGreeting) return "MS";
  return (ms / words >= 0.2 || ms >= 1) ? "MS" : "EN";
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

  async speak(text: string): Promise<string | null> {
    const voice = this.voice;
    const spoken = casualize(text);
    console.log("[TTS] voice=" + voice + ":", spoken.slice(0, 100));

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