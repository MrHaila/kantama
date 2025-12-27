# Varikko TUI Refactor - Planning Documents

Complete planning documentation for refactoring Varikko from CLI scripts into a unified TUI application.

---

## 📋 Phase Overview

| Phase | Document | Effort | Dependencies | Status |
|-------|----------|--------|--------------|--------|
| 00 | [Overview & Architecture](00-overview.md) | N/A | None | ✅ Planning |
| 01 | [Testing Setup](01-testing-setup.md) | 1-2 days | None | ✅ Ready |
| 02 | [Foundation](02-foundation.md) | 2-3 days | Phase 01 | ✅ Ready |
| 03 | [Fetch Zones](03-fetch-zones.md) | 2-3 days | Phase 02 | ✅ Ready |
| 04 | [Geocode Zones](04-geocode-zones.md) | 2 days | Phase 03 | ✅ Ready |
| 05 | [Build Routes](05-build-routes.md) | 3-4 days | Phase 03, 04 | ✅ Ready |
| 06 | [Clear Data](06-clear-data.md) | 1 day | Phase 02 | ✅ Ready |
| 07 | [Calculate Deciles](07-calculate-deciles.md) | 1 day | Phase 05 | ✅ Ready |
| 08 | [Maps Processing](08-maps.md) | 1-2 days | Phase 02 | ✅ Ready |
| 09 | [Export Routes](09-export.md) | 0.5 days | Phase 05 | ✅ Ready |
| 10 | [Dashboard Integration](10-dashboard.md) | 2-3 days | Phases 03-09 | ✅ Ready |
| 11 | [Integration & Polish](11-integration.md) | 2-3 days | All phases | ✅ Ready |

**Total Estimated Effort:** 17-24 days

---

## 🎯 Execution Strategy

### Phase Order

1. **Foundation Phases (01-02)** - Required infrastructure
2. **Core Workflows (03-05)** - Primary data pipeline
3. **Utility Workflows (06-09)** - Supporting operations
4. **Integration (10-11)** - Bring it all together

### Per-Phase Workflow

Each phase is designed as a **standalone work package**:

1. Read phase planning document
2. Write Vitest tests (TDD approach)
3. Implement `lib/` business logic
4. Implement `tui/screens/` UI
5. Implement CLI subcommand
6. Run tests + manual validation
7. Delete old script files
8. Commit and proceed to next phase

### Key Principles

- ✅ **No backward compatibility** - Full replacement refactor
- ✅ **Test-first** - Vitest tests before implementation
- ✅ **One workflow at a time** - Complete validation per phase
- ✅ **Manual testing required** - Compare with current implementation
- ✅ **No context carryover** - Each document is self-contained

---

## 📚 Document Structure

Each planning document contains:

### Header
- Status (Ready/In Progress/Complete)
- Dependencies (which phases required first)
- Estimated effort
- Priority level

### Content Sections
- **Overview** - What the phase does
- **Current Implementation** - Reference to existing code with line numbers
- **Target Architecture** - New file structure and API signatures
- **Implementation Steps** - Detailed step-by-step guide
- **Testing Strategy** - Unit tests, integration tests, fixtures
- **Acceptance Criteria** - Concrete, measurable success metrics
- **Manual Testing Checklist** - Human validation steps
- **Migration Notes** - What to delete, what to update
- **Rollback Plan** - How to revert if phase fails
- **References** - Links to docs, APIs, current code

---

## 🔧 Technology Stack

### Core
- **Language:** TypeScript + Node.js
- **TUI Framework:** Ink (React-based)
- **CLI Framework:** Commander
- **Testing:** Vitest
- **Database:** better-sqlite3

### Key Libraries
- `@turf/turf` - Geospatial operations
- `d3-geo` - Map projections
- `axios` - HTTP client
- `chalk` - Terminal colors
- `eventemitter3` - Event system

### Dependencies Installation
**Always use `pnpm add <package>` to get latest versions - NEVER edit package.json directly!**

---

## 🎨 Design System (Omarchy-Inspired)

### Visual Language
- Monospace font (terminal default)
- Box drawing: `┌─┐│└┘├┤┬┴┼`
- Unicode symbols: `✓✗⊘▶◀▲▼`

### Color Palette
- Primary: Cyan/Blue (interactive elements)
- Success: Green (completed)
- Warning: Yellow (pending)
- Error: Red (failures)
- Muted: Gray (secondary info)

### Keyboard Shortcuts
- Global: `q` quit, `?` help, `Esc` back
- Navigation: `j/k` or `↓/↑`, `1-9` quick select
- Actions: `t` test mode, `r` refresh, `o` open logs

---

## 📦 Deliverables

### New File Structure
```
src/
├── main.ts                    # Entry point
├── cli.ts                     # Commander CLI
├── lib/                       # Business logic (testable)
│   ├── db.ts
│   ├── events.ts
│   ├── zones.ts
│   ├── geocoding.ts
│   ├── routing.ts
│   ├── clearing.ts
│   ├── deciles.ts
│   ├── maps.ts
│   └── export.ts
├── tui/                       # UI components
│   ├── app.tsx
│   ├── dashboard.tsx
│   ├── theme.ts
│   ├── components/
│   └── screens/
└── tests/                     # Vitest tests
    ├── setup.ts
    ├── helpers/
    ├── fixtures/
    └── lib/
```

### Deleted Files (Post-Migration)
- `src/fetch_zones.ts`
- `src/geocode_zones.ts`
- `src/build_routes.ts`
- `src/clear_routes.ts`
- `src/calculate_deciles.ts`
- `src/process_map.ts`
- `src/generate_svg.ts`
- `src/status.ts`

---

## ✅ Success Criteria

### Functional
- All 8 workflows work identically to current scripts
- Real-time progress for long operations
- Error visibility with log file links
- Test mode support for all workflows
- Non-interactive mode for automation/CI

### Non-Functional
- Sub-second startup time
- 80%+ test coverage for lib/ code
- Responsive UI during heavy operations
- Clean error messages (no stack traces in TUI)

### Developer Experience
- Single entry point (`varikko`)
- Discoverable (help screens)
- Consistent UX across workflows
- Easy to add new workflows

---

## 📖 Usage Examples

### After Completion

**Interactive Mode (Recommended):**
```bash
varikko
# Opens TUI dashboard, navigate with keyboard
```

**Non-Interactive Mode:**
```bash
# Individual workflows
varikko fetch              # Fetch zones
varikko fetch --test       # Test mode (5 zones)
varikko geocode            # Geocode all zones
varikko routes             # Calculate routes (all periods)
varikko routes --period=MORNING --test
varikko clear --force      # Clear all data
varikko deciles            # Calculate deciles
varikko map                # Process map
varikko status             # Show status

# Full pipeline (automation)
varikko fetch && \
varikko geocode && \
varikko routes && \
varikko export
```

---

## 🚀 Getting Started

To begin implementation:

1. **Read `00-overview.md`** - Understand architecture and design decisions
2. **Start with Phase 01** - Testing infrastructure is foundation
3. **Follow phases sequentially** - Dependencies matter
4. **Test thoroughly** - Each phase must be validated before moving on
5. **No skipping** - Even if a workflow seems simple, follow the plan

---

## 📝 Notes for Implementers

### Important Reminders

1. **Use `pnpm add`** - Never edit package.json directly for dependencies
2. **Test-first** - Write tests before implementation
3. **Manual validation required** - Compare with old implementation
4. **Each phase is standalone** - No need to remember previous phases
5. **Commit per phase** - Don't batch multiple phases
6. **Ask questions** - Use the unresolved questions section in plans

### Common Pitfalls

- ❌ Skipping tests ("I'll add them later")
- ❌ Batching multiple phases
- ❌ Not comparing results with old implementation
- ❌ Forgetting to delete old files after migration
- ❌ Not testing non-interactive mode

---

## 🔗 References

### External Documentation
- **Ink:** https://github.com/vadimdemedes/ink
- **Commander:** https://github.com/tj/commander.js
- **Vitest:** https://vitest.dev
- **Omarchy Manual:** https://learn.omacom.io/2/the-omarchy-manual
- **Digitransit API:** https://digitransit.fi/en/developers/

### Project Documentation
- `AGENTS.md` - Current project documentation
- `GEOCODING.md` - Geocoding setup guide
- `data/README.md` - Data licensing info

---

## 📊 Progress Tracking

Use this checklist to track overall progress:

- [ ] Phase 01: Testing Setup
- [ ] Phase 02: Foundation
- [ ] Phase 03: Fetch Zones
- [ ] Phase 04: Geocode Zones
- [ ] Phase 05: Build Routes
- [ ] Phase 06: Clear Data
- [ ] Phase 07: Calculate Deciles
- [ ] Phase 08: Maps Processing
- [ ] Phase 09: Export Routes
- [ ] Phase 10: Dashboard Integration
- [ ] Phase 11: Integration & Polish

**When all checkboxes are complete, Varikko 2.0 is ready! 🎉**

---

## 🤝 Contributing

These planning documents are designed to enable distributed work:
- Pick any ready phase with satisfied dependencies
- Work independently without context from other phases
- Submit PR per phase for review
- Move to next phase after approval

---

**Last Updated:** 2025-12-27
**Version:** 1.0
**Authors:** Planning documentation generated for Varikko TUI refactor
