\# 🎙️ BATIA OS — AI Co-Host TikTok Live



BATIA OS ialah sistem \*\*AI co-host automatik untuk TikTok Live\*\* dalam Bahasa Melayu pasar + English. Ia membaca komen penonton dengan suara AI, melayan request lagu, auto-tap untuk likes, dan melindungi akaun dengan Policy Firewall.



\## ✨ Fitur



| Fitur | Keterangan |

|---|---|

| 🗣️ AI Host Bilingual | Balas komen dalam BM pasar / English automatik |

| 🔊 4 Suara Edge-TTS | Yasmin (F), Osman (M), Jenny (EN-F), Guy (EN-M) |

| 👋 Auto Greet | Sapa penonton baru dengan nama mereka |

| 🎵 Request Lagu | Viewer request lagu → download YouTube (yt-dlp) → main + cache |

| 🔇 Auto Ducking | Muzik kecil automatik bila AI bercakap |

| 👆 Auto Tapper | AI ajak viewer tap screen setiap 45–90s (likes REAL) |

| 🛡️ Policy Firewall | Komen berisiko ditahan ke Approval Zone untuk kelulusan manual |

| 🛍️ Shoppable Mode | Auto pitch produk + jawab soalan harga/stok/promo |

| 👑 VIP Memory | Ingat penonton VIP |

| 📊 Live Stats | Viewers, likes, komen, gifts realtime |



\---



\## 🧰 Keperluan Sistem



\- \*\*Windows 10/11\*\*

\- \*\*Node.js 24\*\* — https://nodejs.org

\- \*\*pnpm\*\* — `corepack enable` atau `npm i -g pnpm`

\- \*\*Docker Desktop\*\* (untuk Postgres + Redis) — https://docker.com

\- \*\*Git\*\* — https://git-scm.com

\- \*\*yt-dlp.exe\*\* (untuk download lagu)

\- \*\*Akaun Groq\*\* (API key percuma) — https://console.groq.com

\- \*\*Internet\*\* (TTS Edge + TikTok + YouTube)



\---



\## 📦 Cara Install (Langkah demi Langkah)



\### 1️⃣ Clone repository



```powershell

git clone https://github.com/USERNAME/batia-os.git

cd batia-os

```



\### 2️⃣ Aktifkan pnpm



```powershell

corepack enable

pnpm -v

```



\### 3️⃣ Install semua dependencies



```powershell

pnpm install

```



\### 4️⃣ Hidupkan Docker (Postgres + Redis)



Pastikan \*\*Docker Desktop\*\* sedang running, kemudian:



```powershell

docker compose up -d

```



Semak status:



```powershell

docker ps

```



Mesti nampak container \*\*postgres\*\* dan \*\*redis\*\* status `Up`.



\### 5️⃣ Setup file `.env`



Buat file `apps/orchestrator/.env`:



```env

ORCHESTRATOR\_PORT=4000

DATABASE\_URL=postgresql://postgres:postgres@localhost:5432/batia

GROQ\_API\_KEY=gsk\_gantikan\_dengan\_key\_anda

REDIS\_URL=redis://localhost:6379

```



> ⚠️ Username/password Postgres mesti \*\*sama\*\* dengan nilai dalam `docker-compose.yml`.

> 🔑 Groq API key: daftar percuma di https://console.groq.com → API Keys → Create.



\### 6️⃣ Setup Database (Prisma)



```powershell

cd packages/database

npx prisma db push

npx prisma generate

cd ..\\..

```



\### 7️⃣ Letak yt-dlp (untuk muzik)



1\. Download `yt-dlp.exe` dari https://github.com/yt-dlp/yt-dlp/releases

2\. Letak dalam folder:



```

batia-os/tools/yt-dlp.exe

```



\### 8️⃣ Run sistem (2 terminal berasingan)



\*\*Terminal 1 — Backend (Orchestrator, port 4000):\*\*



```powershell

cd D:\\batia-os

pnpm dev:orch

```



Mesti keluar:

```

BATIA Orchestrator on http://localhost:4000

\[TTS] ready: ms-MY-YasminNeural

```



\*\*Terminal 2 — Frontend (Dashboard, port 3000):\*\*



```powershell

cd D:\\batia-os

pnpm dev:web

```



\### 9️⃣ Buka dashboard



Buka browser: \*\*http://localhost:3000\*\*



\---



\## 🖥️ Cara Guna Dashboard



1\. \*\*Klik butang `SPEAKER` (ungu)\*\* — tab ini jadi peranti suara AI. (Buka \*\*1 tab sahaja\*\*.)

2\. Tukar suara: \*\*YASMIN / OSMAN\*\*

3\. Test tanpa live: tekan \*\*Test 1 – Test 4\*\*, \*\*SHOP 1–3\*\*, \*\*Test JOIN\*\*, \*\*Test MUZIK\*\*

4\. Muzik: taip tajuk lagu → \*\*Mainkan\*\* / \*\*Pause\*\* / \*\*Stop\*\*

5\. \*\*Auto Tapper\*\*: klik \*\*Start Auto Tap\*\*

6\. \*\*Shoppable Live\*\*: klik \*\*SHOPPABLE LIVE\*\* → isi produk → \*\*Go Live\*\*



\### 🔴 Nak connect TikTok Live



1\. \*\*GO LIVE dulu di phone\*\* (public) — wajib!

2\. Masukkan username TikTok (tanpa `@`)

3\. Klik \*\*CONNECT LIVE\*\* → badge jadi `CONNECTED`

4\. Komen viewer akan dibaca AI secara automatik

5\. \*\*JANGAN refresh / restart terminal masa live\*\*



\---



\## 🧪 Test Komen Tanpa Live (script)



```powershell

cd apps/orchestrator

npx tsx test-viewer.ts kak\_ros "Wah bestnya live malam ni member"

npx tsx test-viewer.ts --join

```



\---



\## 📁 Struktur Project



```

batia-os/

├── apps/

│   ├── orchestrator/      # Backend: Socket.IO, TTS, AI, muzik, TikTok

│   │   └── src/

│   │       ├── index.ts

│   │       ├── adapters/TikTokAdapter.ts

│   │       ├── core/ (LiveContextEngine, ScriptQueue)

│   │       ├── policy/PolicyEngine.ts

│   │       ├── router/AIRouter.ts

│   │       └── voice/TtsEngine.ts

│   └── web/               # Frontend Next.js (dashboard)

├── packages/

│   ├── shared/            # WS\_EVENTS \& types

│   └── database/          # Prisma schema (Postgres)

├── policies/

│   └── tiktok\_my\_2026.yaml  # Rule Policy Firewall

├── tools/

│   └── yt-dlp.exe         # Letak manual

├── docker-compose.yml     # Postgres + Redis

└── README.md

```



\---



\## 🛠️ Troubleshooting



| Masalah | Punca | Fix |

|---|---|---|

| `User isn't online` | Akaun TikTok tak tengah live | GO LIVE di phone dulu, baru CONNECT LIVE |

| `EADDRINUSE :4000` | Process lama masih hidup | `taskkill /IM node.exe /F` → run semula |

| Suara AI tak keluar | Tab bukan SPEAKER / autoplay block | Klik mana-mana kat page, klik \*\*SPEAKER\*\*, tinggal 1 tab |

| Lagu lambat mula | Download YouTube pertama kali (normal) | Main semula = instant (cache) |

| Postgres tak connect | Docker tak running | `docker compose up -d` |

| Sistem "lari" lepas edit | Code rosak | Rollback ke save point (bawah) |



\---



\## 💾 Save Point \& Rollback



Sentiasa commit bila sistem stabil:



```powershell

git add -A

git commit -m "SAVE POINT: sistem stabil"

git push origin main

```



Rollback bila rosak:



```powershell

git log --oneline

git checkout <COMMIT\_ID> -- apps/orchestrator/src apps/web/src

```



\---



\## 📄 Lesen



Projek peribadi. Penggunaan tertakluk kepada ToS TikTok \& Microsoft Edge-TTS.

