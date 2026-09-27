"use client";

// ✅ BATIA Gift Overlay v8.70 - GIFT SAHAJA (lirik kekal di :4002 secara asing)
// - luma key max-channel (background hitam dibuang, warna solid)
// - auto-resume + retry (Chrome power-save AbortError)
// - hybrid draw loop (jalan walau window occluded)
// - tiada card/border, tiada lirik - hanya effect transparent

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

interface GiftEvent { id: number; username: string; giftName: string; giftValue: number; }
interface ActiveEffect { id: number; tier: 1 | 2 | 3; kind: "luma" | "alpha" | "confetti"; src?: string; gift: GiftEvent; }

function tierFor(giftName: string, value: number): 1 | 2 | 3 {
  const n = giftName.toLowerCase();
  if (value >= 1000 || /rocket|universe|interstellar|sports car|tiktok universe/.test(n)) return 3;
  if (value >= 100 || /lion|crown|money gun|perfume|corgi/.test(n)) return 2;
  return 1;
}

// ========== LUMA KEY CANVAS (buang background hitam) ==========
function LumaKeyVideo({ src, onDone }: { src: string; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let raf = 0;
    let iv: any = null;
    let running = true;
    let sized = false;

    const size = () => {
      if (!video.videoWidth) return;
      const scale = Math.min(0.5, 420 / video.videoWidth);
      canvas.width = Math.max(2, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(2, Math.floor(video.videoHeight * scale));
      sized = true;
    };

    const drawOnce = () => {
      if (!running || video.readyState < 2) return;
      if (!sized) size();
      if (!sized) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // max-channel key: merah/biru saturated kekal SOLID, hitam dibuang
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
        let a = (m - 24) / (80 - 24);
        if (a < 0) a = 0;
        if (a > 1) a = 1;
        d[i + 3] = (a * 255) | 0;
      }
      ctx.putImageData(img, 0, 0);
    };

    // hybrid: rAF bila visible, interval bila occluded
    const loop = () => { if (!running) return; drawOnce(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    iv = setInterval(drawOnce, 33);

    const end = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      clearInterval(iv);
      console.log("[GIFT FX] ✅ effect selesai:", src);
      onDone();
    };

    video.addEventListener("loadedmetadata", size);
    video.addEventListener("ended", end);
    video.addEventListener("error", end);
    // auto-resume bila Chrome pause untuk power saving
    video.addEventListener("pause", () => {
      if (!running) return;
      video.play().catch(() => {});
    });

    // force muted via property (React muted prop tak reliable)
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    // retry play bila AbortError
    const tryPlay = (attempt = 0) => {
      if (!running) return;
      video.play().then(() => {
        console.log("[GIFT FX] ▶ play:", src);
      }).catch((e: any) => {
        if (!running) return;
        if (e?.name === "AbortError" && attempt < 12) {
          setTimeout(() => tryPlay(attempt + 1), 400);
        } else {
          console.log("[GIFT FX] ❌ play reject:", e?.name, e?.message);
          end();
        }
      });
    };
    tryPlay();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [src, onDone]);

  return (
    <>
      <video ref={videoRef} src={src} playsInline style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", pointerEvents: "none", zIndex: 20,
        }}
      />
    </>
  );
}

// ========== ALPHA WEBM (transparent native) ==========
function AlphaVideo({ src, onDone }: { src: string; onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
    v.addEventListener("pause", () => { v.play().catch(() => {}); });
    const tryPlay = (attempt = 0) => {
      v.play().then(() => console.log("[GIFT FX] ▶ play (alpha):", src)).catch((e: any) => {
        if (e?.name === "AbortError" && attempt < 12) setTimeout(() => tryPlay(attempt + 1), 400);
        else onDone();
      });
    };
    tryPlay();
  }, [src, onDone]);
  return (
    <video
      ref={ref}
      src={src}
      playsInline
      onEnded={onDone}
      onError={onDone}
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%",
        objectFit: "contain", pointerEvents: "none", zIndex: 20,
      }}
    />
  );
}

// ========== FALLBACK CONFETTI (bila folder tier kosong) ==========
function ConfettiBurst({ tier }: { tier: 1 | 2 | 3 }) {
  const count = tier === 3 ? 60 : tier === 2 ? 30 : 12;
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.6 + Math.random() * 1.6,
      size: 6 + Math.random() * 10,
      color: ["#fbbf24", "#fff", "#f472b6", "#22d3ee", "#a3e635"][i % 5],
      rot: Math.random() * 360,
    }))
  ).current;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 20, overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute", top: "-20px", left: p.left + "%",
            width: p.size, height: p.size, background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `confFall ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ========== MAIN GIFT OVERLAY ==========
export default function OverlayPage() {
  const [bgColor, setBgColor] = useState("#00ff00");
  const [effect, setEffect] = useState<ActiveEffect | null>(null);

  const effectRef = useRef<ActiveEffect | null>(null);
  const queueRef = useRef<GiftEvent[]>([]);
  const cacheRef = useRef<{ at: number; data: Record<string, string[]> }>({
    at: 0,
    data: { tier1: [], tier2: [], tier3: [] },
  });

  async function getEffects(): Promise<Record<string, string[]>> {
    const now = Date.now();
    if (now - cacheRef.current.at < 30000) return cacheRef.current.data;
    try {
      const res = await fetch("/api/effects?t=" + now);
      const data = await res.json();
      cacheRef.current = { at: now, data };
      return data;
    } catch (e) {
      return cacheRef.current.data;
    }
  }

  function finishCurrent(id: number) {
    if (effectRef.current && effectRef.current.id === id) {
      effectRef.current = null;
      setEffect(null);
      const next = queueRef.current.shift();
      if (next) void launch(next);
    }
  }

  async function launch(g: GiftEvent) {
    const tier = tierFor(g.giftName, g.giftValue);
    const list = await getEffects();
    const files = list["tier" + tier] || [];
    if (files.length === 0) {
      console.log("[GIFT FX] ⚠️ tier" + tier + " kosong - confetti fallback");
      const act: ActiveEffect = { id: g.id, tier, kind: "confetti", gift: g };
      effectRef.current = act;
      setEffect(act);
      setTimeout(() => finishCurrent(g.id), 4200);
      return;
    }
    const src = files[Math.floor(Math.random() * files.length)];
    const kind: "luma" | "alpha" = src.toLowerCase().endsWith(".webm") ? "alpha" : "luma";
    console.log("[GIFT FX] 🎬 launch tier" + tier + ":", src);
    const act: ActiveEffect = { id: g.id, tier, kind, src, gift: g };
    effectRef.current = act;
    setEffect(act);
  }

  function onGift(g: GiftEvent) {
    console.log("[GIFT FX] 🎁 gift diterima:", g.giftName, g.giftValue);
    const tier = tierFor(g.giftName, g.giftValue);
    if (tier === 3) {
      queueRef.current = [];
      effectRef.current = null;
      setEffect(null);
      void launch(g);
    } else if (!effectRef.current) {
      void launch(g);
    } else if (queueRef.current.length < 3) {
      queueRef.current.push(g);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const bg = q.get("bg");
    if (bg === "blue") setBgColor("#0000ff");
    else if (bg === "transparent" || bg === "none") setBgColor("transparent");
    else setBgColor("#00ff00");

    const socket: any = io(window.location.protocol + "//" + window.location.hostname + ":4000", {
      query: { overlay: "1" },
    });
    socket.on("connect", () => console.log("[GIFT OVERLAY] ✅ socket :4000 connected"));
    socket.on("gift:visual", (d: any) => {
      onGift({
        id: Date.now() + Math.random(),
        username: d?.username || "Viewer",
        giftName: d?.giftName || "Gift",
        giftValue: d?.giftValue || 0,
      });
    });

    // Debug direct: /overlay?bg=green&fx=/effects/tier1/HeartMe.mp4
    const fx = q.get("fx");
    if (fx) {
      setTimeout(() => {
        console.log("[GIFT FX] 🧪 debug direct play:", fx);
        const act: ActiveEffect = {
          id: Date.now(),
          tier: 1,
          kind: fx.toLowerCase().endsWith(".webm") ? "alpha" : "luma",
          src: fx,
          gift: { id: 1, username: "debug", giftName: "debug", giftValue: 0 },
        };
        effectRef.current = act;
        setEffect(act);
      }, 300);
    }

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: bgColor, overflow: "hidden", userSelect: "none" }}>
      <style>{`
        nextjs-portal { display: none !important; }
        @keyframes confFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.2; }
        }
      `}</style>

      {effect && effect.kind === "luma" && effect.src && (
        <LumaKeyVideo src={effect.src} onDone={() => finishCurrent(effect.id)} />
      )}
      {effect && effect.kind === "alpha" && effect.src && (
        <AlphaVideo src={effect.src} onDone={() => finishCurrent(effect.id)} />
      )}
      {effect && effect.kind === "confetti" && <ConfettiBurst tier={effect.tier} />}

      {effect && effect.tier === 3 && (
        <div style={{ position: "fixed", bottom: "10%", left: "50%", transform: "translateX(-50%)", zIndex: 30, textAlign: "center", pointerEvents: "none" }}>
          <div style={{ color: "#fbbf24", fontSize: 34, fontWeight: 900, textShadow: "0 3px 12px #000, 0 0 30px rgba(251,191,36,.8)", whiteSpace: "nowrap" }}>
            @{effect.gift.username}
          </div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, textShadow: "0 2px 8px #000", marginTop: 4, textTransform: "uppercase", letterSpacing: 2 }}>
            {effect.gift.giftName}
          </div>
        </div>
      )}
    </div>
  );
}