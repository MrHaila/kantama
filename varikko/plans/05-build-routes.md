# Phase 05: Build Routes Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 03 (Fetch Zones), Phase 04 (Geocode Zones - optional)
**Estimated Effort:** 3-4 days
**Priority:** HIGH (core workflow, most complex)

---

## Overview

Calculate transit routes for all zone pairs using OpenTripPlanner (OTP). This is the most computationally intensive workflow, potentially processing 232k+ route combinations (279 zones × 278 destinations × 3 time periods).

**What it does:**
1. Load zones from database (use COALESCE(routing_lat, lat) for coordinates)
2. Query routes with status='PENDING' for specified period(s)
3. For each pending route, call OTP GraphQL API
4. Parse OTP response and extract: duration, transfers, walk distance, detailed legs
5. Update routes table with results (status: OK, NO_ROUTE, or ERROR)
6. Update progress metadata every N routes
7. Auto-trigger decile calculation on completion
8. Support local OTP (fast, 10 concurrent) or remote Digitransit API (slow, rate-limited)

**Current Implementation:** `src/build_routes.ts:1-380`

---

## Key Components

### Constants & Configuration
- **OTP Endpoints:** Local (http://localhost:9080) vs Remote (api.digitransit.fi)
- **Time Periods:** MORNING (08:30), EVENING (17:30), MIDNIGHT (23:30)
- **Target Date:** Next Tuesday (for consistent transit schedules)
- **Concurrency:** Local OTP = 10, Remote = 1
- **Rate Limiting:** Local = none, Remote = 200ms delay

### Main Functions
- `buildOtpPlan()` - GraphQL query construction
- `fetchRoute()` - Single route calculation
- `processRoutes()` - Batch processing with concurrency control
- `calculateDeciles()` - Auto-triggered after completion

---

## Target Architecture

**File:** `src/lib/routing.ts`

```typescript
export interface BuildRoutesOptions {
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  testMode?: boolean;
  testLimit?: number;
  emitter?: ProgressEmitter;
}

export async function buildRoutes(
  db: Database.Database,
  options: BuildRoutesOptions
): Promise<{ processed: number; ok: number; noRoute: number; errors: number }>;

export async function fetchRoute(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
  period: string,
  otpConfig: OTPConfig
): Promise<RouteResult>;
```

---

## Testing Strategy

### Unit Tests
- ✅ OTP GraphQL query generation
- ✅ Route parsing (mock OTP responses)
- ✅ Error handling (timeout, network, invalid response)
- ✅ Concurrency control (p-limit)
- ✅ Rate limiting

### Integration Tests
- ✅ Full workflow with mock OTP
- ✅ Progress tracking
- ✅ Auto-trigger deciles
- ✅ Resume from PENDING (idempotency)

### Fixtures Needed
- Mock OTP successful response (with legs)
- Mock OTP no-route response
- Mock OTP error response

---

## Acceptance Criteria

- ✅ All tests pass
- ✅ `varikko routes --period=MORNING` works
- ✅ `varikko routes --test` processes limited routes
- ✅ TUI shows real-time progress (routes/sec, ETA)
- ✅ Local and remote OTP both work
- ✅ Respects concurrency limits
- ✅ Auto-triggers decile calculation
- ✅ Results identical to current implementation

---

## Manual Testing Checklist

- [ ] Test with local OTP (fast)
- [ ] Test with remote OTP (slow, verify rate limiting)
- [ ] Test all 3 periods
- [ ] Verify NO_ROUTE cases handled
- [ ] Verify ERROR cases stored in legs column
- [ ] Test resume after interruption (picks up PENDING)
- [ ] Compare route durations with old implementation

---

## Implementation Notes

**Complexity:** This is the longest-running operation (hours for full dataset). Progress tracking and resume capability are critical.

**OTP Configuration:** Use environment variables to switch between local/remote. Local OTP requires Docker container running.

**Decile Auto-trigger:** After successful completion, automatically call `calculateDeciles()` if any OK routes exist.

---

## References

- **Current Implementation:** `src/build_routes.ts:1-380`
- **OTP GraphQL API:** https://docs.opentripplanner.org/en/latest/apis/GraphQL/
- **Digitransit Routing:** https://digitransit.fi/en/developers/apis/1-routing-api/
