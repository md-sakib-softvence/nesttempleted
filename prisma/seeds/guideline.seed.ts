import {
  PrismaClient,
  TournamentGuidelineAudience,
  TournamentGuidelineSection,
  TournamentGuidelineType,
} from '@prisma/client';

type GuidelineSeed = {
  tournamentName: string;
  key: string;
  section: TournamentGuidelineSection;
  type: TournamentGuidelineType;
  audience: TournamentGuidelineAudience;
  title: string;
  content?: string;
  externalUrl?: string;
  sortOrder: number;
  requiresAcceptance?: boolean;
};

const guidelineSeeds: GuidelineSeed[] = [
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'eligibility',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Player eligibility',
    content: 'Players must use their registered account and check in at least 15 minutes before the match.',
    sortOrder: 1,
  },
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'match-format',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Match format',
    content: 'Matches are played with 6 minutes per half. The tournament uses league and knockout stages.',
    sortOrder: 2,
  },
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'discipline',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.ALL,
    title: 'Fair play and discipline',
    content: 'Abuse, intentional disconnects, cheating, or controller tampering may lead to a forfeit or disqualification.',
    sortOrder: 3,
  },
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'registration-terms',
    section: TournamentGuidelineSection.TERMS,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Registration terms',
    content: 'The participant confirms that submitted profile, team, and contact information is accurate.',
    sortOrder: 1,
    requiresAcceptance: true,
  },
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'payment-refund',
    section: TournamentGuidelineSection.TERMS,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Payment and refund',
    content: 'The entry fee is charged through the configured payment gateway. Refund requests are subject to organizer approval before the registration deadline.',
    sortOrder: 2,
    requiresAcceptance: true,
  },
  {
    tournamentName: 'EA SPORTS FC 26 Championship Cup',
    key: 'privacy-policy',
    section: TournamentGuidelineSection.POLICY,
    type: TournamentGuidelineType.LINK,
    audience: TournamentGuidelineAudience.ALL,
    title: 'Privacy policy',
    externalUrl: 'https://example.com/privacy',
    sortOrder: 1,
  },
  {
    tournamentName: 'Valorant Champions Invitational 2026',
    key: 'game-settings',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Game settings',
    content: 'Teams play the published map pool and round settings. Any map or roster change must be approved by the referee.',
    sortOrder: 1,
  },
  {
    tournamentName: 'Valorant Champions Invitational 2026',
    key: 'anti-cheat',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Anti-cheat requirement',
    content: 'The official anti-cheat client must be active. Suspicious activity can trigger a match review.',
    sortOrder: 2,
  },
  {
    tournamentName: 'Valorant Champions Invitational 2026',
    key: 'code-of-conduct',
    section: TournamentGuidelineSection.POLICY,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.ALL,
    title: 'Code of conduct',
    content: 'Harassment, hate speech, threats, and targeted abuse are prohibited at the venue and in tournament channels.',
    sortOrder: 1,
  },
  {
    tournamentName: 'Valorant Champions Invitational 2026',
    key: 'spectator-entry',
    section: TournamentGuidelineSection.TERMS,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.SPECTATOR,
    title: 'Spectator entry terms',
    content: 'A valid ticket or pass is required for venue entry. The organizer may refuse entry for safety or conduct reasons.',
    sortOrder: 1,
  },
  {
    tournamentName: 'eFootball 2026 Super Clash',
    key: 'match-rules',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Match rules',
    content: 'Matches use the published eFootball settings. Players must use the selected national team and the registered controller.',
    sortOrder: 1,
  },
  {
    tournamentName: 'eFootball 2026 Super Clash',
    key: 'venue-check-in',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Venue check-in',
    content: 'Players must show a valid ID or digital pass at the venue gate before check-in.',
    sortOrder: 2,
  },
  {
    tournamentName: 'eFootball 2026 Super Clash',
    key: 'ticket-policy',
    section: TournamentGuidelineSection.POLICY,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.SPECTATOR,
    title: 'Ticket policy',
    content: 'Tickets are valid only for the selected tournament session and cannot be resold without organizer approval.',
    sortOrder: 1,
  },
  {
    tournamentName: 'Tekken 8 King of Iron Fist Tour',
    key: 'match-format',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Match format',
    content: 'Early rounds are best-of-three. Winners, losers, and grand finals are best-of-five.',
    sortOrder: 1,
  },
  {
    tournamentName: 'Tekken 8 King of Iron Fist Tour',
    key: 'controller-policy',
    section: TournamentGuidelineSection.RULES,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.PLAYER,
    title: 'Controller policy',
    content: 'Players may bring a wired arcade stick or controller. Wireless devices must be disconnected after each match.',
    sortOrder: 2,
  },
  {
    tournamentName: 'Tekken 8 King of Iron Fist Tour',
    key: 'venue-conduct',
    section: TournamentGuidelineSection.POLICY,
    type: TournamentGuidelineType.TEXT,
    audience: TournamentGuidelineAudience.ALL,
    title: 'Venue conduct',
    content: 'Follow staff instructions, keep the play area clear, and do not interfere with another match.',
    sortOrder: 1,
  },
];

export const seedTournamentGuidelines = async (prisma: PrismaClient) => {
  let created = 0;
  let updated = 0;

  for (const item of guidelineSeeds) {
    const tournament = await prisma.tournament.findFirst({
      where: { name: item.tournamentName, isDeleted: false },
      select: { tournamentId: true },
    });
    if (!tournament) {
      console.warn(`Guideline seed skipped; tournament not found: ${item.tournamentName}`);
      continue;
    }

    const row = await prisma.tournamentGuideline.upsert({
      where: {
        tournamentId_section_key: {
          tournamentId: tournament.tournamentId,
          section: item.section,
          key: item.key,
        },
      },
      create: {
        tournamentId: tournament.tournamentId,
        key: item.key,
        section: item.section,
        type: item.type,
        audience: item.audience,
        title: item.title,
        content: item.content,
        externalUrl: item.externalUrl,
        sortOrder: item.sortOrder,
        requiresAcceptance: item.requiresAcceptance ?? false,
        isPublished: true,
      },
      update: {
        type: item.type,
        audience: item.audience,
        title: item.title,
        content: item.content,
        externalUrl: item.externalUrl,
        sortOrder: item.sortOrder,
        requiresAcceptance: item.requiresAcceptance ?? false,
        isPublished: true,
      },
    });

    if (row.createdAt.getTime() === row.updatedAt.getTime()) created += 1;
    else updated += 1;
  }

  console.log(`Tournament guidelines seeded: ${created} created, ${updated} updated.`);
};
