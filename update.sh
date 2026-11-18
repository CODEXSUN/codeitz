#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec sh ../codeship/.container/devkits/codeitz/update.sh "$@"
