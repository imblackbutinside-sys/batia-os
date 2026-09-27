# BATIA OS 🎤🤖

**AI Host Orchestrator untuk TikTok Live Malaysia** — auto-reply komen, reaction gift dengan cinematic effects (drag & drop manager), muzik request + lirik karaoke synced, TTS Bahasa Melayu pasar, dan chroma key integration untuk TikTok Live Studio.

---

## 📋 Isi Kandungan

1. [Seni Bina Sistem](#1-seni-bina-sistem)
2. [Keperluan](#2-keperluan)
3. [Installation](#3-installation)
4. [Menjalankan Sistem (3 Terminal)](#4-menjalankan-sistem-3-terminal)
5. [Setup Dashboard & TikTok Connect](#5-setup-dashboard--tiktok-connect)
6. [Setup TikTok Live Studio (2 Overlay Asing)](#6-setup-tiktok-live-studio-2-overlay-asing)
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
| **Web Dashboard** | `3000` | Next.js: dashboard host + **gift overlay** (`/overlay?bg=green`) + effects API (scan/upload/delete) |
| **Lyrics Server** | `4002` | **Lirik overlay** (`/?bg=green`) + enjin lirik (fetch chain, offset, tick validation) |

```
TikTok Live ──> TikTokAdapter ──> Orchestrator (:4000)
                                      │  ├─> PolicyEngine + LiveContextEngine
                                      │  ├─> AIRouter (Groq → Gemini → OpenRouter → Qwen)
                                      │  ├─> TtsEngine (Edge TTS ms-MY)
                                      │  ├─> Music (yt-dlp → audio/music/)
                                      │  └─> relay music:tick / lyrics:offset
                                      ├─> Web (:3000)
                                      │     ├─ Dashboard (QuickControls + Effects Manager 🎬)
                                      │     └─ GIFT overlay  /overlay?bg=green   ─┐
                                      └─> Lyrics (:4002)                          ├─ TikTok Studio
                                            └─ LIRIK overlay /?bg=green          ─┘ (2 source asing)
```

> **Design note:** Gift overlay dan lirik overlay **sengaja diasingkan** (2 window, 2 source TikTok Studio) supaya host bebas susun posisi setiap layer dalam Studio tanpa bertindih.

---

## 2. Keperluan

- **Windows 10/11**
- **Node.js 20+** — https://nodejs.org
- **pnpm** — `npm install -g pnpm`
- **Git for Windows**
- **Google Chrome** (untuk overlay windows)
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
> ⚠️ `cookies.txt` ada dalam `.gitignore` — JANGAN push ke GitHub.

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

### 3.5 Database (Prisma)

```powershell
cd packages/database
# Set DATABASE_URL dalam .env ikut schema (sqlite/postgres)
npx prisma db push
npx prisma generate
cd ..\..
```

### 3.6 Folder gift effects (optional — boleh guna Effects Manager instead)

```powershell
mkdir D:\batia-os\apps\web\public\effects\tier1
mkdir D:\batia-os\apps\web\public\effects\tier2
mkdir D:\batia-os\apps\web\public\effects\tier3
```

---

## 4. Menjalankan Sistem (3 Terminal)

Buka **3 terminal berasingan**:

```powershell
# TERMINAL 1 — Orchestrator (:4000)
cd D:\batia-os
pnpm dev:orch

# TERMINAL 2 — Web dashboard + gift overlay (:3000)
cd D:\batia-os\apps\web
pnpm dev

# TERMINAL 3 — Lyrics server + lirik overlay (:4002)
cd D:\batia-os\apps\orchestrator
npx tsx src/lyrics-server.ts
```

Tunggu semua ready:
- Terminal 1: `BATIA Orchestrator on http://localhost:4000`
- Terminal 2: `✓ Ready`
- Terminal 3: `[LYRICS] 🌐 Overlay lirik: http://localhost:4002`

> Ketiga-tiga terminal **WAJIB hidup** masa live. Terminal 3 ialah enjin lirik — walau overlay lirik cuma dipakai dari :4002, dia juga sumber data lirik.

---

## 5. Setup Dashboard & TikTok Connect

1. Buka `http://localhost:3000`
2. Masukkan username TikTok (tanpa `@`) → **CONNECT LIVE**
3. Status jadi `CONNECTED` bila akaun sedang live
4. Dashboard auto-claim **audio sink** (label LAPTOP) — lagu & TTS berbunyi dari laptop ni
5. Pilih suara: **YASMIN** / **OSMAN**
6. Mode: **REGULAR LIVE** (chit-chat) / **SHOPPABLE LIVE** (pitch produk)

### Butang test
- `Test 1-4`, `SHOP 1-3`, `Test EN` — komen simulasi (chit-chat, soalan, violation)
- `Test GIFT: Heart Me / Rose` — simulasi gift (trigger overlay effect)
- `Test JOIN` / `Test MUZIK` — penonton masuk / request lagu
- `Clear Cache` — reset dedupe cache

---

## 6. Setup TikTok Live Studio (2 Overlay Asing)

### 6.1 Chrome khas anti-throttle (WAJIB untuk lirik smooth)

Buat **shortcut desktop** dengan target:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=D:\overlay-chrome --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --app=http://localhost:4002/?bg=green
```

- Launch shortcut → **KLIK SEKALI** pill merah "AKTIFKAN ANTI-THROTTLE"
- Window ni boleh duduk belakang / monitor kedua — **JANGAN minimize**

### 6.2 Window gift overlay

- Buka `http://localhost:3000/overlay?bg=green`
- **Klik kanan tab → "Move tab to new window"** (WAJIB window sendiri — Chrome pause video dalam tab background!)
- Klik sekali dalam window tu (unlock autoplay)

### 6.3 Source dalam TikTok Live Studio

| Layer | Window | URL | Susunan cadangan |
|---|---|---|---|
| **LIRIK** | Window Chrome khas | `http://localhost:4002/?bg=green` | Bawah-tengah, scale ~80% |
| **GIFT** | Window tab terpisah | `http://localhost:3000/overlay?bg=green` | Tengah, full frame |

Untuk setiap source:
1. Add Source → **Window Capture** → pilih window berkenaan
2. Klik kanan source → **Filters** → Add → **Chroma Key** → key color `#00ff00`
3. Drag / scale setiap source bebas — **2 layer asing, tak bertindih**

> Rule: jangan minimize window overlay; belakang / occluded OK (flags anti-throttle jaga lirik, auto-resume jaga gift).

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

### Flow playback
1. Gift masuk → `tierFor()` tentukan tier ikut nama/nilai gift
2. Scanner pilih random video dari folder tier
3. `LumaKeyVideo`: canvas process frame-by-frame — pixel hitam → transparent (max-channel key, warna saturated kekal solid)
4. Effect terapung atas green screen → chroma key TikTok Studio → composite dalam live
5. Auto-clear bila video habis

### Chrome power-saving guard
- Overlay gift **WAJIB window sendiri** (bukan tab background)
- Auto-resume + retry (12x) bila Chrome pause video untuk jimat power (`AbortError`)
- Hybrid draw loop (rAF + interval) — jalan walau window occluded

---

## 8. Effects Manager (Drag & Drop)

Butang **🎬** terapung kanan-bawah dashboard → klik untuk buka panel.

### Features
- **Drag & drop** video dari Windows Explorer terus ke tier drop-zone
- **Klik** drop-zone untuk pilih fail (multiple files)
- **Senarai** video setiap tier + **▶ preview** + **🗑 buang**
- Auto-refresh lepas upload/delete; scanner cache 30 saat

### API endpoints
```
GET  /api/effects         — senarai video mengikut tier
POST /api/effects/upload  — upload fail (FormData: tier + file)
POST /api/effects/delete  — buang fail (JSON: { tier, file })
```

### Verify scanner
```powershell
curl -UseBasicParsing http://localhost:3000/api/effects
# {"tier1":["/effects/tier1/HeartMe.mp4"],"tier2":[],"tier3":[]}
```

---

## 9. Muzik & Lirik Karaoke

### 9.1 Request lagu
- Viewer: komen `mainkan lagu <tajuk>` / `lagu <tajuk>`
- Host: dashboard → input Muzik → **Mainkan**
- Queue max 5; duplicate auto-skip; komen `skip`/`cancel` pun berfungsi

### 9.2 Sync lirik
- Dashboard / QuickControls: **Lirik cepat -0.5s** / **Lirik lambat +0.5s**
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

### 9.4 Guard pintar
- **Album/compilation detection** → "album mode" (1 video 10 lagu = lirik per-lagu mustahil)
- **Caption-language prior** (caption ms → hint Bahasa Melayu)
- **Reject full-English** untuk konteks MS (elak hallucination)
- **Hallucination filter** (buang "thanks for watching" dll)
- **Tick validation** (lirik tak boleh lari laju bila dashboard tick tak konsisten)

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
Guna 2 ID pertama dari output `/models`. Model lama mungkin retired → 404.

### 10.3 Task routing
`COMMENT_CLASSIFY`, `CHITCHAT`, `PRODUCT_PITCH`, `FAQ_REASONING`, `POLICY_REWRITE`, `SONG_EXTRACT` — timeout ketat 1.5-2.5s supaya latency live kekal ~1-2 saat.

### 10.4 Empty response guards
5 layer guard elak TTS cakap default message bila AI return kosong (`speakMixed`, `handleJoin`, `processGift`, `processComment`, `sanitizeForRegularMode`).

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
| Gift effect tak keluar langsung | Overlay jadi tab background → Chrome pause video | Move tab to new window; klik sekali unlock autoplay |
| Console: `AbortError ... paused to save power` | Chrome power-saving | v8.70 auto-resume+retry; pastikan window sendiri |
| Lirik stuck bila cycle tab/window | Browser throttle background tab | Guna shortcut Chrome anti-throttle (6.1); jangan minimize |
| Effect ada hijau bocor dalam warna | Luma key lama (luminance) | v8.70 guna max-channel key — warna solid |
| Lirik English untuk lagu Melayu | Whisper auto-detect silap | Caption-language prior + reject full-EN (v8.71+) |
| Lirik lari laju / freeze | Tick dashboard tak konsisten | Tick validation (v8.73+) |
| Playlist/album tiada lirik | 1 video banyak lagu | By design: album mode — request lagu single |
| `/overlay` tunjuk dashboard | File overlay tertindih | Paste semula `overlay/page.tsx` v8.70; clear `.next` |
| Dashboard hilang section / putih | Zombie server :3000 / `.next` lapuk | Kill port 3000; `Remove-Item .next -Recurse -Force`; restart |
| 🎬 Effects Manager tak muncul | `layout.tsx` tak import `<EffectsManager />` | Paste layout v8.64 penuh |
| `FAILED: <tajuk>` music | yt-dlp throttle 60s / title silap | Tunggu 60s; guna `Tajuk - Artis`; check `tools/cookies.txt` |
| LRCLIB 503 / Lyrist 429 | Rate limit luar | Auto-retry backoff; Whisper fallback |
| `[AI] ❌ HTTP 404 model does not exist` | Model Groq retired | Semak `/models` → update `AIRouter.ts` |
| Port sudah guna | Process lama | `Get-NetTCPConnection -LocalPort <port> \| ... Stop-Process -Force` |

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
*.log
tools/cookies.txt
apps/orchestrator/audio/
audio/*.mp3
last_tiktok_user.txt
apps/web/public/effects/**/*.mp4
apps/web/public/effects/**/*.webm
apps/web/public/effects/**/*.mov
apps/web/public/effects/**/*.m4v
```

---

## 14. Struktur Repo

```
batia-os/
├── apps/
│   ├── orchestrator/              # Backend :4000 + lyrics :4002
│   │   ├── src/index.ts           # Orchestrator utama (v8.62a guards)
│   │   ├── src/router/AIRouter.ts # Provider chain + routing
│   │   ├── src/lyrics-server.ts   # Lyrics engine + overlay (v8.74)
│   │   ├── src/policy/ src/core/ src/voice/ src/adapters/
│   │   ├── audio/music/           # cache lagu + lyrics/ (gitignore)
│   │   └── .env
│   └── web/                       # Next.js :3000
│       ├── src/app/page.tsx       # Dashboard
│       ├── src/app/layout.tsx     # Root layout + QuickControls + EffectsManager
│       ├── src/app/components/
│       │   ├── QuickControls.tsx  # Skip + lirik cepat/lambat
│       │   └── EffectsManager.tsx # Drag&drop gift effect
│       ├── src/app/overlay/page.tsx   # GIFT overlay v8.70 (luma key, tiada lirik)
│       ├── src/app/api/effects/
│       │   ├── route.ts           # Scanner (list)
│       │   ├── upload/route.ts    # Upload effect
│       │   └── delete/route.ts    # Delete effect
│       └── public/effects/tier1|tier2|tier3/   # video effect (gitignore)
├── packages/
│   ├── database/                  # Prisma schema + client
│   └── shared/                    # WS_EVENTS constants
├── policies/tiktok_my_2026.yaml   # Policy firewall TikTok MY
├── tools/                         # yt-dlp.exe + cookies.txt (gitignore)
└── README.md
```

### Verify file critical sebelum push
```powershell
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
| **v8.70** | **Overlay gift-only semula (lirik kekal asing :4002) — 2 layer bebas susun** |
| v8.69 | (Experimental) unified overlay — dibuang semula ikut preference host |
| v8.68 | Auto-resume + retry play (Chrome power-save AbortError) |
| v8.67 | Force muted via property (fix NotAllowedError autoplay) + play reject logging |
| v8.66 | Max-channel luma key (warna saturated solid, tiada hijau bocor) |
| v8.65 | Hybrid draw loop (effect jalan walau tab hidden/occluded) |
| v8.64 | Effects Manager drag&drop + overlay tanpa card/border + layout v8.64 |
| v8.63 | Gift effects tier system (local folder + luma key) + QuickControls |
| v8.62a | Empty-response guards (5 layer) |
| v8.74 | Green mode hide debug UI (lyrics overlay) |
| v8.73 | Tick validation + elapsed cross-check |
| v8.72 | Anti-throttle robust (gesture resume) |
| v8.71 | Caption-language prior (fix Whisper English) |
| v8.70L | Tajuk overlay center + max-width |
| v8.69L | Album/compilation detection + album mode |
| v8.68L | Anti-throttle (silent audio + wake lock) |
| v8.62 | Cache lirik kecil restore |
| v8.61 | Dashboard lengkap + lead-in detector + CORS /music/ |

*(L = lyrics server track)*

---

## 🎯 Quick Start (ringkas)

```powershell
# 1. Clone + install
git clone https://github.com/<username>/batia-os.git D:\batia-os
cd D:\batia-os && pnpm install

# 2. Setup: .env (GROQ_API_KEY) + tools/yt-dlp.exe + tools/cookies.txt + prisma db push

# 3. Run 3 terminal
# T1: pnpm dev:orch
# T2: cd apps/web && pnpm dev
# T3: cd apps/orchestrator && npx tsx src/lyrics-server.ts

# 4. Dashboard localhost:3000 → CONNECT LIVE
#    🎬 upload effect video (drag&drop) → Test GIFT verify

# 5. TikTok Studio: 2 source Window Capture
#    - lirik:  :4002/?bg=green  (shortcut Chrome anti-throttle)
#    - gift:   :3000/overlay?bg=green (window sendiri)
#    chroma key #00ff00 kedua-duanya, susun posisi bebas
```

**Selamat berjaya, host! 🎤✨**