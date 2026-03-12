import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

// --- Types ---

interface AppCard {
  name: string;
  description: string;
  path: string;
  icon_path?: string;
}

const Icons = {
  Analyze: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" /></svg>
  ),
  Alert: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" /></svg>
  ),
  Database: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M12,3C17.5,3 22,4.8 22,7V17C22,19.2 17.5,21 12,21C6.5,21 2,19.2 2,17V7C2,4.8 6.5,3 12,3M12,5C7,5 4,6.3 4,7C4,7.7 7,9 12,9C17,9 20,7.7 20,7C20,6.3 17,5 12,5M4,12C4,12.7 7,14 12,14C17,14 20,12.7 20,12V9.5C18.5,10.4 15.4,11 12,11C8.6,11 5.5,10.4 4,9.5V12M4,17C4,17.7 7,19 12,19C17,19 20,17.7 20,17V14.5C18.5,15.4 15.4,16 12,16C8.6,16 5.5,15.4 4,14.5V17Z" /></svg>
  ),
  Pleiades: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" /></svg>
  ),
  JewelBox: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M16,9H19L14,16L9,9H12V5H16M11,2H13V4H11V2M15,19V17H17V19H15M11,19V17H13V19H11M7,19V17H9V19H7Z" /></svg>
  ),
  Backup: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M19.35,10.04C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.04C2.34,8.36 0,10.91 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.04M19,18H6A4,4 0 0,1 2,14C2,11.95 3.53,10.24 5.56,10.03L6.63,9.92L7.13,8.97C8.08,7.14 9.94,6 12,6C14.65,6 16.96,7.84 17.42,10.45L17.71,12.1L19.38,12.22C20.91,12.33 22,13.63 22,15A3,3 0 0,1 19,18M13,13V16H11V13H8L12,9L16,13H13Z" /></svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" /></svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M12,2L14.47,7.29L20.24,8.13L16.06,12.2L17.05,17.94L12,15.29L6.95,17.94L7.94,12.2L3.76,8.13L9.53,7.29L12,2Z" /></svg>
  ),
  ArrowBack: () => (
    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>
  ),
  Folder: () => (
    <svg viewBox="0 0 24 24" className="icon-svg"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" /></svg>
  )
};

type Section = "dashboard" | "analyze" | "pleiades" | "jewelbox" | "database";

interface TableData {
  columns: string[];
  rows: string[][];
}

function App() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [pleiadesApps, setPleiadesApps] = useState<AppCard[]>([]);
  const [jewelBoxApps, setJewelBoxApps] = useState<AppCard[]>([]);
  const [toasts, setToasts] = useState<{ id: number, msg: string }[]>([]);
  const [analyzeRunning, setAnalyzeRunning] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [storageStatus, setStorageStatus] = useState({ current: 0, limit: 0, percent: 0 });
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [currentTable, setCurrentTable] = useState("");
  const [tableData, setTableData] = useState<TableData>({ columns: [], rows: [] });
  const [showEnhancedSyncModal, setShowEnhancedSyncModal] = useState(false);
  const [decompressMode, setDecompressMode] = useState(false);
  const [archiveFiles, setArchiveFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const isDraggingSelect = useRef(false);
  const dragMode = useRef<'select' | 'deselect'>('select');

  useEffect(() => {
    const handleMouseUp = () => { isDraggingSelect.current = false; };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  type DangerAction = "deleteToday" | "wipeDatabase";
  const [dangerModal, setDangerModal] = useState<{
    action: DangerAction;
    step: 1 | 2;
  } | null>(null);

  const addToast = useCallback((msg: string, duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const pollStorage = useCallback(async () => {
    try {
      const [current, limit]: [number, number] = await invoke("get_storage_status");
      const percent = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
      setStorageStatus({ current, limit, percent });
    } catch (e) {
      console.error("Storage update failed", e);
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const running: boolean = await invoke("get_polaris_status");
      setPolarisRunning(running);
    } catch (e) {
      console.error("Polling error", e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const pl: AppCard[] = await invoke("read_launcher_json", { section: "pleiades" });
      const jb: AppCard[] = await invoke("read_launcher_json", { section: "jewelbox" });
      setPleiadesApps(pl);
      setJewelBoxApps(jb);
      await pollStorage();
      await pollStatus();
    } catch (e) {
      console.error("Init failed", e);
    }
  }, [pollStorage, pollStatus]);

  useEffect(() => {
    loadAll();
    const interval_storage = setInterval(pollStorage, 30000);
    const interval_polaris = setInterval(pollStatus, 3000);
    return () => {
      clearInterval(interval_storage);
      clearInterval(interval_polaris);
    };
  }, [loadAll, pollStorage, pollStatus]);

  useEffect(() => {
    const unlistenAnalyze = listen("analyze-progress", (event) => {
      const payload = event.payload as { status: string, progress: string, is_running: boolean };
      setAnalyzeStatus(payload.status);
      setAnalyzeProgress(payload.progress);
      setAnalyzeRunning(payload.is_running);
      if (!payload.is_running) {
        pollStorage();
      }
    });

    const unlistenFinished = listen("analyze-finished", () => {
      setAnalyzeRunning(false);
      setAnalyzeStatus("待機中");
      setAnalyzeProgress("");
      pollStorage();
    });

    const unlistenPolaris = listen<boolean>("polaris-status", (event) => {
      setPolarisRunning(event.payload);
    });

    return () => {
      unlistenAnalyze.then(f => f());
      unlistenFinished.then(f => f());
      unlistenPolaris.then(f => f());
    };
  }, [pollStorage]);

  const handleLaunch = async (app: AppCard) => {
    try {
      await invoke("launch_external_app", { appPath: app.path });
      addToast(`${app.name} を起動しました`);
    } catch (e) {
      addToast(`エラー: ${e}`);
    }
  };

  const handleOpenFolder = async (app: AppCard) => {
    try {
      const dir = app.path.substring(0, app.path.lastIndexOf("\\"));
      await invoke("open_folder", { path: dir });
    } catch (e) {
      addToast(`エラー: ${e}`);
    }
  };

  const handleSync = async () => {
    try {
      setAnalyzeRunning(true);
      await invoke("launch_analyze", { mode: "import" });
    } catch (e) {
      setAnalyzeRunning(false);
      addToast(`解析エラー: ${e}`);
    }
  };

  const handleStartPolaris = async () => {
    try {
      const res: string = await invoke("start_polaris");
      addToast(res);
      pollStatus();
    } catch (e) {
      addToast(`起動失敗: ${e}`);
    }
  };

  const handleOpenEnhancedSync = async () => {
    try {
      const files: string[] = await invoke("list_archive_files");
      setArchiveFiles(files);
      setShowEnhancedSyncModal(true);
      setSelectedFiles(new Set());
      setDecompressMode(false);
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
    }
  };

  const handleFileAction = (e: React.MouseEvent, file: string, type: 'down' | 'enter') => {
    if (type === 'down') {
      if (e.shiftKey && lastSelected) {
        // Shift + Click 範囲選択
        const startIdx = archiveFiles.indexOf(lastSelected);
        const endIdx = archiveFiles.indexOf(file);
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          const range = archiveFiles.slice(min, max + 1);
          setSelectedFiles(prev => {
            const next = new Set(prev);
            range.forEach(f => next.add(f));
            return next;
          });
        }
        return;
      }

      isDraggingSelect.current = true;
      if (e.ctrlKey || e.metaKey) {
        dragMode.current = selectedFiles.has(file) ? 'deselect' : 'select';
      } else {
        if (!selectedFiles.has(file)) {
          setSelectedFiles(new Set([file]));
          dragMode.current = 'select';
        } else {
          dragMode.current = 'select';
        }
      }

      setSelectedFiles(prev => {
        const next = new Set<string>(e.ctrlKey || e.metaKey ? prev : (dragMode.current === 'select' ? prev : new Set<string>()));
        if (dragMode.current === 'select') next.add(file);
        else next.delete(file);
        return next;
      });
      setLastSelected(file);
    } else if (type === 'enter' && isDraggingSelect.current) {
      // マウスドラッグでなぞって選択/解除
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (dragMode.current === 'select') next.add(file);
        else next.delete(file);
        return next;
      });
      setLastSelected(file);
    }
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === archiveFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(archiveFiles));
    }
  };

  const handleExecuteEnhancedSync = async () => {
    if (selectedFiles.size === 0) return;
    try {
      setShowEnhancedSyncModal(false);
      setAnalyzeRunning(true);
      await invoke("launch_enhanced_import", { fileNames: Array.from(selectedFiles) });
    } catch (e) {
      setAnalyzeRunning(false);
      addToast(`強化同期エラー: ${e}`);
    }
  };

  const handleCompressLogs = async () => {
    addToast("アーカイブの圧縮を開始します (レベル3)...");
    try {
      const res: string = await invoke("compress_logs");
      addToast(res);
    } catch (e) {
      addToast(`圧縮エラー: ${e}`);
    } finally {
      pollStorage();
    }
  };

  const handleOpenDecompress = async () => {
    try {
      const files: string[] = await invoke("list_archive_files");
      setArchiveFiles(files);
      setShowEnhancedSyncModal(true);
      setSelectedFiles(new Set());
      setDecompressMode(true);
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
    }
  };

  const handleDecompress = async () => {
    if (selectedFiles.size === 0) return;
    try {
      setShowEnhancedSyncModal(false);
      const res: string = await invoke("decompress_logs", { fileNames: Array.from(selectedFiles) });
      addToast(res);
      pollStorage();
    } catch (e) {
      addToast(`展開エラー: ${e}`);
    } finally {
      setDecompressMode(false);
    }
  };

  const handleOpenDatabase = async () => {
    try {
      const tables: string[] = await invoke("get_db_tables");
      setDbTables(tables);
      setActiveSection("database");
      if (tables.length > 0) {
        loadTableData(tables[0]);
      }
    } catch (e) {
      addToast("DBエラー: " + String(e));
    }
  };

  const loadTableData = async (tableName: string) => {
    setCurrentTable(tableName);
    try {
      const data: TableData = await invoke("get_db_table_data", { tableName: tableName });
      setTableData(data);
    } catch (e) {
      addToast("データ読込エラー: " + String(e));
    }
  };

  const handleDeleteTodayData = () => {
    setDangerModal({ action: "deleteToday", step: 1 });
  };

  const handleWipeDatabase = () => {
    setDangerModal({ action: "wipeDatabase", step: 1 });
  };

  const executeDangerAction = async (action: DangerAction) => {
    setDangerModal(null);
    try {
      let res: string;
      if (action === "deleteToday") {
        res = await invoke("delete_today_data");
      } else {
        res = await invoke("wipe_database");
      }
      addToast(res);
    } catch (e) {
      addToast("エラー: " + String(e));
    }
  };

  const advanceDangerModal = () => {
    if (!dangerModal) return;
    if (dangerModal.action === "wipeDatabase" && dangerModal.step === 1) {
      setDangerModal({ ...dangerModal, step: 2 });
    } else {
      executeDangerAction(dangerModal.action);
    }
  };

  // --- Renderers ---
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // KB単位以下の値を気にするため、小数点2桁を維持しつつ、小さい単位でもしっかり見せる
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };



  const handleCancelSync = async () => {
    try {
      await invoke("cancel_analyze");
      addToast("解析を停止しました");
    } catch (e) {
      addToast(`停止エラー: ${e}`);
    }
  };

  const renderDashboard = () => (
    <div className="view-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">STELLA RECORD の各コアモジュールへアクセスします</p>
      </header>

      <div className="storage-card">
        <div className="storage-header">
          <div className="storage-title">
            <Icons.Sparkle /> Archive Storage
            <button className="btn-refresh-storage" onClick={pollStorage} title="更新">
              <Icons.Refresh />
            </button>
          </div>
          <div className="storage-stats">
            {formatSize(storageStatus.current)} /
            {Math.round(storageStatus.limit / (1024 * 1024 * 1024))} GB ({storageStatus.percent.toFixed(1)}%)
          </div>
        </div>
        <div className="storage-track">
          <div
            className={`storage-fill ${storageStatus.percent > 90 ? 'warning' : ''}`}
            style={{ width: `${storageStatus.percent}%` }}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        {/* ANALYZE (TOP WIDE) */}
        <div className="feature-card wide" onClick={() => setActiveSection("analyze")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Analyze /></div>
            <div className="feature-title">Analyze</div>
          </div>
          <p className="feature-desc">
            VRChatのログを精密に構成・解析し、あなたの足跡をデータベース化します。
          </p>
        </div>

        <div className="feature-card" onClick={() => setActiveSection("pleiades")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Pleiades /></div>
            <div className="feature-title">Pleiades</div>
          </div>
          <p className="feature-desc">
            CosmoArtsStore製の専用拡張ツール。
          </p>
        </div>

        <div className="feature-card" onClick={() => setActiveSection("jewelbox")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.JewelBox /></div>
            <div className="feature-title">JewelBox</div>
          </div>
          <p className="feature-desc">
            外部のお気に入りツール一括起動。
          </p>
        </div>
      </div>
    </div>
  );
  const renderPlanetarium = () => (
    <div className="view-container">
      <div className="back-link" onClick={() => setActiveSection("dashboard")}>
        <Icons.ArrowBack /> Dashboardに戻る
      </div>
      <div className="section-header">
        <h2>Analyze Control</h2>
        <p>VRChatの活動ログを解析し、精密なデータベースを構築します</p>
      </div>

      <div className="planetarium-grid">
        <div className="status-card">
          <div className="status-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: analyzeRunning ? '#10b981' : '#86868b' }} />
            エンジン ステータス
          </div>
          <div className="status-value">{analyzeRunning ? 'システム稼働中' : '待機中'}</div>
        </div>
        <div className="status-card">
          <div className="status-label">管理</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn-action primary" onClick={handleOpenDatabase} style={{ flex: 1 }}>
              <Icons.Database /> DB開く
            </button>
            <button className="btn-action danger" onClick={handleDeleteTodayData} style={{ flex: 1, padding: '0.5rem' }}>
              今日分削除
            </button>
          </div>
        </div>
      </div>

      {/* 主操作: 2列×2行グリッド */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '10px', background: 'rgba(93, 156, 236, 0.1)', borderRadius: '12px' }}>
            <Icons.Analyze />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>Log Synchronization</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              ログを最新の状態に保つための基本操作
            </p>
          </div>
        </div>

        <div className="sync-grid">
          {/* カード1: データベース更新 */}
          <div className="sync-card">
            <h4>データベース更新</h4>
            <p>Polarisが収集した新しいログのみを解析し、行動履歴DBを効率的に更新します。</p>
            <button className="btn-action primary" style={{ width: '100%' }} onClick={() => handleSync()} disabled={analyzeRunning}>
              {analyzeRunning ? '処理中...' : 'インポート開始'}
            </button>
          </div>

          {/* カード2: 圧縮 */}
          <div className="sync-card">
            <h4>ログアーカイブ最適化</h4>
            <p>過去のログを tar.zst で圧縮し、zstフォルダへ移動。圧縮後は元ファイルを削除します。</p>
            <button className="btn-action" style={{ width: '100%' }} onClick={handleCompressLogs}>
              過去ログを圧縮
            </button>
          </div>

          {/* カード3: zipからも読み取る */}
          <div className="sync-card">
            <h4>zipからも読み取る</h4>
            <p>圧縮済み (.tar.zst) を指定してDBを更新。複数選択・ Shift/Ctrl/ドラッグ対応。</p>
            <button
              className="btn-action primary"
              style={{ width: '100%' }}
              onClick={handleOpenEnhancedSync}
              disabled={analyzeRunning}
            >
              アーカイブを選択
            </button>
          </div>

          {/* カード4: 解凍 */}
          <div className="sync-card">
            <h4>アーカイブを解凍</h4>
            <p>zst フォルダ内の .tar.zst を archive フォルダに .txt として復元。展開確認後に .tar.zst を削除します。</p>
            <button
              className="btn-action"
              style={{ width: '100%' }}
              onClick={handleOpenDecompress}
            >
              解凍する
            </button>
          </div>
        </div>

        {analyzeRunning && (
          <div className="progress-container" style={{ marginTop: '2rem' }}>
            <div className="progress-info">
              <span>インポート進捗</span>
              <span>{analyzeProgress}</span>
            </div>
            <div className="progress-track" style={{ height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                className="progress-fill"
                style={{ height: '100%', background: 'var(--accent-gradient)', width: analyzeProgress.includes('%') ? analyzeProgress.split(' ').pop() : '0%', transition: 'width 0.3s' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{analyzeStatus}</p>
              <span
                style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                onClick={handleCancelSync}
              >
                停止
              </span>
            </div>
          </div>
        )}
      </div>

      {/* デンジャーゾーンはページ下部に配置—スクロールすると出てくる */}
      <div className="danger-zone-spacer" />
      <div className="warning-zone">
        <div className="warning-header">
          <div className="danger-badge">DANGER</div>
          <Icons.Alert />
          <h4>デンジャーゾーン</h4>
        </div>
        <p className="danger-text">
          これらの操作はデータベースの整合性に影響を与えたり、データを永久に削除する可能性があります。<br />
          通常の使用では実行する必要はありません。
        </p>
        <div className="warning-actions">
          <button className="btn-action danger" onClick={handleDeleteTodayData}>
            今日分の記録を削除
          </button>
          <button className="btn-action danger wipe" onClick={handleWipeDatabase}>
            データベースを完全に初期化
          </button>
        </div>
      </div>
    </div>
  );
  // App.tsx の renderDatabase() を以下に差し替えてください。
  // インラインの height: 600px を削除し、新しいCSSクラスを使用します。

  // App.tsx の renderDatabase() を以下に差し替えてください。
  // インラインの height: 600px を削除し、新しいCSSクラスを使用します。

  const renderDatabase = () => (
    <div className="view-container" style={{ maxWidth: '100%', padding: '0' }}>
      <div className="back-link" onClick={() => setActiveSection("analyze")}>
        <Icons.ArrowBack /> Analyzeに戻る
      </div>
      <div className="section-header">
        <h2>Database Browser</h2>
        <p>SQLite データベースの全テーブルを照会します (Read-Only)</p>
      </div>

      {/* height は CSS .db-layout で calc() により自動計算 */}
      <div className="db-layout">
        {/* サイドバー: テーブル一覧 */}
        <div className="db-sidebar">
          <div className="db-sidebar-label">Tables</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {dbTables.map(t => (
              <div
                key={t}
                onClick={() => loadTableData(t)}
                className={`db-table-item ${currentTable === t ? 'active' : ''}`}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* メインコンテンツ: テーブルデータ */}
        <div className="db-content">
          <div className="db-content-header">
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Table: {currentTable}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Showing last 100 rows</span>
          </div>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  {tableData.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.length === 0 && (
                  <tr>
                    <td colSpan={tableData.columns.length} className="db-empty">
                      No data found in this table.
                    </td>
                  </tr>
                )}
                {tableData.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard": return renderDashboard();
      case "analyze": return renderPlanetarium();
      case "pleiades": return (
        <div className="view-container">
          <div className="back-link" onClick={() => setActiveSection("dashboard")}>
            <Icons.ArrowBack /> Dashboardに戻る
          </div>
          <div className="section-header"><h2>Pleiades Tools</h2><p>Extension management</p></div>
          <div className="launcher-grid">
            {pleiadesApps.map(app => (
              <div key={app.name} className="launcher-card">
                <div className="launcher-main" onClick={() => handleLaunch(app)}>
                  <div className="launcher-icon">
                    {app.icon_path ? <img src={`https://asset.localhost/${app.icon_path}`} alt="" /> : <Icons.Pleiades />}
                  </div>
                  <div className="launcher-info"><h3>{app.name}</h3><p>{app.description}</p></div>
                </div>
                <button className="btn-folder" onClick={() => handleOpenFolder(app)} title="フォルダを開く"><Icons.Folder /></button>
              </div>
            ))}
          </div>
        </div>
      );
      case "jewelbox": return (
        <div className="view-container">
          <div className="back-link" onClick={() => setActiveSection("dashboard")}>
            <Icons.ArrowBack /> Dashboardに戻る
          </div>
          <div className="section-header"><h2>JewelBox</h2><p>External tool integration</p></div>
          <div className="launcher-grid">
            {jewelBoxApps.map(app => (
              <div key={app.name} className="launcher-card">
                <div className="launcher-main" onClick={() => handleLaunch(app)}>
                  <div className="launcher-icon"><Icons.JewelBox /></div>
                  <div className="launcher-info"><h3>{app.name}</h3><p>{app.description}</p></div>
                </div>
                <button className="btn-folder" onClick={() => handleOpenFolder(app)} title="フォルダを開く"><Icons.Folder /></button>
              </div>
            ))}
          </div>
        </div>
      );
      case "database": return renderDatabase();
      default: return renderDashboard();
    }
  };

  return (
    <div className="main-wrapper">
      <nav className="top-navigation">
        <div className="logo">
          <Icons.Sparkle /> STELLA RECORD
        </div>
        <div className={`survival-group ${polarisRunning ? 'online' : 'offline'}`}>
          <div className="status-lamp">
            <div className="lamp-dot" />
            <span>Polaris: {polarisRunning ? 'Active' : 'Standby'}</span>
          </div>
          {!polarisRunning && (
            <button className="btn-revive" onClick={handleStartPolaris}>
              Revive
            </button>
          )}
        </div>
      </nav>

      <main className="content-area">
        {renderSection()}
      </main>

      {showEnhancedSyncModal && (
        <div className="modal-overlay fullscreen-modal">
          <div className="modal-content archive-selector">
            <div className="archive-modal-header">
              <div>
                <h3>{decompressMode ? 'アーカイブを解凍' : 'zipからも読み取る'}</h3>
                <p>
                  {decompressMode
                    ? '解凍する .tar.zst ファイルを選択してください。展開確認後に .tar.zst は削除されます。'
                    : '取り込む圧縮ログ（.tar.zst）を選択してください。日付新しい順に並んでいます。'}
                </p>
              </div>
              <div className="archive-modal-meta">
                <span className="archive-count">{selectedFiles.size} / {archiveFiles.length} 件選択中</span>
                <button className="btn-action" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={handleSelectAll}>
                  {selectedFiles.size === archiveFiles.length ? '選択解除' : 'すべて選択'}
                </button>
              </div>
            </div>
            <div className="file-list-container fullscreen-list">
              {archiveFiles.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  zst フォルダ内にアーカイブファイルが見つかりません。<br />
                  先に「過去ログを圧縮」を実行してください。
                </div>
              ) : (
                archiveFiles.map(file => (
                  <div
                    key={file}
                    className={`file-item ${selectedFiles.has(file) ? 'selected' : ''}`}
                    onMouseDown={(e) => handleFileAction(e, file, 'down')}
                    onMouseEnter={(e) => handleFileAction(e, file, 'enter')}
                  >
                    <div className={`file-checkbox ${selectedFiles.has(file) ? 'checked' : ''}`}>
                      {selectedFiles.has(file) && '✓'}
                    </div>
                    <Icons.Folder />
                    <span className="file-name">{file}</span>
                    <span className="badge-zst">ZST</span>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-action" onClick={() => { setShowEnhancedSyncModal(false); setDecompressMode(false); }}>キャンセル</button>
              <button
                className={`btn-action ${decompressMode ? '' : 'primary'}`}
                disabled={selectedFiles.size === 0}
                onClick={decompressMode ? handleDecompress : handleExecuteEnhancedSync}
              >
                {selectedFiles.size > 0
                  ? decompressMode ? `${selectedFiles.size}件を解凍する` : `${selectedFiles.size}件を取り込み開始`
                  : decompressMode ? '解凍する' : '取り込み開始'}
              </button>
            </div>

          </div>
        </div>
      )}

      {dangerModal && (() => {
        const isStep2 = dangerModal.step === 2;
        return (
          <div className="modal-overlay" onClick={() => setDangerModal(null)}>
            <div className="modal-content danger-modal" onClick={e => e.stopPropagation()}>
              <div className="danger-modal-header">
                <div className="danger-modal-badge">
                  {isStep2 ? "⚠ FINAL WARNING" : "⚠ DANGER"}
                </div>
                <h3>
                  {dangerModal.action === "deleteToday"
                    ? "今日分の記録を削除"
                    : isStep2 ? "本当に初期化しますか？" : "データベースを完全に初期化"}
                </h3>
              </div>

              <div className="danger-modal-body">
                {dangerModal.action === "deleteToday" ? (
                  <p>今日（ローカル時刻）に記録された<strong>ワールド訪問データをすべて削除</strong>します。<br />この操作は<strong>取り消せません。</strong></p>
                ) : isStep2 ? (
                  <p>本当に実行しますか？<br />ログを再解析するまで<strong>統計・履歴・プレイヤー情報がすべて消去</strong>されます。</p>
                ) : (
                  <p>データベースの<strong>全記録を完全に消去</strong>します。<br />この操作は<strong>取り消せません。</strong>ログが再解析されるまで空になります。</p>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn-action" onClick={() => setDangerModal(null)}>キャンセル</button>
                <button className="btn-action danger-confirm" onClick={advanceDangerModal}>
                  {dangerModal.action === "deleteToday"
                    ? "削除する"
                    : isStep2 ? "完全に初期化する" : "続行する →"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <div className="toast-icon"><Icons.Sparkle /></div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
