import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Grid } from "react-window";
import "./App.css";

interface Photo {
  photo_filename: string;
  photo_path: string;
  world_id: string | null;
  world_name: string;
  timestamp: string;
  memo: string;
}

interface ScanProgress {
  processed: number;
  total: number;
  current_world: string;
}

const Icons = {
  Refresh: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" /></svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.35 19.43,11.03L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.97 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.32 14.87,5.07L14.49,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.51,2.42L9.13,5.07C8.53,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.97 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11.03C4.53,11.35 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.95C7.96,18.34 8.53,18.68 9.13,18.93L9.51,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.49,21.58L14.87,18.93C15.47,18.68 16.04,18.34 16.56,17.95L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" /></svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" /></svg>
  ),
  Link: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z" /></svg>
  )
};

const PhotoCard = ({
  data,
  columnIndex,
  rowIndex,
  style,
  onSelect,
  columnCount,
}: {
  data: Photo[];
  columnIndex?: number;
  rowIndex?: number;
  style?: any;
  onSelect: (photo: Photo) => void;
  columnCount: number;
}) => {
  const index = (rowIndex ?? 0) * columnCount + (columnIndex ?? 0);
  const photo = data[index];
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    let isMounted = true;

    invoke<string>("create_thumbnail", { path: photo.photo_path })
      .then((path) => {
        if (isMounted) setThumbUrl(convertFileSrc(path));
      })
      .catch((err) => console.error("Thumbnail error:", err));

    return () => { isMounted = false; };
  }, [photo?.photo_path]);

  if (!photo) return null;

  return (
    <div style={style} className="photo-card-wrapper" onClick={() => onSelect(photo)}>
      <div className="photo-card">
        <div className="photo-thumb-container">
          {thumbUrl ? (
            <img src={thumbUrl} alt={photo.photo_filename} className="photo-thumb" />
          ) : (
            <div className="photo-thumb-skeleton" />
          )}
        </div>
        <div className="photo-info">
          <div className="photo-world">{photo.world_name}</div>
          <div className="photo-date">{photo.timestamp}</div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "completed" | "error">("idle");
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "" });
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [localMemo, setLocalMemo] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<{ id: number, msg: string }[]>([]);

  const addToast = useCallback((msg: string, duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);
  const [photoFolderPath, setPhotoFolderPath] = useState("");
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const columnWidth = 260;
  const columnCount = Math.max(1, Math.floor((windowSize.width - 40) / columnWidth));
  const gridWidth = columnCount * columnWidth;

  const [searchQuery, setSearchQuery] = useState("");
  const [worldFilter, setWorldFilter] = useState("all");

  const worldNameList = useMemo(() => {
    const names = Array.from(new Set(photos.map((p) => p.world_name)));
    return names.sort();
  }, [photos]);

  const loadPhotos = useCallback(async () => {
    try {
      const results = await invoke<Photo[]>("get_photos", {
        worldQuery: searchQuery || null,
        worldExact: worldFilter === "all" ? null : worldFilter,
      });
      setPhotos(results);
    } catch (err) {
      console.error("Failed to load photos:", err);
    }
  }, [searchQuery, worldFilter]);

  const startScan = useCallback(async () => {
    setScanStatus("scanning");
    setScanProgress({ processed: 0, total: 0, current_world: "" });
    try {
      await invoke("initialize_scan");
    } catch (err) {
      setScanStatus("error");
      console.error("Scan error:", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const setting = await invoke<any>("get_setting_cmd");
      setPhotoFolderPath(setting.photoFolderPath);
      startScan();
    };
    init();

    const unlistenProgress = listen<ScanProgress>("scan:progress", (event) => {
      setScanProgress(event.payload);
    });
    const unlistenCompleted = listen("scan:completed", () => {
      setScanStatus("completed");
    });
    const unlistenError = listen("scan:error", () => {
      setScanStatus("error");
    });

    return () => {
      unlistenProgress.then((f) => f());
      unlistenCompleted.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [startScan]);

  useEffect(() => {
    if (scanStatus === "completed") {
      loadPhotos();
    }
  }, [loadPhotos, scanStatus]);

  // Reload photos when filters change
  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      setPhotoFolderPath(selected);
      await invoke("save_setting_cmd", { setting: { photoFolderPath: selected } });
      startScan();
    }
  };

  const handleRegisterToStellaRecord = async () => {
    addToast("StellaRecord への連携を同期中...");
    try {
      const res: string = await invoke("register_to_stellarecord");
      addToast(res);
    } catch (err) {
      addToast("連携エラー: " + String(err));
    }
  };

  const handleSelectPhoto = useCallback((photo: Photo) => {
    setSelectedPhoto(photo);
    setLocalMemo(photo.memo);
  }, []);

  const handleSaveMemo = async () => {
    if (!selectedPhoto) return;
    setIsSavingMemo(true);
    try {
      await invoke("save_photo_memo", {
        filename: selectedPhoto.photo_filename,
        memo: localMemo,
      });
      setPhotos((prev) =>
        prev.map((p) =>
          p.photo_filename === selectedPhoto.photo_filename
            ? { ...p, memo: localMemo }
            : p
        )
      );
      setSelectedPhoto((prev) => (prev ? { ...prev, memo: localMemo } : null));
    } catch (err) {
      addToast("保存に失敗しました。");
    } finally {
      setIsSavingMemo(false);
    }
  };

  const handleOpenWorld = async () => {
    if (selectedPhoto?.world_id) {
      await invoke("open_world_url", { worldId: selectedPhoto.world_id });
    }
  };

  return (
    <div className="container" id="alpheratz-app">
      <header className="header">
        <div className="logo-group">
          <h1>Pleiades Alpheratz</h1>
          <span className="badge">写真メタデータ管理</span>
        </div>

        <div className="search-bar">
          <div className="input-group">
            <Icons.Search />
            <input
              type="text"
              placeholder="ワールド名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}>
            <option value="all">すべてのワールド</option>
            {worldNameList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="main-content">
        <div className="action-cards-grid">
          <div className="action-card" onClick={handleRegisterToStellaRecord}>
            <div className="action-icon"><Icons.Link /></div>
            <div className="action-info">
              <h3>Connect</h3>
              <p>StellaRecord 連携登録</p>
            </div>
          </div>
          <div className="action-card" onClick={startScan}>
            <div className="action-icon"><Icons.Refresh /></div>
            <div className="action-info">
              <h3>Refresh</h3>
              <p>写真を再スキャン</p>
            </div>
          </div>
          <div className="action-card" onClick={() => setShowSettings(true)}>
            <div className="action-icon"><Icons.Settings /></div>
            <div className="action-info">
              <h3>Settings</h3>
              <p>フォルダ設定</p>
            </div>
          </div>
        </div>
        {scanStatus === "scanning" && (
          <div className="overlay-loader">
            <div className="loader-content">
              <div className="spinner"></div>
              <h3>スキャン中...</h3>
              <div className="progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: scanProgress.total > 0 ? `${(scanProgress.processed / scanProgress.total) * 100}%` : '0%' }}
                  ></div>
                </div>
                <div className="progress-text">
                  {scanProgress.processed} / {scanProgress.total}
                  {scanProgress.current_world && <span className="current-world"> - {scanProgress.current_world}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {scanStatus === "completed" && photos.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>写真が見つかりません</h3>
            <p>フォルダ設定を確認してください。</p>
          </div>
        )}

        <div className="grid-center-container" style={{ display: 'flex', justifyContent: 'center', width: '100%', height: '100%' }}>
          <Grid
            columnCount={columnCount}
            columnWidth={columnWidth}
            rowCount={Math.ceil(photos.length / columnCount)}
            rowHeight={240}
            cellComponent={PhotoCard}
            cellProps={useMemo(() => ({
              data: photos,
              onSelect: handleSelectPhoto,
              columnCount
            }), [photos, handleSelectPhoto, columnCount])}
            style={{
              height: windowSize.height - 120,
              width: gridWidth
            }}
            className="photo-grid"
          />
        </div>
      </main>

      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPhoto(null)}>×</button>
            <div className="modal-body">
              <div className="modal-image-container">
                <img src={convertFileSrc(selectedPhoto.photo_path)} alt="" />
              </div>
              <div className="modal-info">
                <div className="info-header">
                  <h2 onClick={handleOpenWorld} style={{ cursor: selectedPhoto.world_id ? 'pointer' : 'default' }}>
                    {selectedPhoto.world_name} {selectedPhoto.world_id && "↗"}
                  </h2>
                  <div className="info-meta">
                    <span className="timestamp">{selectedPhoto.timestamp}</span>
                  </div>
                </div>
                <div className="memo-section">
                  <label>メモ</label>
                  <textarea
                    value={localMemo}
                    onChange={(e) => setLocalMemo(e.target.value)}
                    placeholder="メモを入力..."
                  />
                  <button className="save-button" onClick={handleSaveMemo} disabled={isSavingMemo}>
                    {isSavingMemo ? "保存中..." : "メモを保存"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
            <div className="modal-body" style={{ gridTemplateColumns: '1fr' }}>
              <div className="modal-info">
                <div className="info-header">
                  <h2>設定</h2>
                </div>
                <div className="memo-section">
                  <label>VRChat写真フォルダ</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" value={photoFolderPath} readOnly style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.03)' }} />
                    <button className="save-button" onClick={handleChooseFolder} style={{ width: '100px' }}>変更</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <div className="toast-icon">✨</div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
