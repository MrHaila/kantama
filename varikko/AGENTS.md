# Varikko Data Pipeline Module

## Purpose
This module serves as the **Data Pipeline** for the Chrono-Map project. It is responsible for fetching geospatial zone data, calculating routes and travel times using the OTP (OpenTripPlanner) instance, and managing the local SQLite database (`varikko.db`) that stores all project data.

## Data Schema (`varikko.db`)
Everything is consolidated into a single SQLite database:

- **`places`**: Stores zone metadata.
    - `id`: Postal code id (e.g., "00100").
    - `name`: Name of the area.
    - `lat`, `lon`: Centroid coordinates.
    - `geometry`: GeoJSON polygon string.
- **`routes`**: Stores pre-calculated transit metadata between places.
    - `from_id`, `to_id`, `time_period`: Unique identifier for a route at a specific time (MORNING, EVENING, MIDNIGHT).
    - `duration`: Travel time in seconds.
    - `numberOfTransfers`: Number of transit transfers.
    - `walkDistance`: Total walking distance in meters.
    - `legs`: Detailed JSON blob of the journey steps (from, to, mode, duration, distance).
    - `status`: Processing state (`PENDING`, `OK`, `NO_ROUTE`, `ERROR`).
- **`metadata`**: Key-value store for run progress and timestamps.

## Key Files
- **`src/fetch_zones.ts`**: Fetches zone data from WFS services, initializes the database schema, populates `places`, and pre-fills the `routes` table with a Cartesian product of all places for each time period.
- **`src/build_routes.ts`**: The core script for fetching detailed itineraries from OTP. It targets `PENDING` routes for a given `--period`.
- **`src/clear_routes.ts`**: Resets `routes` table statuses and metrics to `PENDING`.
- **`src/export_routes.ts`**: Exports the calculated durations into a JSON format for optimized use.

## Commands
Run all commands via `pnpm`:

- **`pnpm fetch:zones`**: Fetches zones and pre-fills the database.
    - Use `--test` to limit to a few zones for quick testing.
- **`pnpm build:routes`**: Calculates transit metrics for `PENDING` routes.
    - `--period=MORNING` (default), `EVENING`, or `MIDNIGHT`.
    - Use `--test` to process just a few random routes.
- **`pnpm test:routes`**: Alias for `build:routes --test`.
- **`pnpm clear:routes`**: Resets the route computational state.
- **`pnpm export:routes`**: Generates a JSON export of durations.
- **`pnpm test`**: Runs unit tests via `vitest`.

## Workflow
Use `pnpm` instead of `npm`.

1.  **Initialize**: `pnpm fetch:zones` (creates schema and places).
2.  **Generate**: `pnpm build:routes --period=MORNING` (computes itineraries).
3.  **Monitor**: Check the `metadata` table or script logs for progress.
4.  **Export**: `pnpm export:routes` for usage.

## Patterns
1.  **Relational Consolidation**: Prefer the SQLite database for all persistence to avoid syncing flat files.
2.  **Multi-Period support**: Routes are calculated for different times of day to capture transit variability.
3.  **Rich Metadata**: Store full OTP leg information in JSON columns to enable interesting UI visualizations without re-calculating.
4.  **Idempotency**: `build_routes` picks up where it left off by querying `PENDING` statuses.
