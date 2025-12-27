# Phase 07: Calculate Deciles Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 05 (Build Routes)
**Estimated Effort:** 1 day
**Priority:** MEDIUM (depends on routes)

---

## Overview

Calculate 10-quantile distribution of route durations for heatmap coloring. Divides successful routes into 10 equal buckets and assigns vintage color palette.

**What it does:**
1. Query all routes with status='OK' and duration NOT NULL
2. Sort by duration ascending
3. Divide into 10 equal quantiles
4. Calculate min/max duration for each decile
5. Assign color from vintage palette
6. Generate human-readable labels (e.g., "8-15 min")
7. Insert into deciles table
8. Store calculation timestamp

**Current Implementation:** `src/calculate_deciles.ts:1-149`

---

## Target Architecture

**File:** `src/lib/deciles.ts`

```typescript
export interface CalculateDecilesOptions {
  force?: boolean;       // Recalculate even if exists
  emitter?: ProgressEmitter;
}

export function calculateDeciles(
  db: Database.Database,
  options: CalculateDecilesOptions
): { deciles: Array<{ number: number; min: number; max: number; color: string; label: string }> };
```

---

## Color Palette

Vintage colors (10 colors from warm to cool):
1. `#f4a582` - Orange
2. `#fddbc7` - Light orange
3. `#d1e5f0` - Light blue
... (full palette in code)

---

## Testing Strategy

- ✅ Correct quantile calculation
- ✅ Edge case: < 10 routes
- ✅ Edge case: exact multiples of 10
- ✅ Color assignment
- ✅ Label generation
- ✅ Decile ranges continuous (no gaps)
- ✅ Last decile open-ended (max = -1)

---

## References

- **Current Implementation:** `src/calculate_deciles.ts:1-149`
