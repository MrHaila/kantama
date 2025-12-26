# OTP Data Management Module

## Purpose

This module handles the fetching of HSL (Helsinki Region Transport) routing data and managing a local OpenTripPlanner (OTP) instance. It is essential for generating travel time matrices and providing routing services for the application.

## Key Files

- **`src/fetch_data.ts`**: The primary script for downloading and extracting HSL graph data. It likely interacts with Digitransit APIs or data dumps.
- **`docker-compose.yml`**: Defines the Docker service for running a local instance of OpenTripPlanner (`hsldevcom/opentripplanner:v2-prod`), mounting the fetched data.
- **`package.json`**: Defines the project scripts and dependencies.

## Commands

All commands are run via `pnpm` within this directory:

- **`pnpm run fetch`**: Downloads the latest HSL graph data and extracts it to the `hsl/` directory. Uses `src/fetch_data.ts`.
- **`pnpm run validate`**: Checks if the `hsl/` directory exists to ensure data is present.
- **`pnpm run clean`**: Deletes the `hsl/` directory to remove existing data.
- **`docker-compose up`**: Starts the local OTP instance.

## Patterns

1.  **Data Fetching**: The `fetch` script is used to provision the necessary graph data (likely `obj.dat` and others) into the `hsl/` directory.
2.  **Containerized Service**: OTP is run as a Docker container, mounting the local `hsl/` directory to serve the routing graph.
3.  **Environment Variables**: Requires a Digitransit subscription key, typically setup in a `.env` file (referenced in `README.md` but good to note here).
