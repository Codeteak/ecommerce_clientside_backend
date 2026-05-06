-- Sole PostgreSQL migration for fresh deployment of the multi-tenant ecommerce schema.
-- Apply this entire file once per new database (e.g. psql -f 001_deployment_postgresql.sql).
-- Layout targets fresh installs (inline FKs, CHECKs, timestamps on CREATE TABLE); idempotent
-- ALTER … IF NOT EXISTS / DROP IF EXISTS blocks also help bring older databases closer to current shape.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Normalized address table shared by shops/customers (and future entities).
