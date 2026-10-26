CREATE TABLE IF NOT EXISTS iy_entities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('company', 'supplier') NOT NULL,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(512) NULL,
  address TEXT NULL,
  country_code CHAR(2) NULL,
  website VARCHAR(512) NULL,
  total_shipments BIGINT UNSIGNED NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_crawled_at DATETIME NULL,
  source_url VARCHAR(512) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iy_entity_type_slug (entity_type, slug),
  KEY idx_iy_entity_name (name(191)),
  KEY idx_iy_entity_country (country_code),
  KEY idx_iy_entity_sort (entity_type, total_shipments, id),
  KEY idx_iy_entity_global_sort (total_shipments, id),
  FULLTEXT KEY ft_iy_entity_search (name, slug, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_crawl_targets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('company', 'supplier') NOT NULL,
  slug VARCHAR(191) NOT NULL,
  url VARCHAR(512) NOT NULL,
  depth INT UNSIGNED NOT NULL DEFAULT 0,
  discovered_from_entity_id BIGINT UNSIGNED NULL,
  status ENUM('pending', 'processing', 'done', 'blocked', 'failed') NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_http_status SMALLINT UNSIGNED NULL,
  last_error TEXT NULL,
  next_attempt_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iy_target_type_slug (entity_type, slug),
  KEY idx_iy_target_queue (status, depth, id, next_attempt_at),
  KEY idx_iy_target_stale (status, updated_at),
  CONSTRAINT fk_iy_target_discovered_from FOREIGN KEY (discovered_from_entity_id)
    REFERENCES iy_entities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_entity_relations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_entity_id BIGINT UNSIGNED NOT NULL,
  target_entity_id BIGINT UNSIGNED NOT NULL,
  relation_type VARCHAR(40) NOT NULL DEFAULT 'trades_with',
  shipment_count BIGINT UNSIGNED NULL,
  observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url VARCHAR(512) NULL,
  raw_json JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iy_relation (source_entity_id, target_entity_id, relation_type),
  KEY idx_iy_relation_target (target_entity_id),
  CONSTRAINT fk_iy_relation_source FOREIGN KEY (source_entity_id)
    REFERENCES iy_entities(id) ON DELETE CASCADE,
  CONSTRAINT fk_iy_relation_target FOREIGN KEY (target_entity_id)
    REFERENCES iy_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_system VARCHAR(32) NOT NULL DEFAULT 'importyeti',
  record_key VARCHAR(128) NOT NULL,
  bol_number VARCHAR(128) NULL,
  master_bol_number VARCHAR(128) NULL,
  arrival_date DATE NULL,
  company_entity_id BIGINT UNSIGNED NULL,
  supplier_entity_id BIGINT UNSIGNED NULL,
  supplier_country VARCHAR(128) NULL,
  entry_port VARCHAR(255) NULL,
  exit_port VARCHAR(255) NULL,
  weight_value DECIMAL(18, 3) NULL,
  weight_unit VARCHAR(32) NULL,
  quantity_value DECIMAL(18, 3) NULL,
  quantity_unit VARCHAR(32) NULL,
  container_count DECIMAL(12, 3) NULL,
  product_description MEDIUMTEXT NULL,
  source_url VARCHAR(512) NULL,
  raw_json JSON NOT NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iy_shipment_source_key (source_system, record_key),
  KEY idx_iy_shipment_bol (bol_number),
  KEY idx_iy_shipment_master_bol (master_bol_number),
  KEY idx_iy_shipment_arrival_id (arrival_date, id),
  KEY idx_iy_shipment_supplier_country (supplier_country),
  KEY idx_iy_shipment_company (company_entity_id),
  KEY idx_iy_shipment_supplier (supplier_entity_id),
  FULLTEXT KEY ft_iy_shipment_product_description (product_description),
  CONSTRAINT fk_iy_shipment_company FOREIGN KEY (company_entity_id)
    REFERENCES iy_entities(id) ON DELETE SET NULL,
  CONSTRAINT fk_iy_shipment_supplier FOREIGN KEY (supplier_entity_id)
    REFERENCES iy_entities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_shipment_hs_codes (
  shipment_id BIGINT UNSIGNED NOT NULL,
  hs_code VARCHAR(32) NOT NULL,
  PRIMARY KEY (shipment_id, hs_code),
  KEY idx_iy_shipment_hs_code (hs_code),
  CONSTRAINT fk_iy_shipment_hs_shipment FOREIGN KEY (shipment_id)
    REFERENCES iy_shipments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_entity_hs_codes (
  entity_id BIGINT UNSIGNED NOT NULL,
  hs_code VARCHAR(32) NOT NULL,
  description VARCHAR(1024) NULL,
  shipment_count BIGINT UNSIGNED NULL,
  PRIMARY KEY (entity_id, hs_code),
  KEY idx_iy_entity_hs_code (hs_code),
  CONSTRAINT fk_iy_entity_hs_entity FOREIGN KEY (entity_id)
    REFERENCES iy_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_entity_country_stats (
  entity_id BIGINT UNSIGNED NOT NULL,
  region_name VARCHAR(128) NOT NULL DEFAULT '',
  country_name VARCHAR(128) NOT NULL,
  shipment_count BIGINT UNSIGNED NULL,
  PRIMARY KEY (entity_id, region_name, country_name),
  KEY idx_iy_country_stats_country (country_name),
  CONSTRAINT fk_iy_country_stats_entity FOREIGN KEY (entity_id)
    REFERENCES iy_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iy_entity_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_id BIGINT UNSIGNED NOT NULL,
  content_hash CHAR(64) NOT NULL,
  profile_json JSON NOT NULL,
  raw_html MEDIUMTEXT NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iy_snapshot_entity_hash (entity_id, content_hash),
  KEY idx_iy_snapshot_captured_at (captured_at),
  CONSTRAINT fk_iy_snapshot_entity FOREIGN KEY (entity_id)
    REFERENCES iy_entities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
