import { changePasswordUtil } from './change-password.util';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('changePasswordUtil', () => {
  let prisma: any;
  let mockHashedPassword: string;

  beforeAll(async () => {
    mockHashedPassword = await bcrypt.hash('password123', 10);
  });

  beforeEach(() => {
    prisma = {
      player: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
      },
    };
  });

  it('should throw BadRequestException if newPassword and confirmPassword do not match', async () => {
    const user = { userId: 'p-1', email: 'pro@tape.com', role: 'player' };
    const dto = {
      currentPassword: 'password123',
      newPassword: 'newPassword123',
      confirmPassword: 'differentPassword',
    };

    await expect(changePasswordUtil(user, dto, prisma)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException if newPassword is same as currentPassword', async () => {
    const user = { userId: 'p-1', email: 'pro@tape.com', role: 'player' };
    const dto = {
      currentPassword: 'password123',
      newPassword: 'password123',
      confirmPassword: 'password123',
    };

    await expect(changePasswordUtil(user, dto, prisma)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw UnauthorizedException if currentPassword is incorrect', async () => {
    const user = { userId: 'p-1', email: 'pro@tape.com', role: 'player' };
    const dto = {
      currentPassword: 'wrongPassword',
      newPassword: 'newPassword123',
      confirmPassword: 'newPassword123',
    };

    prisma.player.findUnique.mockResolvedValue({
      playerId: 'p-1',
      email: 'pro@tape.com',
      password: mockHashedPassword,
      status: 'ACTIVE',
      isDeleted: false,
    });

    await expect(changePasswordUtil(user, dto, prisma)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should successfully update password when currentPassword is valid', async () => {
    const user = { userId: 'p-1', email: 'pro@tape.com', role: 'player' };
    const dto = {
      currentPassword: 'password123',
      newPassword: 'newSecretPassword123',
      confirmPassword: 'newSecretPassword123',
    };

    prisma.player.findUnique.mockResolvedValue({
      playerId: 'p-1',
      email: 'pro@tape.com',
      password: mockHashedPassword,
      status: 'ACTIVE',
      isDeleted: false,
    });
    prisma.player.update.mockResolvedValue({});

    const result = await changePasswordUtil(user, dto, prisma);

    expect(result.success).toBe(true);
    expect(prisma.player.update).toHaveBeenCalled();
  });
});
