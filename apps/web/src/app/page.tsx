"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket = typeof window !== "undefined" ? io(window.location.protocol + "//" + window.location.hostname + ":4000") : ({} as any);

export default function Dashboard() {
  const [mode, setMode] = useState("REGULAR");
  const [voice, setVoice] = useState("ms-MY-YasminNeural");
  const [comments, setComments] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [speaker, setSpeaker] = useState("LAPTOP");
  const [stats, setStats] = useState({ viewers: 0, totalLikes: 0, comments: 0, gifts: 0 });
  const [vips, setVips] = useState<string[]>([]);
  const [shop, setShop] = useState<any>({ running: false, paused: false, state: "IDLE", productName: "", pauseMin: 3, pauseMax: 4, playbackSpeed: 1, items: [] });
  const [shopTab, setShopTab] = useState<"SCRIPT" | "COMMENTS">("SCRIPT");
  const [product, setProduct] = useState<any>(null);
  const [prodDesc, setProdDesc] = useState("");
  const [prodPoints, setProdPoints] = useState("");
  const [promoValue, setPromoValue] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [prodConfigured, setProdConfigured] = useState(false);
  const [voiceStyle, setVoiceStyle] = useState("Casual");
  const [interjectText, setInterjectText] = useState("");
  const [musicQ, setMusicQ] = useState("");
  const [musicPaused, setMusicPaused] = useState(false);
  const [musicVolume, setMusicVolume] = useState(1);
  const musicVolumeRef = useRef(1);
  const [isDucking, setIsDucking] = useState(false);
  const [autoTapEnabled, setAutoTapEnabled] = useState(false);
  const [autoTapCount, setAutoTapCount] = useState(0);
  const [autoTapPerMin, setAutoTapPerMin] = useState(0);
  const [songList, setSongList] = useState<any[]>([]);
  const [music, setMusic] = useState<any>({ state: "IDLE" });
  const musicAudio = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    socket.on(WS_EVENTS.AUDIO_ROUTE, (d: any) => setSpeaker(d.label));
  }, []);
  useEffect(() => {
    socket.on(WS_EVENTS.LIVE_STATS, (d: any) => setStats(d));
    socket.on(WS_EVENTS.LIVE_VIPS, (d: any) => setVips(d));
  }, []);
  useEffect(() => {
    socket.on(WS_EVENTS.HOST_CUE, (d: any) => setResponses((prev: any) => [{ type: "HOST_CUE", content: d.text, targetUser: "HOST" }, ...prev]));
  }, []);
  useEffect(() => {
    socket.on("script:update", (d: any) => setShop(d));
    socket.on("shop:product", (d: any) => {
      setProduct(d);
      setProdDesc(d.description || "");
      setProdPoints((d.sellingPoints || []).join("\n"));
      setPromoValue(d.promoValue || "");
      setPromoCode(d.promoCode || "");
      setProdConfigured(true);
    });
  }, []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = shop.playbackSpeed || 1;
  }, [shop.playbackSpeed]);

  const claimAudio = () => {
    const label = /Mobi|Android/i.test(navigator.userAgent) ? "PHONE" : "LAPTOP";
    socket.emit(WS_EVENTS.AUDIO_CLAIM, { label });
  };
  const [ttUser, setTtUser] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("batia_tt_user") || "" : ""));
  useEffect(() => { if (ttUser) localStorage.setItem("batia_tt_user", ttUser); }, [ttUser]);
  const [ttStatus, setTtStatus] = useState("DISCONNECTED");
  useEffect(() => {
    socket.on(WS_EVENTS.TIKTOK_STATUS, (d: any) => setTtStatus(d.status));
  }, []);
  const connectTikTok = () => socket.emit(WS_EVENTS.TIKTOK_CONNECT, { username: ttUser.replace("@", "").trim() });
  const disconnectTikTok = () => socket.emit(WS_EVENTS.TIKTOK_DISCONNECT, {});

  const rnd = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)];
  const qMs = ["Assalamualaikum host!", "Hai bang, khabar?", "First time join live ni, best!", "Dari mana host asal?", "Best la live malam ni", "Follow dah, nak support", "Share dengan member tadi", "Selalu live pukul berapa?"];
  const qEn = ["hi host where are you from?", "hello, nice stream!", "how long have you been live?", "greetings from overseas", "first time here, what's this about?", "hello, can you hear me?", "hi, are you selling something?"];
  const qHarga = ["Berapa harga produk ni?", "Boleh kurang tak harga?", "Ada promo tak hari ni?", "Stok ada lagi ke?", "Postage berapa ke sana?", "COD boleh ke bang?", "Beli dua boleh kurang?"];
  const qBad = ["Komen NAK kalau korang nak RM100!", "Bagi gift mahal sikit bang!", "Share la live ni sampai viral", "Follow kalau nak menang hadiah", "Klik beg kuning sekarang atau rugi", "Gift roket sikit boss!"];
  const soundRef = useRef(true);
  const audioQueue = useRef<string[]>([]);
  const playing = useRef(false);

  const playNext = () => {
    if (playing.current) return;
    const url = audioQueue.current.shift();
    if (!url) return;
    playing.current = true;
    const a = new Audio(url.replace("localhost", window.location.hostname));
    a.onended = () => { playing.current = false; playNext(); };
    a.onerror = () => { playing.current = false; playNext(); };
    a.play().catch(() => { playing.current = false; playNext(); });
  };

  useEffect(() => {
    socket.on("music:status", (d: any) => {
      if (d.state !== "VOLUME") setMusic((prev: any) => ({ ...prev, ...d }));
      console.log("[MUSIC-WEB] state:", d.state, "| audioFor:", d.audioFor, "| me:", socket.id, "| url:", d.url);
      if (d.state === "PLAYING" && d.url && d.audioFor !== socket.id) { console.log("[MUSIC-WEB] skip - not my sink"); return; }
      if (d.state === "PLAYING" && d.url) {
        if (musicAudio.current) musicAudio.current.pause();
        const mpath = d.url.indexOf("/music/") >= 0 ? d.url.slice(d.url.indexOf("/music/")) : d.url;
        const a = new Audio("http://" + window.location.hostname + ":4000" + mpath);
        a.volume = musicVolume;
        musicAudio.current = a;
        a.onended = () => { socket.emit("music:ended", { file: d.url }); setMusic({ state: "IDLE" }); };
        a.onplay = () => { if (isDucking) a.volume = musicVolumeRef.current * 0.2; else a.volume = musicVolumeRef.current; };
      a.onerror = () => { console.log("[MUSIC-WEB] play error", d.url); socket.emit("music:ended", { file: d.url }); setMusic({ state: "IDLE" }); };
        a.play().catch(() => {});
      }
      if (d.state === "STOPPED") { if (musicAudio.current) { musicAudio.current.pause(); musicAudio.current.currentTime = 0; musicAudio.current = null; } setMusicPaused(false); }
      if (d.state === "PAUSED") { if (musicAudio.current) musicAudio.current.pause(); setMusicPaused(true); }
      if (d.state === "PLAYING") { if (musicAudio.current) musicAudio.current.play().catch(() => {}); setMusicPaused(false); }
      if (d.state === "CACHE_CLEARED") { setMusic({ state: "CACHE_CLEARED", q: d.q }); }
      if (d.state === "VOLUME") { setMusicVolume(d.vol); musicVolumeRef.current = d.vol; }
    });
    socket.on("music:duck", () => {
      if (!musicAudio.current || musicPaused) return;
      setIsDucking(true);
      const startVol = musicAudio.current.volume;
      const targetVol = startVol * 0.2;
      const steps = 10;
      const stepTime = 50;
      let step = 0;
      const fade = setInterval(() => {
        step++;
        const vol = startVol - (startVol - targetVol) * (step / steps);
        if (musicAudio.current) musicAudio.current.volume = Math.max(0, vol);
        if (step >= steps) clearInterval(fade);
      }, stepTime);
    });
    socket.on("music:unduck", () => {
      if (!musicAudio.current) return;
      setIsDucking(false);
      const startVol = musicAudio.current.volume;
      const targetVol = musicVolumeRef.current;
      const steps = 10;
      const stepTime = 50;
      let step = 0;
      const fade = setInterval(() => {
        step++;
        const vol = startVol + (targetVol - startVol) * (step / steps);
        if (musicAudio.current) musicAudio.current.volume = Math.min(targetVol, vol);
        if (step >= steps) clearInterval(fade);
      }, stepTime);
    });
    socket.on("music:queue", (l: any) => setSongList(Array.isArray(l) ? l : []));
    socket.on("autoTap:status", (d: any) => { setAutoTapEnabled(!!d.enabled); setAutoTapCount(d.count || 0); });
    socket.on("autoTap:tick", (d: any) => { setAutoTapCount(d.count || 0); setAutoTapPerMin(d.perMin || 0); });
    socket.on(WS_EVENTS.COMMENT_LOG, (d: any) => setComments((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.POLICY_VIOLATION, (d: any) => setViolations((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.APPROVAL_REQUEST, (d: any) => setApprovals((p) => [d, ...p].slice(0, 10)));
    socket.on(WS_EVENTS.AI_RESPONSE_READY, (d: any) => {
      setResponses((p) => [d, ...p].slice(0, 20));
      if (d.audioUrl && soundRef.current && d.audioFor === socket.id) {
        audioQueue.current.push(d.audioUrl);
        while (audioQueue.current.length > 3) audioQueue.current.shift();
        playNext();
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  const send = (text: string) => socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_user", text });
  const changeMode = (m: string) => { setMode(m); socket.emit(WS_EVENTS.MODE_CHANGED, { mode: m }); };
  const changeVoice = (v: string) => { setVoice(v); socket.emit(WS_EVENTS.VOICE_CHANGED, { voice: v }); };
  const toggleSound = () => {
    soundRef.current = !soundRef.current;
    setSoundOn(soundRef.current);
    if (!soundRef.current) audioQueue.current = [];
  };
  const decide = (id: string, decision: string, finalText: string, username: string) => {
    socket.emit(WS_EVENTS.APPROVAL_DECISION, { id, decision, finalText, username });
    setApprovals((p) => p.filter((x) => x.id !== id));
  };
  const saveConfig = () => {
    socket.emit("shop:config", {
      description: prodDesc,
      sellingPoints: prodPoints.split("\n").map((s) => s.trim()).filter(Boolean),
      promoValue,
      promoCode,
    });
    setProdConfigured(true);
  };
  const setPause = (min: number, max: number) => socket.emit("shop:settings", { pauseMin: min, pauseMax: max });
  const setSpeed = (s: number) => socket.emit("shop:settings", { playbackSpeed: s });
  const doInterject = () => {
    const t = interjectText.trim();
    if (!t) return;
    socket.emit("shop:interject", { text: t });
    setInterjectText("");
  };

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">BATIA OS</h1>
        <div className="flex gap-2">
          <button onClick={() => changeVoice("ms-MY-YasminNeural")} className={"px-3 py-2 rounded " + (voice === "ms-MY-YasminNeural" ? "bg-pink-600" : "bg-gray-800")}>YASMIN</button>
          <button onClick={() => changeVoice("ms-MY-OsmanNeural")} className={"px-3 py-2 rounded " + (voice === "ms-MY-OsmanNeural" ? "bg-pink-600" : "bg-gray-800")}>OSMAN</button>
          <button onClick={toggleSound} className={"px-3 py-2 rounded " + (soundOn ? "bg-green-600" : "bg-gray-800")}>{soundOn ? "SUARA ON" : "SUARA OFF"}</button>
          <button onClick={claimAudio} className="px-3 py-2 rounded bg-purple-700" title="Klik pada peranti yang akan keluarkan suara">SPEAKER: {speaker}</button>
          <button onClick={() => changeMode("REGULAR")} className={"px-4 py-2 rounded " + (mode === "REGULAR" ? "bg-blue-600" : "bg-gray-800")}>REGULAR LIVE</button>
          <button onClick={() => changeMode("SHOPPABLE")} className={"px-4 py-2 rounded " + (mode === "SHOPPABLE" ? "bg-red-600" : "bg-gray-800")}>SHOPPABLE LIVE</button>
        </div>
      </header>

      <div className="mb-6 bg-gray-900 rounded p-4 flex items-center gap-3">
        <span className="text-sm font-semibold">TikTok Live:</span>
        <input value={ttUser} onChange={(e) => setTtUser(e.target.value)} placeholder="username TikTok (tanpa @)" className="bg-gray-800 rounded px-3 py-2 text-sm flex-1" />
        <button onClick={connectTikTok} className="bg-rose-600 px-4 py-2 rounded text-sm">CONNECT LIVE</button>
        <button onClick={disconnectTikTok} className="bg-gray-700 px-4 py-2 rounded text-sm">DISCONNECT</button>
        <span className={"text-xs px-2 py-1 rounded " + (ttStatus.startsWith("CONNECTED") ? "bg-green-700" : "bg-gray-700")}>{ttStatus}</span>
      </div>

      {mode === "SHOPPABLE" && (
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div className="bg-gray-900 rounded p-4">
            <h2 className="font-semibold mb-3">{"\uD83D\uDC68\u200D\uD83D\uDCBC"} Product Details</h2>
            <label className="text-xs text-gray-400">Product Description</label>
            <textarea value={prodDesc} onChange={(e) => { setProdDesc(e.target.value); setProdConfigured(false); }} className="w-full bg-gray-800 rounded px-3 py-2 text-sm h-20 mb-3" />
            <label className="text-xs text-gray-400">Selling Points & Promotions (satu per baris)</label>
            <textarea value={prodPoints} onChange={(e) => { setProdPoints(e.target.value); setProdConfigured(false); }} className="w-full bg-gray-800 rounded px-3 py-2 text-sm h-24 mb-3" />
            <div className="flex gap-2 mb-3">
              <input value={promoValue} onChange={(e) => { setPromoValue(e.target.value); setProdConfigured(false); }} placeholder="Promo: RM59 (biasanya RM99)" className="bg-gray-800 rounded px-3 py-2 text-sm flex-1" />
              <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setProdConfigured(false); }} placeholder="Kod: BATIA59" className="bg-gray-800 rounded px-3 py-2 text-sm w-32" />
            </div>
            <button onClick={saveConfig} className="bg-blue-600 px-4 py-2 rounded text-sm w-full">Save Product</button>
            {prodConfigured && <div className="mt-2 text-green-400 text-xs border border-green-700 rounded px-3 py-2">{"\u2022"} Product configured</div>}
          </div>
          <div className="bg-gray-900 rounded p-4">
            <h2 className="font-semibold mb-3">{"\uD83C\uDFA4"} Voice Settings</h2>
            <label className="text-xs text-gray-400">Voice Style</label>
            <select value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} className="w-full bg-gray-800 rounded px-3 py-2 text-sm mb-3">
              <option>Casual</option>
              <option>Sporting</option>
              <option>Hype</option>
            </select>
            <label className="text-xs text-gray-400">Pause Between Speech (saat)</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs w-8">Min</span>
              <input type="range" min={1} max={8} value={shop.pauseMin} onChange={(e) => setPause(Math.min(+e.target.value, shop.pauseMax), shop.pauseMax)} className="flex-1" />
              <span className="text-sm w-4">{shop.pauseMin}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs w-8">Max</span>
              <input type="range" min={1} max={10} value={shop.pauseMax} onChange={(e) => setPause(shop.pauseMin, Math.max(+e.target.value, shop.pauseMin))} className="flex-1" />
              <span className="text-sm w-4">{shop.pauseMax}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Randomized between {shop.pauseMin}-{shop.pauseMax} seconds</p>
            {!shop.running ? (
              <button onClick={() => socket.emit("shop:start", {})} className="mt-4 bg-green-600 hover:bg-green-500 px-4 py-3 rounded w-full font-semibold">Go Live</button>
            ) : (
              <div className="mt-4 flex gap-2">
                <button onClick={() => socket.emit(shop.paused ? "shop:resume" : "shop:pause", {})} className="bg-yellow-600 hover:bg-yellow-500 px-4 py-3 rounded flex-1 font-semibold">{shop.paused ? "Resume" : "Pause"}</button>
                <button onClick={() => socket.emit("shop:stop", {})} className="bg-red-600 hover:bg-red-500 px-4 py-3 rounded flex-1 font-semibold">Stop Streaming</button>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "SHOPPABLE" && shop.running && (
        <div className="mb-6 bg-gray-900 rounded p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className={"text-xs px-2 py-1 rounded " + (shop.state === "PITCHING" ? "bg-blue-600" : shop.state === "RESPONDING" ? "bg-green-600" : shop.state === "PAUSED" ? "bg-yellow-600" : "bg-gray-700")}>
              {shop.state === "PITCHING" ? "Pitching" : shop.state === "RESPONDING" ? "Responding" : shop.state === "PAUSED" ? "Paused" : "Idle"}
            </span>
            <span className="text-sm font-semibold">{shop.productName}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-purple-300">{"\u2022"} Playback Speed</span>
            <input type="range" min={1} max={2} step={0.05} value={shop.playbackSpeed} onChange={(e) => setSpeed(+e.target.value)} className="flex-1" />
            <span className="text-sm">{(shop.playbackSpeed || 1).toFixed(2)}x</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input value={interjectText} onChange={(e) => setInterjectText(e.target.value)} placeholder="Interject: nak AI cakap apa sekarang?" className="bg-gray-800 rounded px-3 py-2 text-sm flex-1" />
            <button onClick={doInterject} className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded text-sm font-semibold">Cakap Sekarang</button>
          </div>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setShopTab("SCRIPT")} className={"px-3 py-1 rounded text-sm " + (shopTab === "SCRIPT" ? "bg-gray-700 border border-gray-500" : "bg-gray-800")}>Product Script</button>
            <button onClick={() => setShopTab("COMMENTS")} className={"px-3 py-1 rounded text-sm " + (shopTab === "COMMENTS" ? "bg-gray-700 border border-gray-500" : "bg-gray-800")}>Comments</button>
          </div>
          {shopTab === "SCRIPT" ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {shop.items.length === 0 && <p className="text-gray-500 text-sm">Queue kosong - pitch akan dijana automatik.</p>}
              {shop.items.map((it: any) => (
                <div key={it.id} className={"rounded p-3 text-sm border " + (it.status === "SPEAKING" ? "bg-blue-900/40 border-blue-500" : it.status === "QUEUED" ? "bg-gray-800 border-gray-700" : "bg-gray-800/50 border-gray-800")}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-purple-700 rounded-full px-2 py-0.5">{it.id}</span>
                    <span className={"text-xs px-2 py-0.5 rounded " + (it.type === "PITCH" ? "bg-blue-600" : it.type === "GREET" ? "bg-green-600" : "bg-purple-600")}>{it.type === "PITCH" ? "Pitch" : it.type === "GREET" ? "Greet" : "Response"}</span>
                    <span className="text-xs text-gray-400">{it.status === "SPEAKING" ? "Speaking Now" : it.status === "QUEUED" ? "Queued" : "Completed"} ~{it.durationEst}s</span>
                  </div>
                  <p className={it.status === "COMPLETED" ? "text-gray-500" : ""}>{it.text}</p>
                  {it.respondingTo && <div className="mt-2 text-xs border border-purple-700 rounded px-2 py-1 text-purple-300">Responding to:<br />"{it.respondingTo}"</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {comments.map((c, i) => (
                <div key={i} className="bg-gray-800 rounded p-2 text-sm"><span className="font-medium">{c.username}: </span>{c.text}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-3 bg-gray-900 rounded p-4 flex items-center gap-6 text-sm">
        <span>{"\uD83D\uDC65"} Viewers: <b>{stats.viewers}</b></span>
        <span>{"\u2764\uFE0F"} Likes: <b>{stats.totalLikes}</b></span>
        <span>{"\uD83D\uDCAC"} Komen: <b>{stats.comments}</b></span>
        <span>{"\uD83C\uDF81"} Gifts: <b>{stats.gifts}</b></span>
      </div>
      <div className="mb-6 bg-gray-900 rounded p-4 text-sm">
        <span className="font-semibold">{"\uD83D\uDC51"} Penonton VIP:</span>
        {vips.length === 0 ? <span className="text-gray-500 ml-2">belum ada lagi</span> : vips.map((v) => <span key={v} className="ml-2 px-2 py-1 bg-yellow-700 rounded">{v}</span>)}
      </div>

      <div className="mb-6 bg-gray-900 rounded p-4 flex items-center gap-3">
        <span className="text-sm font-semibold">{"\uD83C\uDFB5"} Muzik (YouTube):</span>
        <input value={musicQ} onChange={(e) => setMusicQ(e.target.value)} placeholder="Tajuk lagu atau URL YouTube" className="bg-gray-800 rounded px-3 py-2 text-sm flex-1" />
        <button onClick={() => { socket.emit("music:play", { q: musicQ }); setMusicPaused(false); }} className="bg-teal-600 hover:bg-teal-500 px-4 py-2 rounded text-sm">Mainkan</button>
        <button onClick={() => {
          console.log("[MUSIC] pause/resume click | state:", music.state, "| paused:", musicPaused);
          if (music.state === "PLAYING" && !musicPaused) socket.emit("music:pause", {});
          else if (musicPaused) socket.emit("music:resume", {});
        }} className={"px-4 py-2 rounded text-sm " + (musicPaused ? "bg-green-700 hover:bg-green-600" : "bg-yellow-700 hover:bg-yellow-600")} disabled={music.state !== "PLAYING" && !musicPaused}>
          {musicPaused ? "Play" : "Pause"}
        </button>
        <button onClick={() => { console.log("[MUSIC] stop click"); socket.emit("music:stop", {}); setMusicPaused(false); }} className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded text-sm">Stop</button>
        <span className="text-xs text-gray-400 flex-1">{music.state === "FETCHING" ? "Sedang download..." : music.state === "PLAYING" ? (musicPaused ? "Paused: " : "Now playing: ") + music.q : music.state === "FAILED" ? "Tak jumpa lagu tu" : music.state === "CACHE_CLEARED" ? "Lagu " + music.q + " dah habis, cache dibersihkan ✓" : "ready"}</span>
        <span className="text-xs text-purple-300">{"\uD83D\uDD0A"}</span>
        <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => { const v = +e.target.value; setMusicVolume(v); musicVolumeRef.current = v; if (musicAudio.current) musicAudio.current.volume = v; socket.emit("music:volume", { vol: v }); }} className="w-24" />
        <span className="text-xs w-8">{Math.round(musicVolume * 100)}%</span>

      </div>

      <div className="mb-4 bg-gray-900 rounded p-3 flex items-center gap-4">
        <span className="text-sm font-semibold">{"\uD83D\uDC46"} Auto Tapper:</span>
        <button onClick={() => socket.emit("autoTap:toggle", { enabled: !autoTapEnabled })} className={"px-4 py-2 rounded text-sm font-semibold " + (autoTapEnabled ? "bg-red-700 hover:bg-red-600" : "bg-green-700 hover:bg-green-600")}>
          {autoTapEnabled ? "Stop Auto Tap" : "Start Auto Tap"}
        </button>
        <span className="text-xs text-gray-400">Total: <span className="text-teal-300 font-bold">{autoTapCount}</span></span>

        <span className="text-xs text-gray-500">(AI ajak viewer tap tiap 45-90s - likes REAL)</span>
      </div>

      {songList.length > 0 && (
        <div className="mb-6 bg-gray-900 rounded p-3">
          <div className="text-sm font-semibold mb-2">{"\uD83C\uDFBC"} Senarai Permintaan Lagu ({songList.length})</div>
          {songList.map((s: any, i: number) => (
            <div key={i} className="text-xs text-gray-300 py-1 border-b border-gray-800">
              {i + 1}. <span className="text-teal-300 font-semibold">{s.q}</span> — diminta oleh: <span className="text-amber-300">{s.by}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded p-4">
          <h2 className="font-semibold mb-3">Studio Preview</h2>
          <div className="aspect-[9/16] bg-gray-800 rounded flex items-center justify-center text-gray-500 overflow-hidden">
            {mode === "SHOPPABLE" && product && product.videoLoopUrl ? (
              <video ref={videoRef} src={product.videoLoopUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
            ) : (
              "Avatar / Video Feed"
            )}
          </div>
        </div>

        <div className="bg-gray-900 rounded p-4">
          <h2 className="font-semibold mb-3">AI Responses</h2>
          <div className="space-y-2 overflow-y-auto max-h-[500px]">
            {responses.map((r, i) => (
              <div key={i} className="bg-gray-800 rounded p-3 text-sm">
                <p className="text-xs text-gray-400">{r.type} - {r.targetUser}</p>
                <p>{r.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded p-4">
          <h2 className="font-semibold mb-3">Live Chat + Policy Firewall</h2>
          <div className="flex flex-col gap-2 mb-4">
            <button onClick={() => send(rnd(qMs))} className="bg-green-700 rounded px-3 py-2 text-sm text-left">Test 1: Chit-chat selamat</button>
            <button onClick={() => send(rnd(qEn))} className="bg-purple-700 rounded px-3 py-2 text-sm text-left">Test EN: English reply</button>
            <button onClick={() => send(rnd(qHarga))} className="bg-blue-700 rounded px-3 py-2 text-sm text-left">Test 2: Soalan harga</button>
            <button onClick={() => send(rnd(qBad))} className="bg-red-700 rounded px-3 py-2 text-sm text-left">Test 3: VIOLATION engagement bait</button>
            <button onClick={() => send("Bagi gift lion sikit bang!")} className="bg-red-700 rounded px-3 py-2 text-sm text-left">Test 4: VIOLATION begging gift</button>
            <button onClick={() => send("Berapa harga earbuds ni?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">SHOP 1: Harga earbuds</button>
            <button onClick={() => send("Battery tahan berapa jam?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">SHOP 2: Soalan battery</button>
            <button onClick={() => send("Ada promo tak hari ni?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">SHOP 3: Promo</button>
            <button onClick={() => socket.emit("test:join", {})} className="bg-teal-700 rounded px-3 py-2 text-sm text-left">Test JOIN: penonton baru masuk</button>
            <button onClick={() => send("boleh request lagu instrumental santai tak?")} className="bg-teal-700 rounded px-3 py-2 text-sm text-left">Test MUZIK: request lagu</button>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[300px]">
            {comments.map((c, i) => (
              <div key={i} className="bg-gray-800 rounded p-2 text-sm">
                <span className="font-medium">{c.username}: </span>
                {c.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-amber-900/30 border border-amber-700 rounded p-4">
        <h2 className="font-semibold mb-3">Human Approval Zone (Menunggu Kelulusan Anda)</h2>
        {approvals.length === 0 ? (
          <p className="text-gray-500 text-sm">Tiada komen menunggu kelulusan. Cuba Test 4 - komen HIGH akan masuk sini dulu sebelum AI bercakap.</p>
        ) : (
          <div className="space-y-3">
            {approvals.map((a) => (
              <div key={a.id} className="bg-gray-800 rounded p-3 text-sm">
                <p className="text-xs text-amber-400 mb-1">{a.ruleId} [{a.severity}] - @{a.username}</p>
                <p className="text-gray-300 mb-1">Komen asal: {a.originalText}</p>
                <p className="mb-2">Draft AI: {a.draft}</p>
                <div className="flex gap-2">
                  <button onClick={() => decide(a.id, "approved", a.draft, a.username)} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded">LULUSKAN</button>
                  <button onClick={() => decide(a.id, "rejected", a.draft, a.username)} className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded">TOLAK</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 bg-gray-900 rounded p-4">
        <h2 className="font-semibold mb-3">Policy Violations (Evidence Trail)</h2>
        <div className="space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="bg-red-900/50 border border-red-700 rounded p-3 text-sm">
              <p className="font-medium">{v.ruleId} [{v.severity}] - {v.action}</p>
              <p className="text-gray-300">{v.triggeredText}</p>
            </div>
          ))}
          {violations.length === 0 && <p className="text-gray-500 text-sm">Tiada violation lagi.</p>}
        </div>
      </div>
    </div>
  );
}





















