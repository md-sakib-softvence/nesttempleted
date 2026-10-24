# 🎮 ESPORTS FAN PANEL — FULL API INTEGRATION DOCUMENTATION

This comprehensive documentation covers **all backend APIs** powering the **Fan Experience**, including Profile, Social Following, Live Tournament Coin Predictions, Standings Filters (`Table`, `Goals`, `Metrics`), Digital Ticket Passes, Checkout, and Raffles.

---

## 🌐 1. Server Configuration & Authentication

- **Base URL:** `http://localhost:3002/api/v1` *(or your production server URL)*
- **Content-Type:** `application/json` *(unless uploading images, which uses `multipart/form-data`)*
- **Authorization Header:**
  ```http
  Authorization: Bearer <JWT_ACCESS_TOKEN>
  ```
- **Standard Response Format:**
  ```json
  {
    "statusCode": 200,
    "success": true,
    "message": "Operation description",
    "data": { ... },
    "meta": { "page": 1, "limit": 10, "total": 42 } // on paginated endpoints
  }
  ```

---

## 📑 Quick Navigation

1. [Fan Profile Management](#-2-fan-profile-management)
2. [Social Following & Gamertag Discovery](#-3-social-following--gamertag-discovery)
3. [Tournament Hub & Standings Filters](#-4-tournament-hub--standings-filters)
4. [Live Coin Predictions & Wagers](#-5-live-coin-predictions--wagers)
5. [Digital Ticket Passes & Wallet](#-6-digital-ticket-passes--wallet)
6. [Raffles & Giveaways](#-7-raffles--giveaways)

---

## 👤 2. Fan Profile Management

### 2.1 Get Logged-In Fan Profile
Fetches the profile, point balances (`topPoint`, `coins`), and metadata for the authenticated fan.

- **Route:** `GET /fan/profile`
- **Auth:** Required (`Bearer <token>`)

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Fan profile retrieved successfully",
  "data": {
    "fanId": "fan-uuid-101",
    "firstName": "John",
    "surname": "Doe",
    "gamerTag": "GhostRider99",
    "email": "fan@example.com",
    "phoneNumber": "+2348012345678",
    "profileImage": "https://s3.amazonaws.com/uploads/fans/...",
    "topPoint": 1200,
    "coins": 350,
    "country": "Nigeria",
    "favoriteGame": "EAFC 25",
    "createdAt": "2026-01-15T08:00:00.000Z"
  }
}
```

---

### 2.2 Update Fan Profile
Updates profile information with optional avatar upload.

- **Route:** `PATCH /fan/:id`
- **Auth:** Required (`Bearer <token>`)
- **Content-Type:** `multipart/form-data`

#### Form-Data Fields:
- `firstName` *(string, optional)*
- `surname` *(string, optional)*
- `gamerTag` *(string, optional)*
- `phoneNumber` *(string, optional)*
- `profileImage` *(file, optional — JPG, PNG, WEBP)*
- `favoriteGame` *(string, optional)*

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Fan updated successfully",
  "data": {
    "fanId": "fan-uuid-101",
    "gamerTag": "GhostRider99",
    "profileImage": "https://s3.amazonaws.com/uploads/fans/..."
  }
}
```

---

### 2.3 Get Public Fan Profile by ID
- **Route:** `GET /fan/:id`
- **Auth:** Optional / Public

---

## 🤝 3. Social Following & Gamertag Discovery

### 3.1 Search Players & Fans by GamerTag
Instant search bar for discovering players and fans to follow.

- **Route:** `GET /fan/search-gamertags?query=fifa`
- **Auth:** Optional / Authenticated

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": [
    {
      "id": "player-uuid-1",
      "type": "PLAYER",
      "gamerTag": "FIFA_GOD",
      "name": "Alex Mercer",
      "photo": "https://...",
      "isFollowing": true
    }
  ]
}
```

---

### 3.2 Follow a Player or Fan
- **Route:** `POST /fan/follow`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "targetId": "player-uuid-1",
  "targetType": "PLAYER" // or "FAN"
}
```

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Follow status updated successfully",
  "data": {
    "isFollowing": true,
    "targetId": "player-uuid-1"
  }
}
```

---

### 3.3 Unfollow
- **Route:** `POST /fan/unfollow`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "targetId": "player-uuid-1"
}
```

---

### 3.4 Get User's Following List
- **Route:** `GET /fan/following?page=1&limit=10&searchTerm=`
- **Auth:** Required (`Bearer <token>`)

---

### 3.5 Followed Players Upcoming Matches Feed
Returns upcoming matches featuring pro players that the fan follows.

- **Route:** `GET /fan/followed-matches`
- **Auth:** Required (`Bearer <token>`)

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "totalFollowedPlayers": 4,
    "totalMatches": 2,
    "matches": [
      {
        "matchId": "m-101",
        "tournamentId": "t-winter-2024",
        "tournamentName": "WINTER CHAMPIONSHIP 2024",
        "time": "10:35",
        "status": "SCHEDULED",
        "followedPlayer": {
          "id": "p-83",
          "gamertag": "GamerTag83"
        },
        "opponent": {
          "id": "p-84",
          "gamertag": "GamerTag84"
        }
      }
    ]
  }
}
```

---

## 🏆 4. Tournament Hub & Standings Filters

### 4.1 Get Tournament Details (Overview, Venues & Prizes)
Loads the tournament page header, venues list, guidelines, and entry fee.

- **Route:** `GET /tournaments/:id`
- **Auth:** Public (`@Public()`)

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "tournamentId": "t-winter-2024",
    "name": "WINTER CHAMPIONSHIP 2024",
    "gameTitle": "EAFC 25",
    "status": "IN_PROGRESS",
    "entryFee": 5000,
    "currency": "USD",
    "venues": [
      {
        "venueId": "v-1",
        "name": "MAIN ARENA",
        "address": "123 Stadium Dr",
        "screens": []
      }
    ],
    "manageEventPrizes": [
      { "prizeCategory": "1st Place", "amount": 25000 }
    ],
    "rules": [
      "Fair play rulebook applies",
      "Check-in at arena 30 mins before kick-off"
    ],
    "ticketTiers": [
      {
        "tierId": "tier-day",
        "name": "Day Pass",
        "price": 5000,
        "type": "DAY_PASS",
        "capacity": 500,
        "sold": 120
      }
    ]
  }
}
```

---

### 4.2 Standings Sub-Tabs (`TABLE`, `GOALS`, `METRICS`)
Powers the Standings page and supports filter switching.

- **Route:** `GET /tournaments/:id/standings?filter={table|goals|metrics|all}`
- **Auth:** Public (`@Public()`)

#### A. Table Filter (`?filter=table`):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "filter": "table",
    "table": [
      {
        "rank": 1,
        "playerId": "p-101",
        "gamertag": "FIFA_GOD",
        "playerPhotoUrl": "https://...",
        "played": 1,
        "won": 1,
        "drawn": 0,
        "lost": 0,
        "goalsFor": 3,
        "goalsAgainst": 1,
        "goalDifference": 2,
        "points": 3,
        "form": ["W"]
      }
    ]
  }
}
```

#### B. Goals Filter (`?filter=goals`):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "filter": "goals",
    "goals": [
      {
        "rank": 1,
        "playerId": "p-101",
        "gamertag": "FIFA_GOD",
        "playerPhotoUrl": "https://...",
        "matches": 1,
        "goals": 3,
        "gpm": 3.0
      }
    ],
    "goldenBoot": {
      "playerId": "p-101",
      "name": "FIFA_GOD",
      "goals": 3,
      "gpm": 3.0
    }
  }
}
```

#### C. Metrics Filter (`?filter=metrics`):
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "filter": "metrics",
    "metrics": [
      {
        "playerId": "p-101",
        "gamertag": "FIFA_GOD",
        "played": 1,
        "wins": 1,
        "winRate": 100.0,
        "gpm": 3.0,
        "gapm": 1.0,
        "gdpm": 2.0,
        "cleanSheets": 0
      }
    ],
    "awards": {
      "goldenBoot": { "playerId": "p-101", "name": "FIFA_GOD", "goals": 3, "gpm": 3.0 },
      "goldenGlove": { "playerId": "p-101", "name": "FIFA_GOD", "cleanSheets": 0, "gapm": 1.0 },
      "mostClinical": { "playerId": "p-101", "name": "FIFA_GOD", "gdpm": 2.0 }
    }
  }
}
```

---

### 4.3 Tournament Match Schedule
- **Route:** `GET /tournaments/:id/matches?round=&status=`
- **Auth:** Public (`@Public()`)

---

## 🎯 5. Live Coin Predictions & Wagers

Strictly restricted to active **Live tournaments** (`IN_PROGRESS`) and active (unplayed) matches.

### 5.1 Get Prediction Fixtures & Odds
Fetches active match fixtures with odds multipliers (`1.85x`, `2.10x`, `3.10x`) to render the **"SET COIN PREDICTION"** modal.

- **Route:** `GET /tournaments/:id/prediction-fixtures`
- **Auth:** Public (`@Public()`)

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "tournamentId": "t-winter-2024",
    "tournamentName": "WINTER CHAMPIONSHIP 2024",
    "isLive": true,
    "fixtures": [
      {
        "matchId": "m-101",
        "tournamentName": "WINTER CHAMPIONSHIP 2024",
        "time": "10:35",
        "player1": {
          "id": "p-83",
          "gamertag": "GamerTag83",
          "odds": 1.85
        },
        "player2": {
          "id": "p-84",
          "gamertag": "GamerTag84",
          "odds": 2.10
        },
        "drawOdds": 3.10,
        "status": "OPEN_FOR_PREDICTION"
      }
    ]
  }
}
```

---

### 5.2 Lock In Prediction ("LOCK IN PREDICTION")
Locks the coin prediction, validates balances, deducts wager points, and calculates potential payout.

- **Route:** `POST /tournaments/:id/predict`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "matchId": "m-101",
  "predictedWinnerId": "p-83",
  "wagerPoints": 100,
  "odds": 1.85
}
```

#### Rules:
- `wagerPoints`: Number between `20` and `500`.
- Automatically deducts `wagerPoints` from fan's points balance.
- Returns error `400` if tournament is completed or match has already finished.

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Prediction locked in successfully",
  "data": {
    "message": "Prediction successfully locked in!",
    "tournamentId": "t-winter-2024",
    "tournamentName": "WINTER CHAMPIONSHIP 2024",
    "matchId": "m-101",
    "predictedWinnerId": "p-83",
    "wagerPoints": 100,
    "odds": 1.85,
    "potentialPayout": 185,
    "remainingPoints": 1100,
    "status": "LOCKED",
    "timestamp": "2026-10-22T12:00:00.000Z"
  }
}
```

---

## 🎟️ 6. Digital Ticket Passes & Wallet

### 6.1 Initialize Ticket Purchase (Checkout Button)
Triggered when tapping `Buy Ticket - $5000`.

- **Route:** `POST /tickets/purchase`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "tournamentId": "t-winter-2024",
  "type": "DAY_PASS", // or "VIP", "SEASON_PASS"
  "quantity": 1,
  "tierId": "tier-day" // optional
}
```

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Ticket checkout initiated successfully. Redirect to payment link to complete payment.",
  "data": {
    "paymentLink": "https://checkout.flutterwave.com/v3/hosted/pay/...",
    "txRef": "FLW-TCK-1729600000000-abcd1234",
    "totalAmount": 5000,
    "currency": "USD",
    "quantity": 1,
    "seatNumber": "Seat 121"
  }
}
```
> **Frontend Action:** Open `data.paymentLink` in the browser or webview.

---

### 6.2 Verify Ticket Payment
Called after Flutterwave redirects to verify and issue the digital pass.

- **POST Route:** `POST /tickets/verify`
  ```json
  {
    "txRef": "FLW-TCK-1729600000000-abcd1234",
    "transactionId": "1234567"
  }
  ```
- **GET Route:** `GET /tickets/verify/:txRef?transaction_id=1234567`
- **Auth:** Public (`@Public()`)

---

### 6.3 Fan Digital Ticket Wallet ("Wallet" Tab)
Powers the mobile app's **Wallet** tab with passes, active codes, and check-in QR tokens.

- **Route:** `GET /tickets/my-tickets`
- **Auth:** Required (`Bearer <token>`)

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "totalTickets": 2,
    "activeTickets": 1,
    "usedTickets": 1,
    "tickets": [
      {
        "ticketId": "tck-101",
        "showTicketId": "TCK-00101",
        "tournamentName": "WINTER CHAMPIONSHIP 2024",
        "gameTitle": "EAFC 25",
        "type": "DAY_PASS",
        "pricePaid": 5000,
        "currency": "USD",
        "status": "ACTIVE",
        "qrToken": "TICKET:t-winter-2024:tck-101:random87236",
        "seatNumber": "Seat 121",
        "checkedIn": false,
        "createdAt": "2026-10-22T10:00:00.000Z"
      }
    ]
  }
}
```

---

### 6.4 Transfer Ticket Pass
Allows a fan to transfer an active pass to a friend via phone number or email.

- **Route:** `POST /tickets/transfer`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "ticketId": "tck-101",
  "recipientEmail": "friend@example.com",
  "recipientPhone": "+2348099887766"
}
```

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Ticket successfully transferred to recipient",
  "data": {
    "ticketId": "tck-101",
    "status": "TRANSFERRED"
  }
}
```

---

### 6.5 QR Code Venue Check-In
Used by staff or scanner to validate digital tickets at the venue door.

- **Route:** `POST /tickets/check-in`
- **Auth:** Required (`Bearer <token>`)

#### Request Body:
```json
{
  "qrToken": "TICKET:t-winter-2024:tck-101:random87236",
  "venueId": "v-1"
}
```

---

## 🎁 7. Raffles & Giveaways

### 7.1 List All Raffles
- **Route:** `GET /tournament/raffle?page=1&limit=10&status=OPEN&tournamentId=`
- **Auth:** Public (`@Public()`)

---

### 7.2 Join a Raffle
- **Route:** `POST /tournament/raffle/:raffleId/join`
- **Auth:** Required (`Bearer <token>`) — User ID automatically identified from JWT token.

#### Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Successfully joined the raffle",
  "data": {
    "raffleId": "raffle-uuid-1",
    "ticketNumber": "RAF-0042",
    "entryStatus": "ENTERED"
  }
}
```

---

## 💡 Frontend Quick Tips
1. **Public vs. Protected:** All `@Public()` endpoints do not require the `Authorization` header.
2. **Instant Tabs:** Calling `GET /tournaments/:id/standings` without `?filter=` returns `table`, `goals`, and `metrics` simultaneously, allowing instantaneous local sub-tab switching without extra spinner flickers.
3. **Flutterwave Redirect:** When a user taps "Buy Ticket", the frontend only needs to redirect the user to `data.paymentLink`. When payment is approved, redirect them to your app's `/tickets/verify` page to show their digital QR pass!
