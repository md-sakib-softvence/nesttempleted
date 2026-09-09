import { PrismaService } from '../../../prisma/prisma.service';

export async function generatePlayerId(prisma: PrismaService): Promise<string> {
  const lastPlayer = await prisma.player.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { showPlayerId: true },
  });

  if (!lastPlayer || !lastPlayer.showPlayerId) {
    return 'PLY-00001';
  }

  const lastId = lastPlayer.showPlayerId;
  const numberPart = lastId.split('-')[1];

  if (!numberPart) {
    return 'PLY-00001';
  }

  const nextNumber = parseInt(numberPart, 10) + 1;
  return `PLY-${nextNumber.toString().padStart(5, '0')}`;
}
