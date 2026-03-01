use rusqlite::{Connection, Result};

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS app_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time      DATETIME NOT NULL,
    end_time        DATETIME,
    my_user_id      TEXT,
    my_display_name TEXT,
    vrchat_build    TEXT,
    log_filename    TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS world_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    world_name      TEXT NOT NULL,
    world_id        TEXT NOT NULL,
    instance_id     TEXT NOT NULL,
    access_type     TEXT,
    instance_owner  TEXT,
    region          TEXT,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME,
    FOREIGN KEY(session_id) REFERENCES app_sessions(id)
);

CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT UNIQUE,
    display_name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL,
    player_id       INTEGER NOT NULL,
    is_local        BOOLEAN NOT NULL DEFAULT 0,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS avatar_changes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,
    player_id         INTEGER,
    display_name_raw  TEXT NOT NULL,
    avatar_name       TEXT NOT NULL,
    timestamp         DATETIME NOT NULL,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS video_playbacks (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,
    player_id         INTEGER,
    display_name_raw  TEXT,
    url               TEXT NOT NULL,
    timestamp         DATETIME NOT NULL,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);
";

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(SCHEMA)?;
    Ok(())
}
