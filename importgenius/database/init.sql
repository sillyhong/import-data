-- ImportGenius 数据库初始化 / 升级入口。
-- 默认数据库：import_data。目标环境使用其他数据库名时，请同步修改下方库名和 USE。
-- 执行示例：mysql -u your_mysql_user -p < importgenius/database/init.sql

CREATE DATABASE IF NOT EXISTS `import_data`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE `import_data`;

-- 新库创建主表；已有主表不会重建。迁移只增加可空创建时间列，不回填无法还原的历史时间。
CREATE TABLE IF NOT EXISTS importgenius (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  raw JSON NOT NULL,
  totalShipments BIGINT UNSIGNED NOT NULL DEFAULT 0,
  company VARCHAR(512) NOT NULL DEFAULT '',
  contactInfo MEDIUMTEXT NULL,
  mostRecentDate DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  url VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  country VARCHAR(32) NOT NULL,
  isTarget TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ig_url (url),
  KEY idx_ig_date_id (mostRecentDate, id),
  KEY idx_ig_country_created_id (country, createdAt, id),
  KEY idx_ig_country_date_id (country, mostRecentDate, id),
  KEY idx_ig_country_target_date_id (country, isTarget, mostRecentDate, id)
) ENGINE=InnoDB
  ROW_FORMAT=DYNAMIC
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- 兼容已有主表：历史记录的真实创建时间无法从现有数据还原，留空；后续插入自动记录时间。
SET @ig_created_at_missing = (
  SELECT COUNT(*) = 0
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'importgenius'
    AND COLUMN_NAME = 'createdAt'
);
SET @ig_add_created_at_sql = IF(
  @ig_created_at_missing,
  'ALTER TABLE importgenius ADD COLUMN createdAt DATETIME NULL DEFAULT NULL',
  'SELECT ''createdAt 已存在，跳过字段添加'''
);
PREPARE ig_add_created_at_statement FROM @ig_add_created_at_sql;
EXECUTE ig_add_created_at_statement;
DEALLOCATE PREPARE ig_add_created_at_statement;

SET @ig_set_created_at_default_sql = IF(
  @ig_created_at_missing,
  'ALTER TABLE importgenius MODIFY COLUMN createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''createdAt 默认值无需升级'''
);
PREPARE ig_set_created_at_default_statement FROM @ig_set_created_at_default_sql;
EXECUTE ig_set_created_at_default_statement;
DEALLOCATE PREPARE ig_set_created_at_default_statement;

-- 搜索侧表的关联键沿用现有主表 id 类型，兼容旧库的 INT / BIGINT 等定义。
SET @ig_id_column_type = (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'importgenius'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @ig_create_search_table = CONCAT(
  'CREATE TABLE IF NOT EXISTS importgenius_search (',
  'importgenius_id ', @ig_id_column_type, ' NOT NULL,',
  'FTS_DOC_ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,',
  'product_description MEDIUMTEXT NOT NULL,',
  'PRIMARY KEY (importgenius_id),',
  'UNIQUE KEY FTS_DOC_ID_INDEX (FTS_DOC_ID)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE ig_search_statement FROM @ig_create_search_table;
EXECUTE ig_search_statement;
DEALLOCATE PREPARE ig_search_statement;

CREATE TABLE IF NOT EXISTS importgenius_search_backfill (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  high_water_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending', 'backfilling', 'complete') NOT NULL DEFAULT 'pending',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO importgenius_search_backfill (singleton_id) VALUES (1);

-- 仅在应用任务已完成历史数据回填后建全文索引，避免百万行回填期间持续维护索引。
-- 首次初始化时会跳过；任务页“盘点并补齐索引”会在回填完成后自动创建。
-- 回填完成后再次执行本文件，也会补建缺失的全文索引。
SET @ig_backfill_status = (
  SELECT status
  FROM importgenius_search_backfill
  WHERE singleton_id = 1
  LIMIT 1
);
SET @ig_has_fulltext = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'importgenius_search'
    AND INDEX_TYPE = 'FULLTEXT'
    AND COLUMN_NAME = 'product_description'
    AND SEQ_IN_INDEX = 1
);
SET @ig_add_fulltext_sql = IF(
  @ig_has_fulltext > 0 OR COALESCE(@ig_backfill_status, 'pending') <> 'complete',
  'SELECT ''全文索引已存在，或历史回填尚未完成；本次跳过''',
  'ALTER TABLE importgenius_search ADD FULLTEXT INDEX ft_ig_product_description (product_description), ALGORITHM=INPLACE, LOCK=SHARED'
);
PREPARE ig_fulltext_statement FROM @ig_add_fulltext_sql;
EXECUTE ig_fulltext_statement;
DEALLOCATE PREPARE ig_fulltext_statement;
