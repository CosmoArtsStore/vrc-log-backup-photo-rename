-- V1: Initial schema for Alpheratz
CREATE TABLE IF NOT EXISTS photos (
    photo_filename  TEXT PRIMARY KEY,
    photo_path      TEXT NOT NULL,
    world_id        TEXT,
    world_name      TEXT,
    timestamp       TEXT NOT NULL,
    memo            TEXT DEFAULT '',
    phash           TEXT,
    orientation     TEXT,
    is_favorite     INTEGER DEFAULT 0,
    match_source    TEXT
);

CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS photo_tags (
    photo_filename  TEXT REFERENCES photos(photo_filename),
    tag_id          INTEGER REFERENCES tags(id),
    PRIMARY KEY (photo_filename, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite);
