import { useState, useEffect, useCallback } from "react";
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
  Planetarium: () => (
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

type Section = "dashboard" | "planetarium" | "pleiades" | "jewelbox" | "database";

interface TableData {
  columns: string[];
  rows: string[][];
}

function App() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [pleiadesApps, setPleiadesApps] = useState<AppCard[]>([]);
  const [jewelBoxApps, setJewelBoxApps] = useState<AppCard[]>([]);
  const [toasts, setToasts] = useState<{ id: number, msg: string }[]>([]);
  const [planetariumRunning, setPlanetariumRunning] = useState(false);
  const [planetariumProgress, setPlanetariumProgress] = useState("");
  const [planetariumStatus, setPlanetariumStatus] = useState("");
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [storageStatus, setStorageStatus] = useState({ current: 0, limit: 0, percent: 0 });
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [currentTable, setCurrentTable] = useState("");
  const [tableData, setTableData] = useState<TableData>({ columns: [], rows: [] });

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
    const unlistenPlanetarium = listen("planetarium-progress", (event) => {
      const payload = event.payload as { status: string, progress: string, is_running: boolean };
      setPlanetariumStatus(payload.status);
      setPlanetariumProgress(payload.progress);
      setPlanetariumRunning(payload.is_running);
      if (!payload.is_running) {
        pollStorage();
      }
    });
    const unlistenPolaris = listen<boolean>("polaris-status", (event) => {
      setPolarisRunning(event.payload);
    });

    return () => {
      unlistenPlanetarium.then(f => f());
      unlistenPolaris.then(f => f());
    };
  }, [pollStorage]);

  const handleLaunch = async (app: AppCard) => {
    try {
      await invoke("launch_app", { path: app.path });
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

  const handleSync = async (force: boolean) => {
    try {
      setPlanetariumRunning(true);
      await invoke("launch_planetarium", { forceSync: force });
    } catch (e) {
      setPlanetariumRunning(false);
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

  const handleManualBackup = async () => {
    addToast("アーカイブへの自動同期を開始します...");
    try {
      const res: string = await invoke("execute_manual_backup");
      addToast(res);
    } catch (e) {
      addToast(`同期エラー: ${e}`);
    } finally {
      pollStorage();
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

  const handleDeleteTodayData = async () => {
    if (!window.confirm("今日分のデータを削除してもよろしいですか？（デバッグ用）")) return;
    try {
      const res: string = await invoke("delete_today_data");
      addToast(res);
    } catch (e) {
      addToast("エラー: " + String(e));
    }
  };

  const handleWipeDatabase = async () => {
    const confirm1 = window.confirm("【警告】データベースの全記録を完全に消去します。\nこの操作は取り消せません。続行しますか？");
    if (!confirm1) return;
    const confirm2 = window.confirm("本当によろしいですか？ログが再解析されるまで、統計や履歴はすべて空になります。");
    if (!confirm2) return;

    try {
      const res: string = await invoke("wipe_database");
      addToast(res);
    } catch (e) {
      addToast("エラー: " + String(e));
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
      await invoke("cancel_planetarium");
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
        {/* PLANETARIUM (TOP WIDE) */}
        <div className="feature-card wide" onClick={() => setActiveSection("planetarium")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Planetarium /></div>
            <div className="feature-title">Planetarium</div>
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
        <h2>Planetarium Control</h2>
        <p>VRChatの活動ログを解析し、精密なデータベースを構築します</p>
      </div>

      <div className="planetarium-grid">
        <div className="status-card">
          <div className="status-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: planetariumRunning ? '#10b981' : '#86868b' }} />
            エンジン ステータス
          </div>
          <div className="status-value">{planetariumRunning ? 'システム稼働中' : '待機中'}</div>
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

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '10px', background: 'rgba(93, 156, 236, 0.1)', borderRadius: '12px' }}>
            <Icons.Planetarium />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>Log Synchronization</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              ログを最新の状態に保つための基本操作
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>データベース更新 (Planetarium)</h4>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: '1.4' }}>
              Polarisが収集した新しいログのみを解析し、行動履歴データベースを効率的に更新します。
            </p>
            <button className="btn-action primary" style={{ width: '100%' }} onClick={() => handleSync(false)} disabled={planetariumRunning}>
              {planetariumRunning ? '処理中...' : 'インポート開始'}
            </button>
          </div>

          <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.02)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>ログ同期 (Polaris)</h4>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: '1.4' }}>
              VRChatのフォルダから最新のログを手動でアーカイブへコピーします。
            </p>
            <button
              className="btn-action"
              style={{ width: '100%', opacity: polarisRunning ? 0.6 : 1 }}
              onClick={() => !polarisRunning && handleManualBackup()}
              disabled={polarisRunning}
            >
              アーカイブへ同期
            </button>
          </div>
        </div>

        {planetariumRunning && (
          <div className="progress-container" style={{ marginTop: '2rem' }}>
            <div className="progress-info">
              <span>インポート進捗</span>
              <span>{planetariumProgress}</span>
            </div>
            <div className="progress-track" style={{ height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                className="progress-fill"
                style={{ height: '100%', background: 'var(--accent-gradient)', width: planetariumProgress.includes('%') ? planetariumProgress.split(' ').pop() : '0%', transition: 'width 0.3s' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{planetariumStatus}</p>
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

      <div className="warning-zone">
        <div className="warning-header">
          <Icons.Alert />
          <h4>デンジャーゾーン</h4>
        </div>
        <p className="danger-text">
          これらの操作はデータベースの整合性に影響を与えたり、データを永久に削除する可能性があります。<br />
          通常の使用では実行する必要はありません。
        </p>
        <div className="warning-actions">
          <button className="btn-action danger" onClick={() => handleSync(true)} disabled={planetariumRunning}>
            強制再同期 (Force Sync)
          </button>
          <button className="btn-action danger" onClick={handleDeleteTodayData}>
            今日分の記録を削除
          </button>
          <button className="btn-action danger" onClick={handleWipeDatabase} style={{ background: '#ef4444', color: 'white' }}>
            データベースを完全に初期化
          </button>
        </div>
      </div>
    </div>
  );

  const renderDatabase = () => (
    <div className="view-container" style={{ maxWidth: '100%', padding: '0 2rem' }}>
      <div className="back-link" onClick={() => setActiveSection("planetarium")}>
        <Icons.ArrowBack /> Planetariumに戻る
      </div>
      <div className="section-header">
        <h2>Database Browser</h2>
        <p>SQLite データベースの全テーブルを照会します (Read-Only)</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '2rem', height: '600px' }}>
        <div className="card" style={{ padding: '1rem', overflowY: 'auto' }}>
          <h4 style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem', textTransform: 'uppercase' }}>Tables</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {dbTables.map(t => (
              <div
                key={t}
                onClick={() => loadTableData(t)}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: currentTable === t ? 'var(--accent-gradient)' : 'transparent',
                  color: currentTable === t ? 'white' : 'var(--text-main)',
                  transition: 'all 0.2s'
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Table: {currentTable}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Showing last 100 rows</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: 'white', borderBottom: '2px solid var(--border)' }}>
                  {tableData.columns.map((col, i) => (
                    <th key={i} style={{ padding: '1rem 1.25rem', color: 'var(--text-dim)', borderRight: '1px solid #f1f5f9' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.length === 0 && (
                  <tr>
                    <td colSpan={tableData.columns.length} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                      No data found in this table.
                    </td>
                  </tr>
                )}
                {tableData.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: '1rem 1.25rem', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{cell}</td>
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
      case "planetarium": return renderPlanetarium();
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
