import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FollowDto, UnfollowDto } from '../dto/follow.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl } from '../../utils/s3.util';

@Injectable()
export class FollowerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search Players and Fans by gamerTag (case-insensitive)
   */
  async searchGamertags(query: string, currentUserId?: string) {
    if (!query || !query.trim()) {
      return [];
    }

    const search = query.trim();

    // Search players matching gamerTag
    const players = await this.prisma.player.findMany({
      where: {
        isDeleted: false,
        gamerTag: { contains: search, mode: 'insensitive' },
      },
      select: {
        playerId: true,
        firstName: true,
        lastName: true,
        gamerTag: true,
        showPlayerId: true,
      },
      take: 10,
    });

    // Search fans matching gamerTag
    const fans = await this.prisma.fan.findMany({
      where: {
        isDeleted: false,
        gamerTag: { contains: search, mode: 'insensitive' },
      },
      select: {
        fanId: true,
        firstName: true,
        surname: true,
        gamerTag: true,
        profileImage: true,
        showFanId: true,
      },
      take: 10,
    });

    // If currentUserId is provided, fetch who they already follow
    const followedTags = new Set<string>();
    const followedPlayerIds = new Set<string>();
    const followedFanIds = new Set<string>();

    if (currentUserId) {
      const activeFollows = await this.prisma.follower.findMany({
        where: {
          OR: [{ fanId: currentUserId }, { playerId: currentUserId }],
        },
        select: {
          gamerTag: true,
          targetPlayerId: true,
          targetFanId: true,
        },
      });

      for (const f of activeFollows) {
        if (f.gamerTag) followedTags.add(f.gamerTag.toLowerCase());
        if (f.targetPlayerId) followedPlayerIds.add(f.targetPlayerId);
        if (f.targetFanId) followedFanIds.add(f.targetFanId);
      }
    }

    // Merge and format results
    const results = [
      ...players.map((p) => {
        const tag = p.gamerTag || '';
        const isFollowed =
          followedPlayerIds.has(p.playerId) ||
          (tag.length > 0 && followedTags.has(tag.toLowerCase()));

        return {
          id: p.playerId,
          type: 'PLAYER',
          gamerTag: p.gamerTag,
          gamertag: p.gamerTag, // frontend compatibility
          name: `${p.firstName} ${p.lastName}`.trim(),
          showId: p.showPlayerId,
          isFollowed,
        };
      }),
      ...fans.map((f) => {
        const tag = f.gamerTag || '';
        const isFollowed =
          followedFanIds.has(f.fanId) ||
          (tag.length > 0 && followedTags.has(tag.toLowerCase()));

        return {
          id: f.fanId,
          type: 'FAN',
          gamerTag: f.gamerTag,
          gamertag: f.gamerTag, // frontend compatibility
          name: `${f.firstName} ${f.surname || ''}`.trim(),
          profileImage: f.profileImage,
          showId: f.showFanId,
          isFollowed,
        };
      }),
    ];

    return results;
  }

  /**
   * Follow a player or fan:
   * Client simply provides `targetId` (the player/fan ID being followed).
   * Follower ID is extracted from JWT (`currentUser.userId`).
   * GamerTag is automatically looked up from the database.
   */
  async follow(
    dto: FollowDto,
    currentUser?: { userId: string; role?: string },
  ) {
    if (!currentUser?.userId) {
      throw new UnauthorizedException('Authentication token required');
    }

    const roleStr = String(currentUser.role || '').toUpperCase();
    const isPlayer = roleStr.includes('PLAYER');
    const followerFanId = isPlayer ? null : currentUser.userId;
    const followerPlayerId = isPlayer ? currentUser.userId : null;

    const targetIdentifier = (
      dto.targetId ||
      dto.playerId ||
      dto.gamerTag ||
      ''
    ).trim();

    if (!targetIdentifier) {
      throw new BadRequestException('Player ID or targetId is required');
    }

    // Automatically resolve target and gamerTag from DB
    let gamerTag = '';
    let targetPlayerId: string | null = null;
    let targetFanId: string | null = null;

    // 1. Try finding as Player by ID
    const playerById = await this.prisma.player.findFirst({
      where: { playerId: targetIdentifier, isDeleted: false },
      select: {
        playerId: true,
        gamerTag: true,
        firstName: true,
        lastName: true,
      },
    });

    if (playerById) {
      targetPlayerId = playerById.playerId;
      gamerTag =
        playerById.gamerTag ||
        `${playerById.firstName}_${playerById.lastName}`.trim();
    } else {
      // 2. Try finding as Fan by ID
      const fanById = await this.prisma.fan.findFirst({
        where: { fanId: targetIdentifier, isDeleted: false },
        select: {
          fanId: true,
          gamerTag: true,
          firstName: true,
          surname: true,
        },
      });

      if (fanById) {
        targetFanId = fanById.fanId;
        gamerTag =
          fanById.gamerTag ||
          `${fanById.firstName}_${fanById.surname || ''}`.trim();
      } else {
        // 3. Try finding as Player by gamerTag
        const playerByTag = await this.prisma.player.findFirst({
          where: {
            gamerTag: { equals: targetIdentifier, mode: 'insensitive' },
            isDeleted: false,
          },
          select: { playerId: true, gamerTag: true },
        });

        if (playerByTag) {
          targetPlayerId = playerByTag.playerId;
          gamerTag = playerByTag.gamerTag || targetIdentifier;
        } else {
          // 4. Try finding as Fan by gamerTag
          const fanByTag = await this.prisma.fan.findFirst({
            where: {
              gamerTag: { equals: targetIdentifier, mode: 'insensitive' },
              isDeleted: false,
            },
            select: { fanId: true, gamerTag: true },
          });

          if (fanByTag) {
            targetFanId = fanByTag.fanId;
            gamerTag = fanByTag.gamerTag || targetIdentifier;
          }
        }
      }
    }

    // If neither Player nor Fan exists in the database, throw an error
    if (!targetPlayerId && !targetFanId) {
      throw new NotFoundException('User is not available');
    }

    // Prevent following oneself
    if (
      (followerFanId && followerFanId === targetFanId) ||
      (followerPlayerId && followerPlayerId === targetPlayerId)
    ) {
      throw new BadRequestException('You cannot follow yourself');
    }

    // Check if already followed
    const existing = await this.prisma.follower.findFirst({
      where: {
        AND: [
          followerFanId
            ? { fanId: followerFanId }
            : { playerId: followerPlayerId },
          {
            OR: [
              ...(targetPlayerId ? [{ targetPlayerId }] : []),
              ...(targetFanId ? [{ targetFanId }] : []),
              ...(gamerTag
                ? [
                    {
                      gamerTag: {
                        equals: gamerTag,
                        mode: 'insensitive' as const,
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('You are already following this user');
    }

    // Create record with automatically looked up gamerTag and target ID
    const created = await this.prisma.follower.create({
      data: {
        fanId: followerFanId,
        playerId: followerPlayerId,
        gamerTag,
        targetPlayerId,
        targetFanId,
      },
      include: {
        targetPlayer: {
          select: {
            playerId: true,
            gamerTag: true,
            firstName: true,
            lastName: true,
          },
        },
        targetFan: {
          select: {
            fanId: true,
            gamerTag: true,
            firstName: true,
            surname: true,
          },
        },
      },
    });

    return {
      isFollowing: true,
      follower: created,
    };
  }

  /**
   * Unfollow a player or fan:
   * Client simply provides `targetId` (the player/fan ID being unfollowed).
   * Follower ID is extracted from JWT (`currentUser.userId`).
   */
  async unfollow(
    dto: UnfollowDto,
    currentUser?: { userId: string; role?: string },
  ) {
    if (!currentUser?.userId) {
      throw new UnauthorizedException('Authentication token required');
    }

    const roleStr = String(currentUser.role || '').toUpperCase();
    const isPlayer = roleStr.includes('PLAYER');
    const followerFanId = isPlayer ? null : currentUser.userId;
    const followerPlayerId = isPlayer ? currentUser.userId : null;

    const targetIdentifier = (
      dto.targetId ||
      dto.playerId ||
      dto.gamerTag ||
      ''
    ).trim();

    if (!targetIdentifier) {
      throw new BadRequestException('Player ID or targetId is required');
    }

    const deleteResult = await this.prisma.follower.deleteMany({
      where: {
        AND: [
          followerFanId
            ? { fanId: followerFanId }
            : { playerId: followerPlayerId },
          {
            OR: [
              { targetPlayerId: targetIdentifier },
              { targetFanId: targetIdentifier },
              { gamerTag: { equals: targetIdentifier, mode: 'insensitive' } },
            ],
          },
        ],
      },
    });

    return {
      isFollowing: false,
      deletedCount: deleteResult.count,
    };
  }

  /**
   * Get all followed accounts for a specific user (Fan or Player) with pagination, search, and filtering
   */
  async getFollowing(userId: string, query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['gamerTag'],
    );

    const userCondition = {
      OR: [{ fanId: userId }, { playerId: userId }],
    };

    const searchCondition = where.OR;
    delete where.OR;

    const finalWhere: any = {
      ...where,
      AND: [
        userCondition,
        ...(searchCondition ? [{ OR: searchCondition }] : []),
        ...(where.AND
          ? Array.isArray(where.AND)
            ? where.AND
            : [where.AND]
          : []),
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.follower.findMany({
        where: finalWhere,
        skip,
        take,
        orderBy,
        include: {
          targetPlayer: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              showPlayerId: true,
            },
          },
          targetFan: {
            select: {
              fanId: true,
              firstName: true,
              surname: true,
              gamerTag: true,
              profileImage: true,
              showFanId: true,
            },
          },
        },
      }),
      this.prisma.follower.count({ where: finalWhere }),
    ]);

    const safeData = await Promise.all(
      data.map(async (item) => {
        if (item.targetFan?.profileImage) {
          item.targetFan.profileImage = await getPreSignedUrl(
            item.targetFan.profileImage,
          );
        }
        return item;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  /**
   * Get all followers of a specific gamerTag or user with pagination, search, and filtering
   */
  async getFollowers(gamerTagOrId: string, query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['gamerTag'],
    );

    const targetCondition = {
      OR: [
        { gamerTag: { equals: gamerTagOrId, mode: 'insensitive' as const } },
        { targetPlayerId: gamerTagOrId },
        { targetFanId: gamerTagOrId },
      ],
    };

    const searchCondition = where.OR;
    delete where.OR;

    const finalWhere: any = {
      ...where,
      AND: [
        targetCondition,
        ...(searchCondition ? [{ OR: searchCondition }] : []),
        ...(where.AND
          ? Array.isArray(where.AND)
            ? where.AND
            : [where.AND]
          : []),
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.follower.findMany({
        where: finalWhere,
        skip,
        take,
        orderBy,
        include: {
          fan: {
            select: {
              fanId: true,
              firstName: true,
              surname: true,
              gamerTag: true,
              profileImage: true,
            },
          },
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
            },
          },
        },
      }),
      this.prisma.follower.count({ where: finalWhere }),
    ]);

    const safeData = await Promise.all(
      data.map(async (item) => {
        if (item.fan?.profileImage) {
          item.fan.profileImage = await getPreSignedUrl(item.fan.profileImage);
        }
        return item;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  /**
   * Get all users (Players and Fans) with searching, filtering, and pagination
   * Returns only: id, type, role, and name
   */
  async getAllUsers(query: QueryOptions = {}, currentUserId?: string) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchTerm = (query.searchTerm || query.search) as string | undefined;
    const typeFilter = query.type as string | undefined; // 'PLAYER' | 'FAN' | undefined

    const playerWhere: any = { isDeleted: false };
    if (searchTerm) {
      playerWhere.OR = [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { gamerTag: { contains: searchTerm, mode: 'insensitive' } },
        { username: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const fanWhere: any = { isDeleted: false };
    if (searchTerm) {
      fanWhere.OR = [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { surname: { contains: searchTerm, mode: 'insensitive' } },
        { gamerTag: { contains: searchTerm, mode: 'insensitive' } },
        { username: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const includePlayers = !typeFilter || typeFilter.toUpperCase() === 'PLAYER';
    const includeFans = !typeFilter || typeFilter.toUpperCase() === 'FAN';

    const [playerCount, fanCount] = await Promise.all([
      includePlayers ? this.prisma.player.count({ where: playerWhere }) : 0,
      includeFans ? this.prisma.fan.count({ where: fanWhere }) : 0,
    ]);

    const total = playerCount + fanCount;

    let players: any[] = [];
    let fans: any[] = [];

    if (includePlayers && !includeFans) {
      players = await this.prisma.player.findMany({
        where: playerWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          playerId: true,
          firstName: true,
          lastName: true,
        },
      });
    } else if (!includePlayers && includeFans) {
      fans = await this.prisma.fan.findMany({
        where: fanWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          fanId: true,
          firstName: true,
          surname: true,
        },
      });
    } else {
      if (skip < playerCount) {
        const playersToTake = Math.min(limit, playerCount - skip);
        players = await this.prisma.player.findMany({
          where: playerWhere,
          skip,
          take: playersToTake,
          orderBy: { createdAt: 'desc' },
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
          },
        });

        const remainingLimit = limit - players.length;
        if (remainingLimit > 0) {
          fans = await this.prisma.fan.findMany({
            where: fanWhere,
            skip: 0,
            take: remainingLimit,
            orderBy: { createdAt: 'desc' },
            select: {
              fanId: true,
              firstName: true,
              surname: true,
            },
          });
        }
      } else {
        const fanSkip = skip - playerCount;
        fans = await this.prisma.fan.findMany({
          where: fanWhere,
          skip: fanSkip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            fanId: true,
            firstName: true,
            surname: true,
          },
        });
      }
    }

    // Format players (only id, type, role, name)
    const formattedPlayers = players.map((p) => ({
      id: p.playerId,
      type: 'PLAYER',
      role: 'PLAYER',
      name: `${p.firstName} ${p.lastName}`.trim(),
    }));

    // Format fans (only id, type, role, name)
    const formattedFans = fans.map((f) => ({
      id: f.fanId,
      type: 'FAN',
      role: 'FAN',
      name: `${f.firstName} ${f.surname || ''}`.trim(),
    }));

    const safeData = [...formattedPlayers, ...formattedFans];
    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  /**
   * Get upcoming matches of followed players for the authenticated fan
   */
  async getFollowedUpcomingMatches(userId: string) {
    const follows = await this.prisma.follower.findMany({
      where: {
        OR: [{ fanId: userId }, { playerId: userId }],
      },
      select: {
        targetPlayerId: true,
        gamerTag: true,
        targetPlayer: {
          select: {
            playerId: true,
            gamerTag: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          },
        },
      },
    });

    const targetPlayerIds = follows
      .map((f) => f.targetPlayerId)
      .filter(Boolean) as string[];

    const gamerTags = follows
      .map((f) => f.gamerTag)
      .filter(Boolean) as string[];

    if (gamerTags.length > 0) {
      const tagPlayers = await this.prisma.player.findMany({
        where: { gamerTag: { in: gamerTags }, isDeleted: false },
        select: {
          playerId: true,
          gamerTag: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      });
      targetPlayerIds.push(...tagPlayers.map((p) => p.playerId));
    }

    const uniquePlayerIds = [...new Set(targetPlayerIds)];

    // If fan does not follow any players, return empty list immediately
    if (uniquePlayerIds.length === 0) {
      return {
        totalFollowedPlayers: 0,
        totalMatches: 0,
        matches: [],
      };
    }

    // Fetch active/upcoming tournaments with venues and screens
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        isDeleted: false,
        status: {
          in: [
            'IN_PROGRESS',
            'ONGOING',
            'UPCOMING',
            'REGISTRATION_OPEN',
          ],
        },
      },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const results: any[] = [];
    const seenMatches = new Set<string>();

    // Helper to safely extract matches from all known tournament schedule shapes
    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const venues = t.venues || [];

      // 1. Direct matches array in structure or root
      const rawMatches: any[] =
        schedule.structure?.matches || schedule.matches || [];

      // 2. Calendar / venue-based schedule array
      const calendarList: any[] = Array.isArray(schedule)
        ? schedule
        : Array.isArray(schedule.calendar)
          ? schedule.calendar
          : [];

      for (const vs of calendarList) {
        const venueObj = venues.find(
          (v) => v.venueId === vs.venueId || v.name === vs.venueName,
        );
        const venueName =
          venueObj?.name || vs.venueName || 'Main Arena';

        const screens: any[] = vs.screens || [];
        for (const ss of screens) {
          const screenObj = venueObj?.screens?.find(
            (s) => s.screenId === ss.screenId || s.screenName === ss.screenName,
          );
          const screenName =
            screenObj?.screenName || ss.screenName || 'Screen A';

          const days: any[] = ss.days || [];
          for (const d of days) {
            const timeslots: any[] = d.timeslots || [];
            for (const ts of timeslots) {
              const game = ts.game || ts.match;
              if (game) {
                rawMatches.push({
                  ...game,
                  time: ts.time || game.time || '16:30',
                  date: d.date || game.date || t.startDate,
                  venueName,
                  screenName,
                });
              }
            }
          }
        }
      }

      for (const m of rawMatches) {
        if (!m || m.status === 'COMPLETED') continue;

        const p1Id = m.player1Id || m.participant1Ref?.id;
        const p2Id = m.player2Id || m.participant2Ref?.id;

        const p1Followed = uniquePlayerIds.includes(p1Id);
        const p2Followed = uniquePlayerIds.includes(p2Id);

        // Only include match if one of the followed players is competing
        if (p1Followed || p2Followed) {
          const matchKey = m.id || `${t.tournamentId}-${m.time}`;
          if (seenMatches.has(matchKey)) continue;
          seenMatches.add(matchKey);

          const defaultVenue = venues[0]?.name || 'Main Arena';
          const defaultScreen =
            venues[0]?.screens?.[0]?.screenName || 'Screen A';

          const p1Gamertag =
            m.player1Name ||
            m.participant1Ref?.name ||
            m.player1?.gamertag ||
            'Player 1';
          const p2Gamertag =
            m.player2Name ||
            m.participant2Ref?.name ||
            m.player2?.gamertag ||
            'Player 2';

          const p1Obj = {
            id: p1Id || 'p-1',
            gamertag: p1Gamertag,
            name: p1Gamertag,
            isFollowed: p1Followed,
          };
          const p2Obj = {
            id: p2Id || 'p-2',
            gamertag: p2Gamertag,
            name: p2Gamertag,
            isFollowed: p2Followed,
          };

          results.push({
            id: matchKey,
            matchId: matchKey,
            tournamentId: t.tournamentId,
            tournamentName: t.name,
            time: m.time || '16:30',
            date: m.date || t.startDate,
            player1: p1Obj,
            player2: p2Obj,
            followedPlayer: p1Followed ? p1Obj : p2Obj,
            opponent: p1Followed ? p2Obj : p1Obj,
            venueName: m.venueName || defaultVenue,
            screenName: m.screenName || defaultScreen,
            status: m.status || 'SCHEDULED',
          });
        }
      }
    }

    return {
      totalFollowedPlayers: uniquePlayerIds.length,
      totalMatches: results.length,
      matches: results,
    };
  }
}
