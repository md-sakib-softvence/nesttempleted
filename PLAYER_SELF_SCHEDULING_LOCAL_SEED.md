# Local Player Schedule test data

This local-only seed creates a four-player FC 26 tournament to verify player slot selection and automatic assignment.

## Seed command

From the `backend` directory:

```powershell
npm run seed:player-schedule:local
```

The script refuses database hosts other than `localhost`, `127.0.0.1`, or `::1`. It is idempotent: if the tournament exists, it leaves its bookings and other test changes untouched.

## Created data

- Tournament: `LOCAL TEST | PLAYER SCHEDULE | FC 26`
- Mode: `PLAYER_SELF`; status: `UPCOMING`; format: four-player single elimination
- Four confirmed player registrations
- Two semifinal fixtures with resolved competitors and a 24-hour player booking window
- Final and third-place fixtures that wait for the semifinal results to resolve their competitors
- One venue, two related screens, three event dates, and available time slots
- No entry fee, wallet change, prize credit, score, or payment

The seed may create this test player if it does not already exist:

- Email: `selfschedule.player4@tape.test`
- Password: `LocalTest#2026!`

It does not change passwords for existing accounts.

## Verify the flow

1. In Admin → Tournaments, search for `LOCAL TEST | PLAYER SCHEDULE | FC 26`. Open its Schedule tab to inspect `PLAYER SCHEDULE`, the venue/screens, fixture bracket, and open matchdays. Keep global scheduling open.
2. Sign in to the Player panel as `player1@gmail.com` and open My Matches → Reservation Scheduler. The first semifinal should be listed with a 24-hour countdown. The other participant can sign in as `selfschedule.player4@tape.test` to see the second semifinal.
3. Either participant can choose one valid venue, screen, date, and time. Once booked, the fixture is removed from both pending lists and appears in the scheduled fixtures/calendar.
4. If nobody books within 24 hours, the backend worker checks every minute and assigns the earliest valid open slot. If no valid slot exists, the fixture is marked capacity-blocked for an admin to resolve.
5. After the admin records both semifinal results, the final resolves its players and opens its own 24-hour player booking window.

The timer starts when both fixture participants are resolved. A paused tournament or closed matchday prevents player booking; auto-assignment respects the published matchday window too.
