"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Stats = { viewers: number; totalLikes: number; comments: number; gifts: number };
type ChatMsg = { username: string; text: string; platform: string; id: string; time: string };
type AIResponse = { type: string; content: string; targetUser: string; id: string; audioUrl?: string };
type Song = { q: string; by: string; id: string };
type PendingApproval = { id: string; username: string; text: string; timestamp: Date };
type Violation = { id: string; username: string; text: string; reason: string; timestamp: Date };

export default function BatiaStreamingDashboard() {
  const [status, setStatus] = useState<"OFFLINE" | "LIVE">("OFFLINE");
  const [streamTime, setStreamTime] = useState("00:00:00");
  const [tiktokUsername, setTiktokUsername] = useState("mohd_bakhtiar1979");
  const [stats, setStats] = useState<Stats>({ viewers: 0, totalLikes: 0, comments: 0, gifts: 0 });
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [aiLogs, setAiLogs] = useState<AIResponse[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<string | null>(null);
  const [voice, setVoice] = useState<"YASMIN" | "OSMAN">("YASMIN");
  const [voiceOn, setVoiceOn] = useState(true);
  const [mode, setMode] = useState<"REGULAR" | "SHOPPABLE">("REGULAR");
  const [productDesc, setProductDesc] = useState("Earbuds Bluetooth 5.3");
  const [sellingPoints, setSellingPoints] = useState("Bluetooth 5.3\nBattery 24 jam");
  const [productPrice, setProductPrice] = useState("RM59");
  const [couponCode, setCouponCode] = useState("BATIA59");
  const [voiceStyle, setVoiceStyle] = useState("Casual");
  const [pauseMin, setPauseMin] = useState(3);
  const [pauseMax, setPauseMax] = useState(4);
  const [productSaved, setProductSaved] = useState(false);
  const [musicInput, setMusicInput] = useState("");
  const [ttsVolume, setTtsVolume] = useState(85);
  const [musicVolume, setMusicVolume] = useState(75);
  const [autoTapActive, setAutoTapActive] = useState(false);
  const [autoTapCount, setAutoTapCount] = useState(0);
  const [showTestMenu, setShowTestMenu] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [wsStatus, setWsStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED">("DISCONNECTED");
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setWsStatus("CONNECTING");
    const newSocket = io("http://localhost:4000", { reconnection: true, reconnectionDelay: 3000 });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setWsStatus("CONNECTED");
      setStatus("LIVE");
      newSocket.emit("AUDIO_CLAIM", { label: "LAPTOP_SPEAKER" });
    });

    newSocket.on("disconnect", () => {
      setWsStatus("DISCONNECTED");
      setStatus("OFFLINE");
    });

    newSocket.on("LIVE_STATS", (data: Stats) => setStats(data));
    newSocket.on("COMMENT_LOG", (data: ChatMsg) => {
      setChat(prev => [{ ...data, id: Math.random().toString(36), time: "Now" }, ...prev].slice(0, 50));
    });
    newSocket.on("AI_RESPONSE_READY", (data: AIResponse) => {
      setAiLogs(prev => [{ ...data, id: Math.random().toString(36) }, ...prev].slice(0, 15));
      if (data.audioUrl && voiceOn && audioRef.current) {
        audioRef.current.src = data.audioUrl;
        audioRef.current.volume = ttsVolume / 100;
        audioRef.current.play().catch(() => {});
      }
    });
    newSocket.on("music:queue", (data: Song[]) => setQueue(data));
    newSocket.on("music:status", (data: any) => {
      if (data.state === "PLAYING" && data.url && musicAudioRef.current) {
        setCurrentSong(data.q);
        const fullUrl = data.url.startsWith("http") ? data.url : "http://localhost:4000" + data.url;
        musicAudioRef.current.src = fullUrl;
        musicAudioRef.current.volume = musicVolume / 100;
        musicAudioRef.current.play().catch(() => {});
      } else if ((data.state === "STOPPED" || data.state === "SKIPPED" || data.state === "FAILED") && musicAudioRef.current) {
        setCurrentSong(null);
        musicAudioRef.current.pause();
        musicAudioRef.current.src = "";
      } else if (data.state === "FETCHING") {
        setCurrentSong(data.q);
      }
    });
    newSocket.on("autoTap:status", (data: any) => {
      setAutoTapActive(data.enabled || false);
      setAutoTapCount(data.count || 0);
    });
    newSocket.on("POLICY_VIOLATION", (data: any) => {
      setViolations(prev => [{ id: Math.random().toString(36), username: data.username || "unknown", text: data.text || "", reason: data.reason || "Policy", timestamp: new Date() }, ...prev].slice(0, 20));
    });
    newSocket.on("APPROVAL_REQUEST", (data: any) => {
      setPendingApprovals(prev => [{ id: Math.random().toString(36), username: data.username || "unknown", text: data.text || "", timestamp: new Date() }, ...prev].slice(0, 10));
    });

    return () => { newSocket.disconnect(); };
  }, [voiceOn, ttsVolume, musicVolume]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (status === "LIVE") {
        const now = new Date();
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const diff = now.getTime() - start.getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setStreamTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const emit = (event: string, data?: any) => {
    if (socket && socket.connected) socket.emit(event, data);
  };

  const handleStartStream = () => { emit("TIKTOK_CONNECT", { username: tiktokUsername }); setStatus("LIVE"); };
  const handleEndStream = () => { emit("TIKTOK_DISCONNECT"); setStatus("OFFLINE"); };
  
  const handlePlayMusic = () => {
    if (musicInput.trim()) { emit("music:play", { q: musicInput }); setMusicInput(""); }
  };
  
  const handleSkipMusic = () => {
    emit("music:skip");
  };

  const handleStopMusic = () => {
    emit("music:stop");
    setCurrentSong(null);
    if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current.src = ""; }
  };

  const handleAutoTap = () => {
    emit("autoTap:toggle", { enabled: !autoTapActive });
    setAutoTapActive(!autoTapActive);
  };

  const handleVoiceChange = (newVoice: "YASMIN" | "OSMAN") => {
    setVoice(newVoice);
    const voiceMap = { YASMIN: "ms-MY-YasminNeural", OSMAN: "ms-MY-OsmanNeural" };
    emit("VOICE_CHANGED", { voice: voiceMap[newVoice] });
  };

  const handleModeChange = (newMode: "REGULAR" | "SHOPPABLE") => {
    setMode(newMode);
    emit("MODE_CHANGED", { mode: newMode });
  };

  const handleSaveProduct = () => {
    setProductSaved(true);
    emit("shop:config", { description: productDesc, sellingPoints: sellingPoints.split('\n'), promoValue: productPrice, promoCode: couponCode });
    setTimeout(() => setProductSaved(false), 3000);
  };

  const handleTestChat = (testType: string) => {
    const testMessages: Record<string, string> = {
      "safe": "Hi host, apa khabar?", "english": "Hello from overseas", "price": "Berapa harga produk ni?",
      "violation1": "Follow saya balik please!", "violation2": "Nak gift ni, boleh bagi tak?", 
      "shop1": "Berapa harga earbuds?", "shop2": "Battery tahan berapa lama?", "shop3": "Ada promo tak?", 
      "join": "penonton baru masuk", "music": "mainkan lagu sejati"
    };
    const message = testMessages[testType] || "test";
    
    if (testType === "price") {
      setPendingApprovals(prev => [{ id: Math.random().toString(36), username: "kawan", text: message, timestamp: new Date() }, ...prev]);
    }
    if (testType === "violation1" || testType === "violation2") {
      const violation = { id: Math.random().toString(36), username: "kawan", text: message, reason: testType === "violation1" ? "Engagement Bait" : "Begging for Gifts", timestamp: new Date() };
      setViolations(prev => [violation, ...prev]);
      emit("VIOLATION_DETECTED", { username: "kawan", text: message, reason: violation.reason });
    } else {
      emit("COMMENT_RECEIVED", { username: "kawan", text: message });
    }
    setShowTestMenu(false);
  };

  const handleApproveComment = (id: string) => {
    const item = pendingApprovals.find(p => p.id === id);
    if (item) {
      emit("APPROVAL_DECISION", { id: id, decision: "approved", finalText: item.text, username: item.username });
      setPendingApprovals(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleRejectComment = (id: string) => {
    emit("APPROVAL_DECISION", { id: id, decision: "rejected" });
    setPendingApprovals(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="h-screen bg-[#0f0f0f] text-white font-sans overflow-hidden flex flex-col">
      <audio ref={audioRef} style={{ display: 'none' }} />
      <audio ref={musicAudioRef} style={{ display: 'none' }} />

      <header className="h-14 bg-[#1a1a1a] border-b border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold">BATIA Live Stream</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-sm text-white/60">TikTok Live Control Panel</span>
          <div className={`ml-4 px-2 py-1 rounded text-[10px] font-bold ${wsStatus === 'CONNECTED' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            SOCKET: {wsStatus}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {status === "LIVE" && (
            <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/50 px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-red-400">{streamTime}</span>
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>Viewers: {stats.viewers}</span>
            <span>Likes: {stats.totalLikes}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-64 flex flex-col gap-4 shrink-0">
          <div className="bg-[#1a1a1a] rounded-lg border border-white/10 overflow-hidden">
            <div className="p-3 border-b border-white/10"><span className="text-sm font-semibold">Stream Mode</span></div>
            <div className="p-2 space-y-1">
              <button onClick={() => handleModeChange("REGULAR")} className={`w-full px-3 py-2 rounded text-sm ${mode === "REGULAR" ? "bg-blue-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>📺 REGULAR LIVE</button>
              <button onClick={() => handleModeChange("SHOPPABLE")} className={`w-full px-3 py-2 rounded text-sm ${mode === "SHOPPABLE" ? "bg-orange-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}> SHOPPABLE LIVE</button>
            </div>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-white/10 overflow-hidden flex-1 flex flex-col">
            <div className="p-3 border-b border-white/10"><span className="text-sm font-semibold">Voice & Auto Tap</span></div>
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              <div>
                <div className="text-xs text-white/40 mb-2">AI Voice (Backend)</div>
                <div className="flex gap-2">
                  <button onClick={() => handleVoiceChange("YASMIN")} className={`flex-1 text-xs font-bold py-1.5 rounded ${voice === "YASMIN" ? "bg-cyan-600 text-white" : "bg-white/5 text-white/60"}`}>YASMIN</button>
                  <button onClick={() => handleVoiceChange("OSMAN")} className={`flex-1 text-xs font-bold py-1.5 rounded ${voice === "OSMAN" ? "bg-pink-600 text-white" : "bg-white/5 text-white/60"}`}>OSMAN</button>
                </div>
              </div>
              <button onClick={() => setVoiceOn(!voiceOn)} className={`w-full text-xs font-bold py-2 rounded ${voiceOn ? "bg-green-600 text-white" : "bg-white/5 text-white/60"}`}>SUARA {voiceOn ? "ON" : "OFF"}</button>
              <div className="border-t border-white/10 my-2"></div>
              <div>
                <div className="flex justify-between items-center mb-2"><span className="text-xs text-white/40">Auto Tapper</span><span className="text-sm font-bold text-green-400">{autoTapCount} taps</span></div>
                <button onClick={handleAutoTap} className={`w-full text-xs font-bold py-2 rounded ${autoTapActive ? "bg-green-600 text-white" : "bg-white/5 text-white/60"}`}>{autoTapActive ? "STOP AUTO TAP" : "START AUTO TAP"}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 bg-[#1a1a1a] rounded-lg border border-white/10 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🎵</div>
                <p className="text-white/40 text-sm">TikTok Live Preview</p>
                <p className="text-white/20 text-xs mt-2">Connect to start streaming</p>
              </div>
            </div>
            {status === "LIVE" && (
              <div className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live
              </div>
            )}
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-white/10 p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-white/60 mb-2">TikTok Live</div>
                <input type="text" value={tiktokUsername} onChange={(e) => setTiktokUsername(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white mb-2" placeholder="Username" />
                <div className="flex gap-2">
                  {status === "OFFLINE" ? (
                    <button onClick={handleStartStream} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded">CONNECT</button>
                  ) : (
                    <button onClick={handleEndStream} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded">DISCONNECT</button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-white/60 mb-2">Stream Controls</div>
                {status === "OFFLINE" ? (
                  <button onClick={handleStartStream} className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-3 rounded-lg shadow-lg shadow-red-500/30">GO LIVE</button>
                ) : (
                  <button onClick={handleEndStream} className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-3 rounded-lg">END STREAM</button>
                )}
                <div className="grid grid-cols-2 gap-2">
                   <div className="bg-white/5 rounded p-2 text-center"><div className="text-[9px] text-white/40">VIEWERS</div><div className="text-sm font-bold text-white">{stats.viewers}</div></div>
                   <div className="bg-white/5 rounded p-2 text-center"><div className="text-[9px] text-white/40">LIKES</div><div className="text-sm font-bold text-pink-400">{stats.totalLikes}</div></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-xs font-semibold text-white/60 mb-2">Audio Mixer</div>
                <div className="space-y-2">
                  <div><div className="flex justify-between text-[10px] mb-1"><span className="text-white/60">TTS Volume</span><span className="text-white/40">{ttsVolume}%</span></div><input type="range" min="0" max="100" value={ttsVolume} onChange={(e) => setTtsVolume(parseInt(e.target.value))} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500" /></div>
                  <div><div className="flex justify-between text-[10px] mb-1"><span className="text-white/60">Music Volume</span><span className="text-white/40">{musicVolume}%</span></div><input type="range" min="0" max="100" value={musicVolume} onChange={(e) => setMusicVolume(parseInt(e.target.value))} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-80 bg-[#1a1a1a] rounded-lg border border-white/10 overflow-hidden flex flex-col shrink-0">
          <div className="flex-[0.25] flex flex-col border-b border-white/10 min-h-0">
            <div className="p-2 border-b border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Live Chat</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowTestMenu(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold px-2 py-1 rounded">🧪 Test Menu</button>
                  <span className="text-xs text-white/40">{chat.length} msgs</span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {chat.map((msg) => (<div key={msg.id} className="text-xs"><span className="text-purple-400 font-semibold">{msg.username}:</span><span className="text-white/80 ml-1">{msg.text}</span></div>))}
              {chat.length === 0 && <div className="text-center text-white/40 text-xs py-4">No messages yet...</div>}
            </div>
          </div>

          <div className="flex-[0.25] flex flex-col border-b border-white/10 min-h-0 bg-[#1a1410]">
            <div className="p-2 border-b border-white/10"><div className="flex items-center justify-between"><span className="text-sm font-semibold flex items-center gap-1"><span>⚠️</span> Approval Zone</span><span className="text-xs text-orange-400">{pendingApprovals.length} pending</span></div></div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {pendingApprovals.length === 0 ? (<div className="text-center text-white/40 text-[10px] py-4">Tiada komen menunggu kelulusan</div>) : (
                pendingApprovals.map((item) => (
                  <div key={item.id} className="bg-white/5 border border-orange-600/30 rounded p-2">
                    <div className="text-[10px] mb-1"><span className="text-orange-400 font-bold">{item.username}:</span><span className="text-white/80 ml-1">{item.text}</span></div>
                    <div className="flex gap-1">
                      <button onClick={() => handleApproveComment(item.id)} className="flex-1 bg-green-600/80 hover:bg-green-700 text-white text-[9px] font-bold py-1 rounded">✓ Approve</button>
                      <button onClick={() => handleRejectComment(item.id)} className="flex-1 bg-red-600/80 hover:bg-red-700 text-white text-[9px] font-bold py-1 rounded">✗ Reject</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-[0.2] flex flex-col border-b border-white/10 min-h-0 bg-[#1a0f0f]">
            <div className="p-2 border-b border-white/10"><div className="flex items-center justify-between"><span className="text-sm font-semibold flex items-center gap-1"><span>🚫</span> Violations</span><span className="text-xs text-red-400">{violations.length} total</span></div></div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {violations.length === 0 ? (<div className="text-center text-white/40 text-[10px] py-4">Tiada violation lagi</div>) : (
                violations.map((v) => (
                  <div key={v.id} className="bg-red-900/20 border border-red-800/50 rounded p-2 text-[10px]">
                    <div className="flex justify-between items-start mb-1"><span className="text-red-400 font-bold">{v.username}</span><span className="text-white/40 text-[8px]">{v.timestamp.toLocaleTimeString()}</span></div>
                    <p className="text-white/80 mb-1">{v.text}</p><p className="text-red-400 text-[8px]">Reason: {v.reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-[0.3] flex flex-col min-h-0">
            <div className="p-2 border-b border-white/10 bg-[#151515]">
              <input type="text" value={musicInput} onChange={(e) => setMusicInput(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handlePlayMusic()} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white mb-2" placeholder="Song title or URL" />
              <div className="flex gap-2">
                <button onClick={handlePlayMusic} className="flex-1 bg-green-600/80 hover:bg-green-700 text-white text-[10px] font-bold py-1.5 rounded">PLAY</button>
                <button onClick={handleSkipMusic} className="flex-1 bg-yellow-600/80 hover:bg-yellow-700 text-white text-[10px] font-bold py-1.5 rounded">SKIP (NEXT)</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {currentSong && (<div className="bg-green-900/20 border border-green-800/50 p-2 rounded text-[10px] mb-2"><span className="text-green-400 font-bold">NOW PLAYING:</span> {currentSong}</div>)}
              {aiLogs.map((log) => (<div key={log.id} className="bg-white/5 border-l-2 border-cyan-600 p-1.5 rounded text-[10px]"><span className="text-purple-400 font-bold">{log.type}</span><span className="text-white/80 ml-1 truncate block">{log.content}</span></div>))}
              {queue.map((song, idx) => (<div key={song.id || idx} className="bg-white/5 border-l-2 border-yellow-600 p-1.5 rounded text-[10px] flex justify-between"><span className="text-yellow-400 font-bold">#{idx + 1} {song.q}</span><span className="text-white/40">{song.by}</span></div>))}
              {aiLogs.length === 0 && queue.length === 0 && !currentSong && (<div className="text-center text-white/40 text-xs py-4">Waiting for activity...</div>)}
            </div>
          </div>
        </div>
      </div>

      {mode === "SHOPPABLE" && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2"><span>🛍️</span> Product Details</h2>
              <button onClick={() => handleModeChange("REGULAR")} className="text-white/60 hover:text-white text-2xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-cyan-400">Product Information</h3>
                <div><label className="text-sm text-white/60 block mb-2">Description</label><textarea value={productDesc} onChange={(e) => setProductDesc(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white h-24 resize-none" /></div>
                <div><label className="text-sm text-white/60 block mb-2">Selling Points</label><textarea value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white h-32 resize-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-sm text-white/60 block mb-2">Price</label><input type="text" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white" /></div>
                  <div><label className="text-sm text-white/60 block mb-2">Coupon</label><input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white" /></div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-purple-400">Voice Settings</h3>
                <div><label className="text-sm text-white/60 block mb-2">Voice Style</label><select value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"><option value="Casual">Casual</option><option value="Professional">Professional</option><option value="Energetic">Energetic</option><option value="Friendly">Friendly</option></select></div>
                <div>
                  <label className="text-sm text-white/60 block mb-2">Pause (saat)</label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3"><span className="text-sm text-white/60 w-8">Min</span><input type="range" min="1" max="10" value={pauseMin} onChange={(e) => setPauseMin(parseInt(e.target.value))} className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500" /><span className="text-sm text-white w-8 text-right">{pauseMin}</span></div>
                    <div className="flex items-center gap-3"><span className="text-sm text-white/60 w-8">Max</span><input type="range" min="1" max="10" value={pauseMax} onChange={(e) => setPauseMax(parseInt(e.target.value))} className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500" /><span className="text-sm text-white w-8 text-right">{pauseMax}</span></div>
                  </div>
                </div>
                <div className="pt-4">
                  <button onClick={handleSaveProduct} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">Save</button>
                  {productSaved && (<div className="mt-2 text-green-400 text-sm text-center">✓ Saved</div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTestMenu && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Test Menu</h3>
              <button onClick={() => setShowTestMenu(false)} className="text-white/60 hover:text-white text-2xl">×</button>
            </div>
            <div className="space-y-2">
              <button onClick={() => handleTestChat("safe")} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test 1: Chit-chat</button>
              <button onClick={() => handleTestChat("english")} className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test EN: English</button>
              <button onClick={() => handleTestChat("price")} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test: Soalan harga</button>
              <button onClick={() => handleTestChat("violation1")} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test: Violation 1</button>
              <button onClick={() => handleTestChat("violation2")} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test: Violation 2</button>
              <div className="border-t border-white/10 my-4"></div>
              <button onClick={() => handleTestChat("shop1")} className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">SHOP: Harga</button>
              <button onClick={() => handleTestChat("shop2")} className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">SHOP: Battery</button>
              <button onClick={() => handleTestChat("shop3")} className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">SHOP: Promo</button>
              <div className="border-t border-white/10 my-4"></div>
              <button onClick={() => handleTestChat("join")} className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test: Join</button>
              <button onClick={() => handleTestChat("music")} className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-3 px-4 rounded-lg text-left">Test: Music</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}