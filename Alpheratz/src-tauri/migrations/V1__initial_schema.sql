-- V1: Initial schema for Alpheratz (Legacy Compatible)
CREATE TABLE IF NOT EXISTS photos (
    photo_filename  TEXT PRIMARY KEY,
    photo_path      TEXT NOT NULL,
    world_id        TEXT,
    world_name      TEXT,
    timestamp       TEXT NOT NULL,
    memo            TEXT DEFAULT '',
    phash           TEXT
);

CREATE TABLE IF NOT EXISTS photo_embeddings (
    photo_id       TEXT PRIMARY KEY,
    world_emb      BLOB,
    avatar_emb     BLOB,
    world_cluster  INTEGER,
    avatar_cluster INTEGER
);

CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
