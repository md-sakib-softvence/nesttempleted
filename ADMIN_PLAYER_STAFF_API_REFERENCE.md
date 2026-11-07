# Admin Player and Staff APIs

API base prefix is normally `/api/v1` (it can be configured). All endpoints below require:

```http
Authorization: Bearer <admin-token>
Content-Type: application/json
```

The player endpoints require Admin or Super Admin. The employee analytics endpoint is also restricted to Admin or Super Admin.

## Player Management: Financials tab

### Get a player's financial summary and transactions

```http
GET /api/v1/player/{playerId}/financials?page=1&limit=20
```

Returns the selected player's paid tournament entry fees, player ticket purchases, wallet ledger entries, and prize payouts, paginated newest first. `totalSpent` is successful entry fees and ticket purchases minus successful refunds. `totalWinnings` sums successful prize-payout ledger entries. Pending and failed wallet transactions are shown in the transaction list but excluded from totals. A player without a wallet can still receive entry-fee and ticket transaction history; the endpoint does not create a wallet.

Example `data`:

```json
{
  "playerId": "player-uuid",
  "currency": "NGN",
  "totalSpent": 5000,
  "totalWinnings": 25000,
  "transactions": [
    {
      "id": "transaction-uuid",
      "identityId": "player-uuid",
      "reference": "WTX-REFERENCE",
      "type": "payout",
      "amount": 25000,
      "currency": "NGN",
      "status": "SUCCESS",
      "description": "Tournament prize payout",
      "timestamp": "2026-11-06T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

Transaction `type` values are normalized for the admin UI: `entry_fee`, `ticket_sale`, `payout`, `refund`, `withdrawal`, `payout_rejected`, `credit_adjustment`, and `system_bonus`.

## Player Management: Security tab

### Get tournament passes / QR cards

```http
GET /api/v1/player/{playerId}/security/passes?page=1&limit=20
```

Returns tournament registration status, QR code string, and card/tournament details. Use the `passes` list to show the player card preview.

### Get access logs

```http
GET /api/v1/player/{playerId}/security/access-logs?page=1&limit=20
```

Returns tournament **match check-ins** in reverse chronological order. The current schema does not record player login history, so this endpoint does not return sign-in events.

Example `data`:

```json
{
  "playerId": "player-uuid",
  "logs": [
    {
      "id": "tournament-uuid:match-uuid:player-uuid:2026-11-06T10:00:00.000Z",
      "type": "MATCH_CHECK_IN",
      "details": "Checked in for Match 1",
      "tournamentId": "tournament-uuid",
      "tournamentName": "Winter Championship",
      "matchId": "match-uuid",
      "timestamp": "2026-11-06T10:00:00.000Z",
      "checkedInByRole": "EMPLOYEE"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

### Regenerate all tournament QR codes

```http
POST /api/v1/player/{playerId}/security/qr-codes/regenerate
```

No body is required. This rotates all registration QR tokens for the player in one transaction. Previously issued QR tokens will no longer verify. The response includes the replacement tokens, so handle it as sensitive data.

Example `data`:

```json
{
  "playerId": "player-uuid",
  "regeneratedCount": 1,
  "qrCodes": [
    {
      "registrationId": "registration-uuid",
      "tournamentId": "tournament-uuid",
      "qrCodeString": "PLAYER:..."
    }
  ]
}
```

## Player Management: Discipline tab

### Get moderation status and private notes

```http
GET /api/v1/player/{playerId}/moderation
```

Returns the selected player's moderation status and private moderation note. This route is admin-only; the private note is intentionally omitted from general player profile responses.

Example `data`:

```json
{
  "playerId": "player-uuid",
  "status": "SUSPENDED",
  "moderationNotes": "Temporary suspension for rule violation."
}
```

### Update moderation status and/or private notes

```http
PATCH /api/v1/player/{playerId}/moderation
```

At least one field is required. Accepted status values: `ACTIVE`, `SUSPENDED`, and `BANNED_PERMANENTLY`. `BANNED` is also accepted as an alias for `BANNED_PERMANENTLY`. Send an empty `moderationNotes` string to clear the note.

Request example:

```json
{
  "status": "SUSPENDED",
  "moderationNotes": "Temporary suspension for rule violation."
}
```

## Staff Management: Analytics tab

### Get employee analytics

```http
GET /api/v1/employee/{employeeId}/analytics
```

Returns counts for completed assigned matches, distinct tickets with valid scans, scan reliability percentage, and disputes where the employee was the reporter or resolver.

Example `data`:

```json
{
  "employeeId": "EMP-00003",
  "matchesOfficiated": 7,
  "playersScanned": 12,
  "reliabilityScore": 94,
  "disputesRaised": 2
}
```

## Common response envelope

Successful responses use the standard API envelope; paginated endpoints also provide `meta`:

```json
{
  "statusCode": 200,
  "success": true,
  "message": "...",
  "data": {},
  "meta": {}
}
```
