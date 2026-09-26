# BATIA OS 🎤🤖

**AI Host Orchestrator untuk TikTok Live Malaysia** — auto-reply komen, reaction gift dengan cinematic effects, muzik request + lirik karaoke synced, TTS Bahasa Melayu pasar, drag-and-drop effect manager, dan chroma key integration untuk TikTok Live Studio.

---

## 📋 Isi Kandungan

1. [Seni Bina Sistem](#1-seni-bina-sistem)
2. [Keperluan](#2-keperluan)
3. [Installation](#3-installation)
4. [Menjalankan Sistem (3 Terminal)](#4-menjalankan-sistem-3-terminal)
5. [Setup Dashboard & TikTok Connect](#5-setup-dashboard--tiktok-connect)
6. [Setup TikTok Live Studio (Overlay + Chroma)](#6-setup-tiktok-live-studio-overlay--chroma)
7. [Gift Effects Tier System](#7-gift-effects-tier-system)
8. [Effects Manager (Drag & Drop)](#8-effects-manager-drag--drop)
9. [Muzik & Lirik Karaoke](#9-muzik--lirik-karaoke)
10. [AI Router & Providers](#10-ai-router--providers)
11. [QuickControls (Dashboard)](#11-quickcontrols-dashboard)
12. [Troubleshooting](#12-troubleshooting)
13. [Git Workflow Selamat](#13-git-workflow-selamat)
14. [Struktur Repo](#14-struktur-repo)
15. [Changelog](#15-changelog)

---

## 1. Seni Bina Sistem

| Service | Port | Fungsi |
|---|---|---|
| **Orchestrator** | `4000` | Backend utama: socket.io, TikTok adapter, TTS queue, music download, policy engine, AI routing |
| **Web Dashboard** | `3000` | Next.js: dashboard host + gift overlay (`/overlay?bg=green`) + effects scanner/upload/delete API |
| **Lyrics Server** | `4002` | Lirik synced overlay (`/?bg=green`), lyric fetch chain, offset calibration |

```
TikTok Live ──> TikTokAdapter ──> Orchestrator (:4000)
                                      │  ├─> PolicyEngine + LiveContextEngine
                                      │  ├─> AIRouter (Groq/Gemini/OpenRouter/Qwen)
                                      │  ├─> TtsEngine (Edge TTS ms-MY)
                                      │  ├─> Music (yt-dlp → audio/music/)
                                      │  └─> relay music:tick / lyrics:offset
                                      ├─> Web Dashboard (:3000)
                                      │      ├─> Dashboard (QuickControls + Effects Manager)
                                      │      └─> Gift Overlay (/overlay?bg=green)
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

### 3.6 Folder gift effects (dibuat auto oleh Effects Manager, tapi boleh manual)

```powershell
mkdir D:\batia-os\apps\web\public\effects\tier1
mkdir D:\batia-os\apps\web\public\effects\tier2
mkdir D:\batia-os\apps\web\public\effects\tier3
# Letak video effect (.mp4 background HITAM / .webm alpha) dalam folder tier
# ATAU guna Effects Manager drag&drop dari dashboard (Section 8)
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

### QuickControls (bar bawah dashboard)
- **Skip** — skip lagu sekarang, main queue seterusnya
- **Lirik cepat -0.5s** — lirik maju 0.5 saat
- **Lirik lambat +0.5s** — lirik undur 0.5 saat

### Effects Manager (🎬 butang kanan-bawah dashboard)
- Drag & drop video effect dari folder Windows terus ke tier
- Preview, senarai, buang video — semua dalam dashboard
- Lihat Section 8 untuk detail

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

### Rule effect video
- Format: `.mp4` (background **hitam murni** — auto dibuang via luma key) atau `.webm` (alpha channel)
- **ELAK** warna hijau dalam video (bertembung chroma key)
- Panjang ideal 4-6 saat (auto-clear)
- Banyak fail dalam satu tier → pilih random setiap gift
- Folder kosong → fallback confetti CSS
- Verify scanner: `curl http://localhost:3000/api/effects`

### Flow playback
1. Gift masuk → tier ditentukan oleh `tierFor()`
2. Scanner check folder tier → pilih random video
3. `LumaKeyVideo` component: canvas process frame-by-frame, pixel gelap (luma <18) → transparent, pixel cerah → opaque
4. Effect terapung atas green screen → chroma key TikTok Studio → composite dalam live
5. Auto-clear 5 saat

---

## 8. Effects Manager (Drag & Drop)

Butang **🎬** terapung kanan-bawah dashboard → klik untuk buka panel manager.

### Features
- **Drag & drop** video dari Windows Explorer terus ke tier drop-zone
- **Klik** drop-zone untuk pilih fail (multiple files)
- **Senarai** video dalam setiap tier dengan nama fail
- **▶ Preview** — buka video dalam tab baru
- **🗑 Buang** — delete fail dari server
- **Auto-refresh** senarai lepas upload/delete
- **Cache 30 saat** — effect list auto-rescan

### API endpoints (untuk reference)
```
GET  /api/effects         — senarai video mengikut tier
POST /api/effects/upload  — upload fail (FormData: tier + file)
POST /api/effects/delete  — buang fail (JSON: { tier, file })
```

### Tips effect video
- Background HITAM murni (RGB 0,0,0) — luma key auto-buang
- Warna cerah / neon dalam effect = OK, akan terapung cantik
- Elak hitam separa (grey) — boleh jadi semi-transparent
- Resolution tinggi OK — canvas scale down ke max 420px width untuk performance

---

## 9. Muzik & Lirik Karaoke

### 9.1 Request lagu
- Viewer: komen `mainkan lagu <tajuk>` / `lagu <tajuk>`
- Host: dashboard → input Muzik → **Mainkan**, atau QuickControls
- Queue max 5; duplicate auto-skip; `skip`/`cancel` dari komen pun berfungsi

### 9.2 Sync lirik
- Dashboard: **Lirik cepat -0.5s** / **Lirik lambat +0.5s**
- QuickControls bar (bawah dashboard): butang sama + **Skip**
- Offset auto-save dalam cache lagu (`audio/music/lyrics/<videoId>.json`)

### 9.3 Chain sumber lirik (auto-fallback)
```
1. Cache local (INSTANT)
2. LRCLIB fast path (synced, exact match)
3. YouTube captions (synced)
4. LRCLIB GET/SEARCH (synced, duration validated)
5. Groq Whisper (transcribe audio sendiri, segmented)
   + text-replacement dari plain lyrics (betulkan ejaan)
6. Plain lyrics (Lyrist/OVH) — timing rata (last resort)
```
Guard pintar:
- **Album/compilation detection** → "album mode" (lirik per-lagu mustahil untuk 1 video 10 lagu)
- **Bahasa MS/EN cross-check** (elak Whisper hallucinate English)
- **Hallucination filter** (buang baris generic macam "thanks for watching")
- **Tick validation** (lirik tak boleh lari laju bila dashboard tick tak konsisten)
- **Caption-language prior** (kalau video ada caption ms, guna tu sebagai hint)

---

## 10. AI Router & Providers

Provider chain: **Groq (primary)** → Gemini → OpenRouter → Qwen. Tiada key = provider auto-skip. Semua gagal = contextual fallback (live tak pernah senyap).

### 10.1 Semak model Groq yang hidup untuk key kamu

```powershell
$key = "<GROQ_API_KEY dari .env>"
(Invoke-RestMethod -Uri "https://api.groq.com/openai/v1/models" -Headers @{ Authorization = "Bearer $key" }).data.id
```

### 10.2 Tukar model
Edit `apps/orchestrator/src/router/AIRouter.ts`:
```ts
groq: { ..., models: ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
```
Guna 2 ID pertama dari output `/models`. Model lama (llama-3.3-70b-versatile dll) mungkin sudah retired → 404.

### 10.3 Task routing
`COMMENT_CLASSIFY`, `CHITCHAT`, `PRODUCT_PITCH`, `FAQ_REASONING`, `POLICY_REWRITE`, `SONG_EXTRACT` — semua melalui `routeAIRequest()` dengan timeout ketat (1.5-2.5s) supaya latency live kekal ~1-2 saat.

### 10.4 Empty response guards (v8.62a)
5 layer guard elak TTS cakap default message bila AI return kosong:
- `speakMixed()` guard
- `handleJoin()` guard
- `processGift()` guard
- `processComment()` guard
- `sanitizeForRegularMode()` return kosong instead of default

---

## 11. QuickControls (Dashboard)

Bar terapung bawah-tengah dashboard (`src/app/components/QuickControls.tsx`):
- **Skip** → `music:skip`
- **Lirik cepat -0.5s** → `lyrics:offset {delta:-500}`
- **Lirik lambat +0.5s** → `lyrics:offset {delta:+500}`

Hanya mount pada pathname `/` — overlay green screen tetap bersih.

---

## 12. Troubleshooting

| Masalah | Punca | Fix |
|---|---|---|
| Lirik stuck bila cycle tab/window | Browser throttle background tab | Guna shortcut Chrome anti-throttle (6.1) + klik pill sekali; jangan minimize |
| `[AI] ❌ HTTP 404 model does not exist` | Model Groq retired | Semak `/models` (10.1) → update `AIRouter.ts` |
| AI reply empty tapi TTS cakap default | — | Sudah fixed v8.62a: empty response di-skip |
| Lirik English untuk lagu Melayu | Whisper auto-detect silap | Sudah fixed v8.71: caption-language prior + reject full-EN |
| Lirik lari laju / freeze | Tick dashboard tak konsisten | Sudah fixed v8.73: tick ratio validation + cross-check jam server |
| Playlist/album tiada lirik | 1 video = banyak lagu | By design: "album mode" — request lagu single |
| `/overlay` tunjuk dashboard | File overlay tertindih | Paste semula `overlay/page.tsx` (gift overlay v8.64); clear `.next` |
| Dashboard hilang section / putih | Zombie server port 3000 atau `.next` lapuk | `Get-NetTCPConnection -LocalPort 3000 ... Stop-Process`; `Remove-Item .next -Recurse -Force`; restart |
| `FAILED: <tajuk>` music | yt-dlp tak jumpa / throttle 60s | Tunggu 60s, cuba tajuk penuh `Tajuk - Artis`; check `tools/cookies.txt` |
| LRCLIB 503 / Lyrist 429 | Rate limit luar | Auto-retry dengan backoff; Whisper fallback |
| Gift effect tak keluar | Folder tier kosong / cache scanner | Guna Effects Manager 🎬 → upload video; atau tunggu 30s; check `/api/effects` |
| Tompok hitam dalam stream | Effect video bg hitam tanpa luma key | Guna `.mp4` (luma key auto) — jangan letak bg hijau |
| Port sudah guna | Process lama | `Get-NetTCPConnection -LocalPort <port> \| ... Stop-Process -Force` |
| Effects Manager 🎬 tak muncul | `layout.tsx` tak import `<EffectsManager />` | Paste layout.tsx v8.64 penuh |
| Upload effect gagal | File terlalu besar / format tak support | Max ~50MB; guna `.mp4`/`.webm`/`.mov`/`.m4v` |

---

## 13. Git Workflow Selamat

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

## 14. Struktur Repo

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
│       ├── src/app/layout.tsx               # Root layout + QuickControls + EffectsManager (v8.64)
│       ├── src/app/components/
│       │   ├── QuickControls.tsx             # Skip + lirik cepat/lambat
│       │   └── EffectsManager.tsx           # Drag&drop gift effect
│       ├── src/app/overlay/page.tsx         # Gift overlay v8.64 (tanpa card/border)
│       ├── src/app/api/effects/
│       │   ├── route.ts                     # Scanner (list)
│       │   ├── upload/route.ts              # Upload effect
│       │   └── delete/route.ts              # Delete effect
│       └── public/effects/
│           ├── tier1/                       # Gift <100 coins
│           ├── tier2/                       # Gift 100-999 coins
│           └── tier3/                       # Gift 1000+ coins
├── packages/
│   ├── database/                # Prisma schema + client
│   └── shared/                  # WS_EVENTS constants
├── policies/tiktok_my_2026.yaml # Policy firewall TikTok MY
├── tools/                       # yt-dlp.exe + cookies.txt (gitignore)
└── README.md
```

### Senarai file yang **WAJIB ADA** dalam repo (verify sebelum push)

```powershell
# Run ni untuk check semua file critical wujud
@(
  "apps/orchestrator/src/index.ts",
  "apps/orchestrator/src/lyrics-server.ts",
  "apps/orchestrator/src/router/AIRouter.ts",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/overlay/page.tsx",
  "apps/web/src/app/components/QuickControls.tsx",
  "apps/web/src/app/components/EffectsManager.tsx",
  "apps/web/src/app/api/effects/route.ts",
  "apps/web/src/app/api/effects/upload/route.ts",
  "apps/web/src/app/api/effects/delete/route.ts"
) | ForEach-Object { if (Test-Path $_) { "✅ $_" } else { "❌ MISSING: $_" } }
```

---

## 15. Changelog

| Versi | Perubahan |
|---|---|
| **v8.64** | **Effects Manager drag&drop dari dashboard + overlay tanpa card/border + layout v8.64** |
| v8.63 | Gift effects tier system (local folder + luma key) |
| v8.62a | Empty-response guards (5 layer — TTS tak cakap default bila AI kosong) |
| v8.74 | Green mode hide debug UI (tiada sampah halus dalam chroma) |
| v8.73 | Tick validation + elapsed cross-check (lirik tak lari laju) |
| v8.72 | Anti-throttle robust (gesture resume + re-apply payload) |
| v8.71 | Caption-language prior (fix Whisper English) |
| v8.70 | Tajuk overlay center + max-width + slice 70 char |
| v8.69 | Album/compilation detection + album mode hint |
| v8.68 | Anti-throttle (silent audio + wake lock) |
| v8.67 | Ambiguous title guard + MS corrections |
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
# 1. Clone + install
git clone https://github.com/<username>/batia-os.git D:\batia-os
cd D:\batia-os
pnpm install

# 2. Setup (lihat Installation untuk detail)
#    - .env dengan GROQ_API_KEY
#    - tools/yt-dlp.exe + tools/cookies.txt
#    - prisma db push
#    - apps/web/public/effects/tier1|tier2|tier3/ (atau guna Effects Manager)

# 3. Run 3 terminal
# Terminal 1: pnpm dev:orch
# Terminal 2: cd apps/web && pnpm dev
# Terminal 3: cd apps/orchestrator && npx tsx src/lyrics-server.ts

# 4. Dashboard
#    localhost:3000 → CONNECT LIVE
#    klik 🎬 → upload effect video drag&drop
#    klik test gift → verify effect keluar tanpa background

# 5. TikTok Studio
#    window capture :4002/?bg=green (lirik) + :3000/overlay?bg=green (gift)
#    chroma key #00ff00
```

**Selamat berjaya, host! 🎤✨**