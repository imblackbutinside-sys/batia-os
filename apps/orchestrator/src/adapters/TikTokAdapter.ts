import { TikTokLiveConnection } from "tiktok-live-connector";

export class TikTokAdapter {
  private conn: any = null;
  public connected = false;

  async connect(
    username: string,
    handlers: {
      onComment: (username: string, text: string) => void;
      onGift: (username: string, giftName: string, value: number) => void;
      onLike: (count: number) => void;
      onViewer: (count: number) => void;
      onStatus: (status: string) => void;
    }
  ) {
    this.disconnect();
    this.conn = new TikTokLiveConnection(username, { processInitialData: true });

    let lastComment = 0;

    this.conn.on("chat", (data: any) => {
      try {
        const text = data.comment || data.text || data.content || "";
        const uname = data.uniqueId || data.username || (data.user && (data.user.uniqueId || data.user.nickname)) || "viewer";
        if (!text || !String(text).trim()) return;
        const now = Date.now();
        if (now - lastComment < 2000) return;
        lastComment = now;
        console.log("[TikTok] chat:", uname, ":", text);
        handlers.onComment(String(uname), String(text));
      } catch (e) {}
    });

    this.conn.on("like", (data: any) => {
      try {
        handlers.onLike(Number(data.likeCount || 1));
      } catch (e) {}
    });

    this.conn.on("roomUser", (data: any) => {
      try {
        handlers.onViewer(Number(data.viewerCount || data.totalUserCount || data.userCount || 0));
      } catch (e) {}
    });

    this.conn.on("gift", (data: any) => {
      try {
        const name = data.giftName || (data.gift && data.gift.name) || "gift";
        const value = data.diamondCount || (data.gift && data.gift.diamondCount) || 0;
        const uname = data.uniqueId || (data.user && data.user.uniqueId) || "viewer";
        if (data.repeatEnd) handlers.onGift(String(uname), String(name), Number(value));
      } catch (e) {}
    });

    this.conn.on("streamEnd", () => {
      this.connected = false;
      handlers.onStatus("STREAM_END");
    });

    this.conn.on("disconnected", () => {
      this.connected = false;
      handlers.onStatus("DISCONNECTED");
    });

    try {
      const state = await this.conn.connect();
      this.connected = true;
      handlers.onStatus("CONNECTED");
      console.log("[TikTok] connected, roomId:", state && state.roomId);
      return true;
    } catch (e: any) {
      this.connected = false;
      handlers.onStatus("ERROR: " + (e && e.message ? e.message : "unknown"));
      console.error("[TikTok] connect failed:", e);
      return false;
    }
  }

  disconnect() {
    try {
      if (this.conn) this.conn.disconnect();
    } catch (e) {}
    this.conn = null;
    this.connected = false;
  }
}
