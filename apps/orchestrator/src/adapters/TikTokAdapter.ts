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
      onJoin?: (username: string) => void;
    }
  ) {
    this.disconnect();
    this.conn = new TikTokLiveConnection(username, { processInitialData: true });

    let lastComment = 0;

    this.conn.on("chat", (data: any) => { // console.log("[TikTok RAW] Full data:", JSON.stringify(data)); // Debug disabled
      try {
        const text = data.content || data.comment || "";
        const uname = data.user?.uniqueId || data.user?.displayId || data.user?.nickname || data.uniqueId || data.username || "viewer";
        if (!text || !String(text).trim()) return;
        const now = Date.now();
        if (now - lastComment < 500) return; // Kurangkan throttle
        lastComment = now;
        console.log("[TikTok] chat:", uname, ":", text);
        handlers.onComment(String(uname), String(text));
      } catch (e) {
        console.error("[TikTok] chat error:", e);
      }
    });

    this.conn.on("like", (data: any) => {
      try {
        handlers.onLike(Number(data.likeCount || 1));
      } catch (e) {}
    });

    const onRoom = (data: any) => {
      try {
        const c = Number(data.viewerCount || data.totalUserCount || data.userCount || data.memberCount || data.count || 0);
        if (c > 0) handlers.onViewer(c);
      } catch (e) {}
    };
    ["roomUser", "room_user", "member", "liveIntro", "roomMessage", "social"].forEach((ev) => this.conn.on(ev, onRoom));

    this.conn.on("gift", (data: any) => {
      try {
        const name = data.giftName || (data.gift && data.gift.name) || "gift";
        const value = data.diamondCount || (data.gift && data.gift.diamondCount) || 0;
        const uname = data.user?.uniqueId || data.uniqueId || (data.user && data.user.uniqueId) || "viewer";
        if (data.repeatEnd) handlers.onGift(String(uname), String(name), Number(value));
      } catch (e) {}
    });

    this.conn.on("member", (data: any) => {
      try {
        const uname = data?.user?.uniqueId || data?.uniqueId || "";
        if (uname && handlers.onJoin) handlers.onJoin(String(uname));
      } catch (e) {}
    });

    this.conn.on("streamEnd", () => {
      this.connected = false;
      handlers.onStatus("STREAM_END");
    });

    this.conn.on("disconnected", () => { console.log("[TikTok] Terputus! Cuba connect semula dalam 5 saat...");
      this.connected = false;
      handlers.onStatus("DISCONNECTED"); setTimeout(() => this.connect(username, handlers), 5000);
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






