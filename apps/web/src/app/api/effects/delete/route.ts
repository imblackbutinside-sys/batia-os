// ✅ BATIA Effects Delete v8.64
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { tier, file } = await req.json();
    if (!/^tier[123]$/.test(String(tier))) return NextResponse.json({ ok: false }, { status: 400 });
    const target = path.join(process.cwd(), "public", "effects", String(tier), path.basename(String(file)));
    if (!fs.existsSync(target)) return NextResponse.json({ ok: false, error: "tak jumpa" }, { status: 404 });
    fs.unlinkSync(target);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}