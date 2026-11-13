# Scheduling handoff v1.2.1 backend changes

The backend owns sporting generation and physical allocation separately. Existing graphs are preserved: reads, calendar generation, registration synchronization and settings updates do not rebuild opponents or migrate historical GROUP_POSITION references.

## Counts and qualification

For 40 entrants, 10 groups and Top Q = 2, a single hybrid has 60 group + 19 knockout matches (79 total). A double hybrid has 120 group + 37 knockout matches (157 total). Third place, when explicitly enabled and semifinals exist, adds one match.

New hybrid graphs use QUALIFIER_SEED references. Seeds resolve from the persisted HYBRID_QUALIFICATION_V1 snapshot after all required group matches finish. Winners precede runners-up; within each tier ranking compares points, goal difference, goals for, wins, fair-play penalties and explicitly saved draws. Unequal schedules use rates through cross multiplication. Confirmed slot identities and canonical scores supply the evidence; cached totals do not decide qualification.

A resolved qualification snapshot is immutable. Group-result corrections after resolution are rejected until a downstream correction policy is specified. Existing v1.2 graphs keep their original scaffolds and GROUP_POSITION references.

## Frontend compatibility

Existing calendar-array and matches/slots/seeds/groups response shapes remain. Responses now expose correct guaranteedMatches, conditionalMatches, maximumPossibleMatches, groupsCount, topQualifiers, qualificationResolution, structureSummary and scheduleCapacity. The numeric capacity/maxCapacity fields remain registration capacity. Match revisions are returned as version. Stored weekdays, zero turnover/lunch values, third-place and reset settings are preserved. Double-elimination responses also expose graph-derived finalPlacements.

Reloading tournament/match/capacity data picks up these server fixes. A frontend with its own fixture calculator must use the returned canonical inventory; backend changes cannot replace client-side calculations or add a missing draw interface automatically. No frontend repository is present here.

For an exact sporting tie, an authorized Admin/Super Admin can call:

POST /api/v1/tournaments/{id}/qualification-draw

```json
{
  "tieGroupId": "<current tieGroups[].id>",
  "participantIds": ["<every tied participant exactly once, in drawn order>"],
  "expectedVersion": 12
}
```

The route accepts one current tie group, records actor/time and rejects stale versions, duplicates, omissions and foreign identities. Further group/tier ties may still require another explicit draw. No random sporting tie-break is inferred.

Completed-score correction requires acknowledgement=true and the current match expectedVersion, and retains the existing {match, auditEventId, reason} response. Corrections that affect started downstream fixtures are rejected. Normal score writes require distinct resolved confirmed competitors. Two-leg ties advance only after both legs finish with a non-equal aggregate.

## Calendar and allocation

Playing weekdays govern all frequency labels. Buffer means extra playing dates, never gaps between dates. Capacity uses the same enumerator as physical slot generation: an entire match must avoid lunch; turnover separates starts but is not required after the last match before closing. These choices resolve the estimator/emitter discrepancy described in the handoff.

Capacity reads derive actual free slots and demand without writes. Reconciliation appends complete empty playing dates only when needed, preserves allocations/results and reports actual extension counts. Repeating a sufficient reconciliation adds nothing. Calendar/settings changes reject occupied screen/date/window conflicts. The core, details, settings and schedule-tab update paths share those guards.

Allocation checks canonical identity, existing allocations, physical occupancy and player interval overlap. Automatic allocation uses this shared boundary and returns pending reasons. Home allocation waits for identities and an explicit allocation action. Reset generation respects its flag and activated resets can be booked. Result, qualifier snapshot and any required capacity extension are prepared before one version-conditional JSON write; extension failure leaves the result unsaved. Allocation and registration schedule writes also use optimistic tournament versions.

## Validation boundaries

New structures support 2–128 competitive entrants. Registration capacity is independent of competitive entrants. Invalid Top Q, zero screens/capacity, invalid dates and missing playing weekdays reject instead of generating a misleading calendar. Creation and settings changes run in database transactions.

Production decisions still outstanding in the handoff include IANA timezone/DST policy, dependency-aware round timing, travel/minimum rest, cross-tournament clashes, aggregate penalty resolution and late corrections after frozen qualification. These are not silently introduced here. Live PostgreSQL race/rollback tests and browser integration remain separate from mocked service/unit tests. No production data migration or deployment is performed by these code changes.
