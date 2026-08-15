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
    socket.on(WS_EVENTS.COMMENT_LOG, (d: any) => setComments((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.POLICY_VIOLATION, (d: any) => setViolations((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.APPROVAL_REQUEST, (d: any) => setApprovals((p) => [d, ...p].slice(0, 10)));
    socket.on(WS_EVENTS.AI_RESPONSE_READY, (d: any) => {
      setResponses((p) => [d, ...p].slice(0, 20));
      if (d.audioUrl && soundRef.current && d.audioFor === socket.id) {
        audioQueue.current.push(d.audioUrl);
        playNext();
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  const send = (text: string) => socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_user", text });

  const changeMode = (m: string) => {
    setMode(m);
    socket.emit(WS_EVENTS.MODE_CHANGED, { mode: m });
  };

  const changeVoice = (v: string) => {
    setVoice(v);
    socket.emit(WS_EVENTS.VOICE_CHANGED, { voice: v });
  };

  const toggleSound = () => {
    soundRef.current = !soundRef.current;
    setSoundOn(soundRef.current);
    if (!soundRef.current) audioQueue.current = [];
  };

  const decide = (id: string, decision: string, finalText: string, username: string) => {
    socket.emit(WS_EVENTS.APPROVAL_DECISION, { id, decision, finalText, username });
    setApprovals((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">BATIA OS</h1>
        <div className="flex gap-2">
          <button onClick={() => changeVoice("ms-MY-YasminNeural")} className={"px-3 py-2 rounded " + (voice === "ms-MY-YasminNeural" ? "bg-pink-600" : "bg-gray-800")}>
            YASMIN
          </button>
          <button onClick={() => changeVoice("ms-MY-OsmanNeural")} className={"px-3 py-2 rounded " + (voice === "ms-MY-OsmanNeural" ? "bg-pink-600" : "bg-gray-800")}>
            OSMAN
          </button>
          <button onClick={toggleSound} className={"px-3 py-2 rounded " + (soundOn ? "bg-green-600" : "bg-gray-800")}>
            {soundOn ? "SUARA ON" : "SUARA OFF"}
          </button>
          <button onClick={claimAudio} className="px-3 py-2 rounded bg-purple-700" title="Klik pada peranti yang akan keluarkan suara">
            SPEAKER: {speaker}
          </button>
          <button onClick={() => changeMode("REGULAR")} className={"px-4 py-2 rounded " + (mode === "REGULAR" ? "bg-blue-600" : "bg-gray-800")}>
            REGULAR LIVE
          </button>
          <button onClick={() => changeMode("SHOPPABLE")} className={"px-4 py-2 rounded " + (mode === "SHOPPABLE" ? "bg-red-600" : "bg-gray-800")}>
            SHOPPABLE LIVE
          </button>
        </div>
      </header>
      <div className="mb-6 bg-gray-900 rounded p-4 flex items-center gap-3">
        <span className="text-sm font-semibold">TikTok Live:</span>
        <input value={ttUser} onChange={(e) => setTtUser(e.target.value)} placeholder="username TikTok (tanpa @)" className="bg-gray-800 rounded px-3 py-2 text-sm flex-1" />
        <button onClick={connectTikTok} className="bg-rose-600 px-4 py-2 rounded text-sm">CONNECT LIVE</button>
        <button onClick={disconnectTikTok} className="bg-gray-700 px-4 py-2 rounded text-sm">DISCONNECT</button>
        <span className={"text-xs px-2 py-1 rounded " + (ttStatus.startsWith("CONNECTED") ? "bg-green-700" : "bg-gray-700")}>{ttStatus}</span>
      </div>
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

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded p-4">
          <h2 className="font-semibold mb-3">Studio Preview</h2>
          <div className="aspect-[9/16] bg-gray-800 rounded flex items-center justify-center text-gray-500">
            Avatar / Video Feed
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
            <button onClick={() => send(rnd(qMs))} className="bg-green-700 rounded px-3 py-2 text-sm text-left">
              Test 1: Chit-chat selamat
            </button>
            <button onClick={() => send(rnd(qEn))} className="bg-purple-700 rounded px-3 py-2 text-sm text-left">
              Test EN: English reply            </button>
            <button onClick={() => send(rnd(qHarga))} className="bg-blue-700 rounded px-3 py-2 text-sm text-left">
              Test 2: Soalan harga
            </button>
            <button onClick={() => send(rnd(qBad))} className="bg-red-700 rounded px-3 py-2 text-sm text-left">
              Test 3: VIOLATION engagement bait
            </button>
            <button onClick={() => send("Bagi gift lion sikit bang!")} className="bg-red-700 rounded px-3 py-2 text-sm text-left">
              Test 4: VIOLATION begging gift
            </button>
            <button onClick={() => send("Berapa harga serum vitamin C?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">
              SHOP 1: Harga serum
            </button>
            <button onClick={() => send("Ada tudung warna pink tak?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">
              SHOP 2: Stok tudung pink
            </button>
            <button onClick={() => send("Minyak wangi oud set berapa?")} className="bg-amber-700 rounded px-3 py-2 text-sm text-left">
              SHOP 3: Harga set wangi
            </button>
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
                  <button onClick={() => decide(a.id, "approved", a.draft, a.username)} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded">
                    LULUSKAN
                  </button>
                  <button onClick={() => decide(a.id, "rejected", a.draft, a.username)} className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded">
                    TOLAK
                  </button>
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









