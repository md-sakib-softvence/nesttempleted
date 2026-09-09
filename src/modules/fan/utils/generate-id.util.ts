import { PrismaService } from '../../../prisma/prisma.service';

export async function generateFanId(prisma: PrismaService): Promise<string> {
  const lastFan = await prisma.fan.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { showFanId: true },
  });

  if (!lastFan || !lastFan.showFanId) {
    return 'FAN-00001';
  }

  const lastId = lastFan.showFanId;
  const numberPart = lastId.split('-')[1];

  if (!numberPart) {
    return 'FAN-00001';
  }

  const nextNumber = parseInt(numberPart, 10) + 1;
  return `FAN-${nextNumber.toString().padStart(5, '0')}`;
}
