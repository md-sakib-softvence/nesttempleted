# Tournament: ম্যাচ, সময়, venue ও screen নির্বাচনের হিসাব

এই নথি বর্তমান backend-এর আচরণ ব্যাখ্যা করে। উদাহরণের সময় ও venue সেটিংস বোঝানোর জন্য নেওয়া হয়েছে; এগুলো screenshot-এর সংরক্ষিত configuration বলে ধরে নেওয়া হয়নি। এখানে কোনো scheduling আচরণ পরিবর্তন করা হয়নি।

## ১. ম্যাচের সংখ্যা ও slot capacity আলাদা

ধরি:

| চলক | অর্থ | উদাহরণ |
|---|---|---:|
| T | মোট খেলোয়াড় | ৪০ |
| G | গ্রুপ সংখ্যা | ১০ |
| n | প্রতি গ্রুপে খেলোয়াড়, T ÷ G | ৪ |
| Q | প্রতি গ্রুপের কোয়ালিফায়ার | ২ |
| H | third-place চালু হলে ১, না হলে ০ | ১ |

Single-leg group round robin + single-elimination knockout-এর জন্য:

```text
Group matches = G × n(n − 1) ÷ 2
              = 10 × 4 × 3 ÷ 2 = 60

Qualifiers N = G × Q = 10 × 2 = 20
Knockout matches = N − 1 = 19
Total matches M = 60 + 19 + H = 80
```

অসমান গ্রুপ হলে `G × n(n−1)/2` ব্যবহার না করে প্রতিটি গ্রুপের `nᵢ(nᵢ−1)/2` যোগ করতে হবে।

| পর্ব | সমীকরণ | ম্যাচ | প্রয়োজনীয় খেলার ক্রম |
|---|---|---:|---|
| Group Stage | `10 × [4 × (4−1) ÷ 2]` | ৬০ | আগে; আলাদা screen-এ সমান্তরালে চলতে পারে |
| Preliminary | `20 − 16` | ৪ | গ্রুপের qualification ও seed নির্ধারণের পরে |
| Round of 16 | `(12 সরাসরি + 4 preliminary বিজয়ী) ÷ 2` | ৮ | সংশ্লিষ্ট preliminary শেষ হওয়ার পরে; সরাসরি ওঠা দুজনের ম্যাচ qualification নির্ধারণের পরে শুরু হতে পারে |
| Quarter-final | `8 ÷ 2` | ৪ | সংশ্লিষ্ট Round of 16 শেষ হওয়ার পরে |
| Semi-final | `4 ÷ 2` | ২ | সংশ্লিষ্ট quarter-final শেষ হওয়ার পরে |
| Final ও third-place | `2 ÷ 2 + 2 ÷ 2` | ২ | দুই semi-final শেষ হওয়ার পরে |
| **মোট** | `60 + 4 + 8 + 4 + 2 + 2` | **৮০** | এই dependency অনুযায়ী সময় দেওয়া প্রয়োজন |

**বর্তমান allocator উপরের প্রয়োজনীয় সময়ের ক্রম বাধ্যতামূলক করে না।** ম্যাচের সংখ্যা ঠিক থাকা মানেই সঠিক chronological schedule তৈরি হওয়া নয়।

## ২. সময়ের ইনপুট ও সমীকরণ

| ইনপুট | প্রতীক | অর্থ |
|---|---|---|
| `dailyStart` | A | দিনের শুরু, মিনিটে |
| `dailyEnd` | B | দিনের মধ্যে ম্যাচ শেষ হওয়ার সীমা, মিনিটে |
| `matchDuration` | m | খেলার দৈর্ঘ্য, মিনিটে |
| `turnoverDuration` | r | পরের ম্যাচের আগে পরিবর্তনের সময় |
| `lunchBreakTime` | L | lunch শুরুর সময়, মিনিটে |
| `lunchDuration` | b | lunch-এর দৈর্ঘ্য |

```text
HH:MM → মিনিট = HH × 60 + MM

প্রতি start-এর সাধারণ ব্যবধান Δ = m + r
ম্যাচ শুরু t হলে খেলা শেষ = t + m
পরের সম্ভাব্য start = t + Δ

শর্ত: t + m ≤ B
```

উদাহরণ: `m = 20`, `r = 5`, শুরু `09:00`:

| Start | End | Turnover | পরের সম্ভাব্য start |
|---|---|---|---|
| 09:00 | 09:20 | 09:20–09:25 | 09:25 |
| 09:25 | 09:45 | 09:45–09:50 | 09:50 |
| 09:50 | 10:10 | 10:10–10:15 | 10:15 |

দিনের শেষ ম্যাচের পরে turnover শেষ হতেই হবে—এমন শর্ত নেই। দিনের সীমার মধ্যে **খেলা** শেষ হতে হবে। Overnight window সমর্থিত নয়: end সময় start-এর পরে হতে হবে।

## ৩. Lunch break বাদ দেওয়ার সঠিক নিয়ম

ম্যাচের interval `[t, t+m)` এবং lunch interval `[L, L+b)`। স্বাভাবিক positive duration-এর ক্ষেত্রে overlap-এর সমীকরণ:

```text
Lunch overlap = (t < L + b) AND (t + m > L)
```

Overlap হলে ওই start বাদ দিয়ে engine সরাসরি lunch শেষের সময় নেয়:

```text
t = L + b
```

বর্তমান generator-এর ধাপ:

```text
t = A
while t + m ≤ B:
    if match interval overlaps lunch:
        t = lunch end
        continue
    slot list-এ t যোগ করো
    t = t + m + r
```

ধরি lunch `13:00–14:00`, ম্যাচ ২০ মিনিট:

| সম্ভাব্য interval | Slot হবে? | কারণ |
|---|---|---|
| 12:40–13:00 | হ্যাঁ | lunch শুরুর সময়ই শেষ |
| 12:50–13:10 | না | lunch overlap |
| 13:10–13:30 | না | lunch-এর মধ্যে |
| 14:00–14:20 | হ্যাঁ | lunch শেষ |

এই টেবিল overlap-এর উদাহরণ; প্রতিটি start যে নির্দিষ্ট tournament-এর generated grid-এ থাকবে, তা নয়। Turnover lunch-এর মধ্যে পড়া আলাদাভাবে নিষিদ্ধ নয়। দেরিতে শুরু, extra time বা বাস্তবে খেলা দীর্ঘ হওয়ায় lunch-এ গড়িয়ে যাওয়া generator স্বয়ংক্রিয়ভাবে reschedule করে না।

## ৪. প্রতি screen-এর দৈনিক slot: পূর্ণ উদাহরণ

ধরি:

```text
Daily start = 09:00
Daily end = 17:00
Match = 20 মিনিট
Turnover = 5 মিনিট
Lunch = 13:00–14:00
Δ = 25 মিনিট
```

সকাল:

```text
09:00, 09:25, 09:50, 10:15, 10:40,
11:05, 11:30, 11:55, 12:20
```

মোট **৯টি**। পরের সম্ভাব্য start `12:45`, কিন্তু খেলা শেষ হবে `13:05`; lunch overlap হওয়ায় বাদ যায়। এরপর start হয় `14:00` থেকে।

বিকেল:

```text
14:00, 14:25, 14:50, 15:15, 15:40, 16:05, 16:30
```

মোট **৭টি**। পরের start `16:55`, end `17:15`—দিনের সীমা ছাড়াবে, তাই বাদ।

```text
প্রতি screen-এর দৈনিক slot K = 9 + 7 = 16
```

একটি বাধাহীন window-এর দৈর্ঘ্য W এবং প্রথম slot window-এর শুরুতে হলে:

```text
F(W) = 0                                  যদি W < m
F(W) = floor((W − m) / (m + r)) + 1         অন্যথায়
```

এই উদাহরণে:

```text
সকাল: W = 240 → floor((240−20)/25)+1 = 9
বিকেল: W = 180 → floor((180−20)/25)+1 = 7
```

Backend-এর নির্ভরযোগ্য হিসাব হলো `calculateDayTimeslots(...).length`। শুধু `floor(operatingMinutes / Δ)` ব্যবহার করলে lunch-এর আগে-পরে অব্যবহৃত অংশ ও শেষ ম্যাচের turnover-এর কারণে ভুল হতে পারে।

Lunch-এর বাদ দেওয়া operating minutes-এর হিসাব:

```text
Lunch intersection = max(0, min(B, L+b) − max(A, L))
Operating minutes = max(0, B − A − Lunch intersection)
উদাহরণ: 480 − 60 = 420 মিনিট
```

Operating minutes capacity report-এর একটি মান; এটি সরাসরি exact slot count নয়।

## ৫. সব venue ও screen মিলিয়ে capacity

বর্তমান grid সব screen-এ একই daily time window ও lunch settings ব্যবহার করে।

```text
Total screens S = Σ venue-এর screen সংখ্যা
Daily slot capacity C = K × S
```

ধরি:

| Venue | Screen সংখ্যা | প্রতি screen-এর slot | দৈনিক capacity |
|---|---:|---:|---:|
| Main Arena | ৩ | ১৬ | ৪৮ |
| Venue 2 | ৩ | ১৬ | ৪৮ |
| **মোট** | **৬** | | **৯৬** |

একই সময়ে Main Arena / Screen 1 এবং Venue 2 / Screen 1-এ আলাদা ম্যাচ চলতে পারে। তবে একই খেলোয়াড়ের overlap হলে allocation প্রত্যাখ্যান হতে পারে।

Screenshot-এ `192` দেখালেই এই উদাহরণের সেটিংস ধরে নেওয়া যাবে না। যেমন **09:00–23:30**, একই ২০+৫ মিনিট, lunch 13:00–14:00 এবং মোট ৬ screen হলে:

```text
সকাল = 9 slot
বিকেল = floor((570−20)/25)+1 = 23 slot
K = 9+23 = 32
C = 32 × 6 = 192
```

এটি ১৯২ হওয়ার একটি সম্ভাব্য configuration; প্রকৃত configuration জানতে API response দেখতে হবে।

## ৬. কয় দিন তৈরি হয় এবং কোন তারিখে?

```text
Baseline days D₀ = ceil(guaranteed matches M / daily capacity C)

Reserve days Dᵣ = max(0, ceil((M + conditional matches) / C) − D₀)
Buffer days Dᵦ = max(0, floor(configured buffer))
Total generated playing days D = D₀ + Dᵣ + Dᵦ
```

৮০ ম্যাচ, ৯৬ দৈনিক capacity, conditional match ০, buffer ২ হলে:

```text
D₀ = ceil(80/96) = 1
Dᵣ = 0
Dᵦ = 2
D = 3
মোট physical slot = 3 × 96 = 288
```

সব ৮০টি ম্যাচ allocated হলে বাকি `288−80 = 208`টি Open Slot থাকতে পারে। এই ১ দিনের baseline শুধু physical capacity estimate; round dependency, পরিচিত খেলোয়াড়ের conflict বা প্রয়োজনীয় বিশ্রাম ধরে sporting feasibility-এর প্রমাণ নয়।

তারিখ তৈরিতে start date থেকে পরপর দিন পরীক্ষা করা হয়। কেবল নির্বাচিত playing weekday-গুলো নেওয়া হয়, যতক্ষণ Dটি দিন না হয়। Buffer হলো অতিরিক্ত playing date; দুই খেলার দিনের মাঝে বাধ্যতামূলক gap নয়।

উদাহরণ: start `2026-11-18`, playing weekdays বুধবার ও বৃহস্পতিবার, D=3 হলে:

```text
2026-11-18 → বুধবার → নেওয়া হবে
2026-11-19 → বৃহস্পতিবার → নেওয়া হবে
2026-11-20 থেকে 24 → বাদ
2026-11-25 → বুধবার → নেওয়া হবে
```

তারিখের arithmetic UTC date-only হিসেবে করা হয়, host timezone/DST-এর পরিবর্তন এড়াতে। `HH:MM` slot নিজে timezone-aware timestamp নয়; venue timezone অনুযায়ী frontend ও operations-এ একই অর্থে ব্যবহার করতে হবে।

## ৭. কোন venue, কোন screen: বর্তমান AUTO_RANDOM

একটি physical slot-এর পরিচয়:

```text
slot = (venueId, screenId, date, time)
```

Calendar-এর গঠন:

```text
venue → screens → days → timeslots
```

Engine সব খালি slot সংগ্রহ করে:

```text
E = {সব slot যেখানে game নেই এবং canonicalMatchId নেই}
```

তারপর:

```text
Candidates = unallocated, active, non-terminal matches
Candidates = random order(Candidates)

প্রতিটি match m-এর জন্য:
    E = বর্তমান খালি slot-গুলো
    E = random order(E)
    E থেকে প্রথম allocation-valid slot বেছে নাও
    ওই slot-এ match বসাও
    কোনো slot গ্রহণযোগ্য না হলে pending রাখো
```

কোডে random order করা হয় `sort(() => Math.random() - 0.5)` দিয়ে। এটি seed-ভিত্তিক reproducible বা সমান সম্ভাবনার shuffle-এর নিশ্চয়তা দেয় না। Venue বা screen নির্ধারণে কোনো নির্দিষ্ট ভাগের সমীকরণ নেই।

ধরি shuffled slot-এর প্রথম অংশ হলো:

| পরীক্ষার ক্রম | Venue | Screen | Date | Time |
|---:|---|---|---|---|
| ১ | Venue 2 | Screen 3 | 2026-11-19 | 14:25 |
| ২ | Main Arena | Screen 1 | 2026-11-18 | 09:00 |
| ৩ | Main Arena | Screen 2 | 2026-11-18 | 09:25 |

প্রথম slot valid হলে ম্যাচটি Venue 2 / Screen 3 / 19 November / 14:25-এ বসবে। Player conflict হলে পরেরটি পরীক্ষা করবে। এই তালিকা শুধু প্রক্রিয়া বোঝানোর উদাহরণ—আসল allocation নয়।

অতএব বর্তমান AUTO_RANDOM-এ নিচের কোনোটিই নিশ্চয়তা নয়:

- প্রথম দিনের earliest slot আগে পূরণ হবে।
- Screen 1 ভরে তারপর Screen 2 ব্যবহার হবে।
- সব venue বা screen সমান ম্যাচ পাবে।
- Group Stage শেষ করে knockout শুরু হবে।

## ৮. অন্য scheduling mode-এর পার্থক্য

| Mode | বর্তমান আচরণ |
|---|---|
| AUTO_RANDOM | Generate-এর সময় auto-allocation হতে পারে; match ও খালি slot-এর order random হয় |
| AUTO_HOME_VENUE | Generate-এর সময় grid রেখে দেয়; explicit allocation command-এ পরিচিত দুই player-এর home venue-কে priority দেয় |
| MANUAL | খালি grid তৈরি হয়; admin explicit slot বেছে বরাদ্দ করে |
| PLAYER_SELF | খালি grid ও booking policy তৈরি হয়; আলাদা self-scheduling flow-তে booking হয় |

Home venue priority-এর score:

```text
score(slot, match) = 1, যদি slot.venueId দুই player-এর কোনো homeVenueId-এর সমান হয়
                  = 0, অন্যথায়
```

Score ১-এর slot আগে পরীক্ষা হয়। দুই player একই home venue-এর হলে score ২ হয় না। অন্য venue একেবারে নিষিদ্ধ নয়; valid slot না পেলে অন্য venue-ও পরীক্ষা হতে পারে। দুই পরিচয় resolve না হলে `PARTICIPANTS_UNRESOLVED` pending হয়। এই mode-ও dependency অনুযায়ী chronology নিশ্চিত করে না।

## ৯. Allocation-এর validation ও player overlap

বর্তমান `allocateMatch` যাচাই করে:

- canonical match পাওয়া যায় কি না;
- match playable এবং status SCHEDULED বা PLAYERS_READY কি না;
- আগে allocated কি না;
- venue, screen, date এবং time generated grid-এ আছে কি না;
- slot অন্য ম্যাচে occupied কি না;
- জানা player ID অনুযায়ী অন্য ম্যাচের সঙ্গে overlap আছে কি না।

একই তারিখে shared player-এর দুই ম্যাচের start t₁ ও t₂ এবং validation duration d হলে:

```text
Overlap = (t₁ < t₂ + d) AND (t₂ < t₁ + d)
```

Duration নির্বাচন:

```text
d = schedule.capacity.matchDuration, যদি সেটি থাকে
    অন্যথায় schedule.capacity.matchTimeMinutes
```

বর্তমান `generateSchedule` capacity-তে `matchDuration` ও `turnoverDuration` দুটোই যোগ করে। তাই নতুন schedule-এ player overlap check সাধারণত খেলার দৈর্ঘ্য `m` ব্যবহার করে। পুরোনো schedule-এ আলাদা `matchDuration` না থাকলে fallback হিসেবে `m+r` ব্যবহার হতে পারে। একই screen-এর generated slot-এ turnover থাকে, কিন্তু অন্য screen-এ একই খেলোয়াড়ের জন্য অতিরিক্ত turnover/rest বাধ্যতামূলক—এমন নিশ্চয়তা এই check দেয় না।

TBD বা unresolved qualifier/winner-এর আসল player জানা না থাকলে ভবিষ্যতের player conflict পূর্ণভাবে যাচাই করা যায় না। অতিরিক্ত বিশ্রাম ও venue বদলানোর travel time-এর আলাদা বাধ্যতামূলক rule নেই।

## ১০. Group আগে, knockout পরে করার প্রয়োজনীয় সমীকরণ

এই অংশ **প্রস্তাবিত প্রয়োজনীয় নিয়ম**, বর্তমান AUTO_RANDOM-এর বাস্তবায়িত আচরণ নয়।

ম্যাচ m-এর প্রয়োজনীয় আগের ম্যাচগুলোর set Pred(m) হলে:

```text
Finish(p) = Start(p) + match duration(p)
EarliestStart(m) = max(Finish(p) + required gap(p,m)), p ∈ Pred(m)
```

তারপর এমন physical slot নিতে হবে যেখানে:

```text
slot start ≥ EarliestStart(m)
slot খালি
lunch overlap নেই
পরিচিত player-এর overlap নেই
প্রয়োজনীয় rest/travel gap আছে
```

Hybrid qualification-এর preliminary বা সরাসরি qualifier ম্যাচের জন্য সব প্রয়োজনীয় group fixture-এর completion ও seed-resolution dependency ধরতে হবে। Round of 16-এর preliminary-dependent ম্যাচ তার feeder-এর পরে; সরাসরি qualified দুজনের ম্যাচের জন্য অপ্রাসঙ্গিক preliminary শেষ হওয়ার অপেক্ষা বাধ্যতামূলক নয়। Final ও third-place-এর জন্য দুই semi-final-ই feeder।

ভবিষ্যতের tentative planning-এ feeder-এর scheduled finish ব্যবহার করা যেতে পারে; বাস্তবে score গ্রহণ ও progression-এর ক্ষেত্রে প্রয়োজনীয় ফল ও পরিচয় resolve হওয়াও যাচাই করতে হবে। শুধু stage label বা frontend sorting দিয়ে dependency পূরণ হয় না।

## ১১. Frontend-এ সঠিক ম্যাচ দেখানো ও সংখ্যা যাচাই

নির্বাচিত `venueId → screenId → date` অনুযায়ী সেই দিনের `timeslots` render করতে হবে। সব screen-এ পুরো canonical match list render করা যাবে না।

```text
Match ID = slot.canonicalMatchId
           অথবা slot.game.canonicalMatchId
           অথবা slot.game.id
```

```text
Occupied allocation count = ID-সহ slot-এর সংখ্যা
Unique allocated match count = ওই ID-গুলোর distinct সংখ্যা
Duplicate allocation count = occupied count − unique count
```

৮০-ম্যাচের এই উদাহরণে সব allocated থাকলে:

```text
Canonical matches = 80
Occupied allocations = 80
Unique allocated matches = 80
Duplicate allocations = 0
```

Open Slot ম্যাচ নয়। `TBD vs TBD` নাম দেখালেও canonical ID থাকলে সেটি fixture হিসেবে গণনা করতে হবে। API-এর paginated `matches` তালিকাকে পুরো calendar ধরে নেওয়া যাবে না; `calendar.raw` থেকে সঠিক selected slot নিতে হবে।

## ১২. কোডের সূত্র

- `src/modules/tournament/utils/tournament-calculation.util.ts`: `calculateCapacity`, `calculateDayTimeslots`, `generatePlayingDates`, `buildEmptyScheduleGrid`, `allocateMatch`।
- `src/modules/tournament/utils/competition-runtime.util.ts`: `allocatePending`।
- `src/modules/tournament/service/tournament-schedule.service.ts`: `generateSchedule` ও scheduling mode অনুযায়ী generation।
- `src/modules/tournament/service/tournament-tabs.service.ts`: schedule API-এর normalized matches ও `calendar.raw` response।

এই নথির ৮০-ম্যাচের sporting হিসাবের প্রেক্ষাপটের জন্য দেখুন: [৪০ জন ও ১০ গ্রুপের হিসাব](TOURNAMENT_40_PLAYERS_10_GROUPS_CALCULATION.md)।
