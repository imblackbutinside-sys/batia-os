// ✅ BATIA Effects Upload v8.64 - terima drag&drop dari dashboard, save ke public/effects/<tier>
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const tier = String(form.get("tier") || "");
    const file = form.get("file");
    if (!/^tier[123]$/.test(tier)) return NextResponse.json({ ok: false, error: "tier tak sah" }, { status: 400 });
    if (!file || !(file instanceof File)) return NextResponse.json({ ok: false, error: "tiada file" }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    if (!/\.(mp4|webm|mov|m4v)$/.test(ext)) return NextResponse.json({ ok: false, error: "format tak support: " + ext }, { status: 400 });
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const dir = path.join(process.cwd(), "public", "effects", tier);
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, safe), buf);
    return NextResponse.json({ ok: true, path: `/effects/${tier}/${safe}`, size: buf.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}