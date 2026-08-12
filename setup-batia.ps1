# ============================================
# BATIA OS - Master Setup Script
# Run dari C:\batia-os
# ============================================

# --- Folders ---
$dirs = @(
  "policies",
  "packages/database/prisma",
  "packages/database/src",
  "packages/shared/src",
  "apps/orchestrator/src/router",
  "apps/orchestrator/src/policy",
  "apps/orchestrator/src/core",
  "apps/web/src/app"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

# --- Root package.json ---
$c = @'
{
  "name": "batia-os",
  "private": true,
  "scripts": {
    "dev:orch": "pnpm --filter @batia/orchestrator dev",
    "dev:web": "pnpm --filter @batia/web dev",
    "db:push": "pnpm --filter @batia/database db:push"
  }
}
'@
Set-Content -Path "package.json" -Value $c -Encoding ASCII

# --- pnpm-workspace ---
$c = @'
packages:
  - "apps/*"
  - "packages/*"
'@
Set-Content -Path "pnpm-workspace.yaml" -Value $c -Encoding ASCII

# --- Policy Rulebook YAML ---
$c = @'
meta:
  version: "2026.08"
  market: "MY"

regular_live:
  forbidden_behaviors:
    - id: begging_gifts
      desc: Mengemis atau menekan penonton beri gift
      severity: HIGH
      banned_phrases_regex:
        - "(bagi|kasi|sedekah).*(gift|lion|universe|cendol)"
        - "target.*(lion|gift|universe)"
        - "sapa sayang.*(gift|share)"
    - id: financial_engagement_bait
      desc: Pancing komen guna wang
      severity: CRITICAL
      banned_phrases_regex:
        - "komen.*(nak|mahu).*(RM|ringgit|duit|wang)"
        - "share.*(dapat|menang).*(RM|duit)"
        - "RM[0-9,]+.*(kalau|jika)"
    - id: forced_action_bait
      desc: Memaksa follow atau share
      severity: MEDIUM
      banned_phrases_regex:
        - "wajib (follow|share)"
        - "tekan share kalau sayang"

shoppable_live:
  product_claims:
    - id: medical_health_claims
      desc: Tuntutan perubatan tanpa NPRA
      severity: CRITICAL
      banned_phrases_regex:
        - "(confirm|pasti|jamin).*(sembuh|hilang).*(penyakit|jerawat)"
        - "(putih|kurus).*(dalam|[0-9]+ (hari|minggu))"
  traffic:
    - id: off_platform_redirect
      desc: Lencong trafik keluar TikTok
      severity: CRITICAL
      banned_phrases_regex:
        - "(shopee|lazada|instagram|whatsapp|telegram|link di bio)"

enforcement:
  CRITICAL:
    action: BLOCK_AND_HOLD
  HIGH:
    action: AUTO_REWRITE_THEN_HOLD
  MEDIUM:
    action: AUTO_REWRITE_AUTO_SEND
  LOW:
    action: AUTO_SEND
'@
Set-Content -Path "policies/tiktok_my_2026.yaml" -Value $c -Encoding ASCII

# --- packages/database ---
$c = @'
{
  "name": "@batia/database",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "typescript": "^5.6.0"
  }
}
'@
Set-Content -Path "packages/database/package.json" -Value $c -Encoding ASCII

$c = @'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = "postgresql://batia:batia_password@localhost:5432/batia"
}

model Host {
  id           String        @id @default(cuid())
  name         String
  tiktokHandle String        @unique
  sessions     LiveSession[]
}

model LiveSession {
  id        String       @id @default(cuid())
  hostId    String
  host      Host         @relation(fields: [hostId], references: [id])
  mode      String       @default("REGULAR")
  status    String       @default("LIVE")
  comments  CommentLog[]
  gifts     GiftLog[]
  scripts   ScriptItem[]
}

model Product {
  id    String @id @default(cuid())
  title String
  skus  Sku[]
}

model Sku {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  skuCode   String  @unique
  price     Float
  stock     Int     @default(0)
}

model ScriptItem {
  id        String      @id @default(cuid())
  sessionId String
  session   LiveSession @relation(fields: [sessionId], references: [id])
  type      String
  content   String
  status    String      @default("QUEUED")
}

model CommentLog {
  id        String      @id @default(cuid())
  sessionId String
  session   LiveSession @relation(fields: [sessionId], references: [id])
  username  String
  text      String
  intent    String?
  createdAt DateTime    @default(now())
}

model GiftLog {
  id        String      @id @default(cuid())
  sessionId String
  session   LiveSession @relation(fields: [sessionId], references: [id])
  username  String
  giftName  String
  giftValue Int
}

model ViewerMemory {
  id           String @id @default(cuid())
  tiktokUserId String @unique
  username     String
  isVip        Boolean @default(false)
}

model ViolationLog {
  id            String   @id @default(cuid())
  ruleId        String
  triggeredText String
  action        String
  createdAt     DateTime @default(now())
}
'@
Set-Content -Path "packages/database/prisma/schema.prisma" -Value $c -Encoding ASCII

$c = @'
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
export * from "@prisma/client";
'@
Set-Content -Path "packages/database/src/index.ts" -Value $c -Encoding ASCII

# --- packages/shared ---
$c = @'
{
  "name": "@batia/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts"
}
'@
Set-Content -Path "packages/shared/package.json" -Value $c -Encoding ASCII

$c = @'
export const WS_EVENTS = {
  COMMENT_RECEIVED: "comment:received",
  GIFT_RECEIVED: "gift:received",
  MODE_CHANGED: "mode:changed",
  AI_RESPONSE_READY: "ai:response:ready",
  POLICY_VIOLATION: "policy:violation",
  COMMENT_LOG: "comment:log",
} as const;

export type LiveMode = "REGULAR" | "SHOPPABLE";
'@
Set-Content -Path "packages/shared/src/index.ts" -Value $c -Encoding ASCII

# --- orchestrator ---
$c = @'
{
  "name": "@batia/orchestrator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@batia/database": "workspace:*",
    "@batia/shared": "workspace:*",
    "socket.io": "^4.7.5",
    "js-yaml": "^4.1.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/js-yaml": "^4.0.9",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
'@
Set-Content -Path "apps/orchestrator/package.json" -Value $c -Encoding ASCII

$c = @'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
'@
Set-Content -Path "apps/orchestrator/tsconfig.json" -Value $c -Encoding ASCII

$c = @'
# Isi API keys untuk AI penuh. Kosong = DEMO MODE (auto response)
DASHSCOPE_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
'@
Set-Content -Path "apps/orchestrator/.env" -Value $c -Encoding ASCII

# --- AIRouter.ts ---
$c = @'
interface AIProvider { name: string; baseURL: string; apiKey: string; defaultModel: string }

const providers: Record<string, AIProvider> = {
  qwen: { name: "Qwen-Max", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKey: process.env.DASHSCOPE_API_KEY || "", defaultModel: "qwen-max-latest" },
  groq: { name: "Groq", baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY || "", defaultModel: "llama-3.3-70b-versatile" },
  gemini: { name: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: process.env.GEMINI_API_KEY || "", defaultModel: "gemini-1.5-flash" },
  openrouter: { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || "", defaultModel: "meta-llama/llama-3.3-70b-instruct:free" },
};

export type TaskType = "COMMENT_CLASSIFY" | "PRODUCT_PITCH" | "FAQ_REASONING" | "POLICY_REWRITE" | "CHITCHAT";

interface Route { provider: AIProvider; model: string; temperature: number; maxTokens: number }

const ROUTING_TABLE: Record<TaskType, Route> = {
  COMMENT_CLASSIFY: { provider: providers.groq, model: providers.groq.defaultModel, temperature: 0.3, maxTokens: 256 },
  CHITCHAT: { provider: providers.groq, model: providers.groq.defaultModel, temperature: 0.7, maxTokens: 512 },
  PRODUCT_PITCH: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.8, maxTokens: 1024 },
  FAQ_REASONING: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.6, maxTokens: 2048 },
  POLICY_REWRITE: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.5, maxTokens: 1024 },
};

async function callProvider(p: AIProvider, model: string, messages: any[], temperature: number, maxTokens: number) {
  const start = Date.now();
  const res = await fetch(p.baseURL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.apiKey },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(p.name + " error " + res.status);
  const data: any = await res.json();
  return { content: data.choices?.[0]?.message?.content || "", latencyMs: Date.now() - start };
}

function demoContent(task: TaskType, messages: any[]): string {
  const userMsg = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  switch (task) {
    case "COMMENT_CLASSIFY":
      if (/harga|berapa|stok|stock/.test(userMsg)) return '{"intent":"QUESTION","sentiment":"NEUTRAL","confidence":0.9}';
      return '{"intent":"CHITCHAT","sentiment":"POSITIVE","confidence":0.8}';
    case "FAQ_REASONING":
      return "[DEMO MODE] Terima kasih atas soalan anda! Bila API key dipasang, Qwen-Max akan jawab secara pintar. Sekarang mod ujian tanpa AI penuh.";
    case "CHITCHAT":
      return "[DEMO MODE] Hai, terima kasih sebab join live malam ni! Semoga korang semua sihat.";
    case "PRODUCT_PITCH":
      return "[DEMO MODE] Produk ni memang berbaloi! Tekan beg kuning sekarang sebelum habis stok.";
    case "POLICY_REWRITE":
      return "[DEMO MODE] Ini versi teks yang sudah mematuhi polisi.";
  }
}

export async function routeAIRequest(task: TaskType, messages: any[]) {
  const route = ROUTING_TABLE[task];
  if (!route.provider.apiKey) {
    return { content: demoContent(task, messages), providerUsed: "DEMO", modelUsed: "demo", latencyMs: 0 };
  }
  try {
    const r = await callProvider(route.provider, route.model, messages, route.temperature, route.maxTokens);
    return { content: r.content, providerUsed: route.provider.name, modelUsed: route.model, latencyMs: r.latencyMs };
  } catch (e) {
    try {
      const fb = await callProvider(providers.openrouter, providers.openrouter.defaultModel, messages, route.temperature, route.maxTokens);
      return { content: fb.content, providerUsed: "OpenRouter", modelUsed: providers.openrouter.defaultModel, latencyMs: fb.latencyMs, fallbackUsed: true };
    } catch (e2) {
      return { content: demoContent(task, messages), providerUsed: "DEMO-FALLBACK", modelUsed: "demo", latencyMs: 0 };
    }
  }
}

export async function classifyComment(text: string) {
  const r = await routeAIRequest("COMMENT_CLASSIFY", [
    { role: "system", content: "Klasifikasi komen TikTok. JSON sahaja." },
    { role: "user", content: text },
  ]);
  try { return JSON.parse(r.content); } catch { return { intent: "CHITCHAT", sentiment: "NEUTRAL", confidence: 0.5 }; }
}
'@
Set-Content -Path "apps/orchestrator/src/router/AIRouter.ts" -Value $c -Encoding ASCII

# --- PolicyEngine.ts ---
$c = @'
import * as fs from "fs";
import * as yaml from "js-yaml";

export interface PolicyViolation {
  ruleId: string;
  severity: string;
  action: string;
  triggeredText: string;
}

interface Rule { id: string; severity: string; banned_phrases_regex?: string[] }

export class PolicyEngine {
  private config: any;
  constructor(yamlPath: string) {
    this.config = yaml.load(fs.readFileSync(yamlPath, "utf8"));
  }

  checkText(text: string, mode: "REGULAR" | "SHOPPABLE"): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const rules: Rule[] = [...(this.config.regular_live?.forbidden_behaviors || [])];
    if (mode === "SHOPPABLE") {
      rules.push(...(this.config.shoppable_live?.product_claims || []));
      rules.push(...(this.config.shoppable_live?.traffic || []));
    }
    for (const rule of rules) {
      for (const pattern of rule.banned_phrases_regex || []) {
        if (new RegExp(pattern, "i").test(text)) {
          const action = this.config.enforcement?.[rule.severity]?.action || "AUTO_SEND";
          violations.push({ ruleId: rule.id, severity: rule.severity, action, triggeredText: text });
          break;
        }
      }
    }
    return violations;
  }
}
'@
Set-Content -Path "apps/orchestrator/src/policy/PolicyEngine.ts" -Value $c -Encoding ASCII

# --- LiveContextEngine.ts ---
$c = @'
import { classifyComment, routeAIRequest } from "../router/AIRouter.js";
import { PolicyEngine, PolicyViolation } from "../policy/PolicyEngine.js";
import { prisma } from "@batia/database";

export class LiveContextEngine {
  private mode: "REGULAR" | "SHOPPABLE" = "REGULAR";
  constructor(private policy: PolicyEngine) {}

  setMode(m: "REGULAR" | "SHOPPABLE") {
    this.mode = m;
    console.log("[Engine] mode ->", m);
  }

  async handleComment(sessionId: string, username: string, text: string) {
    const violations = this.policy.checkText(text, this.mode);
    const blocked = violations.find((v) => v.action === "BLOCK_AND_HOLD");

    if (blocked) {
      await prisma.violationLog.create({
        data: { ruleId: blocked.ruleId, triggeredText: text, action: "BLOCK_AND_HOLD" },
      });
      return { response: null, violations };
    }

    const classification = await classifyComment(text);
    await prisma.commentLog.create({
      data: { sessionId, username, text, intent: classification.intent },
    });

    let response: string | null = null;
    if (classification.intent === "QUESTION") {
      const r = await routeAIRequest("FAQ_REASONING", [
        { role: "system", content: "Jawab soalan penonton TikTok dalam Bahasa Melayu, ringkas dan mesra." },
        { role: "user", content: "Soalan dari " + username + ": " + text },
      ]);
      response = r.content;
    } else if (classification.intent === "CHITCHAT") {
      const r = await routeAIRequest("CHITCHAT", [
        { role: "system", content: "Balas komen penonton dengan santai dalam Bahasa Melayu." },
        { role: "user", content: text },
      ]);
      response = r.content;
    }
    return { response, violations };
  }

  async handleGift(sessionId: string, username: string, giftName: string, giftValue: number) {
    await prisma.giftLog.create({ data: { sessionId, username, giftName, giftValue } });
    const r = await routeAIRequest("CHITCHAT", [
      { role: "system", content: "Ucap terima kasih atas gift. JANGAN minta lagi gift." },
      { role: "user", content: username + " bagi " + giftName },
    ]);
    return r.content;
  }
}
'@
Set-Content -Path "apps/orchestrator/src/core/LiveContextEngine.ts" -Value $c -Encoding ASCII

# --- orchestrator index.ts ---
$c = @'
import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { PolicyEngine } from "./policy/PolicyEngine.js";
import { LiveContextEngine } from "./core/LiveContextEngine.js";
import { prisma } from "@batia/database";
import { WS_EVENTS } from "@batia/shared";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "4000");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.resolve(__dirname, "../../../policies/tiktok_my_2026.yaml");

const engine = new LiveContextEngine(new PolicyEngine(policyPath));
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

async function ensureSession() {
  let host = await prisma.host.findFirst();
  if (!host) {
    host = await prisma.host.create({ data: { name: "Host BATIA", tiktokHandle: "@batia.demo" } });
  }
  let session = await prisma.liveSession.findFirst({ where: { status: "LIVE" } });
  if (!session) {
    session = await prisma.liveSession.create({ data: { hostId: host.id, mode: "REGULAR", status: "LIVE" } });
  }
  return session;
}

io.on("connection", (socket) => {
  console.log("[WS] client connected:", socket.id);

  socket.on(WS_EVENTS.COMMENT_RECEIVED, async (data: { username: string; text: string }) => {
    try {
      const session = await ensureSession();
      io.emit(WS_EVENTS.COMMENT_LOG, { username: data.username, text: data.text });
      const { response, violations } = await engine.handleComment(session.id, data.username, data.text);
      for (const v of violations) io.emit(WS_EVENTS.POLICY_VIOLATION, v);
      if (response) io.emit(WS_EVENTS.AI_RESPONSE_READY, { type: "COMMENT_RESPONSE", content: response, targetUser: data.username });
    } catch (e) {
      console.error("[WS] comment error:", e);
    }
  });

  socket.on(WS_EVENTS.GIFT_RECEIVED, async (data: { username: string; giftName: string; giftValue: number }) => {
    const session = await ensureSession();
    const reaction = await engine.handleGift(session.id, data.username, data.giftName, data.giftValue);
    io.emit(WS_EVENTS.AI_RESPONSE_READY, { type: "GIFT_REACTION", content: reaction, targetUser: data.username });
  });

  socket.on(WS_EVENTS.MODE_CHANGED, (data: { mode: "REGULAR" | "SHOPPABLE" }) => {
    engine.setMode(data.mode);
  });
});

httpServer.listen(PORT, () => {
  console.log("BATIA Orchestrator on http://localhost:" + PORT);
});
'@
Set-Content -Path "apps/orchestrator/src/index.ts" -Value $c -Encoding ASCII

# --- web package.json ---
$c = @'
{
  "name": "@batia/web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000"
  },
  "dependencies": {
    "@batia/shared": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
'@
Set-Content -Path "apps/web/package.json" -Value $c -Encoding ASCII

# --- web tsconfig ---
$c = @'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@
Set-Content -Path "apps/web/tsconfig.json" -Value $c -Encoding ASCII

# --- next.config.mjs ---
$c = @'
const nextConfig = {
  transpilePackages: ["@batia/shared"],
};
export default nextConfig;
'@
Set-Content -Path "apps/web/next.config.mjs" -Value $c -Encoding ASCII

# --- tailwind.config.js ---
$c = @'
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
'@
Set-Content -Path "apps/web/tailwind.config.js" -Value $c -Encoding ASCII

# --- postcss.config.js ---
$c = @'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
'@
Set-Content -Path "apps/web/postcss.config.js" -Value $c -Encoding ASCII

# --- layout.tsx ---
$c = @'
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BATIA OS",
  description: "AI Live Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  );
}
'@
Set-Content -Path "apps/web/src/app/layout.tsx" -Value $c -Encoding ASCII

# --- globals.css ---
$c = @'
@tailwind base;
@tailwind components;
@tailwind utilities;
'@
Set-Content -Path "apps/web/src/app/globals.css" -Value $c -Encoding ASCII

# --- page.tsx (Dashboard UI) ---
$c = @'
"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { WS_EVENTS } from "@batia/shared";

const socket = io("http://localhost:4000");

export default function Dashboard() {
  const [mode, setMode] = useState("REGULAR");
  const [comments, setComments] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);

  useEffect(() => {
    socket.on(WS_EVENTS.COMMENT_LOG, (d: any) => setComments((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.AI_RESPONSE_READY, (d: any) => setResponses((p) => [d, ...p].slice(0, 20)));
    socket.on(WS_EVENTS.POLICY_VIOLATION, (d: any) => setViolations((p) => [d, ...p].slice(0, 20)));
    return () => { socket.disconnect(); };
  }, []);

  const send = (text: string) =>
    socket.emit(WS_EVENTS.COMMENT_RECEIVED, { username: "test_user", text });

  const changeMode = (m: string) => {
    setMode(m);
    socket.emit(WS_EVENTS.MODE_CHANGED, { mode: m });
  };

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">BATIA OS</h1>
        <div className="flex gap-2">
          <button onClick={() => changeMode("REGULAR")} className={"px-4 py-2 rounded " + (mode === "REGULAR" ? "bg-blue-600" : "bg-gray-800")}>
            REGULAR LIVE
          </button>
          <button onClick={() => changeMode("SHOPPABLE")} className={"px-4 py-2 rounded " + (mode === "SHOPPABLE" ? "bg-red-600" : "bg-gray-800")}>
            SHOPPABLE LIVE
          </button>
        </div>
      </header>

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
            <button onClick={() => send("Assalamualaikum, apa khabar host?")} className="bg-green-700 rounded px-3 py-2 text-sm text-left">
              Test 1: Chit-chat selamat
            </button>
            <button onClick={() => send("Berapa harga produk ni?")} className="bg-blue-700 rounded px-3 py-2 text-sm text-left">
              Test 2: Soalan harga
            </button>
            <button onClick={() => send("Komen NAK kalau korang nak RM100!")} className="bg-red-700 rounded px-3 py-2 text-sm text-left">
              Test 3: VIOLATION engagement bait
            </button>
            <button onClick={() => send("Bagi gift lion sikit bang!")} className="bg-red-700 rounded px-3 py-2 text-sm text-left">
              Test 4: VIOLATION begging gift
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

      <div className="mt-6 bg-gray-900 rounded p-4">
        <h2 className="font-semibold mb-3">Policy Violations (Evidence Trail)</h2>
        <div className="space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="bg-red-900/50 border border-red-700 rounded p-3 text-sm">
              <p className="font-medium">{v.ruleId} [{v.severity}] - {v.action}</p>
              <p className="text-gray-300">{v.triggeredText}</p>
            </div>
          ))}
          {violations.length === 0 && <p className="text-gray-500 text-sm">Tiada violation lagi. Cuba Test 3 atau Test 4.</p>}
        </div>
      </div>
    </div>
  );
}
'@
Set-Content -Path "apps/web/src/app/page.tsx" -Value $c -Encoding ASCII

Write-Host "========================================"
Write-Host "BATIA OS: SEMUA FAIL SIAP!"
Write-Host "========================================"