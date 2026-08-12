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
  [/\bje\b/gi, "jeh"],
];

function casualize(text: string): string {
  let out = text;
  for (const [re, rep] of CASUAL_MAP) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

export class TtsEngine {
  private tts: any = null;
  private voice: string;
  private dir: string;

  constructor() {
    this.voice = process.env.EDGE_TTS_VOICE || "ms-MY-YasminNeural";
    this.dir = path.join(process.cwd(), "audio");
    fs.mkdirSync(this.dir, { recursive: true });
    this.init();
  }

  private async init() {
    try {
      const mod: any = await import("node-edge-tts");
      const EdgeTTS = mod.EdgeTTS || (mod.default && mod.default.EdgeTTS) || mod.default;
      this.tts = new EdgeTTS({ voice: this.voice, timeout: 15000 });
      console.log("[TTS] ready:", this.voice);
    } catch (e) {
      console.error("[TTS] disabled - text mode only:", e);
    }
  }

  async setVoice(voice: string) {
    this.voice = voice;
    await this.init();
  }

  async speak(text: string): Promise<string | null> {
    if (!this.tts) return null;
    try {
      const casual = casualize(text);
      console.log("[TTS] casual:", casual);
      const clean = casual.replace(/[^\p{L}\p{N}\s.,!?'-]/gu, "");
      const id = "a" + Date.now();
      const file = path.join(this.dir, id + ".mp3");
      await this.tts.ttsPromise(clean, file);
      return "http://localhost:4000/audio/" + id + ".mp3";
    } catch (e) {
      console.error("[TTS] speak error:", e);
      return null;
    }
  }
}

