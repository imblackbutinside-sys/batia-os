"use client";

// ✅ BATIA Effects Manager v8.64 - drag&drop video gift dari folder Windows
// Hanya muncul di dashboard ("/"). Panel terapung, toggle butang 🎬

import { useEffect, useState } from "react";
import type { CSSProperties, DragEvent } from "react";

const TIERS: { id: string; label: string; hint: string }[] = [
  { id: "tier1", label: "🥉 Tier 1 — Kecik", hint: "Rose, Heart Me, PC (<100 coins)" },
  { id: "tier2", label: "🥈 Tier 2 — Medium", hint: "Lion, Crown, Money Gun (100-999)" },
  { id: "tier3", label: "🥇 Tier 3 — Besar", hint: "Rocket, Universe, Car (1000+)" },
];

const panel: CSSProperties = {
  position: "fixed", right: 16, bottom: 70, width: 380, maxHeight: "70vh", overflowY: "auto",
  zIndex: 9998, background: "rgba(15,23,42,0.97)", border: "1px solid #334155", borderRadius: 16,
  padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", fontFamily: "system-ui, sans-serif", color: "#e2e8f0",
};
const drop: CSSProperties = {
  border: "2px dashed #475569", borderRadius: 12, padding: "14px 10px", textAlign: "center",
  fontSize: 12, color: "#94a3b8", cursor: "pointer", background: "rgba(30,41,59,0.5)", marginBottom: 8,
};
const fab: CSSProperties = {
  position: "fixed", right: 16, bottom: 16, zIndex: 9999, width: 52, height: 52, borderRadius: 999,
  border: "1px solid #334155", background: "rgba(15,23,42,0.95)", fontSize: 24, cursor: "pointer",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
};

export default function EffectsManager() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [list, setList] = useState<Record<string, string[]>>({ tier1: [], tier2: [], tier3: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    setMounted(true);
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/effects?t=" + Date.now());
      setList(await r.json());
    } catch (e) {}
  }
  useEffect(() => { if (show) refresh(); }, [show]);

  async function upload(tier: string, files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);
    for (const f of arr) {
      const fd = new FormData();
      fd.append("tier", tier);
      fd.append("file", f);
      try {
        const r = await fetch("/api/effects/upload", { method: "POST", body: fd });
        const j = await r.json();
        setMsg(j.ok ? `✅ ${f.name} → ${tier}` : `❌ ${f.name}: ${j.error}`);
      } catch (e) { setMsg("❌ upload gagal: " + f.name); }
    }
    setBusy(false);
    refresh();
  }

  async function remove(tier: string, url: string) {
    const file = decodeURIComponent(url.split("/").pop() || "");
    try {
      const r = await fetch("/api/effects/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, file }),
      });
      const j = await r.json();
      setMsg(j.ok ? `🗑️ ${file} dibuang` : "❌ delete gagal");
    } catch (e) { setMsg("❌ delete gagal"); }
    refresh();
  }

  const onDrop = (tier: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    upload(tier, e.dataTransfer.files);
  };

  if (!mounted) return null;
  return (
    <>
      <button onClick={() => setShow((s) => !s)} style={fab} title="Gift Effects Manager">🎬</button>
      {show && (
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>🎬 Gift Effects Manager</b>
            <button onClick={() => setShow(false)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>

          {TIERS.map((t) => (
            <div key={t.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{t.hint}</div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop(t.id)}
                style={drop}
              >
                ⬇️ Tarik video dari folder sini<br />
                <label style={{ color: "#22d3ee", textDecoration: "underline", cursor: "pointer" }}>
                  atau klik pilih fail
                  <input
                    type="file"
                    accept=".mp4,.webm,.mov,.m4v"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => e.target.files && upload(t.id, e.target.files)}
                  />
                </label>
              </div>
              {(list[t.id] || []).length === 0 && (
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>— kosong (fallback confetti) —</div>
              )}
              {(list[t.id] || []).map((u) => {
                const name = decodeURIComponent(u.split("/").pop() || "");
                return (
                  <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 6px", background: "rgba(30,41,59,0.6)", borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <a href={u} target="_blank" style={{ color: "#22d3ee", textDecoration: "none" }}>▶</a>
                    <button onClick={() => remove(t.id, u)} style={{ background: "#7f1d1d", border: "none", color: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>🗑</button>
                  </div>
                );
              })}
            </div>
          ))}

          {busy && <div style={{ fontSize: 12, color: "#fbbf24" }}>⏳ upload...</div>}
          {msg && <div style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
          <div style={{ fontSize: 10, color: "#475569", marginTop: 10 }}>
            Rule: background HITAM murni (auto luma-key) • elak warna hijau • 4-6 saat
          </div>
        </div>
      )}
    </>
  );
}