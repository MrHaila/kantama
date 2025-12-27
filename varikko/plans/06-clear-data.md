# Phase 06: Clear Data Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 02 (Foundation)
**Estimated Effort:** 1 day
**Priority:** MEDIUM (utility workflow)

---

## Overview

Reset or clear database data with interactive confirmation. Supports selective clearing (routes only, places, metadata) or full wipe.

**What it does:**
1. Interactive confirmation (unless --force)
2. Clear specified data based on flags
3. Run VACUUM to reclaim disk space
4. Display summary of deleted records

**Current Implementation:** `src/clear_routes.ts:1-100`

---

## Target Architecture

**File:** `src/lib/clearing.ts`

```typescript
export interface ClearOptions {
  force?: boolean;
  routes?: boolean;      // Reset routes to PENDING
  places?: boolean;      // Clear places AND routes
  metadata?: boolean;    // Clear metadata
  emitter?: ProgressEmitter;
}

export function clearData(
  db: Database.Database,
  options: ClearOptions
): { deleted: { routes?: number; places?: number; metadata?: number } };
```

---

## Testing Strategy

- ✅ Reset routes to PENDING (preserves count)
- ✅ Clear places (cascades to routes)
- ✅ Clear metadata
- ✅ Clear all (default)
- ✅ VACUUM runs after clearing

---

## TUI Considerations

Interactive confirmation dialog with checkboxes for what to clear. Show record counts before clearing.

---

## References

- **Current Implementation:** `src/clear_routes.ts:1-100`
