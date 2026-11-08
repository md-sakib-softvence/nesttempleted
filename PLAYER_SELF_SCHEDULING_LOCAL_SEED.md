# Local Player Self-Scheduling Seed

This seed creates a dedicated, relationally complete local fixture without changing the existing `LOCAL TEST | FC 26 Open Cup` or player accounts.

## Run

From the `backend` directory:

```powershell
npm run seed:player-self-scheduling:local
```

The script refuses to run when `DATABASE_URL` does not use `localhost`, `127.0.0.1`, or `::1`. It is idempotent: if its tournament already exists, it leaves it and any bookings made during testing untouched.

## Seeded records

- Tournament: `LOCAL TEST | Player Self-Scheduling | FC 26`
- Mode: `PLAYER_SELF`; format: four-player single elimination
- Four confirmed local player registrations, using the existing `player1@gmail.com`, `local.player@tape.test`, and `playeradder@gmail.com` records, plus one test-only account
- One tournament venue and two real `Venue`/`Screen` relations
- Two resolved semifinals with real registered player IDs and open self-scheduling clocks
- One final whose two participants are the semifinal winners; it is conditional and cannot be booked before results resolve
- Three dates of 30-minute slots with 15-minute turnover, available on both screens
- No entry fee, wallet changes, prize credits, match scores, or real payments

The additional local account is:

- Email: `selfschedule.player4@tape.test`
- Password: `LocalTest#2026!`

The seed does not reset passwords for existing accounts. The existing local test account `player1@gmail.com` retains the credentials already configured in your local database.

## Where to view it

1. In Admin → Tournaments, search for `LOCAL TEST | Player Self-Scheduling | FC 26`. Open its Schedule tab to inspect the scheduling mode, venue, screens, dates, and match bracket.
2. Log in to the Player panel as `player1@gmail.com` and open Calendar → Reservation Scheduler. The first semifinal against `local.player@tape.test` should be available to book.
3. Log in as `selfschedule.player4@tape.test` to see the other semifinal. Either participant can select a valid slot; after one confirms, that match leaves both players’ pending lists and appears in their scheduled match calendar.
4. The final stays out of the booking list until both semifinal results resolve its participants.

The normal player self-scheduling API and background assignment worker operate on this persisted tournament schedule. Phase 1 starts when the seed runs, so the initial test window is open for 48 hours; the worker runs automatically after 96 hours.
