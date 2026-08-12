import { prisma } from "@batia/database";

export interface ProductWithSkus { title: string; skus: Array<{ skuCode: string; price: number; stock: number }>; }

const STOPWORDS = new Set(["tak", "ada", "ni", "tu", "berapa", "harga", "nak", "yang", "kalau", "boleh", "sikit", "bang", "kak", "untuk", "dengan", "macam", "mana", "warna", "set", "jualan", "produk"]);

export async function findProducts(text: string, limit = 3): Promise<ProductWithSkus[]> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const products = await prisma.product.findMany({ include: { skus: true } });

  const scored = products
    .map((p) => {
      const t = p.title.toLowerCase();
      let score = 0;
      for (const w of words) if (t.includes(w)) score++;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => ({
    title: x.p.title,
    skus: x.p.skus.map((s) => ({ skuCode: s.skuCode, price: s.price, stock: s.stock })),
  }));
}

export function formatCatalogForAI(catalog: ProductWithSkus[]): string {
  if (catalog.length === 0) return "(Tiada produk padan dalam katalog)";
  return catalog
    .map((p) => {
      const skuLines = p.skus
        .map((s) => "  - " + s.skuCode + ": RM" + s.price + " (stok " + s.stock + ")")
        .join("\n");
      return p.title + "\n" + skuLines;
    })
    .join("\n\n");
}
