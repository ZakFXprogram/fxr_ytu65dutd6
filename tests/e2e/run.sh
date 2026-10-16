#!/bin/sh
# End-to-end tests: real backend (built) + mock Discord + mock TRON chain, fresh database in a temp folder.
# Needs: backend built (npm run build), frontend built, python3 with requests.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
export FXR_TEST_DIR=$(mktemp -d)
node "$HERE/mock-discord.js" > "$FXR_TEST_DIR/mock-discord.log" 2>&1 & M1=$!
node "$HERE/mock-tron.js" > "$FXR_TEST_DIR/mock-tron.log" 2>&1 & M2=$!
. "$HERE/env.sh"
export DATA_DIR="$FXR_TEST_DIR/data"
(cd "$HERE/../../backend" && node dist/main.js > "$FXR_TEST_DIR/server.log" 2>&1) & S=$!
sleep 3
trap 'kill $M1 $M2 $S 2>/dev/null; pkill -f "dist/main.js" 2>/dev/null || true' EXIT
node "$HERE/real_tron_fixtures.test.js"
python3 "$HERE/test_payments.py"
