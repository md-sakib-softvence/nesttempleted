# Follow System Specification & Implementation Plan

> **Note for Review:** This document verifies the exact implementation plan based on your requirements. **Prisma schemas are 100% UNCHANGED and preserved.**

---

## 1. Core Logic Overview (কিভাবে কাজ করবে)

When someone follows another user, the client **only sends 1 single ID**: the ID of the person they want to follow.

```
                  ┌────────────────────────────────────────┐
                  │          Client Request (POST)         │
                  │   Body: { "targetId": "uuid-here" }    │
                  │   Header: Bearer <JWT_TOKEN>           │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          NestJS / Fan Controller       │
                  └───────────────────┬────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   [ 1. Who is Following? ]                       [ 2. Who is Being Followed? ]
   Extracted from JWT Token                       Looked up from DB using targetId
   ────────────────────────                       ─────────────────────────────────
   • req.user.userId                              • Server searches Player & Fan tables
   • If role == 'FAN'    -> fanId                 • If found in Player -> targetPlayerId
   • If role == 'PLAYER' -> playerId              • If found in Fan    -> targetFanId
                                                  • Automatically reads: gamerTag
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │      Database: Save to "Follower"      │
                  ├────────────────────────────────────────┤
                  │ followerId     : uuid()                │
                  │ fanId / playerId : (from JWT)          │
                  │ targetPlayerId / targetFanId : (from DB)
                  │ gamerTag       : (from DB target user) │
                  └────────────────────────────────────────┘
```

---

## 2. Prisma Schema (অপরিবর্তিত থাকবে - No Changes)

The `Follower` model in `follower.prisma` remains exactly as defined:

```prisma
model Follower {
  followerId     String    @id @default(uuid())

  // Who follows (from JWT)
  fanId          String?
  fan            Fan?      @relation("FanFollowing", fields: [fanId], references: [fanId], onDelete: Cascade)
  playerId       String?
  player         Player?   @relation("PlayerFollowing", fields: [playerId], references: [playerId], onDelete: Cascade)

  // Tracked gamerTag (retrieved from database using targetId)
  gamerTag       String

  // Who is followed (resolved from targetId)
  targetPlayerId String?
  targetPlayer   Player?   @relation("PlayerFollowed", fields: [targetPlayerId], references: [playerId], onDelete: Cascade)
  targetFanId    String?
  targetFan      Fan?      @relation("FanFollowed", fields: [targetFanId], references: [fanId], onDelete: Cascade)

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([gamerTag])
  @@index([fanId])
  @@index([playerId])
  @@index([targetPlayerId])
  @@index([targetFanId])
}
```

---

## 3. Client API Contract (ক্লায়েন্ট থেকে কি পাঠানো হবে)

### A. Follow Endpoint: `POST /fan/follow`

* **Headers:**
  ```http
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  ```
* **Request Body (Only 1 ID needed):**
  ```json
  {
    "targetId": "c6b840e4-18f4-4e92-9694-802c3ef32fbc"
  }
  ```
  *(Note: also accepts `"playerId": "..."` as an alias for convenience)*

* **Backend Execution Steps:**
  1. Extract `followerId` and `role` from JWT (`req.user.userId`).
     - Fan follows: `fanId = req.user.userId`
     - Player follows: `playerId = req.user.userId`
  2. Query `prisma.player.findUnique({ where: { playerId: targetId } })`:
     - If found:
       - `targetPlayerId = player.playerId`
       - `gamerTag = player.gamerTag`
     - If not a player, query `prisma.fan.findUnique({ where: { fanId: targetId } })`:
       - `targetFanId = fan.fanId`
       - `gamerTag = fan.gamerTag`
  3. Check if already following (prevent duplicate rows).
  4. Save into `Follower` table:
     - `fanId` or `playerId` (from JWT)
     - `targetPlayerId` or `targetFanId` (from DB query)
     - `gamerTag` (from DB query)
  5. Return clean response:
     ```json
     {
       "statusCode": 200,
       "message": "Follow status updated successfully",
       "data": {
         "isFollowing": true,
         "follower": {
           "followerId": "d82087e5-3bc4-419b-a316-2c5e56d81234",
           "fanId": "123e4567-e89b-12d3-a456-426614174000",
           "playerId": null,
           "gamerTag": "CR7_KING",
           "targetPlayerId": "c6b840e4-18f4-4e92-9694-802c3ef32fbc",
           "targetFanId": null,
           "createdAt": "2026-10-22T10:30:00.000Z",
           "updatedAt": "2026-10-22T10:30:00.000Z"
         }
       }
     }
     ```

---

### B. Unfollow Endpoint: `POST /fan/unfollow`

* **Headers:**
  ```http
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  ```
* **Request Body:**
  ```json
  {
    "targetId": "c6b840e4-18f4-4e92-9694-802c3ef32fbc"
  }
  ```
* **Backend Execution Steps:**
  1. Extract follower ID from JWT (`req.user.userId`).
  2. Delete follower row where `(fanId == userId OR playerId == userId)` AND `(targetPlayerId == targetId OR targetFanId == targetId)`.
  3. Return:
     ```json
     {
       "statusCode": 200,
       "message": "Unfollowed successfully",
       "data": {
         "isFollowing": false,
         "deletedCount": 1
       }
     }
     ```

---

### C. Search Gamertags Endpoint: `GET /fan/search-gamertags?query=k`

* **Headers:** `Authorization: Bearer <JWT_TOKEN>`
* Searches `Player` and `Fan` tables by `gamerTag` (case-insensitive).
* Compares results against the logged-in user's active follows to mark `isFollowed`.
* **Response:**
  ```json
  {
    "statusCode": 200,
    "message": "Gamertags retrieved successfully",
    "data": [
      {
        "id": "c6b840e4-18f4-4e92-9694-802c3ef32fbc",
        "type": "PLAYER",
        "gamerTag": "CR7_KING",
        "gamertag": "CR7_KING",
        "name": "Cristiano Ronaldo",
        "showId": "PL-00042",
        "isFollowed": false
      },
      {
        "id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
        "type": "FAN",
        "gamerTag": "KING_FAN",
        "gamertag": "KING_FAN",
        "name": "Alex King",
        "profileImage": "https://...",
        "showId": "FAN-00109",
        "isFollowed": true
      }
    ]
  }
  ```
* The UI displays `gamertag`, and clicking **FOLLOW** immediately sends `targetId: id`.

---

## 4. Complete API Reference

| Method | Endpoint | Auth | Body / Query | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/fan/search-gamertags` | JWT | `?query=k` | Search players & fans by gamerTag with follow status |
| `POST` | `/fan/follow` | JWT | `{ "targetId": "..." }` | Follow by target ID (auto-looks up gamerTag & JWT follower) |
| `POST` | `/fan/unfollow` | JWT | `{ "targetId": "..." }` | Unfollow by target ID |
| `GET` | `/fan/following` | JWT | `?page=1&limit=10&searchTerm=...&sortBy=createdAt&sortOrder=desc` | Get followed accounts with pagination & filtering |
| `GET` | `/fan/:id/following` | JWT | `?page=1&limit=10&searchTerm=...&sortBy=createdAt&sortOrder=desc` | Get followed accounts for a specific user ID |
| `GET` | `/fan/:id/followers` | JWT | `?page=1&limit=10&searchTerm=...&sortBy=createdAt&sortOrder=desc` | Get followers for a specific user ID or gamerTag |

---

## 5. Step-by-Step Code Architecture

### A. DTO Layer (`backend/src/modules/fan/dto/follow.dto.ts`)
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FollowDto {
  @ApiProperty({
    description: 'Player ID (or Fan ID) of the person you want to follow',
    example: 'c6b840e4-18f4-4e92-9694-802c3ef32fbc',
  })
  @IsString()
  targetId: string;

  @ApiPropertyOptional({ description: 'Optional alias for targetId' })
  @IsOptional()
  @IsString()
  playerId?: string;
}

export class UnfollowDto {
  @ApiProperty({
    description: 'Player ID (or Fan ID) to unfollow',
    example: 'c6b840e4-18f4-4e92-9694-802c3ef32fbc',
  })
  @IsString()
  targetId: string;

  @ApiPropertyOptional({ description: 'Optional alias for targetId' })
  @IsOptional()
  @IsString()
  playerId?: string;
}
```

### B. Service Layer (`backend/src/modules/fan/service/follower.service.ts`)
```typescript
// 1. Follower identity determined directly from JWT:
const roleStr = String(currentUser.role || '').toUpperCase();
const isPlayer = roleStr.includes('PLAYER');
const followerFanId = isPlayer ? null : currentUser.userId;
const followerPlayerId = isPlayer ? currentUser.userId : null;

// 2. Target lookup:
const player = await this.prisma.player.findUnique({
  where: { playerId: targetIdentifier },
  select: { playerId: true, gamerTag: true, firstName: true, lastName: true },
});

if (player) {
  targetPlayerId = player.playerId;
  gamerTag = player.gamerTag || `${player.firstName}_${player.lastName}`;
} else {
  const fan = await this.prisma.fan.findUnique({
    where: { fanId: targetIdentifier },
    select: { fanId: true, gamerTag: true, firstName: true, surname: true },
  });
  if (fan) {
    targetFanId = fan.fanId;
    gamerTag = fan.gamerTag || `${fan.firstName}_${fan.surname}`;
  }
}

// 3. Database persistence:
const created = await this.prisma.follower.create({
  data: {
    fanId: followerFanId,
    playerId: followerPlayerId,
    gamerTag,
    targetPlayerId,
    targetFanId,
  },
});
```

### C. Controller Layer (`backend/src/modules/fan/controller/fan.controller.ts`)
Routes are registered under `@Controller('fan')` with `JwtAuthGuard` and `RolesGuard`:
```typescript
@Post('follow')
@ApiOperation({ summary: 'Follow a player or fan by ID' })
async follow(
  @Body() dto: FollowDto,
  @Req() req: Request & { user?: { userId: string; role: string } },
) {
  const data = await this.followerService.follow(dto, req.user);
  return sendResponse({ message: 'Follow status updated successfully', data });
}
```

---

## 6. Frontend Integration Example (`FanDashboard.tsx`)

In `frontend/components/fan/FanDashboard.tsx`:

```tsx
// 1. Search Gamertags
const searchGamertags = async (query: string) => {
  const res = await apiClient.get(`/fan/search-gamertags?query=${encodeURIComponent(query)}`);
  setSearchResults(res.data.data);
};

// 2. Follow Player
const onFollowPlayer = async (targetId: string) => {
  await apiClient.post('/fan/follow', {
    targetId: targetId, // Only 1 ID sent!
  });
  // Update state: mark isFollowed = true
  setSearchResults(prev =>
    prev.map(p => (p.id === targetId ? { ...p, isFollowed: true } : p))
  );
};

// 3. Unfollow Player
const onUnfollowPlayer = async (targetId: string) => {
  await apiClient.post('/fan/unfollow', {
    targetId: targetId, // Only 1 ID sent!
  });
  // Update state: mark isFollowed = false
  setSearchResults(prev =>
    prev.map(p => (p.id === targetId ? { ...p, isFollowed: false } : p))
  );
};
```

---

## 7. Edge Cases Handled

1. **Self-Following Prevention:**
   If a user passes their own ID (`targetId === req.user.userId`), the server throws `BadRequestException('You cannot follow yourself')`.

2. **Duplicate Follow Prevention:**
   If the follower already follows the target, the server returns `{ isFollowing: true, alreadyFollowing: true }` without inserting a duplicate database row.

3. **Case-Insensitive Gamertag Searches:**
   Searching for `cr7`, `CR7`, or `k` finds matching gamertags using Postgres `mode: 'insensitive'`.

4. **Foreign Key Deletion Safety (`onDelete: Cascade`):**
   If a user account is deleted, all their following and follower rows are cleanly removed by the database without leaving orphaned records.

---

## 8. Testing with cURL

```bash
# 1. Search for gamertags containing "k"
curl -X GET "http://localhost:5000/api/v1/fan/search-gamertags?query=k" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# 2. Follow a player by ID
curl -X POST "http://localhost:5000/api/v1/fan/follow" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"targetId": "c6b840e4-18f4-4e92-9694-802c3ef32fbc"}'

# 3. View who you are following
curl -X GET "http://localhost:5000/api/v1/fan/following" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# 4. Unfollow a player by ID
curl -X POST "http://localhost:5000/api/v1/fan/unfollow" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"targetId": "c6b840e4-18f4-4e92-9694-802c3ef32fbc"}'
```
