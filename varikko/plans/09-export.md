# Phase 09: Export Routes Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 05 (Build Routes)
**Estimated Effort:** 0.5 days
**Priority:** LOW (simple export utility)

---

## Overview

Export calculated routes to JSON file in nested format for external use.

**What it does:**
1. Query routes with status='OK' for specified period
2. Build nested object: `{ from_id: { to_id: duration, ... }, ... }`
3. Write to `routes_export.json`

**Current Implementation:** `src/export_routes.ts:1-41`

---

## Target Architecture

**File:** `src/lib/export.ts`

```typescript
export interface ExportOptions {
  period?: string;
  outputPath?: string;
}

export function exportRoutes(
  db: Database.Database,
  options: ExportOptions
): { routeCount: number; outputPath: string };
```

---

## Testing Strategy

- ✅ Correct nested format
- ✅ Period filtering
- ✅ Only OK routes exported
- ✅ File written successfully

---

## Bug to Fix

Current implementation has incorrect DB_PATH (`../varikko.db` instead of `../opas/public/varikko.db`). Fix in refactor.

---

## References

- **Current Implementation:** `src/export_routes.ts:1-41`
