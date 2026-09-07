import { TikTokLiveConnection } from "tiktok-live-connector";

export interface TikTokHandlers {
  onComment: (username: string, text: string) => void;
  onGift: (username: string, giftName: string, giftValue: number) => void;
  onLike: (count: number) => void;
  onViewer: (count: number) => void;
  onStatus: (status: string) => void;
  onJoin: (username: string) => void;
}

// ✅ Cari teks chat dalam nested object (fallback untuk format game streaming)
function extractText(obj: any, depth = 0): string {
  if (!obj || typeof obj !== "object" || depth > 3) return "";
  for (const k of ["comment", "text", "message", "content", "describe"]) {
    if (typeof obj[k] === "string" && obj[k]) return obj[k];
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const t = extractText(v, depth + 1);
      if (t) return t;
    }
  }
  return "";
}

export class TikTokAdapter {
  public connected = false;
  private connection: any = null;
  private handlers: TikTokHandlers | null = null;
  private username = "";
  private retryTimer: NodeJS.Timeout | null = null;
  private hbTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private manualStop = false;
  private connecting = false;
  private chatCount = 0;
  private likeCount = 0;

  async connect(username: string, handlers: TikTokHandlers) {
    if (this.connected) {
      console.log("[TikTok] Already connected");
      return;
    }
    this.username = username;
    this.handlers = handlers;
    this.manualStop = false;
    this.attempts = 0;
    await this.attempt();
  }

  private async attempt() {
    if (this.connected || this.manualStop || this.connecting) return;
    this.connecting = true;
    this.attempts++;

    // ✅ Bersihkan connection lama sebelum buat baru
    try { this.connection?.disconnect?.(); } catch (e) {}
    this.connection = null;

    console.log(`[TikTok] Connecting to: ${this.username} (attempt ${this.attempts})`);
    try {
      const conn = new TikTokLiveConnection(this.username, {});
      this.connection = conn;
      this.registerEvents(conn);
      await conn.connect();
      if (this.manualStop) { this.connecting = false; return; }
      this.connected = true;
      this.connecting = false;
      this.attempts = 0;
      this.chatCount = 0;
      this.likeCount = 0;
      this.startHeartbeat();
      console.log("[TikTok] ✅ connected, roomId:", conn.roomId);
      this.handlers?.onStatus("CONNECTED");
    } catch (e: any) {
      this.connecting = false;
      this.connected = false;
      console.error("[TikTok] connect failed:", (e && e.message ? e.message : String(e)).split("\n")[0]);
      this.handlers?.onStatus("CONNECTING...");
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.manualStop) return;
    if (this.attempts >= 30) {
      console.log("[TikTok] max retries reached -> DISCONNECTED");
      this.handlers?.onStatus("DISCONNECTED");
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    console.log("[TikTok] ⏳ retry dalam 10s...");
    this.retryTimer = setTimeout(() => void this.attempt(), 10000);
  }

  private startHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      console.log(`[TIKTOK HB] connected=${this.connected} | chat=${this.chatCount} | like=${this.likeCount}`);
    }, 30000);
  }

  private registerEvents(c: any) {
    // ✅ CHAT: extractor + debug + skip komen lama
    c.on("chat", (data: any) => {
      this.chatCount++;
      const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
      const text = data?.comment || data?.text || data?.message || data?.content || extractText(data);

      if (!text) {
        console.log(`[TIKTOK CHAT DEBUG] ${username} - EMPTY TEXT`);
        console.log(`  keys:`, Object.keys(data || {}).join(","));
        console.log(`  sample:`, JSON.stringify(data).slice(0, 400));
        return;
      }

      // ✅ SKIP KOMEN LAMA (>15s): elak baca backlog masa connect/reboot
      const ct = data?.common?.createTime;
      if (typeof ct === "number" && ct > 0) {
        const ctMs = ct > 1e12 ? ct : ct * 1000;
        const age = Date.now() - ctMs;
        if (age > 15000) {
          console.log(`[TIKTOK CHAT] ⏭️ skip komen lama (${Math.round(age / 1000)}s): ${username}`);
          return;
        }
      }

      console.log(`[TIKTOK CHAT] ${username}: ${text}`);
      this.handlers?.onComment(username, text);
    });

    // Emote/sticker - log saja, jangan proses sebagai komen
    c.on("emote", (data: any) => {
      console.log(`[TIKTOK EMOTE] ${data?.user?.uniqueId || "viewer"} (sticker - ignored)`);
    });

    c.on("gift", (data: any) => {
      const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
      const giftName = data?.giftName || data?.gift?.name || "gift";
      const value = data?.diamondCount || data?.gift?.diamondCount || 0;
      console.log(`[TIKTOK GIFT] ${username}: ${giftName} (${value})`);
      this.handlers?.onGift(username, giftName, value);
    });

    c.on("like", (data: any) => {
      this.likeCount += data?.likeCount || 1;
      this.handlers?.onLike(data?.likeCount || 1);
    });

    c.on("roomUser", (data: any) => {
      this.handlers?.onViewer(parseInt(data?.viewerCount || "0", 10) || 0);
    });

    c.on("join", (data: any) => {
      const username = data?.user?.uniqueId || data?.user?.nickname || "";
      if (username) {
        console.log(`[TIKTOK JOIN] ${username}`);
        this.handlers?.onJoin(username);
      }
    });

    c.on("liveEnded", () => {
      console.log("[TikTok] live ended");
      this.connected = false;
      this.manualStop = true;
      if (this.hbTimer) clearInterval(this.hbTimer);
      this.handlers?.onStatus("STREAM_ENDED");
    });

    c.on("disconnected", () => {
      console.log("[TikTok] disconnected - auto-reconnect");
      this.connected = false;
      if (this.hbTimer) clearInterval(this.hbTimer);
      this.handlers?.onStatus("DISCONNECTED");
      this.scheduleRetry();
    });
  }

  disconnect() {
    this.manualStop = true;
    this.connecting = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.hbTimer) clearInterval(this.hbTimer);
    try { this.connection?.disconnect?.(); } catch (e) {}
    this.connection = null;
    this.connected = false;
    console.log("[TikTok] disconnected (manual)");
  }
}

export default TikTokAdapter;