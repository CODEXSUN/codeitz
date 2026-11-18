#!/bin/sh
set -eu
node .container/init-workspace.mjs
exec "$@"
