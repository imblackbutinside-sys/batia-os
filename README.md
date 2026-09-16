# 🎙️ BATIA OS — AI Host TikTok Live Malaysia

AI host automatik untuk TikTok Live Malaysia. Boleh:
- ✅ Jawab komen penonton dalam **Bahasa Melayu pasar (rojak)** atau English secara automatik
- ✅ Faham slang TikTok Malaysia (PC = Punch Card/Heart Me, hati oren, tap screen, beg kuning)
- ✅ React kepada gift (Rose, Lion, Galaxy, Heart Me, dll) dengan sebutan betul
- ✅ Main lagu request dari YouTube (dengan cache supaya instant)
- ✅ Shoppable Live mode (pitch produk automatik)
- ✅ Policy Firewall TikTok Malaysia + Human Approval Zone
- ✅ Auto Tapper (AI ajak viewer tap screen → likes REAL)
- ✅ Dual voice: Yasmin (female) / Osman (male) + Jenny/Guy untuk English

---

## 📁 Struktur Projek

```
D:\batia-os\
├── apps\
│   ├── orchestrator\          # BACKEND (Node + Socket.IO)
│   │   ├── src\
│   │   │   ├── index.ts       # ⭐ Main server (WAJIB tahu file ni)
│   │   │   ├── router\AIRouter.ts      # ⭐ AI routing + Groq + detect language
│   │   │   ├── voice\TtsEngine.ts      # ⭐ Text-to-Speech + sebutan rojak
│   │   │   ├── core\          # LiveContextEngine, ScriptQueue
│   │   │   ├── policy\        # PolicyEngine (firewall)
│   │   │   └── adapters\TikTokAdapter.ts  # Connector TikTok Live
│   │   ├── audio\             # Audio AI response (auto-clear masa start)
│   │   │   └── music\         # ⭐ Cache lagu YouTube + cache.json
│   │   └── test-viewer.ts     # Tool test komen tanpa live
│   └── web\
│       └── src\app\page.tsx   # ⭐ Dashboard (frontend)
├── packages\
│   ├── database\              # Prisma (SQLite/Postgres)
│   └── shared\                # WS_EVENTS constants
├── policies\
│   └── tiktok_my_2026.yaml    # Rules Policy Firewall
├── tools\
│   ├── yt-dlp.exe             # ⭐ Downloader YouTube
│   └── cookies.txt            # ⭐ Cookies YouTube (WAJIB login)
└── README.md                  # File ni
```

**4 file yang paling selalu diubah:** `index.ts`, `AIRouter.ts`, `TtsEngine.ts`, `page.tsx`

---

## 🧰 Keperluan Sistem

| Item | Versi / Nota |
|---|---|
| Windows | 10 / 11 |
| Node.js | 20+ (tested v24) |
| pnpm | `npm install -g pnpm` |
| Microsoft Edge | Untuk TTS (Edge Neural Voice) + export cookies |
| Akaun Groq | https://console.groq.com → API key (PERCUMA) |
| Akaun YouTube | Login dalam Edge (untuk cookies download lagu) |
| Akaun TikTok | Username live host |

---

## 🚀 SETUP DARI AWAL (ikut urutan!)

### 1. Clone repo
```powershell
git clone <URL-REPO-GITHUB> D:\batia-os
cd D:\batia-os
```

### 2. Install dependencies
```powershell
pnpm install
```

### 3. Setup environment keys
Buat file `apps\orchestrator\.env`:
```env
ORCHESTRATOR_PORT=4000
GROQ_API_KEY=gsk_xxxxxxxxxxxx
EDGE_TTS_VOICE=ms-MY-YasminNeural
DATABASE_URL="file:./dev.db"
```
*(Keys lain optional: `DASHSCOPE_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`)*

### 4. Setup database
```powershell
pnpm --filter @batia/database db push
```
*(Kalau fail, cuba: `pnpm --filter @batia/database migrate dev`)*

### 5. Setup tools muzik
```powershell
mkdir D:\batia-os\tools
# Download yt-dlp.exe dari https://github.com/yt-dlp/yt-dlp/releases
# Letak dalam D:\batia-os\tools\yt-dlp.exe
```

**Cookies YouTube (WAJIB untuk download lagu):**
1. Buka **Edge** → pergi https://youtube.com → **LOGIN**
2. Install extension Edge: **"Get cookies.txt LOCALLY"**
3. Klik extension → **Export**
4. Save sebagai `D:\batia-os\tools\cookies.txt`
   - ⚠️ Pastikan nama betul-betul `cookies.txt` (bukan `cookies.txt.txt`)
5. Verify:
```powershell
Test-Path D:\batia-os\tools\cookies.txt   # patut: True
```

### 6. Run sistem (2 terminal)
```powershell
# TERMINAL 1 — Backend
cd D:\batia-os
pnpm dev:orch
# Patut keluar: BATIA Orchestrator on http://localhost:4000

# TERMINAL 2 — Dashboard
cd D:\batia-os
pnpm dev:web
# Patut keluar: localhost:3000
```

### 7. Buka dashboard & connect
1. Browser: `http://localhost:3000`
2. Masukkan username TikTok (tanpa @)
3. Klik **CONNECT LIVE**
4. Tunggu status hijau `CONNECTED`
5. Klik **SPEAKER: LAPTOP** pada peranti yang nak keluarkan suara

---

## 📅 CARA RUN HARIAN (lepas setup siap)

```powershell
# Terminal 1
cd D:\batia-os
pnpm dev:orch

# Terminal 2
cd D:\batia-os
pnpm dev:web
```
Pastu dashboard → **CONNECT LIVE** → mula live dalam phone TikTok.

️ **Lepas restart orchestrator, WAJIB klik CONNECT LIVE semula** (TikTok tak auto-reconnect).

---

## 🧪 TESTING (tanpa live)

```powershell
cd D:\batia-os\apps\orchestrator

# Test komen BM
npx tsx test-viewer.ts test_user "hai bang khabar?"

# Test komen EN
npx tsx test-viewer.ts test_user "hi, are you selling something?"

# Test request lagu
npx tsx test-viewer.ts test_user "lagu kejora"

# Test slang TikTok
npx tsx test-viewer.ts test_user "PC HARI BARU"
```

Atau guna butang **Test 1 / Test 2 / Test EN** dalam dashboard.

---

## 🎵 CACHE LAGU

- Lagu yang pernah download disimpan dalam `apps\orchestrator\audio\music\`
- Mapping tajuk→file dalam `music\cache.json`
- Request lagu sama kali kedua = **INSTANT** (cache hit)
- Nak force download baru:
```powershell
Remove-Item D:\batia-os\apps\orchestrator\audio\music\cache.json
```

---

## 🛠️ TROUBLESHOOTING (masalah yang PERNAH jadi + fix)

| Masalah | Punca | Penyelesaian |
|---|---|---|
| Muzik fail `403/Sign in` | Cookies YouTube expired | Re-export `cookies.txt` dari Edge (login dulu) |
| Muzik fail `HTTP 416` | Bug `--no-part` (dah fix v8.5) | Pastikan code terkini |
| Download lagu fail tanpa sebab | Timeout (lagu panjang) | Timeout sekarang 30s (v8.19). Kalau masih fail, log akan tunjuk `stderr:` |
| Main lagu SALAH | Cache rosak (dah fix v8.5) | `Remove-Item ...\music\cache.json` |
| Pause → Play → Pause tak jadi | Bug frontend state (dah fix) | Pastikan `page.tsx` terkini (fix RESUMED→PLAYING) |
| Komen/lagu LAMA dibaca lepas reboot | Backlog TikTok | Grace 8s auto-discard (v8.18b). Log tunjuk `[BACKLOG] Discard` |
| Response lambat 9-10 saat | Groq congested / rate limit | Timeout ketat + DEMO fallback (v8.16/17). Tunggu 15-30 minit Groq recover |
| AI jawab English untuk komen BM | detectLang sempit (dah fix v8.10) | Pastikan `AIRouter.ts` terkini |
| Sebutan "Rose" jadi "rosea" | TTS baca ikut Melayu | PRONUNCIATION_FIX dalam `TtsEngine.ts` (v8.12+) |
| Sebutan "la" jadi "le" | TTS tak confident | Mapping `la → lah` (v8.16+) |
| Username disebut pelik (test_user) | TTS baca underscore | Username fix dalam `TtsEngine.ts` |
| Suara tak keluar | Audio sink tak claim | Klik butang **SPEAKER: LAPTOP** dalam dashboard |
| TikTok tak connect lepas restart | Normal — tak auto-reconnect | Klik **CONNECT LIVE** semula |
| Port 4000 berebut (EADDRINUSE) | 2 process node hidup | `Get-Process node \| Stop-Process -Force` pastu run semula |
| Dashboard tak update | Socket lama | Refresh browser (Ctrl+F5) |
| Code kacau selepas edit AI lain | Edit bertindih | `git checkout -- <file>` untuk revert ke commit stabil |

---

## 💾 GIT WORKFLOW (bila nak save kerja)

```powershell
cd D:\batia-os
git add -A
git commit -m "SAVE v8.XX: cerita perubahan"
git push origin main
```

**Bila code rosak / nak balik ke versi stabil:**
```powershell
git status                      # tengok file mana berubah
git log --oneline -5            # tengok commit terakhir
git checkout -- apps/orchestrator/src/index.ts   # revert 1 file
# atau revert semua:
git reset --hard origin/main
```
⚠️ `git reset --hard` BUANG semua local changes. Jangan guna kalau ada kerja belum commit.
⚠️ **JANGAN revert `tools/cookies.txt`** — cookies terkini ada situ.

---

## 📜 SEJARAH VERSI (ringkas)

| Versi | Perubahan penting |
|---|---|
| v8 | Groq multi-model fallback |
| v8.4 | Response fresh + compound-mini (laju) |
| v8.5 | Exact song file match (tak main lagu salah) |
| v8.7 | Slang TikTok MY (PC/Heart Me) + context |
| v8.10 | detectLang BM lengkap (default BM) |
| v8.12 | Pronunciation gift (Rose→ros, Heart→hart) + unicode fancy text |
| v8.14 | Clean pronunciation (kurang over-fix) |
| v8.16 | AI timeout ketat + latency log |
| v8.17 | compound-mini dulu + rule fallback song extract |
| v8.18b | Discard backlog TikTok lepas reconnect |
| v8.19 | Music timeout 30s + stderr logging |

---

## 📞 NOTA PENTING

1. **Groq free tier ada rate limit** — kalau banyak test sehari, dia jadi lambat/sekat sebentar. Tunggu 15-30 minit.
2. **Cookies YouTube luput** dalam beberapa minggu — export semula bila muzik mula fail.
3. **Jangan biar ChatGPT/AI lain edit code tanpa commit dulu** — commit sebelum experiment, senang revert.
4. **Commit kecil & kerap** — senang tahu mana punca bila rosak.

Selamat live! 🎙️🇲