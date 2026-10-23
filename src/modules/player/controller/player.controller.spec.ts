import { Test, TestingModule } from '@nestjs/testing';
import { PlayerController } from './player.controller';
import { PlayerService } from '../service/player.service';
import { AuthService } from '../../auth/service/auth.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

describe('PlayerController', () => {
  let controller: PlayerController;
  let playerService: any;
  let authService: any;

  beforeEach(async () => {
    playerService = {
      createPlayer: jest.fn(),
      getPlayerById: jest.fn(),
      updatePlayer: jest.fn(),
      updateDocumentStatus: jest.fn(),
      deleteDocument: jest.fn(),
      getAllPlayer: jest.fn(),
      recoverPlayer: jest.fn(),
      deletePlayer: jest.fn(),
    };

    authService = {
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayerController],
      providers: [
        { provide: PlayerService, useValue: playerService },
        { provide: AuthService, useValue: authService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PlayerController>(PlayerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLoginPlayer', () => {
    it('should retrieve logged in player profile using token userId', async () => {
      const mockResult = {
        id: 'player-1',
        fullName: 'Test Player',
        gamertag: 'TEST_GAMER',
      };
      playerService.getPlayerById.mockResolvedValue(mockResult);

      const req: any = { user: { userId: 'player-1', role: 'player' } };
      const response = await controller.getLoginPlayer(req);

      expect(playerService.getPlayerById).toHaveBeenCalledWith('player-1');
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockResult);
    });
  });

  describe('updateLoggedInPlayer', () => {
    it('should update profile of authenticated user', async () => {
      const mockUpdated = {
        id: 'player-1',
        fullName: 'Updated Name',
        gamertag: 'UPDATED_GAMER',
      };
      playerService.updatePlayer.mockResolvedValue(mockUpdated);

      const req: any = { user: { userId: 'player-1', role: 'player' } };
      const dto = { gamerTag: 'UPDATED_GAMER' };
      const response = await controller.updateLoggedInPlayer(req, dto, undefined);

      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        'player-1',
        dto,
        undefined,
        [],
        req.user,
      );
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockUpdated);
    });
  });

  describe('changePassword', () => {
    it('should delegate to authService.changePassword with req.user', async () => {
      const mockResult = { success: true, message: 'Password changed successfully' };
      authService.changePassword.mockResolvedValue(mockResult);

      const req: any = { user: { userId: 'player-1', role: 'player' } };
      const dto = {
        currentPassword: 'password123',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123',
      };
      const response = await controller.changePassword(req, dto);

      expect(authService.changePassword).toHaveBeenCalledWith(req.user, dto);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockResult);
    });
  });
});
