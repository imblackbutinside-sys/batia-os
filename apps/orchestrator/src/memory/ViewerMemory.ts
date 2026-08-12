import { prisma } from "@batia/database";

export async function trackViewer(username: string): Promise<{ isVip: boolean; visitCount: number }> {
  const memory = await prisma.viewerMemory.upsert({
    where: { tiktokUserId: username },
    create: { tiktokUserId: username, username, isVip: false },
    update: {},
  });

  const visitCount = await prisma.commentLog.count({
    where: { username },
  });

  if (!memory.isVip && visitCount >= 3) {
    await prisma.viewerMemory.update({
      where: { tiktokUserId: username },
      data: { isVip: true },
    });
    return { isVip: true, visitCount };
  }
  return { isVip: memory.isVip, visitCount };
}
