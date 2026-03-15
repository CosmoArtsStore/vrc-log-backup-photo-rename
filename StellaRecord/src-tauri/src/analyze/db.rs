use rusqlite::{Connection, Result};

pub const MAIN_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS app_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_filename    TEXT UNIQUE NOT NULL,
    vrchat_build    TEXT,
    my_user_id      TEXT,
    my_display_name TEXT,
    start_time      DATETIME,
    end_time        DATETIME
);

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

CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT UNIQUE NOT NULL,
    display_name    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);

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

CREATE TABLE IF NOT EXISTS player_visit_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES world_visits(id),
    player_id       INTEGER NOT NULL REFERENCES players(id),
    event_type      TEXT NOT NULL CHECK(event_type IN ('joined','join_complete','left')),
    timestamp       DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_visit_events_visit_id   ON player_visit_events(visit_id);
CREATE INDEX IF NOT EXISTS idx_player_visit_events_player_id  ON player_visit_events(player_id);
CREATE INDEX IF NOT EXISTS idx_player_visit_events_timestamp  ON player_visit_events(timestamp);

CREATE TABLE IF NOT EXISTS video_playbacks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL REFERENCES world_visits(id),
    url             TEXT NOT NULL,
    timestamp       DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_playbacks_visit_id ON video_playbacks(visit_id);

CREATE TABLE IF NOT EXISTS notifications (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id            INTEGER NOT NULL REFERENCES app_sessions(id),
    notif_id              TEXT UNIQUE,
    notif_type            TEXT NOT NULL CHECK(notif_type IN ('boop','friendRequest','requestInvite','invite','votetokick')),
    sender_user_id        TEXT,
    sender_username       TEXT,
    message               TEXT,
    created_at            DATETIME,
    received_at           DATETIME NOT NULL,
    target_world_id       TEXT,
    target_world_name     TEXT,
    target_instance_id    TEXT,
    target_access_type    TEXT,
    target_instance_owner TEXT,
    target_region         TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_type     ON notifications(notif_type);
CREATE INDEX IF NOT EXISTS idx_notifications_received ON notifications(received_at);

CREATE TABLE IF NOT EXISTS travel_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES app_sessions(id),
    event_type      TEXT NOT NULL CHECK(event_type IN ('home','requested','fetching','set')),
    world_id        TEXT,
    world_name      TEXT,
    instance_id     TEXT,
    access_type     TEXT,
    instance_owner  TEXT,
    region          TEXT,
    timestamp       DATETIME NOT NULL,
    source_notif_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_travel_events_session_id ON travel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_travel_events_timestamp  ON travel_events(timestamp);
";

pub const MAIN_VIEWS: &str = "
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

pub const EXTENDS_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS session_debug_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_filename    TEXT NOT NULL,
    snapshot_type   TEXT NOT NULL,
    captured_at     DATETIME,
    key_name        TEXT NOT NULL,
    value_text      TEXT,
    value_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_debug_snapshots_log_filename
    ON session_debug_snapshots(log_filename);
CREATE INDEX IF NOT EXISTS idx_session_debug_snapshots_snapshot_type
    ON session_debug_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_session_debug_snapshots_captured_at
    ON session_debug_snapshots(captured_at);
";

pub fn init_main_db(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(MAIN_SCHEMA)?;
    conn.execute_batch(MAIN_VIEWS)?;
    Ok(())
}

pub fn init_extends_db(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    conn.execute_batch(EXTENDS_SCHEMA)?;
    Ok(())
}
