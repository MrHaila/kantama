# OTP Data Management

This sub-project handles fetching HSL routing data and running a local instance of OpenTripPlanner (OTP).

## Prerequisites

- [PNPM](https://pnpm.io/)
- [Docker](https://www.docker.com/)
- A Digitransit subscription key.

## Setup

1.  Ensure you have a `.env` file in the monorepo root (or `varikko/` or `data/otp/`) with your Digitransit subscription key:
    ```env
    DIGITRANSIT_SUBSCRIPTION_KEY=your_key_here
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

## Commands

### Fetch latest data
Downloads the latest HSL graph data and extracts it to the `hsl/` directory.
```bash
pnpm run fetch
```

### Validate data
Checks if the `hsl/` directory exists.
```bash
pnpm run validate
```

### Clean data
Deletes the `hsl/` directory.
```bash
pnpm run clean
```

## Running OTP Locally

After fetching and extracting the data, you can start OTP using Docker:

```bash
docker-compose up
```

OTP will be available at [http://localhost:8080/otp/routers/default/index.html](http://localhost:8080/otp/routers/default/index.html).

> [!NOTE]
> The initial start might take a minute as it loads the graph into memory.
