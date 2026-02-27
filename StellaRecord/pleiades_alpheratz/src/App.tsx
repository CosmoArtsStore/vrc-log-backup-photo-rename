import React, { useState, useEffect, useCallback, useMemo } from "react";
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

// --- Components ---

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState<AlpheratzSetting>({ photoFolderPath: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [memoText, setMemoText] = useState("");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterWorld, setFilterWorld] = useState("");
  const [uniqueWorlds, setUniqueWorlds] = useState<string[]>([]);

  const COLUMNS = 4;
  const ITEM_HEIGHT = 200;

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const s: AlpheratzSetting = await invoke("get_setting_cmd");
      setSetting(s);
      await refreshPhotos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshPhotos() {
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
  }

  const filteredPhotos = photos.filter(p => {
    const matchesSearch = p.world_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.photo_filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.memo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWorld = filterWorld === "" || (p.world_name || "ワールド不明") === filterWorld;
    return matchesSearch && matchesWorld;
  });

  const handleSelectPhoto = (photo: PhotoRecord) => {
    setSelectedPhoto(photo);
    setMemoText(photo.memo || "");
  };

  const handleSaveMemo = async () => {
    if (!selectedPhoto) return;
    try {
      await invoke("save_photo_memo", { filename: selectedPhoto.photo_filename, memo: memoText });
      const updated = photos.map(p => p.photo_filename === selectedPhoto.photo_filename ? { ...p, memo: memoText } : p);
      setPhotos(updated);
      setSelectedPhoto({ ...selectedPhoto, memo: memoText });
      alert("メモを保存しました");
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

  // --- Grid Cell Renderer ---
  const Cell = useCallback(({ columnIndex, rowIndex, style, photos }: { columnIndex: number, rowIndex: number, style: React.CSSProperties, photos: PhotoRecord[] }) => {
    const index = rowIndex * COLUMNS + columnIndex;
    if (!photos || index >= photos.length) return null;
    const photo = photos[index];

    // Lazy load thumbnail
    useEffect(() => {
      const pId = photo.photo_filename;
      if (!thumbnails[pId]) {
        invoke("create_thumbnail", { path: photo.photo_path }).then((thumbPath: unknown) => {
          setThumbnails(prev => ({ ...prev, [pId]: String(thumbPath) }));
        });
      }
    }, [photo.photo_filename, photo.photo_path, thumbnails]);

    const imgSrc = thumbnails[photo.photo_filename]
      ? convertFileSrc(thumbnails[photo.photo_filename])
      : ""; // Placeholder

    return (
      <div style={style} className="photo-item">
        <div className="photo-card" onClick={() => handleSelectPhoto(photo)}>
          {imgSrc ? (
            <img src={imgSrc} alt={photo.photo_filename} loading="lazy" />
          ) : (
            <div style={{ background: '#111', width: '100%', height: '100%' }} />
          )}
          <div className="photo-info-overlay">
            <div className="world-name-tag">{photo.world_name || "ワールド不明"}</div>
            <div style={{ opacity: 0.8, fontSize: '0.7rem' }}>{photo.timestamp}</div>
          </div>
        </div>
      </div>
    );
  }, [handleSelectPhoto, thumbnails, COLUMNS]);

  const gridCellProps = useMemo(() => ({ photos: filteredPhotos }), [filteredPhotos]);

  return (
    <div className="alpheratz-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h1>Alpheratz</h1>
          <div className="search-box">
            <input type="text" placeholder="ワールド・メモで検索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-box">
            <select value={filterWorld} onChange={e => setFilterWorld(e.target.value)}>
              <option value="">全てのワールド</option>
              {uniqueWorlds.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="stats">{filteredPhotos.length} Photos</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => refreshPhotos()}>更新</button>
          <button onClick={() => setShowSettings(!showSettings)}>⚙</button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <div className="close-btn" onClick={() => setShowSettings(false)}>×</div>
          <h3>設定</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#999' }}>写真フォルダパス</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={setting.photoFolderPath} readOnly />
              <button onClick={handleBrowseFolder}>参照</button>
            </div>
          </div>
        </div>
      )}

      <main className="viewer-main">
        {loading ? (
          <div style={{ padding: '2rem' }}>スキャン中...</div>
        ) : (
          <Grid<{ photos: PhotoRecord[] }>
            columnCount={COLUMNS}
            columnWidth={document.body.clientWidth / COLUMNS}
            defaultHeight={800}
            defaultWidth={1200}
            rowCount={Math.ceil(filteredPhotos.length / COLUMNS)}
            rowHeight={ITEM_HEIGHT}
            cellProps={gridCellProps}
            cellComponent={Cell}
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

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

              <div className="detail-row">
                <span className="detail-label">World</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span className="detail-value" style={{ fontWeight: 700, color: 'var(--accent)' }}>
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
              <div className="detail-row">
                <span className="detail-label">World ID</span>
                <span className="detail-value" style={{ fontSize: '0.75rem', opacity: 0.6 }}>{selectedPhoto.world_id || "Unknown"}</span>
              </div>

              <div className="memo-area">
                <span className="detail-label">Memo</span>
                <textarea
                  value={memoText}
                  onChange={e => setMemoText(e.target.value)}
                  placeholder="メモを入力..."
                />
                <button onClick={handleSaveMemo}>保存</button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
