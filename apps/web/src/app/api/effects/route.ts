// ✅ BATIA Effects Scanner v8.63 - scan local folder effects tiap request
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = path.join(process.cwd(), "public", "effects");
  const out: Record<string, string[]> = { tier1: [], tier2: [], tier3: [] };
  for (const tier of ["tier1", "tier2", "tier3"]) {
    const dir = path.join(base, tier);
    try {
      if (fs.existsSync(dir)) {
        out[tier] = fs
          .readdirSync(dir)
          .filter((f) => /\.(mp4|webm|mov|m4v)$/i.test(f))
          .map((f) => `/effects/${tier}/${encodeURIComponent(f)}`);
      }
    } catch (e) {}
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}