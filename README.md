cd C:\\batia-os

@'

\# 🎙️ BATIA™ OS — AI Operating System untuk Host TikTok Live



\*\*"Bukan menggantikan host. Memperkuatkan host."\*\*



BATIA™ OS ialah AI Operating System dwi-mod (Regular Live + Shoppable Live) untuk host \& agency TikTok Malaysia. Ia menggabungkan AI Router, Policy Engine compliance-first, Human-in-the-Loop approval, dan TTS bahasa pasar — semuanya berjalan local di laptop anda.



\---



\## ✨ Fitur



| Sistem | Keterangan |

|---|---|

| 🧠 AI Router | Groq (real) + fallback Qwen-Max / Gemini / OpenRouter. Auto-demo mode jika tiada API key |

| 🎭 Persona Host | Bahasa pasar Malaysia (bukan baku, bukan Indonesia) |

| 🔄 Dwi-Mod | REGULAR (borak santai, tiada jualan) vs SHOPPABLE (pitch produk, beg kuning) |

| 🎙️ TTS | Edge-TTS ms-MY-YasminNeural / ms-MY-OsmanNeural + Casualizer fonetik |

| 🛡️ Policy Engine | 3-tier enforcement: auto / human approval / auto-block |

| 👨‍️ Human Approval Zone | Komen HIGH tunggu kelulusan host sebelum AI bercakap |

| 📜 Evidence Trail | Log semua violation untuk compliance agency |

| 🔌 TikTok Adapter | Baca komen/gift real-time dari live TikTok (tiktok-live-connector) |

| 🗄️ PostgreSQL + Prisma | Schema lengkap (Host, Session, Product, Violation, Memory) |



\---



\## 🖥️ Keperluan



\### Hardware (disahkan berjalan)

\- HP ZBook Power G7 (32GB RAM, 4GB GPU Quadro)

\- Nota: Semua AI inference via cloud API — GPU local TIDAK diperlukan



\### Software

\- Node.js v20+ (node --version)

\- Docker Desktop (untuk PostgreSQL + Redis)

\- pnpm (npm i -g pnpm)



\---



\## 🚀 Pemasangan (Step-by-Step)



\### 1. Database (Docker)



&#x20;   mkdir C:\\batia-os

&#x20;   cd C:\\batia-os



Cipta docker-compose.yml:



&#x20;   version: "3.8"

&#x20;   services:

&#x20;     postgres:

&#x20;       image: postgres:16-alpine

&#x20;       container\_name: batia-postgres

&#x20;       environment:

&#x20;         POSTGRES\_DB: batia

&#x20;         POSTGRES\_USER: batia

&#x20;         POSTGRES\_PASSWORD: batia\_password

&#x20;       ports:

&#x20;         - "5432:5432"

&#x20;       volumes:

&#x20;         - postgres\_data:/var/lib/postgresql/data

&#x20;     redis:

&#x20;       image: redis:7-alpine

&#x20;       container\_name: batia-redis

&#x20;       ports:

&#x20;         - "6379:6379"

&#x20;       volumes:

&#x20;         - redis\_data:/data

&#x20;   volumes:

&#x20;     postgres\_data:

&#x20;     redis\_data:



&#x20;   docker compose up -d

&#x20;   docker ps   # pastikan batia-postgres \& batia-redis "Up"



\### 2. Install dependencies



&#x20;   npm i -g pnpm

&#x20;   pnpm install



Jika keluar \[ERR\_PNPM\_IGNORED\_BUILDS], tambah dalam pnpm-workspace.yaml:



&#x20;   onlyBuiltDependencies:

&#x20;     - "@prisma/client"

&#x20;     - "@prisma/engines"

&#x20;     - "prisma"

&#x20;     - "esbuild"

&#x20;     - "sharp"



Kemudian pnpm install semula, atau run pnpm approve-builds.



\### 3. Push database schema



&#x20;   pnpm db:push



Jangkaan: Your database is now in sync with your Prisma schema + Generated Prisma Client



Jika EPERM ... query\_engine-windows.dll.node → matikan orchestrator dulu (Ctrl+C), baru db:push (Windows lock DLL yang tengah dipakai).



\### 4. Isi API keys



Edit apps/orchestrator/.env:



&#x20;   DASHSCOPE\_API\_KEY=          # Qwen-Max (optional)

&#x20;   GROQ\_API\_KEY=gsk\_xxxx       # disyorkan (percuma, console.groq.com)

&#x20;   GEMINI\_API\_KEY=             # optional

&#x20;   OPENROUTER\_API\_KEY=         # optional (fallback)

&#x20;   EDGE\_TTS\_VOICE=ms-MY-YasminNeural



Jika semua kosong, sistem jalan dalam DEMO MODE (auto-response tanpa AI).



\### 5. Run (2 terminal)



Terminal 1 — Orchestrator:



&#x20;   cd C:\\batia-os

&#x20;   pnpm dev:orch



Jangkaan: BATIA Orchestrator on http://localhost:4000



Terminal 2 — Web UI:



&#x20;   cd C:\\batia-os

&#x20;   pnpm dev:web



Jangkaan: Local: http://localhost:3000



Buka http://localhost:3000



\---



\## 🧪 Testing



| Butang | Jangkaan |

|---|---|

| Test 1 (chit-chat) | AI balas salam (bahasa pasar) + suara |

| Test 2 (soalan harga) | REGULAR: deflect "takde jualan". SHOPPABLE: pitch produk |

| Test 3 (RM100 bait) | Auto-BLOCK (CRITICAL) → Evidence Trail |

| Test 4 (begging gift) | Masuk Human Approval Zone → klik LULUSKAN baru AI bercakap |



\### Tukar suara

\- Klik YASMIN (wanita) / OSMAN (lelaki)

\- Klik SUARA ON/OFF untuk mute



\### TikTok Live (real)

1\. Start live dari phone (1-2 minit)

2\. Laptop: taip username TikTok → CONNECT LIVE

3\. Status hijau CONNECTED → komen/gift masuk real-time



\---



\## 🗂️ Struktur Projek



&#x20;   batia-os/

&#x20;   ├── apps/

&#x20;   │   ├── web/                    # Next.js dashboard

&#x20;   │   │   └── src/app/page.tsx    # UI utama

&#x20;   │   └── orchestrator/           # Node.js otak

&#x20;   │       └── src/

&#x20;   │           ├── index.ts            # WebSocket server + audio

&#x20;   │           ├── router/AIRouter.ts  # multi-provider AI

&#x20;   │           ├── policy/PolicyEngine.ts

&#x20;   │           ├── core/LiveContextEngine.ts

&#x20;   │           ├── voice/TtsEngine.ts  # TTS + casualizer

&#x20;   │           └── adapters/TikTokAdapter.ts

&#x20;   ├── packages/

&#x20;   │   ├── database/  # Prisma schema

&#x20;   │   └── shared/    # WS\_EVENTS + types

&#x20;   ├── policies/tiktok\_my\_2026.yaml   # Compliance rulebook

&#x20;   ├── docker-compose.yml

&#x20;   └── pnpm-workspace.yaml



\---



\## 🛠️ Troubleshooting (Isu Yang Ditemui \& Fix)



| Isu | Punca | Fix |

|---|---|---|

| no configuration file provided | Run docker compose luar folder | cd C:\\batia-os dulu |

| \[ERR\_PNPM\_IGNORED\_BUILDS] | pnpm v10 block build scripts | Tambah onlyBuiltDependencies / pnpm approve-builds |

| Cannot use 'in' operator ... resolutions | Run pnpm luar folder (scan seluruh C:) | cd C:\\batia-os |

| ERR\_MODULE\_NOT\_FOUND TtsEngine.js | Folder src/voice tak wujud | New-Item -ItemType Directory -Force -Path apps/orchestrator/src/voice |

| Unknown argument resolvedText | Schema ViolationLog tak ada field | Patch schema + pnpm db:push |

| EPERM rename query\_engine...dll | Orchestrator lock DLL | Ctrl+C orchestrator → db:push → start semula |

| AI jawab bahasa baku/Indonesia | Prompt lemah | Persona + Casualizer + rewrite prompt pasar MY |

| "je" disebut "jea" | TTS baca huruf | Casualizer: je → jeh (audio sahaja) |



\---



\## ⚖️ Compliance (TikTok MY 2026)



Rulebook: policies/tiktok\_my\_2026.yaml

\- DILARANG: Begging gift / engagement bait kewangan / forced action

\- DILARANG: Tuntutan perubatan tanpa NPRA (MAL)

\- DILARANG: Redirect trafik keluar TikTok

\- DILARANG: Kandungan statik / non-interactive

\- WAJIB: Disclosure AI, human supervision (selari arah regulasi Douyin/Taobao)



\---



\## 🗺️ Roadmap



\- \[x] MVP core + AI + TTS + Policy + Approval

\- \[x] TikTok Adapter (code siap)

\- \[ ] Test live TikTok sebenar

\- \[ ] Seed Product Catalog (SHOPPABLE)

\- \[ ] Avatar Engine (DeepFaceLive, GPU 4GB)

\- \[ ] OBS integration (output ke stream)

\- \[ ] Ujian Regular Live sebagai official host



\---



\*Dibina 11-12 Ogos 2026 • ZBook Power G7 • Docker + pnpm + Prisma + Groq\*

'@ | Set-Content -Path "README.md" -Encoding utf8

Write-Host "README.md siap!"

