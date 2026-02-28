import { useState, useEffect, useCallback, useMemo, CSSProperties } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Grid } from "react-window";
import "./App.css";

interface PhotoRecord {
  photo_filename: string;
  photo_path: string;
  world_id: string | null;
  world_name: string | null;
  timestamp: string;
  memo: string;
}

interface AlpheratzSetting {
  photoFolderPath: string;
}

// --- PhotoCard Component ---
// Individual card handles its own thumbnail lazy-loading to keep App state clean
const PhotoCard = ({ photo, onSelect }: { photo: PhotoRecord; onSelect: (p: PhotoRecord) => void }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadThumb = async () => {
      try {
        const thumbPath: string = await invoke("create_thumbnail", { path: photo.photo_path });
        if (isMounted) setThumbUrl(convertFileSrc(thumbPath));
      } catch (e) {
        console.error("Failed to load thumbnail", e);
      }
    };
    loadThumb();
    return () => { isMounted = false; };
  }, [photo.photo_path]);

  return (
    <div className="photo-card" onClick={() => onSelect(photo)}>
      {thumbUrl ? (
        <img src={thumbUrl} alt={photo.photo_filename} loading="lazy" />
      ) : (
        <div className="photo-placeholder" />
      )}
      <div className="photo-info-overlay">
        <div className="world-name-tag">{photo.world_name || "ワールド不明"}</div>
        <div className="photo-timestamp-tag">{photo.timestamp}</div>
      </div>
    </div>
  );
};

// --- Cell Renderer for react-window ---
const Cell = ({ columnIndex, rowIndex, style, photos, onSelect, columns }: { columnIndex: number; rowIndex: number; style: CSSProperties; photos: PhotoRecord[]; onSelect: (p: PhotoRecord) => void; columns: number }) => {
  const index = rowIndex * columns + columnIndex;
  if (!photos || index >= photos.length) return null;

  return (
    <div style={style} className="photo-item">
      <PhotoCard photo={photos[index]} onSelect={onSelect} />
    </div>
  );
};

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState<AlpheratzSetting>({ photoFolderPath: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [memoText, setMemoText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterWorld, setFilterWorld] = useState("");
  const [uniqueWorlds, setUniqueWorlds] = useState<string[]>([]);

  const COLUMNS = 4;
  const ITEM_HEIGHT = 200;

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const s: AlpheratzSetting = await invoke("get_setting_cmd");
      setSetting(s);
      await refreshPhotos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshPhotos = async () => {
    setLoading(true);
    try {
      const list: PhotoRecord[] = await invoke("scan_photos");
      setPhotos(list);

      const worlds = Array.from(new Set(list.map(p => p.world_name || "ワールド不明"))).sort();
      setUniqueWorlds(worlds);
    } catch (e) {
      alert("エラー: " + e);
    } finally {
      setLoading(false);
    }
  };

  // Performance Optimization: Memoize filtered list
  const filteredPhotos = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return photos.filter(p => {
      const matchesSearch = !term ||
        p.world_name?.toLowerCase().includes(term) ||
        p.photo_filename.toLowerCase().includes(term) ||
        p.memo.toLowerCase().includes(term);
      const matchesWorld = filterWorld === "" || (p.world_name || "ワールド不明") === filterWorld;
      return matchesSearch && matchesWorld;
    });
  }, [photos, searchTerm, filterWorld]);

  const handleSelectPhoto = useCallback((photo: PhotoRecord) => {
    setSelectedPhoto(photo);
    setMemoText(photo.memo || "");
  }, []);

  const handleSaveMemo = async () => {
    if (!selectedPhoto) return;
    try {
      await invoke("save_photo_memo", { filename: selectedPhoto.photo_filename, memo: memoText });
      const updated = photos.map(p => p.photo_filename === selectedPhoto.photo_filename ? { ...p, memo: memoText } : p);
      setPhotos(updated);
      setSelectedPhoto({ ...selectedPhoto, memo: memoText });
    } catch (e) {
      alert("保存失敗: " + e);
    }
  };

  const handleBrowseFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      const newSetting = { photoFolderPath: selected };
      setSetting(newSetting);
      await invoke("save_setting_cmd", { setting: newSetting });
      await refreshPhotos();
    }
  };

  const gridData = useMemo(() => ({
    photos: filteredPhotos,
    onSelect: handleSelectPhoto,
    columns: COLUMNS
  }), [filteredPhotos, handleSelectPhoto]);

  return (
    <div className="alpheratz-container">
      <header className="header">
        <div className="header-left">
          <h1>Alpheratz</h1>
          <div className="search-box">
            <input
              type="text"
              placeholder="検索..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-box">
            <select value={filterWorld} onChange={e => setFilterWorld(e.target.value)}>
              <option value="">全てのワールド</option>
              {uniqueWorlds.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="stats">{filteredPhotos.length} Photos</div>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => refreshPhotos()} title="Refresh">🔄</button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)} title="Settings">⚙️</button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="close-btn" onClick={() => setShowSettings(false)}>×</div>
          <h3>設定</h3>
          <div className="setting-item">
            <label>写真フォルダパス</label>
            <div className="path-input-group">
              <input type="text" value={setting.photoFolderPath} readOnly />
              <button onClick={handleBrowseFolder}>参照</button>
            </div>
          </div>
        </div>
      )}

      <main className="viewer-main">
        {loading ? (
          <div className="loading-overlay">スキャン中...</div>
        ) : (
          <Grid
            columnCount={COLUMNS}
            columnWidth={document.body.clientWidth / COLUMNS}
            defaultHeight={window.innerHeight - 64}
            defaultWidth={document.body.clientWidth}
            rowCount={Math.ceil(filteredPhotos.length / COLUMNS)}
            rowHeight={ITEM_HEIGHT}
            cellProps={gridData}
            cellComponent={Cell as any}
          />
        )}
      </main>

      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="full-image-container">
              <img src={convertFileSrc(selectedPhoto.photo_path)} alt={selectedPhoto.photo_filename} />
            </div>
            <aside className="sidebar-detail">
              <div className="close-btn" onClick={() => setSelectedPhoto(null)}>×</div>
              <h2>Photo Detail</h2>

              <div className="detail-row">
                <span className="detail-label">File Name</span>
                <span className="detail-value">{selectedPhoto.photo_filename}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Timestamp</span>
                <span className="detail-value">{selectedPhoto.timestamp}</span>
              </div>

              <hr />

              <div className="detail-row">
                <span className="detail-label">World</span>
                <div className="world-link-group">
                  <span className="world-name-primary">
                    {selectedPhoto.world_name || "ワールド不明"}
                  </span>
                  {selectedPhoto.world_id && (
                    <a
                      href={`https://vrchat.com/home/world/${selectedPhoto.world_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vrc-link"
                    >
                      VRChatで開く ↗
                    </a>
                  )}
                </div>
              </div>

              <div className="memo-area">
                <span className="detail-label">Memo</span>
                <textarea
                  value={memoText}
                  onChange={e => setMemoText(e.target.value)}
                  placeholder="メモを入力..."
                />
                <button className="save-btn" onClick={handleSaveMemo}>保存</button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
