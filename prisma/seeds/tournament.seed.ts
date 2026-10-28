import {
  PrismaClient,
  TournamentFormat,
  Currency,
  PrizeRule,
  RegistrationCutOffMode,
  FrequencyStatus,
  TournamentStatus,
  SchedulingMode,
  TicketType
} from '@prisma/client';

export const seedTournaments = async (prisma: PrismaClient) => {
  console.log('🎮 Seeding rich tournaments...');

  const tournamentsToCreate = [
    {
      name: 'EA SPORTS FC 26 Championship Cup',
      gameTitle: 'FC 26',
      tournamentFormat: TournamentFormat.LEAGUE_AND_KNOCKOUT,
      numberOfTeams: 16,
      entryFee: 25.0,
      currency: Currency.USD,
      paymentWindow: 48,
      prizeRule: PrizeRule.PERCENTAGE,
      percentage: 75.0,
      houseRake: 25.0,
      couponCreation: true,
      registrationCutOffMode: RegistrationCutOffMode.BOTH,
      startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      capacity: 32,
      dailyStart: '10:00',
      dailyEnd: '20:00',
      matchDuration: 30,
      turnoverDuration: 10,
      lunchBreakTime: '13:00',
      lunchDuration: 60,
      buffer: 15,
      frequencyStatus: FrequencyStatus.DAILY,
      frequencyArray: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      canvasImage:
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
      tournamentLogoUrl:
        'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=400&q=80',
      rules: [
        'Standard EA Sports competitive rules apply.',
        'Matches are 6 minutes per half, tactical defending only.',
        'Controllers must be inspected before match start.'
      ],
      tsAndTc: [
        'Players must check in 15 minutes prior to scheduled match time.',
        'No-show after 10 minutes leads to automatic match forfeit.'
      ],
      schedulingMode: SchedulingMode.AUTO_HOME_VENUE,
      status: TournamentStatus.REGISTRATION_OPEN,
      registrationOpen: true,
      venues: {
        create: [
          {
            name: 'Lagos Cyber Arena',
            address: '14 Victoria Island Esplanade, Lagos',
            screens: {
              create: [
                { screenName: 'Screen Alpha (Main Stage)' },
                { screenName: 'Screen Beta (Arena 2)' }
              ]
            }
          }
        ]
      },
      ticketTiers: {
        create: [
          {
            name: 'VIP Arena Access',
            type: TicketType.VIP,
            price: 50.0,
            currency: 'USD',
            capacity: 40,
            sold: 12,
            description: 'Front-row stage seating, lounge access, free merchandise'
          },
          {
            name: 'General Admission',
            type: TicketType.DAY_PASS,
            price: 15.0,
            currency: 'USD',
            capacity: 150,
            sold: 45,
            description: 'Grandstand spectator seating and live broadcast area'
          }
        ]
      }
    },
    {
      name: 'Valorant Champions Invitational 2026',
      gameTitle: 'Valorant',
      tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
      numberOfTeams: 8,
      entryFee: 50.0,
      currency: Currency.USD,
      paymentWindow: 24,
      prizeRule: PrizeRule.FIXED_AMOUNT,
      percentage: 80.0,
      houseRake: 20.0,
      couponCreation: false,
      registrationCutOffMode: RegistrationCutOffMode.CAPACITY,
      startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      capacity: 16,
      dailyStart: '12:00',
      dailyEnd: '22:00',
      matchDuration: 60,
      turnoverDuration: 15,
      lunchBreakTime: '15:00',
      lunchDuration: 45,
      buffer: 20,
      frequencyStatus: FrequencyStatus.WEEKLY,
      frequencyArray: ['Saturday', 'Sunday'],
      canvasImage:
        'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
      tournamentLogoUrl:
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80',
      rules: [
        '5v5 Standard Competitive Spike Plant/Defuse rules.',
        'Overtime: Win by two rounds.',
        'Standard Riot anti-cheat Vanguard required.'
      ],
      tsAndTc: [
        'Team captains must join the official Discord referee channel.',
        'Tactical pauses capped at 2 per map per team.'
      ],
      schedulingMode: SchedulingMode.MANUAL,
      status: TournamentStatus.UPCOMING,
      registrationOpen: true,
      venues: {
        create: [
          {
            name: 'Tape Esports Dome',
            address: '88 Tech Boulevard, Innovation District',
            screens: {
              create: [
                { screenName: 'Main Battlefield Screen 01' },
                { screenName: 'Side Stage Screen 02' }
              ]
            }
          }
        ]
      },
      ticketTiers: {
        create: [
          {
            name: 'Champion Pass',
            type: TicketType.VIP,
            price: 75.0,
            currency: 'USD',
            capacity: 30,
            sold: 8,
            description: 'Player dugout access and exclusive autograph session'
          },
          {
            name: 'Standard Fan Pass',
            type: TicketType.DAY_PASS,
            price: 20.0,
            currency: 'USD',
            capacity: 200,
            sold: 60,
            description: 'Full tournament arena access'
          }
        ]
      }
    },
    {
      name: 'eFootball 2026 Super Clash',
      gameTitle: 'eFootball 2026',
      tournamentFormat: TournamentFormat.LEAGUE,
      numberOfTeams: 12,
      entryFee: 15.0,
      currency: Currency.USD,
      paymentWindow: 36,
      prizeRule: PrizeRule.PERCENTAGE,
      percentage: 70.0,
      houseRake: 30.0,
      couponCreation: true,
      registrationCutOffMode: RegistrationCutOffMode.DEADLINE,
      startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      capacity: 24,
      dailyStart: '14:00',
      dailyEnd: '21:00',
      matchDuration: 25,
      turnoverDuration: 10,
      lunchBreakTime: '17:00',
      lunchDuration: 30,
      buffer: 10,
      frequencyStatus: FrequencyStatus.DAILY,
      frequencyArray: ['Wednesday', 'Thursday', 'Friday', 'Saturday'],
      canvasImage:
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
      tournamentLogoUrl:
        'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=400&q=80',
      rules: [
        'Konami Authentic Team matchmaking.',
        '10-minute regulation time.',
        'Penalties on draw.'
      ],
      tsAndTc: [
        'All disputes resolved by tournament referee on field.',
        'Valid photo ID or digital pass required for arena gate clearance.'
      ],
      schedulingMode: SchedulingMode.MANUAL,
      status: TournamentStatus.IN_PROGRESS,
      registrationOpen: false,
      venues: {
        create: [
          {
            name: 'Main Arena Hall A',
            address: 'Convention Center Level 2, Metro City',
            screens: {
              create: [
                { screenName: 'Screen Center 01' },
                { screenName: 'Screen Center 02' }
              ]
            }
          }
        ]
      },
      ticketTiers: {
        create: [
          {
            name: 'VIP Box Seat',
            type: TicketType.VIP,
            price: 40.0,
            currency: 'USD',
            capacity: 25,
            sold: 15,
            description: 'Complimentary drinks, snacks, and stadium box views'
          },
          {
            name: 'Daily Pass',
            type: TicketType.DAY_PASS,
            price: 10.0,
            currency: 'USD',
            capacity: 100,
            sold: 52,
            description: 'Single day arena spectator pass'
          }
        ]
      }
    },
    {
      name: 'Tekken 8 King of Iron Fist Tour',
      gameTitle: 'Tekken 8',
      tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
      numberOfTeams: 16,
      entryFee: 20.0,
      currency: Currency.USD,
      paymentWindow: 24,
      prizeRule: PrizeRule.FIXED_AMOUNT,
      percentage: 85.0,
      houseRake: 15.0,
      couponCreation: false,
      registrationCutOffMode: RegistrationCutOffMode.CAPACITY,
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      capacity: 32,
      dailyStart: '11:00',
      dailyEnd: '19:00',
      matchDuration: 15,
      turnoverDuration: 5,
      lunchBreakTime: '14:00',
      lunchDuration: 45,
      buffer: 10,
      frequencyStatus: FrequencyStatus.DAILY,
      frequencyArray: ['Saturday', 'Sunday'],
      canvasImage:
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
      tournamentLogoUrl:
        'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80',
      rules: [
        'Best of 3 rounds, 60 seconds per round.',
        'Winners, Losers, and Grand Finals are Best of 5.',
        'Blind pick available on request.'
      ],
      tsAndTc: [
        'Players bring their own arcade sticks or pads.',
        'Wireless controller desync mandatory after each match.'
      ],
      schedulingMode: SchedulingMode.MANUAL,
      status: TournamentStatus.COMPLETED,
      registrationOpen: false,
      venues: {
        create: [
          {
            name: 'Colosseum Esports Stage',
            address: '45 Fighter Way, Downtown Arena',
            screens: {
              create: [
                { screenName: 'Octagon Stage Screen' }
              ]
            }
          }
        ]
      },
      ticketTiers: {
        create: [
          {
            name: 'Ringside Seat',
            type: TicketType.VIP,
            price: 35.0,
            currency: 'USD',
            capacity: 50,
            sold: 50,
            description: 'Direct ringside view of the fighting stage'
          }
        ]
      }
    }
  ];

  for (const t of tournamentsToCreate) {
    const existing = await prisma.tournament.findFirst({
      where: { name: t.name }
    });

    if (!existing) {
      const created = await prisma.tournament.create({
        data: t
      });
      console.log(`✅ Seeded tournament: "${created.name}" (${created.gameTitle} - ${created.status})`);
    } else {
      console.log(`ℹ️ Tournament "${t.name}" already exists, skipping.`);
    }
  }

  console.log('🏆 Tournament seeding completed successfully!');
};
