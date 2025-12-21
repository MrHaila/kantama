# Varikko Data Pipeline Module

## Purpose
This module serves as the **Data Pipeline** for the Chrono-Map project. It is responsible for fetching geospatial zone data, calculating travel time matrices using the OTP (OpenTripPlanner) instance, and managing the local SQLite database that stores this data.

## Key Files
- **`src/fetch_zones.ts`**: Fetches and processes geospatial zone data (likely from HSL or similar sources) and stores them in the database.
- **`src/build_matrix.ts`**: The core script for generating traffic/travel time matrices. It queries the OTP instance for travel times between zones.
- **`src/clear_matrix.ts`**: A utility script to clear existing matrix data from the database.
- **`src/export_matrix.ts`**: Exports the processed matrix data, possibly for use by the frontend (`Opas`).
- **`package.json`**: Defines the extraction/processing scripts and dependencies (including `better-sqlite3` and geospatial tools).

## Commands
All commands are run via `pnpm` (or `npm`) within this directory:

- **`pnpm run fetch:zones`**: Runs `src/fetch_zones.ts` to populate zone data.
- **`pnpm run build:matrix`**: Runs `src/build_matrix.ts` to calculate travel times.
- **`pnpm run test:matrix`**: Runs `src/build_matrix.ts` in test mode (likely processing a smaller subset for validation).
- **`pnpm run clear:matrix`**: Runs `src/clear_matrix.ts` to wipe matrix data.
- **`pnpm run export:matrix`**: Runs `src/export_matrix.ts` to output the final dataset.
- **`pnpm test`**: Runs unit tests via `vitest`.

## Patterns
1.  **Pipeline Workflow**: The general workflow is **Fetch Zones** -> **Build Matrix** -> **Export**.
2.  **Database Storage**: Uses `better-sqlite3` for high-performance interaction with a local SQLite database to store zones and travel times.
3.  **OTP Integration**: Relies on the `otp` module (running locally) to calculate travel times.
4.  **Geospatial Processing**: Uses `@turf/turf` and `d3-geo` for spatial calculations.
