# Phase 09: Export Routes - DEPRECATED

**Status:** Deprecated - Remove functionality
**Dependencies:** None
**Estimated Effort:** 0.1 days
**Priority:** LOW (cleanup task)

---

## Overview

Remove export routes functionality - no longer needed.

**Tasks:**

1. Delete `src/export_routes.ts`
2. Delete `src/tests/lib/export.test.ts`
3. Remove `export:routes` script from `package.json:22`
4. Remove `export` CLI command from `src/cli.ts:390-395`
5. Remove `export_routes` event type from `src/lib/events.ts:9`
6. Update references in plan files:
   - `plans/02-foundation.md:125` (event type)
   - `plans/README.md:162, 212` (file list, CLI command)
   - `plans/00-overview.md:30, 236` (overview)
7. Update `AGENTS.md:30, 45, 58` (documentation)

**Files to Remove:**
- `src/export_routes.ts:1-41`
- `src/tests/lib/export.test.ts`

---

## Rationale

Export functionality is deprecated and should be removed from codebase.
