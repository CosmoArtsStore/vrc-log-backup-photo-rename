# Alpheratz.db schema design

## photos

```sql
CREATE TABLE photos (
    photo_filename  TEXT PRIMARY KEY,
    photo_path      TEXT NOT NULL,
    world_id        TEXT,
    world_name      TEXT,
    timestamp       TEXT NOT NULL,
    width           INTEGER,
    height          INTEGER,
    orientation     TEXT,
    memo            TEXT DEFAULT '',
    phash           TEXT,
    histogram       BLOB,
    is_favorite     INTEGER DEFAULT 0
);
```

## tags

```sql
CREATE TABLE tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);
```

## photo_tags

```sql
CREATE TABLE photo_tags (
    photo_filename  TEXT REFERENCES photos(photo_filename),
    tag_id          INTEGER REFERENCES tags(id),
    PRIMARY KEY (photo_filename, tag_id)
);
```

メモ:
- `photo_filename` を写真の一意キーとして採用
- `is_favorite` は SQLite では `INTEGER`
- 将来的な検索強化のため `histogram` を確保
