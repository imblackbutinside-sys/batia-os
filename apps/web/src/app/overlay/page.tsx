"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket: any = typeof window !== "undefined"
  ? io(window.location.protocol + "//" + window.location.hostname + ":4000", { query: { overlay: "1" } })
  : null;

type Burst = { id: number; emoji: string; label: string; user: string; x: number; y: number };

const GIFT_MAP: Record<string, { emoji: string; label: string }> = {
  "heart me": { emoji: "🧡", label: "Heart Me" },
  "rose": { emoji: "🌹", label: "Rose" },
  "tiktok": { emoji: "🎵", label: "TikTok" },
  "perfume": { emoji: "🧴", label: "Perfume" },
  "donut": { emoji: "🍩", label: "Donut" },
  "ice cream": { emoji: "🍦", label: "Ice Cream" },
  "corgi": { emoji: "🐶", label: "Corgi" },
  "panda": { emoji: "🐼", label: "Panda" },
  "lion": { emoji: "🦁", label: "Lion" },
  "eagle": { emoji: "🦅", label: "Eagle" },
  "galaxy": { emoji: "🌌", label: "Galaxy" },
  "universe": { emoji: "🪐", label: "Universe" },
};

const PC_TARGET = 50;

export default function OverlayPage() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [caption, setCaption] = useState("");
  const [pc, setPc] = useState(0);
  const [green, setGreen] = useState(false);
  const idRef = useRef(1);
  const capTimer = useRef<any>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setGreen(q.get("bg") === "green");

    const onGift = (d: any) => {
      const key = String(d.giftName || "").toLowerCase();
      const g = GIFT_MAP[key] || { emoji: "🎁", label: d.giftName || "Gift" };
      const isPC = key.includes("heart") || key.includes("pc") || key.includes("punch");
      if (isPC) setPc((p) => p + 1);
      const id = idRef.current++;
      const b: Burst = {
        id, emoji: g.emoji, label: g.label, user: d.username || "",
        x: 8 + Math.random() * 84, y: 12 + Math.random() * 62,
      };
      setBursts((p) => [...p.slice(-11), b]);
      setTimeout(() => setBursts((p) => p.filter((x) => x.id !== id)), 2600);
    };

    const onResp = (d: any) => {
      setCaption(String(d.content || ""));
      if (capTimer.current) clearTimeout(capTimer.current);
      capTimer.current = setTimeout(() => setCaption(""), 6000);
    };

    socket.on("gift:visual", onGift);
    socket.on(WS_EVENTS.AI_RESPONSE_READY, onResp);
    return () => {
      socket.off("gift:visual", onGift);
      socket.off(WS_EVENTS.AI_RESPONSE_READY, onResp);
      if (capTimer.current) clearTimeout(capTimer.current);
    };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none",
      background: green ? "#00ff00" : "transparent",
      fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes burstIn { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 30% { transform: scale(1.25) rotate(6deg); opacity: 1; } 55% { transform: scale(1) rotate(0deg); opacity: 1; } 100% { transform: scale(1.05) translateY(-30px); opacity: 0; } }
        @keyframes capIn { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .giftBurst { position: absolute; text-align: center; animation: burstIn 2.6s ease forwards; }
        .giftEmoji { font-size: 90px; display: block; filter: drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
        .giftLabel { color: #fff; font-weight: 900; font-size: 20px; text-shadow: 0 2px 6px #000; }
        .giftUser { color: #fbbf24; font-weight: 700; font-size: 15px; text-shadow: 0 2px 6px #000; }
        .pcBox { position: absolute; top: 18px; right: 18px; background: rgba(0,0,0,.72); border: 3px solid #f97316; border-radius: 14px; padding: 12px 18px; color: #fff; min-width: 220px; }
        .pcBar { height: 12px; background: #374151; border-radius: 8px; overflow: hidden; margin-top: 8px; }
        .pcFill { height: 100%; background: linear-gradient(90deg, #f97316, #fbbf24); transition: width .4s; }
        .capBar { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); max-width: 80%; background: rgba(0,0,0,.78); border: 2px solid #22d3ee; border-radius: 999px; padding: 14px 34px; color: #fff; font-size: 26px; font-weight: 800; text-align: center; animation: capIn .35s ease; text-shadow: 0 2px 6px #000; }
      `}</style>

      {bursts.map((b) => (
        <div key={b.id} className="giftBurst" style={{ left: b.x + "%", top: b.y + "%" }}>
          <span className="giftEmoji">{b.emoji}</span>
          <div className="giftLabel">{b.label}</div>
          <div className="giftUser">{b.user}</div>
        </div>
      ))}

      {pc > 0 && (
        <div className="pcBox">
          <div style={{ fontWeight: 900, fontSize: 18 }}>🧡 PUNCH CARD: {pc} / {PC_TARGET}</div>
          <div className="pcBar"><div className="pcFill" style={{ width: Math.min(100, (pc / PC_TARGET) * 100) + "%" }} /></div>
        </div>
      )}

      {caption && <div className="capBar">🎤 {caption}</div>}
    </div>
  );
}