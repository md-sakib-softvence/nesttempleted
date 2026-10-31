import { Test, TestingModule } from '@nestjs/testing';
import { TournamentTabsController } from './tournament-tabs.controller';
import { TournamentTabsService } from '../../service/tournament-tabs.service';

describe('TournamentTabsController', () => {
  let controller: TournamentTabsController;
  let tabsService: Partial<Record<keyof TournamentTabsService, jest.Mock>>;

  beforeEach(async () => {
    tabsService = {
      getDetailsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        basicInformation: { name: 'Winter Cup', gameTitle: 'EAFC 25' },
        financialSettings: { entryFee: 5000, currency: 'NGN' },
      }),
      patchDetailsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        basicInformation: { name: 'Winter Cup Updated' },
      }),
      getRegistrationsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        counts: { registered: 10, total: 10 },
      }),
      patchRegistrationsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        config: { registrationOpen: true },
      }),
      getScheduleTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        schedulingMode: 'MANUAL',
      }),
      patchScheduleTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        schedulingPaused: true,
      }),
      getLeaderboardsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tournamentLeaderboard: [],
      }),
      patchLeaderboardsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tournamentLeaderboard: [],
      }),
      getRafflesTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        raffles: [],
      }),
      patchRafflesTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        raffles: [{ raffleId: 'r-1', name: 'Raffle 1' }],
      }),
      getPlayerCardTemplateTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        organizerLogo: 'logo.png',
      }),
      patchPlayerCardTemplateTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        organizerLogo: 'new-logo.png',
      }),
      getFanPassTemplateTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        fanPassArtUrl: 'art.png',
      }),
      patchFanPassTemplateTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        fanPassArtUrl: 'new-art.png',
      }),
      getRulesTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        rules: ['Rule 1'],
      }),
      patchRulesTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        rules: ['Rule 1 updated'],
      }),
      getTermsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tsAndTc: ['Term 1'],
      }),
      patchTermsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tsAndTc: ['Term 1 updated'],
      }),
      getSettingsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        name: 'Winter Cup',
      }),
      patchSettingsTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        name: 'Winter Cup Saved',
      }),
      getTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tab: 'details',
      }),
      patchTab: jest.fn().mockResolvedValue({
        tournamentId: 't-1',
        tab: 'details',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TournamentTabsController],
      providers: [
        {
          provide: TournamentTabsService,
          useValue: tabsService,
        },
      ],
    }).compile();

    controller = module.get<TournamentTabsController>(TournamentTabsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get details tab', async () => {
    const res = await controller.getDetailsTab('t-1');
    expect(tabsService.getDetailsTab).toHaveBeenCalledWith('t-1');
    expect(res.data.basicInformation.name).toBe('Winter Cup');
  });

  it('should patch details tab', async () => {
    const res = await controller.patchDetailsTab('t-1', { name: 'Winter Cup Updated' });
    expect(tabsService.patchDetailsTab).toHaveBeenCalledWith('t-1', { name: 'Winter Cup Updated' });
    expect(res.data.basicInformation.name).toBe('Winter Cup Updated');
  });

  it('should get registrations tab', async () => {
    const res = await controller.getRegistrationsTab('t-1');
    expect(tabsService.getRegistrationsTab).toHaveBeenCalledWith('t-1');
    expect(res.data.counts.total).toBe(10);
  });

  it('should get schedule tab', async () => {
    const res = await controller.getScheduleTab('t-1');
    expect(tabsService.getScheduleTab).toHaveBeenCalledWith('t-1');
    expect(res.data.schedulingMode).toBe('MANUAL');
  });

  it('should get leaderboards tab', async () => {
    const res = await controller.getLeaderboardsTab('t-1');
    expect(tabsService.getLeaderboardsTab).toHaveBeenCalledWith('t-1');
    expect(res.data.tournamentId).toBe('t-1');
  });

  it('should get and patch raffles tab', async () => {
    await controller.getRafflesTab('t-1');
    expect(tabsService.getRafflesTab).toHaveBeenCalledWith('t-1');

    await controller.patchRafflesTab('t-1', { name: 'Raffle 1' });
    expect(tabsService.patchRafflesTab).toHaveBeenCalledWith('t-1', { name: 'Raffle 1' });
  });

  it('should get and patch player card template tab', async () => {
    await controller.getPlayerCardTemplateTab('t-1');
    expect(tabsService.getPlayerCardTemplateTab).toHaveBeenCalledWith('t-1');

    await controller.patchPlayerCardTemplateTab('t-1', { organizerLogo: 'new-logo.png' });
    expect(tabsService.patchPlayerCardTemplateTab).toHaveBeenCalledWith('t-1', { organizerLogo: 'new-logo.png' });
  });

  it('should get and patch fan pass template tab', async () => {
    await controller.getFanPassTemplateTab('t-1');
    expect(tabsService.getFanPassTemplateTab).toHaveBeenCalledWith('t-1');

    await controller.patchFanPassTemplateTab('t-1', { fanPassArtUrl: 'new-art.png' });
    expect(tabsService.patchFanPassTemplateTab).toHaveBeenCalledWith('t-1', { fanPassArtUrl: 'new-art.png' });
  });

  it('should get and patch rules tab', async () => {
    await controller.getRulesTab('t-1');
    expect(tabsService.getRulesTab).toHaveBeenCalledWith('t-1');

    await controller.patchRulesTab('t-1', { rules: ['Rule 1 updated'] });
    expect(tabsService.patchRulesTab).toHaveBeenCalledWith('t-1', { rules: ['Rule 1 updated'] });
  });

  it('should get and patch terms tab', async () => {
    await controller.getTermsTab('t-1');
    expect(tabsService.getTermsTab).toHaveBeenCalledWith('t-1');

    await controller.patchTermsTab('t-1', { tsAndTc: ['Term 1 updated'] });
    expect(tabsService.patchTermsTab).toHaveBeenCalledWith('t-1', { tsAndTc: ['Term 1 updated'] });
  });

  it('should get and patch settings tab', async () => {
    await controller.getSettingsTab('t-1');
    expect(tabsService.getSettingsTab).toHaveBeenCalledWith('t-1');

    await controller.patchSettingsTab('t-1', { name: 'Winter Cup Saved' });
    expect(tabsService.patchSettingsTab).toHaveBeenCalledWith('t-1', { name: 'Winter Cup Saved' });
  });

  it('should dynamically get and patch tab by name', async () => {
    await controller.getTabByName('t-1', 'details');
    expect(tabsService.getTab).toHaveBeenCalledWith('t-1', 'details');

    await controller.patchTabByName('t-1', 'details', { name: 'Winter Cup' });
    expect(tabsService.patchTab).toHaveBeenCalledWith('t-1', 'details', { name: 'Winter Cup' });
  });
});
