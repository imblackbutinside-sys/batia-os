# BATIA OS - AI TikTok Live Host (Malaysia Edition)

AI host untuk TikTok Live: baca komen, balas bersuara (TTS), policy firewall
anti-violate TikTok, bilingual MS/EN dengan 4 suara.

## Feature
- AI bilingual MS/EN (auto-detect bahasa komen)
- 4 suara: Yasmin/Osman (Melayu), Jenny/Guy (English auto)
- Policy firewall + rewrite compliant (TikTok Malaysia 2026)
- Stats live + panel VIP + speaker auto-remember
- Auto-pitch produk (Shoppable) + butang test rawak
- Connect TikTok Live (tiktok-live-connector)

## Tech Stack
Node.js + TypeScript (tsx) | Socket.IO | Next.js | Prisma + PostgreSQL (Docker)
| node-edge-tts | Groq API (qwen/qwen3.6-27b) | tiktok-live-connector

## Setup
1. Prerequisites: Node 24, pnpm, Docker Desktop
2. docker compose up -d        (PostgreSQL + Redis)
3. pnpm install
4. pnpm db:push
5. Isi GROQ_API_KEY dalam apps/orchestrator/.env
6. Terminal 1: pnpm dev:orch   (port 4000)
7. Terminal 2: pnpm dev:web    (port 3000)
8. Browser: http://localhost:3000

## Struktur
apps/orchestrator  backend (AI, TTS, socket, policy, adapter TikTok)
apps/web           dashboard Next.js
packages/database  Prisma schema
packages/shared    WS_EVENTS dikongsi
policies/          tiktok_my_2026.yaml (policy firewall)

## Save Points (git)
568bc9e  TERKINI - Qwen3.6 Groq (no thinking) + bilingual fix + username TikTok real
8a5b2dc  stabil selepas repair + ignore audio cache
4f25664  sebelum SUARA KU + default Osman
548adf3  lama (origin/main) - bilingual + Jenny voice + pronunciation fix

Rollback: git checkout 568bc9e -- apps/orchestrator/src apps/web/src

## Nota Penting
- llama-3.3-70b-versatile DIBUANG Groq 16/8/2026 -> guna qwen/qwen3.6-27b
- Qwen3.6 wajib reasoning_effort:"none" + reasoning_format:"hidden"
  (jika tidak, tag akan dibaca oleh TTS)
- Language detection rule-based (regex MS) dalam AIRouter.ts
- Username TikTok diambil dari data.user.uniqueId
