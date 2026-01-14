#!/bin/bash

set -euo pipefail

# Configuration
RETRIES=2
SLEEP_SECONDS=3
DB_PORT=5432
SQL_SCRIPTS_DIR="${SQL_SCRIPTS_DIR:-../migrations}"
RDS_DB_NAME="${RDS_DB_NAME:-uptickart}"

# --- Retrieve secret ARN from SSM Parameter Store ---
echo "Retrieving secret ARN from SSM Parameter Store..."
SECRET_ARN=$(aws ssm get-parameter \
  --name "/rds/secret-arn" \
  --query "Parameter.Value" \
  --output text)

# --- Retrieve all credentials from Secrets Manager ---
echo "Retrieving RDS credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query "SecretString" \
  --output text)

# Parse credentials from JSON
RDS_ENDPOINT=$(echo "$SECRET_JSON" | jq -r '.host')
RDS_USERNAME=$(echo "$SECRET_JSON" | jq -r '.username')
RDS_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.password')

# Set PGPASSWORD environment variable so psql doesn't prompt for password
export PGPASSWORD="$RDS_PASSWORD"

# Create database if it doesn't exist
echo "Connecting to RDS instance and creating $RDS_DB_NAME database..."

# Check if database exists
DB_EXISTS=$(psql -h "$RDS_ENDPOINT" -U "$RDS_USERNAME" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$RDS_DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = "1" ]; then
    echo "Database $RDS_DB_NAME already exists"
else
    echo "Creating database $RDS_DB_NAME..."
    psql -h "$RDS_ENDPOINT" -U "$RDS_USERNAME" -d postgres -c "CREATE DATABASE $RDS_DB_NAME" || {
        echo "Error: Failed to create database"
        exit 1
    }
fi

# Unset password for security
unset PGPASSWORD

echo ""
echo "✅ $RDS_DB_NAME database exists !"
echo ""

JDBC_URL="jdbc:postgresql://${RDS_ENDPOINT}:${DB_PORT}/$RDS_DB_NAME"

echo "Preparing to upgrade remote database"
echo "Username: $RDS_USERNAME"
echo "JDBC URL: $JDBC_URL"

# --- Pre-requisite checks ---
command -v jq >/dev/null 2>&1 || { echo >&2 "Error: 'jq' is required."; exit 1; }
command -v flyway >/dev/null 2>&1 || { echo >&2 "Error: 'flyway' CLI is required."; exit 1; }

# --- Run Flyway migration directly ---
flyway \
  -connectRetries=$RETRIES \
  -url="$JDBC_URL" \
  -user="$RDS_USERNAME" \
  -password="$RDS_PASSWORD" \
  -locations="filesystem:$SQL_SCRIPTS_DIR" \
  migrate

echo "✅ Flyway migration complete"
