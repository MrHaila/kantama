#!/bin/bash

# Only run in remote environments. We assume you have things already set up locally.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

pnpm install
