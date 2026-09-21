"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket: any = typeof window !== "undefined"
  ? io(window.location.protocol + "//" + window.location.hostname + ":4000")
  : null;

type Line = { a: number; b: number; text: string };

export default function Dashboard() {
  const [mode, setMode] = useState("REGULAR");
  const [voice, setVoice] = useState("ms-MY-YasminNeural");
  const [soundOn, setSoundOn] = useState(true);
  const [speaker, setSpeaker] = useState("LAPTOP");
  const [tiktokUser, setTiktokUser] = useState("mohd_bakhtiar1979");
  const [tiktokStatus, setTiktokStatus] = useState("DISCONNECTED");
  const [stats, setStats] = useState({ viewers: 0, totalLikes: 0, comments: 0, gifts: 0 });
  const [vips, setVips] = useState<string[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [cues, setCues] = useState<string[]>([]);
  const [songQuery, setSongQuery] = useState("");
  const [musicStatus, setMusicStatus] = useState("ready");
  const [currentSong, setCurrentSong] = useState("");
  const [queue, setQueue] = useState<any[]>([]);
  const [volume, setVolume] = useState(1.0);
  const [autoTap, setAutoTap] = useState(false);
  const [autoTapCount, setAutoTapCount] = useState(0);
  const [shop, setShop] = useState<any>({ running: false, paused: false, product: null, items: [] });
  const [interject, setInterject] = useState("");

  const musicAudio = useRef<HTMLAudioElement | null>(null);
  const tickInterval = useRef<any>(null);
  const leadinDone = useRef<Record<string, boolean>>({});
  const volumeRef = useRef(1.0);
  const soundOnRef = useRef(true);

  useEffect(() => { volumeRef.current = volume; if (musicAudio.current) musicAudio.current.volume = volume; }, [volume]);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  useEffect(() => {
    if (!musicAudio.current) musicAudio.current = new Audio();

    socket.on("connect", () => console.log("[WEB] connected ke orchestrator"));

    socket.on(WS_EVENTS.TIKTOK_STATUS, (d: any) => setTiktokStatus(d.status));
    socket.on(WS_EVENTS.LIVE_STATS, (d: any) => setStats(d));
    socket.on(WS_EVENTS.LIVE_VIPS, (v: string[]) => setVips(v));
    socket.on(WS_EVENTS.COMMENT_LOG, (d: any) => setComments((p) => [...p.slice(-40), d]));
    socket.on(WS_EVENTS.POLICY_VIOLATION, (d: any) => setViolations((p) => [...p.slice(-20), d]));
    socket.on(WS_EVENTS.APPROVAL_REQUEST, (d: any) => setApprovals((p) => [...p.filter((x) => x.id !== d.id), d]));
    socket.on(WS_EVENTS.HOST_CUE, (d: any) => setCues((p) => [...p.slice(-4), d.text]));
    socket.on("script:update", (d: any) => setShop((s: any) => ({ ...s, items: d?.items || [], running: d?.running ?? s.running, paused: d?.paused ?? s.paused })));
    socket.on("shop:product", (p: any) => setShop((s: any) => ({ ...s, product: p })));
    socket.on("autoTap:status", (d: any) => { setAutoTap(d.enabled); setAutoTapCount(d.count || 0); });
    socket.on("autoTap:tick", (d: any) => setAutoTapCount(d.count));
    socket.on("music:queue", (q: any[]) => setQueue(q || []));

    socket.on(WS_EVENTS.AI_RESPONSE_READY, (d: any) => {
      setResponses((p) => [...p.slice(-30), d]);
      if (d.audioUrl && soundOnRef.current && d.audioFor === socket.id) {
        try { const a = new Audio(d.audioUrl); a.play().catch(() => {}); } catch (e) {}
      }
    });

    socket.on("music:volume", (d: any) => { if (musicAudio.current) musicAudio.current.volume = Math.max(0, Math.min(1, d.vol)); });
    socket.on("music:duck", () => { if (musicAudio.current) musicAudio.current.volume = 0.25; });
    socket.on("music:unduck", () => { if (musicAudio.current) musicAudio.current.volume = volumeRef.current; });

    socket.on("music:status", (d: any) => {
      setMusicStatus(d.state + (d.q ? ": " + d.q : ""));
      const a = musicAudio.current;
      if (!a) return;
      if (d.state === "PLAYING" && d.url) {
        const mpath = String(d.url);
        const idm = mpath.match(/\/music\/([^/?#]+)\./);
        const vid = idm ? idm[1] : "";
        a.src = d.url;
        a.volume = volumeRef.current;
        setCurrentSong(d.q || "");
        a.onended = () => { socket.emit("music:ended", {}); };
        a.play().then(() => {
          socket.emit("music:started", { q: d.q });
        }).catch((e) => console.log("[WEB] play blocked:", e));
        if (tickInterval.current) clearInterval(tickInterval.current);
        tickInterval.current = setInterval(() => {
          if (musicAudio.current && !musicAudio.current.paused && !musicAudio.current.ended) {
            socket.emit("music:tick", { elapsed: musicAudio.current.currentTime * 1000 });
          }
        }, 500);
        // ✅ v8.59: detect lead-in silence (intro sebelum muzik) untuk sync lirik LRCLIB
        if (vid && !leadinDone.current[vid]) {
          leadinDone.current[vid] = true;
          (async () => {
            try {
              const resp = await fetch(d.url);
              const buf = await resp.arrayBuffer();
              const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
              const ctx = new AC();
              const ad = await ctx.decodeAudioData(buf);
              const ch = ad.getChannelData(0);
              const sr = ad.sampleRate;
              const step = Math.max(1, Math.floor(sr / 100));
              const limit = Math.min(ch.length, sr * 30);
              let first = 0;
              for (let i = 0; i < limit; i += step) {
                if (Math.abs(ch[i]) > 0.02) { first = i; break; }
              }
              ctx.close();
              const ms = Math.round((first / sr) * 1000);
              console.log("[MUSIC-WEB] lead-in detected:", ms + "ms");
              socket.emit("music:leadin", { videoId: vid, ms });
            } catch (e) {}
          })();
        }
      }
      if (d.state === "PAUSED") a.pause();
      if (d.state === "RESUMED") a.play().catch(() => {});
      if (d.state === "STOPPED" || d.state === "SKIPPED" || d.state === "FAILED") {
        a.pause(); a.src = "";
        if (tickInterval.current) clearInterval(tickInterval.current);
        setCurrentSong("");
      }
      if (d.state === "VOLUME") setVolume(Math.max(0, Math.min(1, d.vol)));
    });

    return () => {
      if (tickInterval.current) clearInterval(tickInterval.current);
    };
  }, []);

  const btn = (on: boolean): any => ({
    padding: "10px 18px", borderRadius: 6, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 13, color: "#fff",
    background: on ? "#e11d48" : "#374151",
  });
  const panel: any = { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 16, marginBottom: 14 };
  const input: any = { background: "#1f2937", border: "1px solid #374151", color: "#fff", borderRadius: 6, padding: "10px 12px", fontSize: 14, flex: 1 };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#fff", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>BATIA OS</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn(voice.includes("Yasmin"))} onClick={() => { setVoice("ms-MY-YasminNeural"); socket.emit(WS_EVENTS.VOICE_CHANGED, { voice: "ms-MY-YasminNeural" }); }}>YASMIN</button>
          <button style={btn(voice.includes("Osman"))} onClick={() => { setVoice("ms-MY-OsmanNeural"); socket.emit(WS_EVENTS.VOICE_CHANGED, { voice: "ms-MY-OsmanNeural" }); }}>OSMAN</button>
          <button style={{ ...btn(soundOn), background: soundOn ? "#16a34a" : "#374151" }} onClick={() => setSoundOn(!soundOn)}>SUARA {soundOn ? "ON" : "OFF"}</button>
          <button style={{ ...btn(true), background: "#7c3aed" }} onClick={() => { socket.emit(WS_EVENTS.AUDIO_CLAIM, { label: "LAPTOP" }); setSpeaker("LAPTOP"); }}>SPEAKER: {speaker}</button>
          <button style={{ ...btn(mode === "REGULAR"), background: mode === "REGULAR" ? "#2563eb" : "#374151" }} onClick={() => { setMode("REGULAR"); socket.emit(WS_EVENTS.MODE_CHANGED, { mode: "REGULAR" }); }}>REGULAR LIVE</button>
          <button style={{ ...btn(mode === "SHOPPABLE"), background: mode === "SHOPPABLE" ? "#2563eb" : "#374151" }} onClick={() => { setMode("SHOPPABLE"); socket.emit(WS_EVENTS.MODE_CHANGED, { mode: "SHOPPABLE" }); }}>SHOPPABLE LIVE</button>
        </div>
      </div>

      {cues.length > 0 && (
        <div style={{ ...panel, background: "#78350f", border: "1px solid #b45309" }}>
          💡 <b>HOST CUE:</b> {cues[cues.length - 1]}
        </div>
      )}

      <div style={panel}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <b style={{ whiteSpace: "nowrap" }}>TikTok Live:</b>
          <input style={input} value={tiktokUser} onChange={(e) => setTiktokUser(e.target.value)} />
          <button style={{ ...btn(true), background: "#e11d48" }} onClick={() => socket.emit(WS_EVENTS.TIKTOK_CONNECT, { username: tiktokUser })}>CONNECT LIVE</button>
          <button style={btn(false)} onClick={() => socket.emit(WS_EVENTS.TIKTOK_DISCONNECT, {})}>DISCONNECT</button>
          <span style={{ color: tiktokStatus === "CONNECTED" ? "#4ade80" : "#9ca3af", fontSize: 13, fontWeight: 700 }}>{tiktokStatus}</span>
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", gap: 26, fontSize: 14 }}>
          <span>👥 Viewers: <b>{stats.viewers}</b></span>
          <span>❤️ Likes: <b>{stats.totalLikes}</b></span>
          <span>💬 Komen: <b>{stats.comments}</b></span>
          <span>🎁 Gifts: <b>{stats.gifts}</b></span>
        </div>
      </div>

      <div style={panel}>
        <b>👑 Penonton VIP:</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {vips.length === 0 && <span style={{ color: "#6b7280" }}>tiada lagi</span>}
          {vips.map((v) => (
            <span key={v} style={{ background: "#92400e", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>{v}</span>
          ))}
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <b style={{ whiteSpace: "nowrap" }}>🎵 Muzik (YouTube):</b>
          <input style={input} placeholder="Tajuk lagu atau URL YouTube" value={songQuery} onChange={(e) => setSongQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && songQuery.trim()) { socket.emit("music:play", { q: songQuery.trim() }); setSongQuery(""); } }} />
          <button style={{ ...btn(true), background: "#0d9488" }} onClick={() => { if (songQuery.trim()) { socket.emit("music:play", { q: songQuery.trim() }); setSongQuery(""); } }}>Mainkan</button>
          <button style={{ ...btn(true), background: "#b45309" }} onClick={() => socket.emit("music:pause", {})}>Pause</button>
          <button style={{ ...btn(true), background: "#b91c1c" }} onClick={() => socket.emit("music:stop", {})}>Stop</button>
          <button style={btn(false)} onClick={() => socket.emit("music:skip", {})}>Skip</button>
          <span style={{ color: "#9ca3af", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{musicStatus}</span>
          <span style={{ marginLeft: "auto" }}>🔊</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} style={{ width: 120 }}
            onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); socket.emit("music:volume", { vol: v }); }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Sync lirik:</span>
          <button style={btn(false)} onClick={() => socket.emit("lyrics:offset", { delta: -500 })}>Lirik cepat -0.5s</button>
          <button style={btn(false)} onClick={() => socket.emit("lyrics:offset", { delta: 500 })}>Lirik lambat +0.5s</button>
          {currentSong && <span style={{ fontSize: 12, color: "#4ade80" }}>♪ {currentSong}</span>}
          {queue.length > 0 && <span style={{ fontSize: 12, color: "#9ca3af" }}>Queue: {queue.map((q) => q.q).join(" → ")}</span>}
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <b>👆 Auto Tapper:</b>
          <button style={{ ...btn(autoTap), background: autoTap ? "#16a34a" : "#15803d" }} onClick={() => socket.emit("autoTap:toggle", { enabled: !autoTap })}>
            {autoTap ? "Stop Auto Tap" : "Start Auto Tap"}
          </button>
          <span style={{ fontSize: 13 }}>Total: <b style={{ color: "#4ade80" }}>{autoTapCount}</b></span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>(AI ajak viewer tap tiap 45-90s - likes REAL)</span>
        </div>
      </div>

      {mode === "SHOPPABLE" && (
        <div style={panel}>
          <b>🛍️ Shoppable Live:</b>
          {shop.product && <span style={{ marginLeft: 10, fontSize: 13, color: "#fbbf24" }}>{shop.product.title} — RM{shop.product.skus?.[0]?.price}</span>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={{ ...btn(true), background: "#16a34a" }} onClick={() => socket.emit("shop:start", {})}>Start</button>
            <button style={btn(false)} onClick={() => socket.emit("shop:pause", {})}>Pause</button>
            <button style={btn(false)} onClick={() => socket.emit("shop:resume", {})}>Resume</button>
            <button style={{ ...btn(true), background: "#b91c1c" }} onClick={() => socket.emit("shop:stop", {})}>Stop</button>
            <input style={input} placeholder="Interject manual (contoh: stok tinggal 3!)" value={interject} onChange={(e) => setInterject(e.target.value)} />
            <button style={btn(false)} onClick={() => { if (interject.trim()) { socket.emit("shop:interject", { text: interject.trim() }); setInterject(""); } }}>Hantar</button>
          </div>
          <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
            {(shop.items || []).map((it: any, i: number) => (
              <div key={i} style={{ color: it.status === "SPOKEN" ? "#6b7280" : "#e5e7eb", marginBottom: 4 }}>
                [{it.type}] {it.status} — {String(it.text || "").slice(0, 90)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div style={panel}>
          <b>Studio Preview</b>
          <iframe title="lyrics" src={"http://" + (typeof window !== "undefined" ? window.location.hostname : "localhost") + ":4002/"}
            style={{ width: "100%", height: 260, border: "1px solid #1f2937", borderRadius: 8, background: "#000", marginTop: 10 }} />
        </div>

        <div style={panel}>
          <b>AI Responses</b>
          <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto", fontSize: 12 }}>
            {responses.length === 0 && <span style={{ color: "#6b7280" }}>tiada response lagi</span>}
            {[...responses].reverse().map((r, i) => (
              <div key={i} style={{ marginBottom: 8, background: "#1f2937", padding: 8, borderRadius: 6 }}>
                <span style={{ color: "#fbbf24" }}>[{r.type}]</span> <span style={{ color: "#9ca3af" }}>→ {r.targetUser}</span>
                <div>{String(r.content || "").slice(0, 140)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={panel}>
          <b>Live Chat + Policy Firewall</b>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...btn(true), background: "#16a34a" }} onClick={() => socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_user", text: "assalamualaikum, cantik live ni!" })}>Test 1: Chit-chat selamat</button>
            <button style={{ ...btn(true), background: "#7c3aed" }} onClick={() => socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_en", text: "hello host, you look great today!" })}>Test EN: English reply</button>
            <button style={{ ...btn(true), background: "#2563eb" }} onClick={() => socket.emit(WS_EVENTS.GIFT_RECEIVED, { username: "test_user", giftName: "Heart Me", giftValue: 1 })}>Test Gift</button>
            <button style={btn(false)} onClick={() => socket.emit("test:join", {})}>Test Join</button>
            <button style={btn(false)} onClick={() => socket.emit("cache:clear", {})}>Clear Cache</button>
          </div>
          <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
            {[...comments].reverse().map((c, i) => (
              <div key={i} style={{ marginBottom: 4 }}><b style={{ color: "#4ade80" }}>{c.username}:</b> {c.text}</div>
            ))}
          </div>
          {approvals.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ color: "#fbbf24" }}>⚠️ Perlukan approval:</b>
              {approvals.map((a: any) => (
                <div key={a.id} style={{ background: "#78350f", padding: 8, borderRadius: 6, marginTop: 6, fontSize: 12 }}>
                  {a.triggeredText || a.text}
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <button style={{ ...btn(true), background: "#16a34a", padding: "4px 10px", fontSize: 11 }} onClick={() => { socket.emit(WS_EVENTS.APPROVAL_DECISION, { id: a.id, decision: "approved" }); setApprovals((p) => p.filter((x) => x.id !== a.id)); }}>Lulus</button>
                    <button style={{ ...btn(true), background: "#b91c1c", padding: "4px 10px", fontSize: 11 }} onClick={() => { socket.emit(WS_EVENTS.APPROVAL_DECISION, { id: a.id, decision: "rejected" }); setApprovals((p) => p.filter((x) => x.id !== a.id)); }}>Tolak</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {violations.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#f87171" }}>
              {violations.slice(-3).map((v: any, i: number) => (<div key={i}>🚫 {v.rule || v.type}: {String(v.text || "").slice(0, 60)}</div>))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}