import { TikTokLiveConnection } from "tiktok-live-connector";

export interface TikTokHandlers {
  onComment: (username: string, text: string) => void;
  onGift: (username: string, giftName: string, giftValue: number) => void;
  onLike: (count: number) => void;
  onViewer: (count: number) => void;
  onStatus: (status: string) => void;
  onJoin: (username: string) => void;
}

export class TikTokAdapter {
  public connected = false;
  private connection: TikTokLiveConnection | null = null;
  private handlers: TikTokHandlers | null = null;
  private username = "";
  private retryTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private manualStop = false;

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
    if (this.connected || this.manualStop) return;
    this.attempts++;
    console.log(`[TikTok] Connecting to: ${this.username} (attempt ${this.attempts})`);
    try {
      this.connection = new TikTokLiveConnection(this.username, {});
      this.registerEvents();
      await this.connection.connect();
      this.connected = true;
      this.attempts = 0;
      console.log("[TikTok] ✅ connected, roomId:", (this.connection as any).roomId);
      this.handlers?.onStatus("CONNECTED");
    } catch (e: any) {
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

  private registerEvents() {
    const c = this.connection;
    if (!c) return;

    c.on("chat", (data: any) => {
      const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
      const text = data?.comment || data?.text || "";
      if (!text) return;
      console.log(`[TIKTOK CHAT] ${username}: ${text}`);
      this.handlers?.onComment(username, text);
    });

    c.on("gift", (data: any) => {
      const username = data?.user?.uniqueId || data?.user?.nickname || "viewer";
      const giftName = data?.giftName || data?.gift?.name || "gift";
      const value = data?.diamondCount || data?.gift?.diamondCount || 0;
      console.log(`[TIKTOK GIFT] ${username}: ${giftName} (${value})`);
      this.handlers?.onGift(username, giftName, value);
    });

    c.on("like", (data: any) => {
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
      this.handlers?.onStatus("STREAM_ENDED");
    });

    c.on("disconnected", () => {
      console.log("[TikTok] disconnected - auto-reconnect");
      this.connected = false;
      this.handlers?.onStatus("DISCONNECTED");
      this.scheduleRetry();
    });
  }

  disconnect() {
    this.manualStop = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { (this.connection as any)?.disconnect?.(); } catch (e) {}
    this.connection = null;
    this.connected = false;
    console.log("[TikTok] disconnected (manual)");
  }
}

export default TikTokAdapter;