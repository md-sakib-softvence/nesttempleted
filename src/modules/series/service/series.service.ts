import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SeriesCoreService } from './series-core.service';
import { SeriesTournamentsService } from './series-tournaments.service';
import { SeriesParticipantsService } from './series-participants.service';
import { SeriesLeaderboardService } from './series-leaderboard.service';
import { SeriesPublicationService } from './series-publication.service';

import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateSeriesDto } from '../dto/update-series.dto';
import { UpdateSeriesStatusDto } from '../dto/update-series-status.dto';
import { LinkTournamentsDto } from '../dto/link-tournaments.dto';
import { ReorderTournamentsDto } from '../dto/reorder-tournaments.dto';
import { UpdateSeriesParticipantDto } from '../dto/update-participant.dto';
import { CreateSeriesAdjustmentDto } from '../dto/create-adjustment.dto';
import { UpdateSeriesScoringConfigDto } from '../dto/update-scoring-config.dto';
import { UpdateSeriesPublicationDto } from '../dto/update-publication.dto';
import { QuerySeriesDto } from '../dto/query-series.dto';
import {
  QuerySeriesParticipantDto,
} from '../dto/query-participant.dto';

/**
 * SeriesService acts as the Unified Master Facade for the Series domain.
 * It coordinates across 5 specialized sub-services:
 * - SeriesCoreService (CRUD & Lifecycle)
 * - SeriesTournamentsService (Tournament Association & Reordering)
 * - SeriesParticipantsService (Participant Pool, Approvals & Adjustments)
 * - SeriesLeaderboardService (Standings, Points Engine & Scoring Rules)
 * - SeriesPublicationService (Publication Settings & Fan Portal)
 */
@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private coreService?: SeriesCoreService,
    @Optional() private tournamentsService?: SeriesTournamentsService,
    @Optional() private participantsService?: SeriesParticipantsService,
    @Optional() private leaderboardService?: SeriesLeaderboardService,
    @Optional() private publicationService?: SeriesPublicationService,
  ) {
    if (!this.coreService) this.coreService = new SeriesCoreService(this.prisma);
    if (!this.tournamentsService) this.tournamentsService = new SeriesTournamentsService(this.prisma);
    if (!this.participantsService) this.participantsService = new SeriesParticipantsService(this.prisma);
    if (!this.leaderboardService) this.leaderboardService = new SeriesLeaderboardService(this.prisma);
    if (!this.publicationService) this.publicationService = new SeriesPublicationService(this.prisma);
  }

  // ==========================================
  // 1. Series CRUD & Lifecycle (SeriesCoreService)
  // ==========================================

  async createSeries(dto: CreateSeriesDto) {
    return this.coreService!.createSeries(dto);
  }

  async getAllSeries(query: QuerySeriesDto) {
    return this.coreService!.getAllSeries(query);
  }

  async getSeriesById(id: string) {
    return this.coreService!.getSeriesById(id);
  }

  async updateSeries(id: string, dto: UpdateSeriesDto) {
    return this.coreService!.updateSeries(id, dto);
  }

  async updateSeriesStatus(id: string, dto: UpdateSeriesStatusDto) {
    return this.coreService!.updateSeriesStatus(id, dto);
  }

  // ==========================================
  // 2. Series Tournament Association (SeriesTournamentsService)
  // ==========================================

  async getSeriesTournaments(seriesId: string) {
    return this.tournamentsService!.getSeriesTournaments(seriesId);
  }

  async linkTournaments(seriesId: string, dto: LinkTournamentsDto) {
    return this.tournamentsService!.linkTournaments(seriesId, dto);
  }

  async reorderTournaments(seriesId: string, dto: ReorderTournamentsDto) {
    return this.tournamentsService!.reorderTournaments(seriesId, dto);
  }

  async unlinkTournament(seriesId: string, tournamentId: string) {
    const result = await this.tournamentsService!.unlinkTournament(seriesId, tournamentId);
    // Recalculate standings after tournament is unlinked
    await this.leaderboardService!.recalculateSeriesStandings(seriesId, true);
    return result;
  }

  // ==========================================
  // 3. Series Participants & Adjustments (SeriesParticipantsService)
  // ==========================================

  async getSeriesParticipants(seriesId: string, query: QuerySeriesParticipantDto) {
    return this.participantsService!.getSeriesParticipants(seriesId, query);
  }

  async updateSeriesParticipant(
    seriesId: string,
    participantId: string,
    dto: UpdateSeriesParticipantDto,
  ) {
    return this.participantsService!.updateSeriesParticipant(seriesId, participantId, dto);
  }

  async createPointAdjustment(
    seriesId: string,
    dto: CreateSeriesAdjustmentDto,
    createdBy = 'ADMIN',
  ) {
    return this.participantsService!.createPointAdjustment(seriesId, dto, createdBy);
  }

  async getPointAdjustments(seriesId: string) {
    return this.participantsService!.getPointAdjustments(seriesId);
  }

  // ==========================================
  // 4. Series Standings & Scoring (SeriesLeaderboardService)
  // ==========================================

  async getSeriesLeaderboard(seriesId: string) {
    return this.leaderboardService!.getSeriesLeaderboard(seriesId);
  }

  async recalculateSeriesStandings(seriesId: string, forceAll = true) {
    return this.leaderboardService!.recalculateSeriesStandings(seriesId, forceAll);
  }

  async getScoringConfig(seriesId: string) {
    return this.leaderboardService!.getScoringConfig(seriesId);
  }

  async updateScoringConfig(seriesId: string, dto: UpdateSeriesScoringConfigDto) {
    return this.leaderboardService!.updateScoringConfig(seriesId, dto);
  }

  // ==========================================
  // 5. Series Publication & Fan Portal (SeriesPublicationService)
  // ==========================================

  async getPublicationSettings(seriesId: string) {
    return this.publicationService!.getPublicationSettings(seriesId);
  }

  async updatePublicationSettings(seriesId: string, dto: UpdateSeriesPublicationDto) {
    return this.publicationService!.updatePublicationSettings(seriesId, dto);
  }

  async getPublicSeriesBySlug(slug: string) {
    return this.publicationService!.getPublicSeriesBySlug(slug);
  }
}
