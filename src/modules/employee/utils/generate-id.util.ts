import { PrismaService } from '../../../prisma/prisma.service';

export async function generateEmployeeId(
  prisma: PrismaService,
): Promise<string> {
  const lastEmployee = await prisma.employee.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { showEmployeeId: true },
  });

  if (!lastEmployee || !lastEmployee.showEmployeeId) {
    return 'EMP-00001';
  }

  const lastId = lastEmployee.showEmployeeId;
  const numberPart = lastId.split('-')[1];

  if (!numberPart) {
    return 'EMP-00001';
  }

  const nextNumber = parseInt(numberPart, 10) + 1;
  return `EMP-${nextNumber.toString().padStart(5, '0')}`;
}
