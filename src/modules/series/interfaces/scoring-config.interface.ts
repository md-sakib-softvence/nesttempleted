export interface ScoringConfig {
  id?: string;
  name?: string;
  placementPoints?: Record<string, number>;
  participationPoints?: number;
  matchWinPoints?: number;
  matchDrawPoints?: number;
  matchLossPoints?: number;
  weighting?: Record<string, number>;
  bonusRules?: {
    championBonus?: number;
    cleanSheetBonus?: number;
    [key: string]: any;
  };
}

export interface SeriesPublicationSettings {
  enabled: boolean;
  publicSlug: string;
  leaderboardEnabled?: boolean;
  liveUpdatesEnabled?: boolean;
  showSeriesLogo?: boolean;
  showCoverImage?: boolean;
  showSeriesDescription?: boolean;
  showSeriesDates?: boolean;
  showTournamentList?: boolean;
  showUpcomingTournament?: boolean;
  showCompletedTournamentResults?: boolean;
  showLeaderboard?: boolean;
  showParticipantProfiles?: boolean;
  showPointsBreakdown?: boolean;
  showRankMovement?: boolean;
  showTournamentPoints?: boolean;
  showSponsors?: boolean;
  showVenueInfo?: boolean;
  showLastUpdatedTime?: boolean;
  showChampion?: boolean;
  leaderboardLimit?: number;
  embedTheme?: 'dark' | 'light';
  embedCompact?: boolean;
  status?: string;
}
