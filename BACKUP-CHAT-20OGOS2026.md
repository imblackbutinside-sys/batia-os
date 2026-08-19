# BACKUP SESI - 20 OGOS 2026 (BATIA OS)

## Masalah & Fix
1. Suara AI hilang / DEMO MODE
   Punca: Groq buang model llama-3.3-70b-versatile pada 16/8/2026 (rasmi:
   console.groq.com/docs/deprecations, diumumkan 17/6/2026).
   Fix: tukar ke qwen/qwen3.6-27b (pilihan bukan OpenAI).
2. TTS baca "thinking process"
   Punca: Qwen3.6 berfikir secara default (reasoning_format raw).
   Fix: reasoning_effort:"none" + reasoning_format:"hidden" + strip tag
   think dalam callProvider (AIRouter.ts).
3. Komen Melayu dijawab English (sebutan tak betul)
   Punca: language detection pakai AI, selalu tersilap (lang=EN utk komen MS).
   Fix: detectLang rule-based (regex perkataan Melayu) dalam AIRouter.ts;
   laluan soalan (FAQ_REASONING) dalam LiveContextEngine.ts pun ikut bahasa.
4. Username TikTok jadi "viewer"/salah
   Fix: ambil dari data.user.uniqueId / data.user.nickname (TikTokAdapter.ts).
5. Fail rosak sebab paste Notepad bertindih (shared/index.ts, LiveContextEngine.ts)
   Fix: git checkout HEAD -- <fail>, kemudian ganti dengan versi bersih.

## Fail diubah (commit 568bc9e)
- apps/orchestrator/src/router/AIRouter.ts (model + reasoning + detectLang)
- apps/orchestrator/src/core/LiveContextEngine.ts (soalan bilingual)
- apps/orchestrator/src/adapters/TikTokAdapter.ts (username real)
- apps/orchestrator/src/core/AiReadState.ts (baru - asas AI BACA KOMEN)
- .gitignore (ignore audio cache)
- README.md + PANDUAN-BATIA.html (dokumentasi kemaskini)

## Save points
568bc9e TERKINI | 8a5b2dc | 4f25664 | 548adf3 (lama, origin/main)
Rollback: git checkout 568bc9e -- apps/orchestrator/src apps/web/src

## API key
GROQ_API_KEY dalam apps/orchestrator/.env - JANGAN kongsi atau push ke GitHub.

## Status feature
Jalan: bilingual 4 suara, policy firewall, stats/VIP, auto-pitch, username real.
Belum: butang AI BACA KOMEN ON/OFF (UI), SUARA KU (voice clone), auto-sapa.
