const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log('--- Starting Seed for Fan Followed Matches ---');

  // 1. Get the authenticated Fan (fansakib@gmail.com)
  const fanRes = await pool.query(
    'SELECT "fanId", email, "firstName" FROM "Fan" WHERE email = $1',
    ['fansakib@gmail.com']
  );

  if (fanRes.rows.length === 0) {
    throw new Error('Fan fansakib@gmail.com not found!');
  }
  const fan = fanRes.rows[0];
  console.log('Target Fan:', fan);

  // 2. Ensure pro players exist
  // Check if p-1 and p-2 exist
  const existingPlayers = await pool.query(
    'SELECT "playerId", "gamerTag", "firstName", "lastName" FROM "Player"'
  );
  console.log('Existing players:', existingPlayers.rows);

  let p1Id = 'p-1';
  let p2Id = 'p-2';

  // Also ensure FIFA_GOD and CR7_KING exist or update gamertags
  if (existingPlayers.rows.length >= 2) {
    p1Id = existingPlayers.rows[0].playerId;
    p2Id = existingPlayers.rows[1].playerId;
  }

  // 3. Clear existing follows for this fan and insert follows for p1 and p2
  await pool.query('DELETE FROM "Follower" WHERE "fanId" = $1', [fan.fanId]);

  const follow1Id = uuidv4();
  const follow2Id = uuidv4();

  const p1GamerTag = existingPlayers.rows[0]?.gamerTag || 'STRIKER_99';
  const p2GamerTag = existingPlayers.rows[1]?.gamerTag || 'PHANTOM_7';

  await pool.query(
    `INSERT INTO "Follower" ("followerId", "fanId", "gamerTag", "targetPlayerId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [follow1Id, fan.fanId, p1GamerTag, p1Id]
  );

  await pool.query(
    `INSERT INTO "Follower" ("followerId", "fanId", "gamerTag", "targetPlayerId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [follow2Id, fan.fanId, p2GamerTag, p2Id]
  );

  console.log(`Created Follows: fan ${fan.email} follows ${p1GamerTag} (${p1Id}) and ${p2GamerTag} (${p2Id})`);

  // 4. Update Tournament schedule for EA SPORTS FC 26 Championship Cup
  const tournRes = await pool.query(
    `SELECT "tournamentId", name, status FROM "Tournament" 
     WHERE status IN ('IN_PROGRESS', 'ONGOING', 'REGISTRATION_OPEN', 'UPCOMING') 
     ORDER BY "createdAt" ASC LIMIT 2`
  );

  if (tournRes.rows.length === 0) {
    throw new Error('No active/upcoming tournaments found!');
  }

  const t1 = tournRes.rows[0];
  console.log('Selected Tournament 1:', t1);

  // Get venues and screens for t1
  const venueRes = await pool.query(
    'SELECT "venueId", name FROM "Venue" WHERE "tournamentId" = $1',
    [t1.tournamentId]
  );
  let v1Id = venueRes.rows[0]?.venueId;
  let v1Name = venueRes.rows[0]?.name || 'Tape Arena Central Lagos';

  let s1Name = 'Main Stage Screen A';
  if (v1Id) {
    const screenRes = await pool.query(
      'SELECT "screenId", "screenName" FROM "Screen" WHERE "venueId" = $1',
      [v1Id]
    );
    if (screenRes.rows.length > 0) {
      s1Name = screenRes.rows[0].screenName;
    }
  }

  // Create match schedule
  const match1 = {
    id: `match-${t1.tournamentId}-01`,
    player1Id: p1Id,
    player1Name: p1GamerTag,
    player2Id: p2Id,
    player2Name: p2GamerTag,
    time: 'Today @ 16:30 WAT',
    date: new Date().toISOString().split('T')[0],
    venueName: v1Name,
    screenName: s1Name,
    status: 'SCHEDULED'
  };

  const schedulePayload1 = {
    structure: {
      matches: [match1]
    },
    matches: [match1],
    calendar: [
      {
        venueId: v1Id,
        venueName: v1Name,
        screens: [
          {
            screenId: 'screen-01',
            screenName: s1Name,
            days: [
              {
                date: 'Today',
                timeslots: [
                  {
                    time: '16:30',
                    game: match1
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  await pool.query(
    'UPDATE "Tournament" SET schedule = $1 WHERE "tournamentId" = $2',
    [JSON.stringify(schedulePayload1), t1.tournamentId]
  );
  console.log(`Updated schedule for Tournament: ${t1.name}`);

  // If there's a second tournament, schedule match 2
  if (tournRes.rows.length > 1) {
    const t2 = tournRes.rows[1];
    const venue2Res = await pool.query(
      'SELECT "venueId", name FROM "Venue" WHERE "tournamentId" = $1',
      [t2.tournamentId]
    );
    const v2Name = venue2Res.rows[0]?.name || 'Tape Arena Victoria Island';
    const s2Name = 'Dome Stage Screen B';

    const match2 = {
      id: `match-${t2.tournamentId}-02`,
      player1Id: p2Id,
      player1Name: p2GamerTag,
      player2Id: p1Id,
      player2Name: p1GamerTag,
      time: 'Tomorrow @ 18:00 WAT',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      venueName: v2Name,
      screenName: s2Name,
      status: 'SCHEDULED'
    };

    const schedulePayload2 = {
      structure: {
        matches: [match2]
      },
      matches: [match2]
    };

    await pool.query(
      'UPDATE "Tournament" SET schedule = $1 WHERE "tournamentId" = $2',
      [JSON.stringify(schedulePayload2), t2.tournamentId]
    );
    console.log(`Updated schedule for Tournament 2: ${t2.name}`);
  }

  console.log('--- Seed Completed Successfully! ---');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed Error:', err);
  pool.end();
  process.exit(1);
});
