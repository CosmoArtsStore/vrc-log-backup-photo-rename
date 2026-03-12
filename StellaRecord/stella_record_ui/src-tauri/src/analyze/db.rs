use rusqlite::{Connection, Result};

pub const SCHEMA: &str = "
-- ① セッション（ログファイル1件 = 1セッション）
CREATE TABLE IF NOT EXISTS app_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_filename    TEXT UNIQUE NOT NULL,
    vrchat_build    TEXT,
    my_user_id      TEXT,
    my_display_name TEXT,
    start_time      DATETIME,
    end_time        DATETIME
);

-- ② ワールド訪問
--   instance_id: インスタンス番号のみ（例: 74156）
--   world_id + instance_id でフルインスタンスを再構築可能
--   access_type: private / friends / hidden / public / group
--   instance_owner: アクセスがprivate/friends/hiddenの場合のオーナーusr_id
CREATE TABLE IF NOT EXISTS world_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES app_sessions(id),
    world_id        TEXT NOT NULL,
    world_name      TEXT NOT NULL,
    instance_id     TEXT NOT NULL,
    access_type     TEXT CHECK(access_type IN ('private','friends','hidden','public','group') OR access_type IS NULL),
    instance_owner  TEXT,
    region          TEXT,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME
);
CREATE INDEX IF NOT EXISTS idx_world_visits_world_id   ON world_visits(world_id);
CREATE INDEX IF NOT EXISTS idx_world_visits_join_time  ON world_visits(join_time);
CREATE INDEX IF NOT EXISTS idx_world_visits_session_id ON world_visits(session_id);

-- ③ プレイヤーマスタ
--   first_seen_at / last_seen_at は VIEW player_stats で集計するためカラムに持たない
CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT UNIQUE NOT NULL,
    display_name    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);

-- ④ プレイヤー同席記録
--   is_self = 1: 自分自身 (ローカルプレイヤー)
CREATE TABLE IF NOT EXISTS player_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES world_visits(id),
    player_id       INTEGER NOT NULL REFERENCES players(id),
    is_self         BOOLEAN NOT NULL DEFAULT 0,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME,
    UNIQUE(visit_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_player_visits_visit_id  ON player_visits(visit_id);
CREATE INDEX IF NOT EXISTS idx_player_visits_player_id ON player_visits(player_id);

-- ⑤ 動画再生履歴
--   URLのみ記録。誰がリクエストしたかはプライバシー保護のため収集しない。
CREATE TABLE IF NOT EXISTS video_playbacks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES world_visits(id),
    url             TEXT NOT NULL,
    timestamp       DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_playbacks_visit_id ON video_playbacks(visit_id);

-- ⑥ 通知受信履歴
--   group タイプはスキップ（文字化けが多く情報量が低い）
--   notif_id で重複排除（同一通知がセッション内で複数回届くケースあり）
--   NOTE: 同一not_xxxが複数回届いても初回のみが記録される（INSERT OR IGNORE）
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES app_sessions(id),
    notif_id        TEXT UNIQUE,
    notif_type      TEXT NOT NULL CHECK(notif_type IN ('boop','friendRequest','requestInvite','invite','votetokick')),
    sender_user_id  TEXT,
    sender_username TEXT,
    message         TEXT,
    created_at      DATETIME,
    received_at     DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_type     ON notifications(notif_type);
CREATE INDEX IF NOT EXISTS idx_notifications_received ON notifications(received_at);
";

/// 外部プラグイン向け集計VIEW
pub const VIEWS: &str = "
-- 訪問サマリー（外部ツールがワールド一覧・滞在時間を取得するために使う）
CREATE VIEW IF NOT EXISTS visit_summary AS
SELECT
    wv.id              AS visit_id,
    wv.world_id,
    wv.world_name,
    wv.instance_id,
    wv.access_type,
    wv.region,
    wv.join_time,
    wv.leave_time,
    CAST((julianday(COALESCE(wv.leave_time, datetime('now'))) - julianday(wv.join_time)) * 86400 AS INTEGER)
                       AS duration_sec,
    (SELECT COUNT(*) FROM player_visits pv
     WHERE pv.visit_id = wv.id AND pv.is_self = 0)
                       AS other_player_count
FROM world_visits wv
ORDER BY wv.join_time DESC;

-- プレイヤー統計（外部ツールが「よく一緒にいた人」を集計するために使う）
CREATE VIEW IF NOT EXISTS player_stats AS
SELECT
    p.id               AS player_id,
    p.user_id,
    p.display_name,
    COUNT(DISTINCT pv.visit_id)                          AS co_visit_count,
    MIN(pv.join_time)                                    AS first_met,
    MAX(COALESCE(pv.leave_time, pv.join_time))           AS last_met
FROM players p
JOIN player_visits pv ON pv.player_id = p.id
WHERE pv.is_self = 0
GROUP BY p.id
ORDER BY co_visit_count DESC;
";

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    // avatar_changes は廃止（プライバシー方針による）
    conn.execute_batch("DROP TABLE IF EXISTS avatar_changes;")?;
    conn.execute_batch(SCHEMA)?;
    conn.execute_batch(VIEWS)?;
    Ok(())
}
