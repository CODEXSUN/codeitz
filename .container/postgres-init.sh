#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=app_password="$CODEITZ_DB_PASSWORD" <<'SQL'
CREATE ROLE codeitz LOGIN PASSWORD :'app_password';
CREATE SCHEMA codeitz AUTHORIZATION codeitz;
SQL
