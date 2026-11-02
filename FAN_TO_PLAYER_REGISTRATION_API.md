# Fan tournament application and player activation API

Routes use the configured API prefix (default `/api/v1`). All three endpoints require the signed-in Fan's bearer access token. The server reads the fee and currency from the tournament, initializes Flutterwave, and verifies payment directly with Flutterwave before creating a Player.

## 1. Create the application and checkout

`POST /fan/tournaments/{tournamentId}/registrations`

```json
{
  "homeVenueId": "venue-id",
  "primaryTeamId": "France",
  "secondaryTeamId": "Spain",
  "jerseySize": "M"
}
```

The venue is checked against the selected tournament. Primary and secondary national teams are required for tournaments whose `gameType` is `FOOTBALL`; the choices are France, Spain, Portugal, England, Brazil, Germany, Netherlands, Argentina, Italy, Belgium, Sweden, Morocco, Senegal, Croatia, Norway, Türkiye, Colombia, Uruguay, and Côte d'Ivoire. Other-game tournaments do not accept team choices. The response contains `data.application`, a separate `data.payment` ledger record, `data.requiresPayment`, and, for paid tournaments, `data.checkout`. The application only stores tournament/application details; all fee, gateway, Flutterwave reference, transaction ID, and payment status fields live in `Payment`.

## 2. Verify Flutterwave payment

`POST /fan/tournaments/{tournamentId}/registrations/{applicationId}/verify-payment`

```json
{
  "txRef": "TAPE-APP-application-id-reference"
}
```

The backend verifies the reference with Flutterwave, checks transaction status, amount, currency, Fan, Tournament, and application metadata, then updates the matching `Payment` row with Flutterwave's transaction ID, paid amount/currency, provider response, and paid time. The client must not treat a redirect or browser callback as proof of payment.

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

This endpoint is available only after a successful `Payment` exists for the application. It uses the existing PlayerService creation logic to create the Player and wallet, creates the paid `TournamentRegistration` in the same database transaction, links it to the Fan application and Tournament, and marks the application completed. The response contains the Player session tokens, application, and final registration.

## Tournament game category

Tournament creation and update accept `gameType: "FOOTBALL" | "OTHER"`. The fan registration form uses this explicit field to decide whether to show national team selectors; it does not infer the game category from the title. Existing tournaments are backfilled from their game title by the migration.

## Database and environment setup

Apply the included Prisma migrations from the backend directory:

```powershell
npm.cmd exec prisma migrate deploy
```

Set the normal database configuration, `FLUTTERWAVE_SECRET_KEY`, and `FRONTEND_URL` in the backend environment. Do not expose the Flutterwave secret key to the frontend.
