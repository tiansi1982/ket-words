-- R01：档案快照加版本号，PUT 按读取时的版本条件写入（并发同步不再互相覆盖）
-- 已有记录从 0 开始；客户端读到 0 时以 baseVersion 0 写入
ALTER TABLE profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
