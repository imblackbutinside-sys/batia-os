import { prisma } from "@batia/database";

async function main() {
  console.log("Seeding BATIA catalog...");

  const products = [
    {
      title: "Serum Vitamin C Brightening 30ml",
      skus: [
        { skuCode: "SVC-30", price: 89, stock: 45 },
        { skuCode: "SVC-30-PROMO", price: 69, stock: 20 },
      ],
    },
    {
      title: "Tudung Bawal Satin Premium",
      skus: [
        { skuCode: "TBS-BLACK", price: 45, stock: 30 },
        { skuCode: "TBS-PINK", price: 45, stock: 25 },
        { skuCode: "TBS-NAVY", price: 45, stock: 18 },
      ],
    },
    {
      title: "Minyak Wangi Oud Arabian 50ml",
      skus: [
        { skuCode: "OWA-50", price: 129, stock: 15 },
        { skuCode: "OWA-50-SET", price: 199, stock: 8 },
      ],
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { title: p.title } });
    if (existing) {
      console.log("Skip (exists):", p.title);
      continue;
    }
    const created = await prisma.product.create({
      data: { title: p.title, skus: { create: p.skus } },
    });
    console.log("Created:", created.title, "-", p.skus.length, "SKUs");
  }
  console.log("Seed done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
