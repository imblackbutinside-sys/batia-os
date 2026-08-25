import { TikTokLiveConnection } from "tiktok-live-connector";

interface TikTokCallbacks {
  onComment: (username: string, text: string) => void;
  onGift: (username: string, giftName: string, giftValue: number) => void;
  onLike: (count: number) => void;
  onViewer: (count: number) => void;
  onStatus: (status: string) => void;
  onJoin: (username: string) => void;
}

export class TikTokAdapter {
  private conn: TikTokLiveConnection | null = null;
  private reconnectEnabled = true;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  public connected = false;
  private currentUsername = "";
  private currentOpts: TikTokCallbacks | null = null;

  async connect(username: string, opts: TikTokCallbacks): Promise<void> {
    try {
      this.currentUsername = username;
      this.currentOpts = opts;
      opts.onStatus("CONNECTING...");
      console.log("[TikTok] Connecting to:", username);
      
      this.conn = new TikTokLiveConnection(username, {
        processInitialData: true,
        processExtendedData: true,
        requestPollingIntervalMs: 2000,
        sessionId: process.env.TIKTOK_SESSION_ID || undefined,
      });

      this.conn.on("roomUser", (data) => {
        opts.onViewer(data.viewerCount || 0);
      });

      this.conn.on("chat", (data) => {
        const uname = data.uniqueId || data.userId || "unknown";
        const text = data.comment || "";
        if (text) opts.onComment(uname, text);
      });

      this.conn.on("gift", (data) => {
        const uname = data.uniqueId || data.userId || "unknown";
        const giftName = data.giftName || "Gift";
        const giftValue = data.diamondCount || 1;
        if (data.giftType === 1 && !data.repeatEnd) return;
        opts.onGift(uname, giftName, giftValue);
      });

      this.conn.on("like", (data) => {
        opts.onLike(data.likeCount || 1);
      });

      this.conn.on("member", (data) => {
        const uname = data.uniqueId || data.userId || "unknown";
        opts.onJoin(uname);
      });

      this.conn.on("streamEnd", (actionId) => {
        console.log("[TikTok] Stream ended:", actionId);
        this.connected = false;
        opts.onStatus("DISCONNECTED");
        this.scheduleReconnect(username, opts);
      });

      this.conn.on("disconnected", (reason) => {
        console.log("[TikTok] Disconnected:", reason);
        this.connected = false;
        opts.onStatus("DISCONNECTED");
        this.scheduleReconnect(username, opts);
      });

      this.conn.on("error", (err: any) => {
        const errMsg = err?.message || String(err);
        console.error("[TikTok] Connection error:", errMsg);
        if (errMsg.includes("UserOfflineError") || errMsg.includes("isn't online") || errMsg.includes("user isn't live")) {
          console.log("[TikTok] User is OFFLINE - stopping reconnect");
          this.stopReconnect();
          opts.onStatus("USER_OFFLINE");
          return;
        }
        this.connected = false;
        opts.onStatus("ERROR");
        this.scheduleReconnect(username, opts);
      });

      await this.conn.connect();
      this.resetReconnectCounter();
      this.connected = true;
      
      let roomId = "unknown";
      try {
        if (typeof (this.conn as any).getRoomId === 'function') {
          roomId = (this.conn as any).getRoomId();
        } else if ((this.conn as any).roomId) {
          roomId = (this.conn as any).roomId;
        } else if ((this.conn as any).state && (this.conn as any).state.roomId) {
          roomId = (this.conn as any).state.roomId;
        }
      } catch (e) {
        roomId = "connected";
      }
      
      console.log("[TikTok] connected, roomId:", roomId);
      opts.onStatus("CONNECTED");
      
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error("[TikTok] Connect failed:", errMsg);
      if (errMsg.includes("UserOfflineError") || errMsg.includes("isn't online") || errMsg.includes("user isn't live")) {
        console.log("[TikTok] User is OFFLINE - stopping reconnect");
        this.stopReconnect();
        opts.onStatus("USER_OFFLINE");
        return;
      }
      opts.onStatus("DISCONNECTED");
      this.scheduleReconnect(username, opts);
    }
  }

  private stopReconnect() {
    this.reconnectEnabled = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    console.log("[TikTok] Reconnect stopped.");
  }

  private scheduleReconnect(username: string, opts: TikTokCallbacks) {
    if (!this.reconnectEnabled) return;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > 5) {
      console.log("[TikTok] Max reconnect attempts reached (5). Stopping.");
      this.stopReconnect();
      return;
    }
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    console.log(`[TikTok] Terputus! Cuba connect semula dalam ${delay/1000}s (attempt ${this.reconnectAttempts}/5)...`);
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect(username, opts).catch(() => {});
    }, delay);
  }

  private resetReconnectCounter() {
    this.reconnectAttempts = 0;
    this.reconnectEnabled = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  disconnect() {
    console.log("[TikTok] Manual disconnect");
    this.reconnectEnabled = false;
    this.resetReconnectCounter();
    if (this.conn) {
      try {
        this.conn.disconnect();
      } catch (e) {
        console.error("[TikTok] Disconnect error:", e);
      }
      this.conn = null;
    }
    this.connected = false;
  }

  enableReconnect() {
    this.reconnectEnabled = true;
    this.reconnectAttempts = 0;
  }

  disableReconnect() {
    this.reconnectEnabled = false;
  }
}