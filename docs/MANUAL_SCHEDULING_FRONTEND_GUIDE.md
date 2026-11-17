# Manual tournament scheduling: frontend integration

This guide describes the current backend contract. Base URL: `/api/v1`.
All examples use relative URLs. Replace IDs with values returned by the API.

## 1. Access and prerequisites

- Allocation, moving, removing, and admin available-slot requests require an authenticated `ADMIN` or `SUPER_ADMIN`.
- Send `Authorization: Bearer <token>`; send JSON bodies with `Content-Type: application/json`.
- Tournament competition structure, venues, screens, and calendar must exist first.
- A newly generated `MANUAL` schedule has fixtures and empty calendar slots.
- Changing an existing tournament from `AUTO_RANDOM` to `MANUAL` preserves existing allocations. It does not clear the calendar.
- Admin allocation is not restricted to `MANUAL` mode; admin edits of existing automatic schedules are supported.

To select manual mode through the tournament update endpoint:

```http
PATCH /api/v1/tournaments/{tournamentId}
Content-Type: multipart/form-data
```

Send a form field `schedulingMode=MANUAL`. Let the browser set the multipart boundary.
Do not regenerate the competition simply to move a match: match IDs and results must be preserved.
If the structure exists but calendar generation is needed, use `POST /api/v1/tournaments/{tournamentId}/calendar` with the timing settings; this preserves existing occupied allocations or rejects incompatible changes.

## 2. Endpoints

| Action | Method | URL |
|---|---|---|
| Read schedule and calendar | GET | `/tournaments/{tournamentId}/tabs/schedule` |
| Read unallocated fixtures | GET | `/tournaments/{tournamentId}/tabs/schedule?isAllocated=false&page=1&limit=25` |
| Read eligible admin slots | GET | `/matches/{matchId}/available-slots` |
| Assign an unallocated fixture | POST | `/matches/{matchId}/allocation` |
| Move an allocated fixture atomically | PATCH | `/matches/{matchId}/allocation` |
| Remove allocation | DELETE | `/matches/{matchId}/allocation` |

Paths in this table are relative to `/api/v1`.
Do not use `/tournaments/{id}/self-schedule/matches/{matchId}/available-slots` for manual admin scheduling: that endpoint enforces player self-scheduling mode and windows.

## 3. Read the schedule

```http
GET /api/v1/tournaments/{tournamentId}/tabs/schedule?page=1&limit=25
```

Important response fields:

| Field under `data` | Frontend use |
|---|---|
| `version` | Schedule concurrency version |
| `schedulingMode` | Display current mode |
| `matches[]` | Paginated fixture list; match ID is `matches[i].id` |
| `canonicalMatches[]` | Compatibility alias of the same paginated list; do not concatenate with `matches` |
| `pagination` | `total`, `page`, `limit`, `totalPages`, `hasNextPage` |
| `totalMatches` | Count after list filters; not the daily capacity |
| `venues[]` | Venue and screen metadata |
| `calendar.uniqueMatchdays[]` | Available dates |
| `calendar.raw[]` | Full stored calendar, independent of list pagination and filters |

Other list filters: `date`, `venueId`, `round`, `status`, `isAllocated=true/false`.
Default page size is 25. Fetch subsequent pages until `hasNextPage` is false when a complete fixture list is needed.

Calendar shape:

```text
calendar.raw[]
  venueId, venueName
  screens[]
    screenId, screenName
    days[]
      date
      timeslots[]
        time
        canonicalMatchId
        game
```

A slot is occupied if `canonicalMatchId` or `game` is present. Resolve its match ID with:

```ts
const matchId = slot.canonicalMatchId
  ?? slot.game?.canonicalMatchId
  ?? slot.game?.id;
```

Use returned names for display. An unresolved participant can have `player.id: null` and a label such as `Slot #1`, `Qualifier Seed #4`, or `Winner of ...`. Never treat a slot number or label as a player ID.
Schedule-list participant fields are `match.player1.name` and `match.player2.name`; calendar cards also provide `game.player1Name` and `game.player2Name`.
An `endTime` in the list may be null. If displaying a calculated match end, add `data.matchDuration`; turnover is separate.

## 4. Load eligible slots when a fixture is selected

```http
GET /api/v1/matches/{matchId}/available-slots
```

Illustrative response (IDs and version are examples):

```json
{
  "success": true,
  "message": "Eligible slots retrieved",
  "data": {
    "matchId": "match-id",
    "version": 12,
    "slots": [
      {
        "venueId": "venue-id",
        "venueName": "Main Arena",
        "screenId": "screen-id",
        "screenName": "Screen 1",
        "date": "2026-11-21",
        "time": "09:00"
      }
    ]
  }
}
```

- Slots are sorted by date and time. Group these flat records by date, venue, and screen for the picker.
- Use the exact returned `date` and `time`; do not convert them with browser timezone parsing or create your own slots.
- Keep this response's `version` with the selection and send it as `expectedScheduleVersion` when saving.
- For moving, the endpoint temporarily frees this match's current booking in memory only. It does not save any change. The existing slot may appear among valid choices.
- An empty `slots` list is valid. It can mean occupied capacity, player conflicts, unscheduled feeders, or constraints from already booked downstream matches. This endpoint currently returns no per-slot exclusion reasons.
- Show an empty-state message, e.g. “No eligible slot. Schedule preceding rounds or review existing allocations.”
- Only `SCHEDULED` and `PLAYERS_READY` fixtures are accepted for allocation/moving. BYEs and non-playable fixtures cannot be assigned.

## 5. Assign or move

Send the same JSON body for both operations:

```json
{
  "venueId": "venue-id",
  "screenId": "screen-id",
  "date": "2026-11-21",
  "time": "09:00",
  "expectedScheduleVersion": 12
}
```

- New allocation: `POST /api/v1/matches/{matchId}/allocation`.
- Move: `PATCH /api/v1/matches/{matchId}/allocation`.
- `venueId`, `screenId`, `date`, and `time` are required.
- `expectedScheduleVersion` is optional in the DTO, but the frontend should always send the version from the latest slot response. It must be an integer >= 1.
- `expectedVersion` is an optional match version, not the schedule version. The schedule-tab list currently does not expose match versions; omit it unless obtained from a response that does.
- Do not implement moving as DELETE followed by POST: if the POST fails, the old booking would already be gone. PATCH saves the move in one version-checked write; failed moves preserve the old booking.

Successful assign/move data:

```json
{
  "success": true,
  "message": "Match allocation moved",
  "data": {
    "allocation": {
      "id": "alloc-match-id",
      "canonicalMatchId": "match-id",
      "venueId": "venue-id",
      "screenId": "screen-id",
      "date": "2026-11-21",
      "time": "09:00"
    },
    "match": {},
    "version": 13
  }
}
```

`match` is abbreviated here; the real response contains the canonical match including its allocation and participant references. It uses canonical fields such as `date` and `time`, whereas the schedule-tab list uses `scheduledDate` and `startTime`. Refetch the schedule rather than inserting this object directly into the list.

## 6. Remove an allocation

```http
DELETE /api/v1/matches/{matchId}/allocation
```

No request body. Success returns `data.match` with allocation fields removed. This endpoint does not return the new schedule version, so refetch the schedule.
Live, completed, or under-review matches cannot be unallocated. A feeder match also cannot be unallocated while a downstream dependent fixture is booked. Use a valid atomic move, or remove downstream allocations first, working backwards from the final.

## 7. Scheduling rules enforced by the backend

- Venue, screen, date, and time must exist in the stored calendar.
- One match per physical slot; no simultaneous overlapping match for the same resolved player or identical entrant reference.
- Existing allocation cannot be assigned again with POST.
- Qualification-seed/group-position fixtures wait until all group-stage fixtures are scheduled to finish.
- Winner/loser references wait for their feeder fixtures; tie references wait for the tie's legs. Automatic BYEs are traversed to their underlying feeders.
- Dependency timing uses match duration plus turnover. Moving a feeder also checks already booked downstream fixtures.
- No additional player minimum-rest policy was added.
- These timing checks permit scheduling future unresolved fixtures; they do not require feeder results to be completed before making a booking.

Example settings: `09:00–23:00`, match 20 minutes, turnover 5 minutes, lunch `15:00–15:20`.
The calendar includes `14:25`, then `15:20`; it omits `14:50` because a 20-minute match would overlap lunch. Render returned slots exactly.

## 8. Errors and frontend recovery

Use the HTTP status and response `message`. Do not assume all business errors are HTTP 409; validation errors commonly return 400. Some messages below are prefixes or human-readable strings, not a separate structured error-code field.

| Status/message | Meaning | Frontend action |
|---|---|---|
| 401 / 403 | Missing login or insufficient role | Login or show access restriction |
| 404 | Match/tournament not found | Refresh list; close stale selection |
| 409 `VERSION_CONFLICT` | Slot list is stale | Reload schedule and eligible slots; require reselection |
| 409 `MATCH_VERSION_CONFLICT` | Optional match version is stale | Refresh match |
| 409 containing `changed during allocation` | Concurrent write won | Refresh schedule and picker |
| 400 `MATCH_ALREADY_ALLOCATED` | POST used on a booked fixture | Refresh; use PATCH for a move |
| 400 `PLAYER_TIME_OVERLAP` | Entrant/player is already playing | Refresh eligible slots |
| 400 `DEPENDENCY_UNSCHEDULED` | Required feeder has no booking | Schedule feeders first |
| 400 `ROUND_DEPENDENCY_CONFLICT` | Booking violates round order | Select a valid later/earlier slot as appropriate |
| 409 `DEPENDENT_MATCH_ALLOCATED...` | Removing feeder would invalidate downstream bookings | Use atomic move or unallocate downstream first |
| 400 containing `already occupied` | Another match occupies the screen | Reload picker |
| 400 invalid venue/screen/date/time or `Match is not playable` | Selection or fixture is ineligible | Refresh and display server message |
| 409 match not schedulable / live or completed | Match state blocks edit | Disable edit and refresh |

On network timeout, a write may already have succeeded: refetch before retrying. Disable duplicate submit while a save is pending. Do not automatically repeat POST/PATCH with a newer version without user review.

## 9. UI implementation sequence

1. Load schedule and paginated unallocated fixtures.
2. Select a fixture and load its admin eligible slots.
3. Build date → venue → screen → time options from that response.
4. Enable Assign/Move only after a valid selection; store the associated schedule version.
5. Submit POST for new assignment or PATCH for moving.
6. On success, refresh calendar, fixture list, and schedule version; clear stale picker data.
7. On conflict, refresh and ask the admin to choose again.
8. Confirm Remove in the UI, call DELETE, then refresh.

Acceptance checks: assign once; reject occupied slot; reject same entrant overlap; show no knockout slots before feeders are booked; allow legal future placeholder bookings; preserve old booking on invalid move; reject stale versions; block removing booked feeders; retain pagination; preserve allocations when changing to MANUAL; render the lunch gap without inventing a 14:50 card.

## Source references

- `src/modules/tournament/controller/match/match.controller.ts`
- `src/modules/tournament/service/tournament-matches.service.ts`
- `src/modules/tournament/service/tournament-tabs.service.ts`
- `src/modules/tournament/dto/tournament/allocate-match.dto.ts`
- `src/modules/tournament/utils/tournament-calculation.util.ts`
