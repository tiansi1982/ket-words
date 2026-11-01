-- R1：发音评测签名接口（/api/soe-url）的鉴权与每日配额
-- 未绑定云同步账号的设备用匿名设备令牌（POST /api/device 签发）调用
CREATE TABLE devices (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  ip TEXT
);

-- 按（主体, 日期）计数。主体：u:<user_id> / d:<device token> / ip:<ip> / dev-ip:<ip>
CREATE TABLE soe_quota (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
