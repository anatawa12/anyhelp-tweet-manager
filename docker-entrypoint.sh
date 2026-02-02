#!/bin/sh
set -e

# Handle SETTINGS_JSON environment variable
if [ -n "$SETTINGS_JSON" ]; then
  echo "Writing settings.json from environment variable..."
  echo "$SETTINGS_JSON" > /app/settings.json
fi

# Check if arguments were provided
if [ $# -eq 0 ]; then
  # No arguments - run start
  echo "Starting bot..."
  exec node dist/index.js
else
  # Arguments provided - run process-rt
  echo "Running process-rt with arguments: $@"
  exec node dist/process-rt.js "$@"
fi
