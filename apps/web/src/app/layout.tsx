import type { Metadata, Viewport } from "next";
import "./globals.css";
import QuickControls from "./components/QuickControls";
import EffectsManager from "./components/EffectsManager";

// ✅ BATIA OS root layout v8.64
// - dark theme restore (body gelap + scrollbar gelap)
// - QuickControls floating bar (Skip + lirik cepat/lambat)
// - EffectsManager floating panel (drag&drop video gift)
export const metadata: Metadata = {
  title: "BATIA OS",
  description: "AI Host Orchestrator untuk TikTok Live Malaysia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms">
      <body
        style={{
          background: "#0b1220",
          color: "#e2e8f0",
          margin: 0,
          padding: 0,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <style>{`
          html, body {
            background: #0b1220;
            color: #e2e8f0;
            margin: 0;
            padding: 0;
            min-height: 100vh;
          }
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-thumb { background: #334155; border-radius: 8px; }
          ::-webkit-scrollbar-track { background: #0b1220; }
          button { font-family: inherit; }
        `}</style>
        {children}
        <QuickControls />
        <EffectsManager />
      </body>
    </html>
  );
}