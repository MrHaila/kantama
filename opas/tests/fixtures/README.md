# Test Fixtures

This directory contains minimal test data for E2E tests.

## Contents

- **zones.json**: 8 zones covering different connectivity levels and cities
- **manifest.json**: Data summary metadata
- **routes/**: Route files for 8 zones × 3 time periods = 24 files (if all exist)

## Selected Zones

- HEL-331: Kannelmäki, Helsinki
- HEL-030: Kaartinkaupunki, Helsinki
- HEL-050: Punavuori, Helsinki
- HEL-457: Itäkeskus, Helsinki
- HEL-473: Mellunmäki, Helsinki
- VAN-Ylästö: Ylästö, Vantaa
- ESP-712: Bodom, Espoo
- ESP-111: Pohjois-Leppävaara, Espoo

## Regenerating Fixtures

To update fixtures from current production data:

```bash
pnpm test:create-fixtures
```

This will snapshot the current data structure and ensure tests stay in sync.

## Last Generated

2025-12-29T18:08:09.441Z

Generated from: 2025-12-29T09:27:56.132Z
