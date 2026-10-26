-- Provision the default database only. Table definitions live once in
-- database/migrations/001_initial_schema.sql.
CREATE DATABASE IF NOT EXISTS `import_data`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
