# Match incident review and restart

An incident is a persisted `MatchDispute` record linked to one tournament and canonical match ID. Reporting it changes the match to `UNDER_REVIEW` in both canonical schedule representations and its calendar slot. Report creation and the schedule change commit together. Scores are blocked during review.

## Manual check

1. Start the backend and frontend. Restart Vite after updating its Socket.IO proxy.
2. Use separate browser profiles or an incognito session for the employee and manager/admin accounts. Logging different accounts into tabs sharing the same storage can replace their session credentials.
3. Open the employee's assigned match, verify and confirm both player check-ins, then select **Raise Issue**. Choose a reason and enter observations. Submit the report. The card shows **Match Locked Under Review**.
4. The manager and admin receive an immediate socket notification. Select **Review incident**, or open the incident bell on the manager dashboard/admin header. Admins can also use **Tournaments → Schedule & Results → Match incidents**.
5. Check the tournament, exact match, participants, reporter and observations. Enter resolution notes and choose **Resolve & allow restart**.
6. The employee's card updates through the socket and shows the resolution notes with **Start Again**. The action remains disabled if a player's check-in is missing. Refreshing the page preserves this state.
7. Select **Start Again**. The match returns to `IN_PROGRESS` and **Submit Match Score** becomes available. Submit the result to mark the match `COMPLETED`.

Resolving an incident never starts or completes the match automatically. Existing check-ins and scores are preserved. Only the assigned employee, a manager or an admin may restart it. Active duplicate reports and simultaneous stale updates return HTTP 409.

## API

All routes use the `/api/v1` prefix and bearer authentication.

| Method | Route                                        | Purpose                                                                                            |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | `/tournaments/:id/matches/:matchId/disputes` | Report with `{ "reason": "Hardware failure", "notes": "Controller disconnected" }`                 |
| GET    | `/disputes?tournamentId=:id`                 | Review list; tournament filter is optional                                                         |
| GET    | `/disputes/:id`                              | Full persisted report details                                                                      |
| PATCH  | `/disputes/:id`                              | Resolve with `{ "resolution": "RESOLVED", "reason": "Controller replaced", "expectedVersion": 1 }` |
| POST   | `/tournaments/:id/matches/:matchId/resume`   | Explicitly restart the cleared match                                                               |
| POST   | `/tournaments/:id/matches/:matchId/score`    | Submit the final score after restart                                                               |

## Socket delivery

Connect to `/match-incidents` with Socket.IO auth `{ token: accessToken }`. The server validates the JWT and active staff account, joins managers/admins to a reviewer room and each operator to their own user room. Clients cannot choose rooms. The server disconnects expired sessions.

Events: `incidents:ready`, `incident:created`, `incident:updated`, `match:updated`. Incident events reach reviewers, the reporter and the assigned employee; other employees do not receive report data. Events are emitted after the database transaction commits. On reconnect the frontend reloads persisted incident/match data to recover missed events.

## Database update

The additive migration is `20261102160000_match_incident_reporting`. It adds observations and reporter audit fields to the existing `MatchDispute` table. It does not require a database reset. This migration was applied to the configured development database and recorded as applied; older unrelated migration history remains as it was.
