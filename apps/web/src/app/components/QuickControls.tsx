"use client";

// ✅ BATIA QuickControls v8.63 - floating control bar untuk dashboard
// Hanya muncul di pathname "/" (dashboard) - overlay green screen tetap bersih

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { io } from "socket.io-client";

function btn(bg: string): CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export default function QuickControls() {
  const [show, setShow] = useState(false);
  const [sock, setSock] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return; // ✅ dashboard sahaja
    setShow(true);
    // ✅ query overlay:1 = tak kacau audio sink dashboard
    const s = io(window.location.protocol + "//" + window.location.hostname + ":4000", {
      query: { overlay: "1" },
    });
    setSock(s);
    return () => { s.disconnect(); };
  }, []);

  if (!show) return null;

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 1500);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(15,23,42,0.92)",
        border: "1px solid #334155",
        borderRadius: 999,
        padding: "8px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <button
        onClick={() => { sock?.emit("music:skip"); flash("⏭️ Skip!"); }}
        style={btn("#ef4444")}
      >
        Skip
      </button>
      <button
        onClick={() => { sock?.emit("lyrics:offset", { delta: -500 }); flash("⚡ Lirik cepat -0.5s"); }}
        style={btn("#475569")}
      >
        Lirik cepat -0.5s
      </button>
      <button
        onClick={() => { sock?.emit("lyrics:offset", { delta: 500 }); flash("🐢 Lirik lambat +0.5s"); }}
        style={btn("#475569")}
      >
        Lirik lambat +0.5s
      </button>
      {msg && (
        <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, marginLeft: 4 }}>
          {msg}
        </span>
      )}
    </div>
  );
}