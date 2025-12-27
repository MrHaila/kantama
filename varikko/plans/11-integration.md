# Phase 11: Integration & Polish

**Status:** Ready for implementation
**Dependencies:** All phases 01-10
**Estimated Effort:** 2-3 days
**Priority:** FINAL (cleanup and deployment)

---

## Overview

Final integration, polish, testing, and deployment preparation. This phase ensures production-readiness.

---

## Tasks

### 1. Cleanup Legacy Code
- [ ] Delete all old script files (`fetch_zones.ts`, `geocode_zones.ts`, etc.)
- [ ] Remove old pnpm scripts from `package.json`
- [ ] Update AGENTS.md documentation
- [ ] Update README with new usage instructions

### 2. Build & Packaging
- [ ] Configure TypeScript build for production
- [ ] Test compiled binary (`pnpm build && ./dist/main.js`)
- [ ] Add shebang to main.ts for direct execution
- [ ] Test npm link for global installation
- [ ] Create .npmignore (exclude tests, plans, etc.)

### 3. Documentation
- [ ] Update README.md
  - Installation instructions
  - Interactive mode usage
  - Non-interactive mode examples
  - Environment variables
- [ ] Create CONTRIBUTING.md
- [ ] Document TUI keyboard shortcuts
- [ ] Update AGENTS.md with new architecture

### 4. Error Handling & Logging
- [ ] Ensure all errors logged to files
- [ ] Graceful exit on Ctrl+C in TUI
- [ ] Clear error messages (no stack traces in TUI)
- [ ] Log rotation (max file size/count)

### 5. Performance Optimization
- [ ] Profile startup time (should be < 1s)
- [ ] Optimize DB queries (add indexes if needed)
- [ ] Test with full dataset (279 zones)
- [ ] Benchmark route calculation speed

### 6. Cross-Platform Testing
- [ ] Test on macOS (iTerm, Terminal.app)
- [ ] Test terminal resize handling
- [ ] Test color output in different terminals
- [ ] Verify Unicode symbols render correctly

### 7. CI/CD Setup (Optional)
- [ ] GitHub Actions for tests
- [ ] Automated builds
- [ ] Version bumping workflow

### 8. Final Testing
- [ ] Run full pipeline end-to-end
- [ ] Compare results with old implementation
- [ ] Test all CLI commands
- [ ] Test all TUI screens
- [ ] Edge case testing (empty DB, network failures, etc.)

---

## Acceptance Criteria

- ✅ All tests pass (unit + integration)
- ✅ 80%+ code coverage
- ✅ All old scripts deleted
- ✅ Documentation complete
- ✅ Binary works when installed globally
- ✅ Production-ready error handling
- ✅ Performance benchmarks met

---

## Deployment Checklist

- [ ] Version bump to 2.0.0 (breaking changes)
- [ ] Update CHANGELOG.md
- [ ] Tag release in git
- [ ] Build and test final binary
- [ ] Document migration path from v1

---

## Package.json Final State

```json
{
  "name": "varikko",
  "version": "2.0.0",
  "description": "Varikko Data Pipeline - TUI for transit route calculation",
  "bin": {
    "varikko": "./dist/main.js"
  },
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src",
    "clean": "rm -rf dist"
  },
  "files": [
    "dist",
    "data",
    "README.md",
    "LICENSE"
  ]
}
```

---

## Migration Guide for Users

**Old Way:**
```bash
pnpm fetch:zones
pnpm geocode:zones
pnpm build:routes
```

**New Way:**
```bash
# Interactive (recommended)
varikko

# Non-interactive
varikko fetch
varikko geocode
varikko routes
```

---

## Known Issues to Document

1. **OTP Docker Required:** Local OTP needs Docker container running
2. **API Keys:** Geocoding and remote OTP require API keys
3. **Large Dataset:** Full route calculation takes hours
4. **Terminal Size:** Dashboard requires minimum 80x24 terminal

---

## Success Metrics

- ✅ Startup time < 1s
- ✅ Route calculation speed matches old implementation
- ✅ Memory usage reasonable (< 500MB)
- ✅ No memory leaks during long operations
- ✅ All workflows complete successfully

---

## Post-Launch

- Monitor for issues
- Gather user feedback
- Plan future enhancements (workflow presets, config file, etc.)

---

## References

- **Old Implementation:** All `src/*.ts` scripts (to be deleted)
- **New Architecture:** `plans/00-overview.md`
