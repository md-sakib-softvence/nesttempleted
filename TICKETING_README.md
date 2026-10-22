# 🎟️ Tournament Ticketing & Flutterwave Payment System

Complete documentation for the Tournament Ticketing System, including seat and capacity calculations, ticket categories, lifecycle statuses, Flutterwave checkout & verification, and venue QR check-in.

---

## 📌 Table of Contents
1. [Overview](#overview)
2. [Ticket Categories & Lifecycle Statuses](#ticket-categories--lifecycle-statuses)
3. [Capacity & Seat Calculations](#capacity--seat-calculations)
4. [How to Buy Tickets (Step-by-Step Flow)](#how-to-buy-tickets-step-by-step-flow)
5. [How Many Tickets Can a User Buy?](#how-many-tickets-can-a-user-buy)
6. [Flutterwave Integration Architecture](#flutterwave-integration-architecture)
7. [API Routes & Payload Documentation](#api-routes--payload-documentation)
   - [1. Initialize Purchase (Flutterwave Checkout)](#1-initialize-purchase-flutterwave-checkout)
   - [2. Verify Payment & Issue Ticket](#2-verify-payment--issue-ticket)
   - [3. Flutterwave Webhook Listener](#3-flutterwave-webhook-listener)
   - [4. Venue QR Code Check-In](#4-venue-qr-code-check-in)
   - [5. Get My Purchased Tickets (Wallet)](#5-get-my-purchased-tickets-wallet)
   - [6. Tournament Seat Capacity & Calculations Summary](#6-tournament-seat-capacity--calculations-summary)
   - [7. Ticket Sales Analytics (Admin)](#7-ticket-sales-analytics-admin)
   - [8. Ticket Tiers Management (CRUD)](#8-ticket-tiers-management-crud)

---

## 1. Overview
The ticketing module allows spectators (**Fans** and **Players**) to purchase digital passes to live or stream-broadcast esports tournaments. It guarantees:
- **Real-Time Seat & Capacity Control**: Prevents overbooking beyond tournament and tier thresholds.
- **Flutterwave Checkout**: Safe payment gateway integration supporting Cards, Bank Transfers, and USSD in NGN, USD, etc.
- **Dynamic Seat Numbers**: Automatically assigns seat designations (`Seat #1`, `Seat #2`, etc.) or custom seats.
- **Scannable QR Codes**: Frontend scanner-compliant tokens (`FAN:<tournamentId>:<fanId>:<ticketId>` or `PLAYER:<tournamentId>:<playerId>:<ticketId>`).
- **Fraud Prevention**: Single-use check-ins, hash-verified webhooks, and idempotent ticket generation.

---

## 2. Ticket Categories & Lifecycle Statuses

### A. The 3 Ticket Categories (`TicketType`)
| Category | Code | Description | Typical Access |
| :--- | :--- | :--- | :--- |
| **Day Pass** | `DAY_PASS` | Access for one full day of the event | General admission seating, standard venue zones. |
| **Season Pass** | `SEASON_PASS` | Multi-day or full tournament duration pass | Access for all stages and days of the championship. |
| **VIP Pass** | `VIP` | Exclusive premium spectator experience | Premium front-row seats, VIP lounge, expedited check-in. |

### B. Ticket Lifecycle Statuses (`TicketStatus`)
| Status | Meaning | Can Check-In? |
| :--- | :--- | :--- |
| `ACTIVE` | Valid, paid ticket ready for entry. | ✅ **Yes** |
| `USED` | Already scanned at venue gate/screen. | ❌ **No** (Duplicate entry blocked) |
| `TRANSFERRED` | Ticket transferred to another spectator. | ❌ **No** (Old owner cannot use) |
| `CANCELLED` | Voided or refunded by tournament admin. | ❌ **No** |

---

## 3. Capacity & Seat Calculations

The system calculates seating and capacity across two levels:

1. **Tournament Level**:
   $$\text{Available Seats} = \max(0, \text{Tournament Capacity} - \text{Total Active/Used Tickets Sold})$$
   $$\text{Occupancy Rate (\%)} = \left(\frac{\text{Tickets Sold}}{\text{Tournament Capacity}}\right) \times 100$$
   $$\text{Check-In Rate (\%)} = \left(\frac{\text{Checked-In Tickets}}{\text{Total Sold}}\right) \times 100$$

2. **Tier Level (`TicketTier`)**:
   $$\text{Tier Available Seats} = \max(0, \text{Tier Capacity} - \text{Tier Sold})$$

3. **Dynamic Seat Assignment**:
   When purchasing, if no custom seat number is requested, the system automatically assigns the next sequential seat:
   $$\text{Assigned Seat} = \text{"Seat "} + (\text{Current Total Sold} + 1)$$
   For bulk purchases of $N$ tickets, seats are assigned sequentially: `Seat X-1`, `Seat X-2`, ..., `Seat X-N`.

---

## 4. How to Buy Tickets (Step-by-Step Flow)

```
 [Player / Fan App]
        │
        ▼ 1. Select Pass (Day / Season / VIP) & Quantity
 [POST /api/v1/tickets/purchase]
        │
        ├──> Check Tournament Capacity & Tier Availability
        ├──> Calculate total price = unitPrice × quantity
        ├──> Generate unique reference: FLW-TCK-<timestamp>-<uuid>
        │
        ▼ 2. Initialize Flutterwave
 [Flutterwave API: /v3/payments]
        │
        ▼ 3. Return paymentLink to Client
 [User redirected to Flutterwave Hosted Page]
        │
        ▼ 4. User completes payment via Card/Transfer/USSD
        │
 ┌──────┴─────────────────────────────────┐
 │                                        │
 ▼ [Client Redirect]                      ▼ [Webhook in Background]
GET /api/v1/tickets/verify/:txRef        POST /api/v1/tickets/flutterwave-webhook
 │                                        │
 └─────────────────┬──────────────────────┘
                   │
                   ▼ 5. Verify status === 'successful'
             [Backend Issues Ticket(s)]
                   ├── Generate showTicketId (e.g. TCK-00001)
                   ├── Generate QR Token (FAN:tourId:userId:tckId)
                   ├── Assign Seat Number
                   ├── Increment TicketTier.sold count
                   └── Save to Database (Status: ACTIVE)
```

---

## 5. How Many Tickets Can a User Buy & Single-Use Rules

### A. Multiple Purchases for Players & Fans
- **Multiple Times**: Any registered **Fan** or **Player** can purchase tickets **as many times as they want**. There is no limit on how many separate checkout orders a user can place.
- **Multiple Tickets per Order**: In each purchase, the user can buy multiple tickets by setting `quantity: N` (e.g., buying 2, 4, or 10 tickets for friends or family).
- **Capacity Constraint**: The requested `quantity` **cannot exceed** the remaining available seats in the tournament or the specific ticket tier:
  $$\text{Current Sold} + \text{Requested Quantity} \le \text{Capacity}$$
  If a user requests more tickets than remaining seats, the API rejects the request with HTTP `400 Bad Request`:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Not enough seats available. Tournament capacity reached. Remaining seats: 5"
  }
  ```

### B. One Ticket = One-Time Use Only for the Match
- **Strict Single-Use**: Each individual ticket issued possesses a unique `ticketId`, `showTicketId`, `seatNumber`, and `qrToken`.
- **Match Venue Check-In**: A ticket can **ONLY be checked in once** for the tournament match (`checkedIn: true`, `status: USED`).
- **Duplicate Prevention**: If any spectator or player attempts to use or scan the same QR token a second time, the check-in endpoint instantly blocks entry:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Ticket has already been used! Checked in at 2026-10-22T08:00:00.000Z"
  }
  ```

### C. Digital Pass Links for Player & Fan
The API builds clean, direct links for each ticket pass linked to the user's role:
- **Fan Pass Link**: `${FRONTEND_URL}/fan/tickets/${ticketId}`
- **Player Pass Link**: `${FRONTEND_URL}/player/tickets/${ticketId}`
- **Ticket Wallet**: `${FRONTEND_URL}/${role}/tickets`

### D. Redirect URL Configuration via `.env`
The checkout redirect URL is retrieved directly from `backend/.env`:
```env
FRONTEND_URL=https://www.tapegaming.com
TICKET_REDIRECT_URL=https://tapegaming.com/tickets/verify
```
When `POST /api/v1/tickets/purchase` is invoked, the backend retrieves `process.env.TICKET_REDIRECT_URL` and appends `?tx_ref=<tx_ref>` so the user is returned seamlessly to the frontend verification screen after paying on Flutterwave. Clients can also optionally supply a custom `redirectUrl` in the request body.

---

## 6. Flutterwave Integration Architecture

- **Hosted Checkout URL**: Returned immediately as `paymentLink` upon calling `POST /api/v1/tickets/purchase`.
- **Redirect URL from `.env`**: Passes `TICKET_REDIRECT_URL` from `.env` to Flutterwave with the custom transaction reference.
- **Payment Verification**:
  - Redirect endpoint: `GET /api/v1/tickets/verify/:txRef`
  - Direct API endpoint: `POST /api/v1/tickets/verify`
- **Idempotency Protection**: If verification is called multiple times for the same transaction reference, the existing issued tickets are returned without charging or creating duplicates.
- **Webhook Security**: Verified via the `verif-hash` header against `FLUTTERWAVE_SECRET_HASH`.

---

## 7. API Routes & Payload Documentation

### 1. Initialize Purchase (Flutterwave Checkout)
- **Method**: `POST`
- **URL**: `/api/v1/tickets/purchase`
- **Auth**: Bearer JWT (Fan or Player)
- **Request Body**:
```json
{
  "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
  "tierId": "b1a37c92-1e94-4d1a-8c77-4b95cf60a34e",
  "type": "DAY_PASS",
  "quantity": 2,
  "seatNumber": "Row A - Seat 1"
}
```
> **Note**: `customerEmail`, `customerName`, and `customerPhone` are **NOT** needed in the request body because they are automatically resolved from your authenticated JWT session (`Fan` or `Player` database record). The `redirectUrl` is automatically retrieved from `.env` (`TICKET_REDIRECT_URL`).
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Ticket checkout initiated successfully. Redirect to payment link to complete payment.",
  "data": {
    "paymentLink": "https://checkout.flutterwave.com/v3/hosted/pay/49d2871bfa829",
    "txRef": "FLW-TCK-1718000000000-a1b2c3d4",
    "redirectUrl": "https://tapegaming.com/tickets/verify?tx_ref=FLW-TCK-1718000000000-a1b2c3d4",
    "digitalPassLink": "https://tapegaming.com/fan/tickets",
    "amount": 3000,
    "currency": "NGN",
    "quantity": 2,
    "ticketType": "DAY_PASS",
    "seatNumber": "Row A - Seat 1",
    "purchaserRole": "FAN",
    "purchaserId": "fan_12345",
    "purchaserName": "Alex Morgan",
    "tournamentName": "Lagos Cyber Clash 2026",
    "oneTicketOneTimeOnly": true,
    "canBuyMultipleTimes": true
  }
}
```

---

### 2. Verify Payment & Issue Ticket
- **Method**: `GET` or `POST`
- **URL**: `/api/v1/tickets/verify/:txRef` or `POST /api/v1/tickets/verify`
- **Auth**: Public
- **Request Body (if POST)**:
```json
{
  "txRef": "FLW-TCK-1718000000000-a1b2c3d4",
  "transactionId": 2882001
}
```
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "2 ticket(s) issued successfully",
  "data": {
    "verified": true,
    "tickets": [
      {
        "ticketId": "912a783b-3162-4217-b769-cf3607068e1a",
        "showTicketId": "TCK-00001",
        "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
        "purchaserRole": "FAN",
        "purchaserName": "Alex Morgan",
        "type": "DAY_PASS",
        "pricePaid": 1500,
        "currency": "NGN",
        "status": "ACTIVE",
        "seatNumber": "Row A - Seat 1-1",
        "qrToken": "FAN:8f3e2b41-3b7c-4a34-8c01-7c980d287ea6:fan_123:912a783b-3162-4217-b769-cf3607068e1a",
        "checkedIn": false
      }
    ]
  }
}
```

---

### 3. Flutterwave Webhook Listener
- **Method**: `POST`
- **URL**: `/api/v1/tickets/flutterwave-webhook`
- **Headers**: `verif-hash: <FLUTTERWAVE_SECRET_HASH>`
- **Response**: `{ "received": true }`

---

### 4. Venue QR Code Check-In
- **Method**: `POST`
- **URL**: `/api/v1/tickets/check-in`
- **Auth**: Bearer JWT (Staff or Admin)
- **Request Body**:
```json
{
  "qrToken": "FAN:8f3e2b41-3b7c-4a34-8c01-7c980d287ea6:fan_123:912a783b-3162-4217-b769-cf3607068e1a",
  "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
  "venueId": "venue_main_hall",
  "screenId": "gate_1"
}
```
- **Response (Success)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Access Granted: General Admission",
  "data": {
    "success": true,
    "message": "Access Granted: General Admission",
    "ticket": {
      "ticketId": "912a783b-3162-4217-b769-cf3607068e1a",
      "showTicketId": "TCK-00001",
      "purchaserName": "Alex Morgan",
      "purchaserRole": "FAN",
      "type": "DAY_PASS",
      "seatNumber": "Row A - Seat 1-1",
      "checkedInAt": "2026-10-22T08:00:00.000Z",
      "tournamentName": "Lagos Cyber Clash 2026"
    }
  }
}
```

---

### 5. Get My Purchased Tickets (Pass Wallet & Registered Passes)
- **Method**: `GET`
- **URL**: `/api/v1/tickets/my-tickets`
- **Auth**: Bearer JWT (Fan or Player)
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "User tickets retrieved successfully",
  "data": {
    "totalPasses": 1,
    "activeCodes": 1,
    "usedCodes": 0,
    "tickets": [
      {
        "id": "912a783b-3162-4217-b769-cf3607068e1a",
        "showTicketId": "TCK-00001",
        "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
        "tournamentName": "Lagos Cyber Clash 2026",
        "purchaserRole": "FAN",
        "type": "DAY_PASS",
        "pricePaid": 1500,
        "currency": "NGN",
        "seatNumber": "Row A - Seat 1-1",
        "status": "ACTIVE",
        "checkedIn": false,
        "qrToken": "FAN:8f3e2b41-3b7c-4a34-8c01-7c980d287ea6:fan_123:912a783b-3162-4217-b769-cf3607068e1a",
        "passUrl": "https://tapegaming.com/fan/tickets/912a783b-3162-4217-b769-cf3607068e1a",
        "oneTimeUseOnly": true,
        "isUsable": true,
        "purchaseDate": "2026-10-22T07:45:00.000Z"
      }
    ]
  }
}
```

---

### 6. Transfer Ticket Pass (Transfer Pass Modal Parity)
- **Method**: `POST`
- **URL**: `/api/v1/tickets/transfer`
- **Auth**: Bearer JWT (Authenticated Ticket Owner)
- **Rule**: *"License transfers are irrecoverable and immediately lock ticket access once completed."*
- **Request Body**:
```json
{
  "ticketId": "912a783b-3162-4217-b769-cf3607068e1a",
  "recipientPhone": "+1 (555) 345-2311",
  "recipientEmail": "friend@example.com"
}
```
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Ticket successfully transferred to recipient (+1 (555) 345-2311). Your ticket access has been locked.",
  "data": {
    "message": "Ticket successfully transferred to recipient (+1 (555) 345-2311). Your ticket access has been locked.",
    "originalTicketId": "912a783b-3162-4217-b769-cf3607068e1a",
    "originalTicketStatus": "TRANSFERRED",
    "recipientTicketId": "cm11223344aabbcc",
    "recipientShowTicketId": "TCK-K9X2-A1B2",
    "recipientName": "+1 (555) 345-2311",
    "recipientPhone": "+1 (555) 345-2311",
    "tournamentName": "Winter Championship 2024",
    "seatNumber": "Seat 1"
  }
}
```

---

### 7. Tournament Seat Capacity & Calculations Summary
- **Method**: `GET`
- **URL**: `/api/v1/tickets/tournament/:tournamentId/summary`
- **Auth**: Public
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Tournament ticket and seat calculations retrieved successfully",
  "data": {
    "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
    "tournamentName": "Lagos Cyber Clash 2026",
    "currency": "NGN",
    "status": "UPCOMING",
    "totalCapacity": 500,
    "soldTickets": 120,
    "availableSeats": 380,
    "occupancyRate": 24.0,
    "totalRevenue": 180000,
    "totalCheckIns": 85,
    "checkInRate": 70.83,
    "tiers": [
      {
        "tierId": "tier-day-pass",
        "name": "Day Pass",
        "type": "DAY_PASS",
        "price": 1500,
        "currency": "NGN",
        "capacity": 300,
        "sold": 100,
        "availableSeats": 200,
        "status": "ACTIVE"
      },
      {
        "tierId": "tier-vip",
        "name": "VIP Pass",
        "type": "VIP",
        "price": 5000,
        "currency": "NGN",
        "capacity": 50,
        "sold": 20,
        "availableSeats": 30,
        "status": "ACTIVE"
      }
    ]
  }
}
```

---

### 7. Ticket Sales Analytics (Admin)
- **Method**: `GET`
- **URL**: `/api/v1/tickets/analytics`
- **Auth**: Bearer JWT (Admin or Super Admin)
- **Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Ticket analytics retrieved successfully",
  "data": {
    "totalRevenue": 180000,
    "totalTicketsSold": 120,
    "totalCheckIns": 85,
    "checkInRate": 70.8,
    "salesByTournament": [
      {
        "name": "Lagos Cyber Clash 2026",
        "revenue": 180000,
        "tickets": 120
      }
    ],
    "recentPurchases": [
      {
        "id": "912a783b-3162-4217-b769-cf3607068e1a",
        "showTicketId": "TCK-00001",
        "fanName": "Alex Morgan",
        "type": "DAY_PASS",
        "pricePaid": 1500,
        "currency": "NGN",
        "tournamentName": "Lagos Cyber Clash 2026",
        "createdAt": "2026-10-22T07:45:00.000Z"
      }
    ]
  }
}
```

---

### 8. Ticket Tiers Management (CRUD)
- `GET /api/v1/tickets/tournament/:tournamentId/tiers` - Public list of tiers.
- `POST /api/v1/tickets/tiers` - Admin creates tier:
  ```json
  {
    "tournamentId": "8f3e2b41-3b7c-4a34-8c01-7c980d287ea6",
    "name": "VIP Pass",
    "type": "VIP",
    "price": 5000,
    "currency": "NGN",
    "capacity": 50,
    "description": "Front-row seats + VIP lounge access"
  }
  ```
- `PUT /api/v1/tickets/tiers/:tierId` - Admin updates tier pricing/capacity.
- `DELETE /api/v1/tickets/tiers/:tierId` - Admin deletes tier (only allowed if 0 tickets sold).
