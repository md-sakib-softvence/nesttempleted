import { PrismaClient, EmployeeRole, EmployeeState, FanStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedStaffAndFans(prisma: PrismaClient) {
  console.log('👥 Seeding Staff & Fans...');

  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  // 1. Seed Employees / Staff
  const employeesData = [
    {
      employeeId: 'st-1',
      showEmployeeId: 'STAFF-001',
      name: 'Alice Manager',
      email: 'manager@tape.com',
      phoneNumber: '+1234567890',
      role: EmployeeRole.MANAGER,
      state: EmployeeState.ACTIVE,
      password: hashedPassword,
      cashLeader: true,
      enablePost: true,
    },
    {
      employeeId: 'st-2',
      showEmployeeId: 'STAFF-002',
      name: 'Mike Security',
      email: 'security@tape.com',
      phoneNumber: '+1122334455',
      role: EmployeeRole.SECURITY,
      state: EmployeeState.ACTIVE,
      password: hashedPassword,
      cashLeader: true,
      enablePost: true,
    },
    {
      employeeId: 'st-3',
      showEmployeeId: 'STAFF-003',
      name: 'Bob Umpire',
      email: 'umpire@tape.com',
      phoneNumber: '+1987654321',
      role: EmployeeRole.EMPLOYEE,
      state: EmployeeState.ACTIVE,
      password: hashedPassword,
      cashLeader: false,
      enablePost: true,
    },
  ];

  for (const emp of employeesData) {
    await prisma.employee.upsert({
      where: { email: emp.email },
      update: {
        name: emp.name,
        role: emp.role,
        state: emp.state,
        password: emp.password,
        phoneNumber: emp.phoneNumber,
      },
      create: emp,
    });
    console.log(`✅ Seeded Employee: ${emp.email} (${emp.role})`);
  }

  // 2. Seed Fans
  const fansData = [
    {
      firstName: 'Super Fan',
      surname: 'Sam',
      email: 'fan_vip@tape.com',
      phoneNumber: '+15550001',
      gender: 'Other',
      ageRange: '25-34',
      status: FanStatus.ACTIVE,
      topPoint: 1200,
      favoriteGame: 'EAFC 25',
      password: hashedPassword,
    },
    {
      firstName: 'Newbie',
      surname: 'Nate',
      email: 'fan_new@tape.com',
      phoneNumber: '+15550002',
      gender: 'Male',
      ageRange: '18-24',
      status: FanStatus.ACTIVE,
      topPoint: 100,
      favoriteGame: 'Tekken 8',
      password: hashedPassword,
    },
  ];

  for (const fan of fansData) {
    const existing = await prisma.fan.findUnique({ where: { email: fan.email } });
    if (!existing) {
      const count = await prisma.fan.count();
      const showId = `FAN-${Date.now()}-${count}`;
      await prisma.fan.create({
        data: {
          ...fan,
          showFanId: showId,
        },
      });
      console.log(`✅ Seeded Fan: ${fan.email}`);
    } else {
      await prisma.fan.update({
        where: { email: fan.email },
        data: {
          password: fan.password,
          topPoint: fan.topPoint,
          status: fan.status,
        },
      });
      console.log(`✅ Updated Fan: ${fan.email}`);
    }
  }
}
