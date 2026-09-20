"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket = typeof window !== "undefined"
  ? io(window.location.protocol + "//" + window.location.hostname + ":4000", { query: { overlay: "1" } })
  : ({} as any);

type Burst = { id: number; user: string; gift: string; kind: string };

function giftKind(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("rose")) return "rose";
  if (n.includes("lion")) return "lion";
  if (n.includes("galaxy")) return "galaxy";
  if (n.includes("clap")) return "clap";
  return "heart";
}

const KIND_EMOJI: Record<string, string> = { heart: "🧡", rose: "🌹", lion: "🦁", galaxy: "🌌", clap: "👏" };
const KIND_COLOR: Record<string, string> = { heart: "#fb923c", rose: "#f43f5e", lion: "#facc15", galaxy: "#a78bfa", clap: "#4ade80" };
const PC_TARGET = 100;

export default function OverlayPage() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [caption, setCaption] = useState("");
  const [pcCount, setPcCount] = useState(0);
  const [activated, setActivated] = useState(false);
  const [bg, setBg] = useState("transparent");
  const idRef = useRef(0);
  const captionTimer = useRef<any>(null);

  const pushBurst = (user: string, gift: string, value: number) => {
    const kind = giftKind(gift);
    const id = ++idRef.current;
    setActivated(true);
    setBursts((p) => [...p.slice(-3), { id, user, gift, kind }]);
    if (kind === "heart") setPcCount((c) => c + Math.max(1, value || 1));
    setTimeout(() => setBursts((p) => p.filter((b) => b.id !== id)), 4200);
  };

  const pushCaption = (text: string) => {
    setCaption(text);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(""), 7000);
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("bg") === "green") setBg("#00ff00");

    const onGift = (d: any) => pushBurst(d.username || "viewer", d.giftName || "Gift", d.giftValue || 1);
    const onAi = (d: any) => { if (d && d.content) pushCaption(String(d.content)); };
    socket.on("gift:visual", onGift);
    socket.on(WS_EVENTS.AI_RESPONSE_READY, onAi);

    let testTimer: any = null;
    if (q.get("test") === "1") {
      const users = ["TOK JANGGUT REMBAU", "Syaedora", "MKhaidil86", "QRIDA MIESHA"];
      const gifts = ["Heart Me", "Rose", "Lion", "Galaxy", "Clap Clap"];
      let i = 0;
      testTimer = setInterval(() => {
        pushBurst(users[i % users.length], gifts[i % gifts.length], 1);
        if (i % 2 === 0) pushCaption("Terima kasih member sebab support live ni, appreciate sangat!");
        i++;
      }, 3500);
    }
    return () => {
      if (testTimer) clearInterval(testTimer);
      socket.off("gift:visual", onGift);
      socket.off(WS_EVENTS.AI_RESPONSE_READY, onAi);
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: bg, overflow: "hidden", pointerEvents: "none", fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes ovPop { 0% { transform: scale(0) translateY(40px); opacity: 0; } 25% { transform: scale(1.3) translateY(0); opacity: 1; } 45% { transform: scale(1); } 80% { opacity: 1; } 100% { transform: scale(1.05) translateY(-60px); opacity: 0; } }
        @keyframes ovFloat { 0% { transform: translateY(0) scale(.6); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-220px) scale(1.1); opacity: 0; } }
        @keyframes ovSpin { 0% { transform: rotate(0deg) scale(.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: rotate(360deg) scale(1.2); opacity: 0; } }
        @keyframes ovSlide { 0% { transform: translateX(-50%) translateY(30px); opacity: 0; } 10% { transform: translateX(-50%) translateY(0); opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>

      {activated && (
        <div style={{ position: "absolute", top: 16, right: 16, width: 260, background: "rgba(0,0,0,.55)", border: "2px solid #fb923c", borderRadius: 14, padding: "8px 12px", color: "#fff" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🧡 PC Hari Ni: {pcCount}/{PC_TARGET}</div>
          <div style={{ marginTop: 6, height: 10, background: "rgba(255,255,255,.2)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (pcCount / PC_TARGET) * 100)}%`, background: "linear-gradient(90deg,#fb923c,#f43f5e)", transition: "width .5s" }} />
          </div>
        </div>
      )}

      {bursts.map((b, idx) => (
        <div key={b.id} style={{ position: "absolute", left: "50%", top: `${34 + idx * 13}%`, transform: "translate(-50%,-50%)", textAlign: "center", animation: b.kind === "galaxy" ? "ovSpin 4s ease-out forwards" : "ovPop 4s ease-out forwards", zIndex: 5 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <div style={{ fontSize: 110, lineHeight: 1, filter: "drop-shadow(0 0 18px " + KIND_COLOR[b.kind] + ")" }}>{KIND_EMOJI[b.kind]}</div>
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} style={{ position: "absolute", left: `${-30 + k * 30}%`, top: 0, fontSize: 30, animation: `ovFloat 2.4s ease-out ${k * 0.25}s forwards`, opacity: 0 }}>{KIND_EMOJI[b.kind]}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "inline-block", background: "rgba(0,0,0,.65)", border: `2px solid ${KIND_COLOR[b.kind]}`, color: "#fff", borderRadius: 999, padding: "6px 18px", fontSize: 20, fontWeight: 800 }}>
            {b.user}
          </div>
          <div style={{ marginTop: 4, color: KIND_COLOR[b.kind], fontSize: 16, fontWeight: 700, textShadow: "0 1px 4px #000" }}>{b.gift}!</div>
        </div>
      ))}

      {caption && (
        <div style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", maxWidth: "80%", background: "rgba(0,0,0,.65)", color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 22, fontWeight: 600, textAlign: "center", animation: "ovSlide 7s ease-out forwards", textShadow: "0 1px 3px #000", whiteSpace: "normal" }}>
          {caption}
        </div>
      )}
    </div>
  );
}