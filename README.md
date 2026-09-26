# BATIA OS 🎤🤖

**AI Host Orchestrator untuk TikTok Live Malaysia** — auto-reply komen, reaction gift, muzik request + lirik karaoke synced, TTS Bahasa Melayu pasar, dan gift effects cinematic dengan chroma key untuk TikTok Live Studio.

---

## 📋 Isi Kandungan

1. [Seni Bina Sistem](#1-seni-bina-sistem)
2. [Keperluan](#2-keperluan)
3. [Installation](#3-installation)
4. [Menjalankan Sistem (3 Terminal)](#4-menjalankan-sistem-3-terminal)
5. [Setup Dashboard & TikTok Connect](#5-setup-dashboard--tiktok-connect)
6. [Setup TikTok Live Studio (Overlay + Chroma)](#6-setup-tiktok-live-studio-overlay--chroma)
7. [Gift Effects Tier System](#7-gift-effects-tier-system)
8. [Muzik & Lirik Karaoke](#8-muzik--lirik-karaoke)
9. [AI Router & Providers](#9-ai-router--providers)
10. [QuickControls (Dashboard)](#10-quickcontrols-dashboard)
11. [Troubleshooting](#11-troubleshooting)
12. [Git Workflow Selamat](#12-git-workflow-selamat)
13. [Struktur Repo](#13-struktur-repo)
14. [Changelog](#14-changelog)

---

## 1. Seni Bina Sistem

| Service | Port | Fungsi |
|---|---|---|
| **Orchestrator** | `4000` | Backend utama: socket.io, TikTok adapter, TTS queue, music download, policy engine, AI routing |
| **Web Dashboard** | `3000` | Next.js: dashboard host + gift overlay (`/overlay?bg=green`) + effects scanner API |
| **Lyrics Server** | `4002` | Lirik synced overlay (`/?bg=green`), lyric fetch chain, offset calibration |

```
TikTok Live ──> TikTokAdapter ──> Orchestrator (:4000)
                                      │  ├─> PolicyEngine + LiveContextEngine
                                      │  ├─> AIRouter (Groq/Gemini/OpenRouter/Qwen)
                                      │  ├─> TtsEngine (Edge TTS ms-MY)
                                      │  ├─> Music (yt-dlp → audio/music/)
                                      │  └─> relay music:tick / lyrics:offset
                                      ├─> Web Dashboard (:3000) + Gift Overlay
                                      └─> Lyrics Server (:4002) → Overlay karaoke
```

---

## 2. Keperluan

- **Windows 10/11**
- **Node.js 20+** — https://nodejs.org
- **pnpm** — `npm install -g pnpm`
- **Git for Windows**
- **Google Chrome** (untuk overlay window)
- **TikTok Live Studio** (untuk streaming)
- **API Keys:**
  - `GROQ_API_KEY` — **WAJIB** (AI chit-chat + Whisper lirik) — https://console.groq.com
  - `GEMINI_API_KEY` — optional backup
  - `OPENROUTER_API_KEY` — optional backup
  - `DASHSCOPE_API_KEY` — optional (Qwen)

---

## 3. Installation

### 3.1 Clone repo

```powershell
git clone https://github.com/<username>/batia-os.git D:\batia-os
cd D:\batia-os
```

### 3.2 Install dependencies

```powershell
pnpm install
```

### 3.3 Tools (yt-dlp + YouTube cookies)

```powershell
mkdir D:\batia-os\tools
# 1) Download yt-dlp.exe dari https://github.com/yt-dlp/yt-dlp/releases
#    Letak di: D:\batia-os\tools\yt-dlp.exe
# 2) Export cookies YouTube dari browser (extension "Get cookies.txt LOCALLY")
#    Save sebagai: D:\batia-os\tools\cookies.txt
```

> Cookies diperlukan untuk download lagu YouTube tanpa kena block / age-gate.

### 3.4 Setup `.env`

Buat file `D:\batia-os\apps\orchestrator\.env`:

```env
# WAJIB
GROQ_API_KEY=gsk_xxxxxxxxxxxx

# OPTIONAL (backup provider)
GEMINI_API_KEY=
OPENROUTER_API_KEY=
DASHSCOPE_API_KEY=

# OPTIONAL (defaults sudah betul)
ORCHESTRATOR_PORT=4000
LYRICS_OFFSET_MS=0
```

> ⚠️ **JANGAN commit `.env` ke GitHub.** Pastikan `.gitignore` ada baris `.env`.

### 3.5 Database (Prisma)

```powershell
cd packages/database
# Set DATABASE_URL dalam .env root/monorepo ikut schema (sqlite/postgres)
npx prisma db push
npx prisma generate
cd ..\..
```

### 3.6 Folder gift effects

```powershell
mkdir D:\batia-os\apps\web\public\effects\tier1
mkdir D:\batia-os\apps\web\public\effects\tier2
mkdir D:\batia-os\apps\web\public\effects\tier3
# Letak video effect (.mp4 background HITAM / .webm alpha) dalam folder tier
```

---

## 4. Menjalankan Sistem (3 Terminal)

Buka **3 terminal berasingan**:

```powershell
# TERMINAL 1 — Orchestrator (:4000)
cd D:\batia-os
pnpm dev:orch

# TERMINAL 2 — Web dashboard (:3000)
cd D:\batia-os\apps\web
pnpm dev

# TERMINAL 3 — Lyrics server (:4002)
cd D:\batia-os\apps\orchestrator
npx tsx src/lyrics-server.ts
```

Tunggu semua ready:
- Terminal 1: `BATIA Orchestrator on http://localhost:4000`
- Terminal 2: `✓ Ready`
- Terminal 3: `[LYRICS] 🌐 Overlay lirik: http://localhost:4002`

---

## 5. Setup Dashboard & TikTok Connect

1. Buka `http://localhost:3000`
2. Masukkan username TikTok (tanpa `@`) → **CONNECT LIVE**
3. Status jadi `CONNECTED` bila akaun sedang live
4. Dashboard auto-claim **audio sink** (label LAPTOP) — lagu & TTS berbunyi dari laptop ni
5. Pilih suara: **YASMIN** / **OSMAN**
6. Mode: **REGULAR LIVE** (chit-chat) / **SHOPPABLE LIVE** (pitch produk)

### Butang test
- `Test 1: Chit-chat selamat`, `Test EN`, `Test 2-4`, `SHOP 1-2` — hantar komen simulasi
- `Test Gift` / `Test Join` — simulasi gift & penonton masuk
- `Clear Cache` — reset dedupe cache

---

## 6. Setup TikTok Live Studio (Overlay + Chroma)

### 6.1 Chrome khas anti-throttle (WAJIB untuk lirik smooth)

Buat **shortcut desktop** dengan target:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=D:\overlay-chrome --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --app=http://localhost:4002/?bg=green
```

- Launch shortcut → **KLIK SEKALI** pada pill merah "AKTIFKAN ANTI-THROTTLE" (sekali sahaja tiap session)
- Window ni boleh sorok belakang / monitor kedua — **JANGAN minimize**

### 6.2 Source dalam TikTok Live Studio

| Overlay | URL | Capture |
|---|---|---|
| **Lirik karaoke** | `http://localhost:4002/?bg=green` | Window Capture window Chrome khas |
| **Gift effects** | `http://localhost:3000/overlay?bg=green` | Window Capture tab berasingan |

Untuk setiap source:
1. Add Source → **Window Capture** → pilih window overlay
2. Klik kanan source → **Filters** → Add → **Chroma Key** → key color `#00ff00`
3. Hijau jadi transparent → lirik / gift effect terapung atas video live

> Rule: jangan minimize window overlay; occluded / belakang OK.

---

## 7. Gift Effects Tier System

Effect video disimpan dalam folder local — **tukar bila-bila masa tanpa restart** (auto-rescan 30 saat):

```
apps/web/public/effects/
├── tier1/   ← gift kecik  (Rose, Heart Me, PC)          <100 coins
├── tier2/   ← gift medium (Lion, Crown, Money Gun)     100-999 coins
└── tier3/   ← gift besar  (Rocket, Universe, Car)      1000+ coins (INTERRUPT effect sedia ada)
```

- Format: `.mp4` (background **hitam murni** — auto dibuang via luma key) atau `.webm` (alpha channel)
- Elak warna **hijau** dalam video (bertembung chroma key)
- Panjang ideal 4-6 saat (auto-clear)
- Banyak fail dalam satu tier → pilih random setiap gift
- Folder kosong → fallback confetti CSS
- Verify scanner: `curl http://localhost:3000/api/effects`

---

## 8. Muzik & Lirik Karaoke

### 8.1 Request lagu
- Viewer: komen `mainkan lagu <tajuk>` / `lagu <tajuk>`
- Host: dashboard → input Muzik → **Mainkan**, atau QuickControls
- Queue max 5; duplicate auto-skip; `skip`/`cancel` dari komen pun berfungsi

### 8.2 Sync lirik
- Dashboard: **Lirik cepat -0.5s** / **Lirik lambat +0.5s**
- QuickControls bar (bawah dashboard): butang sama + **Skip**
- Offset auto-save dalam cache lagu (`audio/music/lyrics/<videoId>.json`)

### 8.3 Chain sumber lirik (auto-fallback)
```
1. Cache local (INSTANT)
2. LRCLIB fast path (synced, exact match)
3. YouTube captions (synced)
4. LRCLIB GET/SEARCH (synced, duration validated)
5. Groq Whisper (transcribe audio sendiri, segmented)
   + text-replacement dari plain lyrics (betulkan ejaan)
6. Plain lyrics (Lyrist/OVH) — timing rata (last resort)
```
Guard pintar: album/compilation dikesan → "album mode" (lirik per-lagu mustahil untuk 1 video 10 lagu); bahasa MS/EN disilang-check; hallucination filter; tick validation (lirik tak boleh lari laju).

---

## 9. AI Router & Providers

Provider chain: **Groq (primary)** → Gemini → OpenRouter → Qwen. Tiada key = provider auto-skip. Semua gagal = contextual fallback (live tak pernah senyap).

### 9.1 Semak model Groq yang hidup untuk key kamu

```powershell
$key = "<GROQ_API_KEY dari .env>"
(Invoke-RestMethod -Uri "https://api.groq.com/openai/v1/models" -Headers @{ Authorization = "Bearer $key" }).data.id
```

### 9.2 Tukar model
Edit `apps/orchestrator/src/router/AIRouter.ts`:
```ts
groq: { ..., models: ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
```
Guna 2 ID pertama dari output `/models`. Model lama (llama-3.3-70b-versatile dll) mungkin sudah retired → 404.

### 9.3 Task routing
`COMMENT_CLASSIFY`, `CHITCHAT`, `PRODUCT_PITCH`, `FAQ_REASONING`, `POLICY_REWRITE`, `SONG_EXTRACT` — semua melalui `routeAIRequest()` dengan timeout ketat (1.5-2.5s) supaya latency live kekal ~1-2 saat.

---

## 10. QuickControls (Dashboard)

Bar terapung bawah-tengah dashboard (`src/app/components/QuickControls.tsx`):
- **Skip** → `music:skip`
- **Lirik cepat -0.5s** → `lyrics:offset {delta:-500}`
- **Lirik lambat +0.5s** → `lyrics:offset {delta:+500}`

Hanya mount pada pathname `/` — overlay green screen tetap bersih.

---

## 11. Troubleshooting

| Masalah | Punca | Fix |
|---|---|---|
| Lirik stuck bila cycle tab/window | Browser throttle background tab | Guna shortcut Chrome anti-throttle (6.1) + klik pill sekali; jangan minimize |
| `[AI] ❌ HTTP 404 model does not exist` | Model Groq retired | Semak `/models` (9.1) → update `AIRouter.ts` |
| AI reply empty tapi TTS cakap default | — | Sudah fixed v8.62a: empty response di-skip |
| Lirik English untuk lagu Melayu | Whisper auto-detect silap | Sudah fixed v8.71: caption-language prior + reject full-EN |
| Lirik lari laju / freeze | Tick dashboard tak konsisten | Sudah fixed v8.73: tick ratio validation + cross-check jam server |
| Playlist/album tiada lirik | 1 video = banyak lagu | By design: "album mode" — request lagu single |
| `/overlay` tunjuk dashboard | File overlay tertindih | Paste semula `overlay/page.tsx` (gift overlay v8.63); clear `.next` |
| Dashboard hilang section / putih | Zombie server port 3000 atau `.next` lapuk | `Get-NetTCPConnection -LocalPort 3000 ... Stop-Process`; `Remove-Item .next -Recurse -Force`; restart |
| `FAILED: <tajuk>` music | yt-dlp tak jumpa / throttle 60s | Tunggu 60s, cuba tajuk penuh `Tajuk - Artis`; check `tools/cookies.txt` |
| LRCLIB 503 / Lyrist 429 | Rate limit luar | Auto-retry dengan backoff; Whisper fallback |
| Gift effect tak keluar | Folder tier kosong / cache scanner | Letak video dalam tier; tunggu 30s; check `/api/effects` |
| Tompok hitam dalam stream | Effect video bg hitam tanpa luma key | Guna `.mp4` (luma key auto) — jangan letak bg hijau |
| Port sudah guna | Process lama | `Get-NetTCPConnection -LocalPort <port> \| ... Stop-Process -Force` |

---

## 12. Git Workflow Selamat

```powershell
# Sebelum perubahan besar: backup dulu
git add -A
git commit -m "WIP: sebelum experiment X"
git branch backup-YYYY-MM-DD

# Balik ke state GitHub
git reset --hard origin/main

# Ambil balik satu file dari backup
git checkout backup-YYYY-MM-DD -- path/ke/file

# Commit kecil & kerap, push tiap settle
git add .
git commit -m "FIX/FEAT: ..."
git push origin main
```

> Pengajaran projek ni: kerja uncommitted hilang bila revert. **Commit + push setiap fix yang dah verify.**

### `.gitignore` wajib ada:
```
node_modules/
.next/
.env
.env.*
tools/cookies.txt
apps/orchestrator/audio/
last_tiktok_user.txt
```

---

## 13. Struktur Repo

```
batia-os/
├── apps/
│   ├── orchestrator/            # Backend :4000
│   │   ├── src/index.ts         # Orchestrator utama (v8.62a)
│   │   ├── src/router/AIRouter.ts
│   │   ├── src/lyrics-server.ts # Lyrics server (v8.74)
│   │   ├── src/policy/  src/core/  src/voice/  src/adapters/
│   │   ├── audio/music/         # cache lagu + lyrics/ (local, gitignore)
│   │   └── .env
│   └── web/                     # Next.js :3000
│       ├── src/app/page.tsx                 # Dashboard
│       ├── src/app/layout.tsx               # Root layout + QuickControls
│       ├── src/app/components/QuickControls.tsx
│       ├── src/app/overlay/page.tsx         # Gift overlay (v8.63)
│       ├── src/app/api/effects/route.ts     # Effects scanner
│       └── public/effects/tier1|tier2|tier3/
├── packages/
│   ├── database/                # Prisma schema + client
│   └── shared/                  # WS_EVENTS constants
├── policies/tiktok_my_2026.yaml # Policy firewall TikTok MY
├── tools/                       # yt-dlp.exe + cookies.txt (gitignore)
└── README.md
```

---

## 14. Changelog

| Versi | Perubahan |
|---|---|
| v8.74 | Green mode hide debug UI (tiada sampah halus dalam chroma) |
| v8.73 | Tick validation + elapsed cross-check (lirik tak lari laju) |
| v8.72 | Anti-throttle robust (gesture resume + re-apply payload) |
| v8.71 | Caption-language prior (fix Whisper English) |
| v8.70 | Tajuk overlay center + max-width + slice 70 char |
| v8.69 | Album/compilation detection + album mode hint |
| v8.68 | Anti-throttle (silent audio + wake lock) |
| v8.67 | Ambiguous title guard + MS corrections |
| v8.63 | Gift effects tier system (local folder + luma key) + QuickControls + effects scanner API |
| v8.62a | Empty-response guards (TTS tak cakap default bila AI kosong) |
| v8.62 | Cache lirik kecil restore |
| v8.61 | Dashboard lengkap + lead-in detector + CORS /music/ |
| v8.60 | Fast path require exact match |
| v8.59 | Full dashboard page.tsx |
| v8.49 | Whisper Malay prompt + post-correction |
| v8.45 | Emit STOPPED bila lagu tamat natural |
| v8.44 | Smart LRCLIB GET + duration validation + gift overlay restore |

---

## 🎯 Quick Start (ringkas)

```powershell
pnpm install
# setup .env + tools + prisma (lihat Installation)
# Terminal 1: pnpm dev:orch
# Terminal 2: cd apps/web && pnpm dev
# Terminal 3: cd apps/orchestrator && npx tsx src/lyrics-server.ts
# Browser: localhost:3000 → CONNECT LIVE
# TikTok Studio: window capture overlay + chroma key #00ff00
```

**Selamat berjaya, host! 🎤✨**