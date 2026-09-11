import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

export const createActivities = async (
  prisma: PrismaService,
  title: string,
  description: string,
  roleString: string,
) => {
  const role = roleString.toUpperCase() as Role;
  
  return await prisma.activityLog.create({
    data: {
      title,
      description,
      role,
    },
  });
};
