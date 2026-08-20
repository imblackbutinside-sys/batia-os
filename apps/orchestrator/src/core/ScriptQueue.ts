export interface ScriptItem {
  id: number;
  type: "PITCH" | "RESPONSE";
  text: string;
  status: "QUEUED" | "SPEAKING" | "COMPLETED";
  durationEst: number;
  respondingTo?: string;
}

export interface QueueSnapshot {
  running: boolean;
  paused: boolean;
  state: "IDLE" | "PITCHING" | "RESPONDING" | "PAUSED";
  productName: string;
  pauseMin: number;
  pauseMax: number;
  playbackSpeed: number;
  items: ScriptItem[];
}

function estSeconds(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(5, Math.round(words / 2.2));
}

export class ScriptQueue {
  private items: ScriptItem[] = [];
  private nextId = 1;
  private busy = false;
  running = false;
  paused = false;
  productName = "";
  pauseMin = 3;
  pauseMax = 4;
  playbackSpeed = 1;

  constructor(
    private speak: (text: string) => Promise<unknown>,
    private emit: () => void
  ) {}

  start(productName: string) {
    this.running = true;
    this.paused = false;
    this.productName = productName;
    console.log("[QUEUE] start:", productName);
    this.emit();
    void this.process();
  }

  stop() {
    this.running = false;
    this.paused = false;
    this.busy = false;
    this.items = [];
    console.log("[QUEUE] stop");
    this.emit();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    console.log("[QUEUE] pause");
    this.emit();
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    console.log("[QUEUE] resume");
    this.emit();
    void this.process();
  }

  setSettings(s: { pauseMin?: number; pauseMax?: number; playbackSpeed?: number }) {
    if (typeof s.pauseMin === "number") this.pauseMin = s.pauseMin;
    if (typeof s.pauseMax === "number") this.pauseMax = s.pauseMax;
    if (typeof s.playbackSpeed === "number") this.playbackSpeed = s.playbackSpeed;
    this.emit();
  }

  addPitch(text: string) {
    if (!this.running) return;
    this.items.push({ id: this.nextId++, type: "PITCH", text, status: "QUEUED", durationEst: estSeconds(text) });
    this.trim();
    this.emit();
    void this.process();
  }

  addResponse(text: string, respondingTo: string) {
    if (!this.running) return;
    this.items.push({ id: this.nextId++, type: "RESPONSE", text, status: "QUEUED", durationEst: estSeconds(text), respondingTo });
    this.trim();
    this.emit();
    void this.process();
  }

  private trim() {
    if (this.items.length > 12) {
      this.items = this.items.filter((i) => i.status !== "COMPLETED").slice(-10);
    }
  }

  private currentState(): QueueSnapshot["state"] {
    if (!this.running) return "IDLE";
    if (this.paused) return "PAUSED";
    const speaking = this.items.find((i) => i.status === "SPEAKING");
    if (speaking) return speaking.type === "PITCH" ? "PITCHING" : "RESPONDING";
    return "IDLE";
  }

  snapshot(): QueueSnapshot {
    return {
      running: this.running,
      paused: this.paused,
      state: this.currentState(),
      productName: this.productName,
      pauseMin: this.pauseMin,
      pauseMax: this.pauseMax,
      playbackSpeed: this.playbackSpeed,
      items: this.items.map((i) => ({ ...i })),
    };
  }

  private async process() {
    if (this.busy || !this.running || this.paused) return;
    const item = this.items.find((i) => i.status === "QUEUED");
    if (!item) return;
    this.busy = true;
    item.status = "SPEAKING";
    this.emit();
    try {
      await this.speak(item.text);
    } catch (e) {
      console.error("[QUEUE] speak error:", e);
    }
    await new Promise((r) => setTimeout(r, item.durationEst * 1000));
    const pauseMs = (this.pauseMin + Math.random() * Math.max(0, this.pauseMax - this.pauseMin)) * 1000;
    await new Promise((r) => setTimeout(r, pauseMs));
    item.status = "COMPLETED";
    this.busy = false;
    this.emit();
    void this.process();
  }
}
