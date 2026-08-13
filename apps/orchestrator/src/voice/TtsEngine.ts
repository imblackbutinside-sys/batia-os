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

function casualize(text: string): string {
  let out = text;
  for (const [re, rep] of USERNAME_FIX) out = out.replace(re, rep);
  for (const [re, rep] of CASUAL_MAP) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

const VOICE_CHAIN = [
  { voice: "ms-MY-YasminNeural", label: "Yasmin (MS)" },
  { voice: "ms-MY-OsmanNeural", label: "Osman (MS)" },
  { voice: "id-ID-GadisNeural", label: "Gadis (ID-fallback)" },
  { voice: "en-SG-WayneNeural", label: "Wayne (SG-EN)" },
];

export class TtsEngine {
  private instances: any[] = [];
  private voiceIdx = 0;
  private dir: string;

  constructor() {
    this.dir = path.join(process.cwd(), "audio");
    fs.mkdirSync(this.dir, { recursive: true });
    this.getInstance(0).then(() => console.log("[TTS] ready:", VOICE_CHAIN[0].label)).catch((e) => console.error("[TTS] disabled:", e));
  }

  private async getInstance(i: number): Promise<any> {
    if (!this.instances[i]) {
      const mod: any = await import("node-edge-tts");
      const EdgeTTS = mod.EdgeTTS || (mod.default && mod.default.EdgeTTS) || mod.default;
      this.instances[i] = new EdgeTTS({ voice: VOICE_CHAIN[i].voice, timeout: 8000 });
    }
    return this.instances[i];
  }

  async setVoice(input: string) {
    const low = input.toLowerCase();
    const idx = VOICE_CHAIN.findIndex((v) =>
      low.includes(v.voice.toLowerCase()) ||
      v.voice.toLowerCase().includes(low) ||
      low.includes(v.label.split(" ")[0].toLowerCase())
    );
    if (idx >= 0) {
      this.voiceIdx = idx;
      console.log("[TTS] voice switched to:", VOICE_CHAIN[idx].label);
      try { await this.getInstance(idx); } catch (e) {}
    }
  }

  async speak(text: string): Promise<string | null> {
    const casual = casualize(text);
    console.log("[TTS] casual:", casual);
    const clean = casual.replace(/[^\p{L}\p{N}\s.,!?'-]/gu, "");
    const id = "a" + Date.now();
    const file = path.join(this.dir, id + ".mp3");
    for (let i = 0; i < VOICE_CHAIN.length; i++) {
      const idx = (this.voiceIdx + i) % VOICE_CHAIN.length;
      try {
        const tts = await this.getInstance(idx);
        await tts.ttsPromise(clean, file);
        console.log("[TTS] success with:", VOICE_CHAIN[idx].label);
        return "http://localhost:4000/audio/" + id + ".mp3";
      } catch (e) {
        console.warn("[TTS] fail " + VOICE_CHAIN[idx].label + " -> next");
        this.instances[idx] = null;
      }
    }
    console.error("[TTS] all voices failed");
    return null;
  }
}
