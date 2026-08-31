import { TikTokLiveConnection } from "tiktok-live-connector";

export class TikTokAdapter {
  private connection: TikTokLiveConnection | null = null;
  private isConnectedState: boolean = false;

  connect(
    username: string,
    callbacks: {
      onComment: (username: string, text: string) => void;
      onGift: (username: string, giftName: string, giftValue: number) => void;
      onLike: (count: number) => void;
      onViewer: (count: number) => void;
      onStatus: (status: string) => void;
      onJoin: (username: string) => void;
    }
  ) {
    if (this.isConnectedState) {
      console.log("[TikTok] Already connected");
      return;
    }

    console.log(`[TikTok] Connecting to: ${username}`);
    callbacks.onStatus("CONNECTING...");

    this.connection = new TikTokLiveConnection(username, {});

    this.connection.on("streamEnd", () => {
      console.log("[TikTok] Stream ended");
      callbacks.onStatus("STREAM_ENDED");
      this.disconnect();
    });

    this.connection.on("disconnected", () => {
      console.log("[TikTok] Disconnected");
      this.isConnectedState = false;
      callbacks.onStatus("DISCONNECTED");
    });

    // ✅ DEBUG TERPERINCI: Lihat apa yang diekstrak dari komen
    this.connection.on("chat", (data: any) => {
      // Cuba semua kemungkinan struktur data dari library
      const uname = data.user?.uniqueId || data.user?.nickname || data.uniqueId || data.nickname || "unknown";
      const text = data.comment || data.text || data.message || "";
      
      console.log(`[TIKTOK EXTRACTED] 👤 User: "${uname}" | 💬 Text: "${text}"`);
      
      if (uname !== "unknown" && text.trim() !== "") {
        console.log(`[TIKTOK CALLBACK] ✅ Menghantar ke processComment...`);
        callbacks.onComment(uname, text);
      } else {
        console.log(`[TIKTOK IGNORED] ❌ Username "unknown" atau teks kosong.`);
      }
    });

    this.connection.on("gift", (data: any) => {
      const uname = data.user?.uniqueId || data.user?.nickname || data.uniqueId || data.nickname || "unknown";
      const giftName = data.giftName || "Unknown Gift";
      const giftValue = data.diamondCount || 0;
      console.log(`[TIKTOK DEBUG GIFT] 🎁 User: "${uname}" | Gift: "${giftName}"`);
      callbacks.onGift(uname, giftName, giftValue);
    });

    this.connection.on("like", (data: any) => {
      const count = data.likeCount || 1;
      callbacks.onLike(count);
    });

    this.connection.on("roomUser", (data: any) => {
      const count = data.totalUser || data.viewerCount || 0;
      callbacks.onViewer(count);
    });

    this.connection.on("member", (data: any) => {
      const uname = data.user?.uniqueId || data.user?.nickname || data.uniqueId || data.nickname || "unknown";
      callbacks.onJoin(uname);
    });

    this.connection.connect()
      .then((state: any) => {
        console.log(`[TikTok] ✅ connected, roomId: ${state.roomId}`);
        this.isConnectedState = true;
        callbacks.onStatus("CONNECTED");
      })
      .catch((err: any) => {
        console.error("[TikTok] ❌ Connection failed:", err.message || err);
        callbacks.onStatus("FAILED");
      });
  }

  disconnect() {
    if (this.connection) {
      console.log("[TikTok] Disconnecting...");
      try {
        this.connection.disconnect();
      } catch (e) {}
      this.connection = null;
      this.isConnectedState = false;
    }
  }

  get connected() {
    return this.isConnectedState;
  }
}