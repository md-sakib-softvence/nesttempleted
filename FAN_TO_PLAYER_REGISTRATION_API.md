# Fan tournament application and player activation API

Routes use the configured API prefix (default `/api/v1`). All three endpoints require the signed-in Fan's bearer access token. The server reads the fee and currency from the tournament, initializes Flutterwave, and verifies payment directly with Flutterwave before creating a Player.

## 1. Create the application and checkout

`POST /fan/tournaments/{tournamentId}/registrations`

```json
{
  "homeVenueId": "venue-id",
  "primaryTeamId": "team-id",
  "secondaryTeamId": "backup-team-id",
  "jerseySize": "M"
}
```

The venue is checked against the selected tournament. Primary and secondary teams are required and must differ for football tournaments; they are ignored for other games. The response contains `data.application`, `data.requiresPayment`, and, for paid tournaments, `data.checkout` with the Flutterwave link and transaction reference. The application is linked to the Fan and Tournament in the database before checkout. Free tournaments are marked paid by the server and skip Flutterwave.

## 2. Verify Flutterwave payment

`POST /fan/tournaments/{tournamentId}/registrations/{applicationId}/verify-payment`

```json
{
  "txRef": "TAPE-APP-application-id-reference"
}
```

The backend verifies the reference with Flutterwave, checks transaction status, amount, currency, Fan, Tournament, and application metadata, then stores the Flutterwave transaction ID and paid amount/currency on the application. The client must not treat a redirect or browser callback as proof of payment.

## 3. Complete the player profile and tournament registration

`POST /fan/tournaments/{tournamentId}/registrations/{applicationId}/complete`

```json
{
  "gamerTag": "SamTheGamer",
  "preferredPlatform": "PlayStation 5",
  "favoriteTeam": "Real Madrid",
  "profilePicture": "https://example.com/avatar.jpg"
}
```

This endpoint is available only after the application payment is confirmed. It creates the Player, paid `TournamentRegistration`, and accounting ticket in one database transaction, links them to the Fan application and Tournament, and marks the application completed. The response contains the Player session tokens, application, and final registration.

## Database and environment setup

Apply the included Prisma migrations from the backend directory:

```powershell
npm.cmd exec prisma migrate deploy
```

Set the normal database configuration, `FLUTTERWAVE_SECRET_KEY`, and `FRONTEND_URL` in the backend environment. Do not expose the Flutterwave secret key to the frontend.
