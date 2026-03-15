import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Icons } from "./components/Icons";
import { useAnalyzeState } from "./hooks/useAnalyzeState";
import { useArchiveSelection } from "./hooks/useArchiveSelection";
import { useDashboardState } from "./hooks/useDashboardState";
import { useToasts } from "./hooks/useToasts";
import type { AppCard, DangerAction, LogViewerData, Section, TableData } from "./types";

function App() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [currentTable, setCurrentTable] = useState("");
  const [tableData, setTableData] = useState<TableData>({ columns: [], rows: [] });
  const [showEnhancedSyncModal, setShowEnhancedSyncModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPendingArchiveModal, setShowPendingArchiveModal] = useState(false);
  const [modalMode, setModalMode] = useState<"import" | "viewer">("import");
  const [archiveFiles, setArchiveFiles] = useState<string[]>([]);
  const [showLogViewerModal, setShowLogViewerModal] = useState(false);
  const [logViewerData, setLogViewerData] = useState<LogViewerData | null>(null);
  const [archiveLimitDraft, setArchiveLimitDraft] = useState("1000");
  const [startupEnabledDraft, setStartupEnabledDraft] = useState(false);
  const [pendingArchiveLogCount, setPendingArchiveLogCount] = useState(0);

  const [dangerModal, setDangerModal] = useState<{
    action: DangerAction;
    step: 1 | 2;
  } | null>(null);

  const { toasts, addToast } = useToasts();
  const {
    registryApps,
    polarisRunning,
    managementSettings,
    storageStatus,
    pollStorage,
    pollStatus,
    saveManagementSettings,
  } = useDashboardState();
  const {
    analyzeRunning,
    analyzeProgress,
    analyzeStatus,
    setAnalyzeRunning,
    handleSync,
    handleCancelSync,
  } = useAnalyzeState(pollStorage, addToast);
  const {
    selectedFiles,
    clearSelection,
    handleFileAction,
    handleSelectAll,
  } = useArchiveSelection(archiveFiles);

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
      clearSelection();
      setModalMode("import");
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
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

  const handleOpenLogViewer = async () => {
    try {
      const files: string[] = await invoke("list_archive_files");
      setArchiveFiles(files);
      setShowEnhancedSyncModal(true);
      clearSelection();
      setModalMode("viewer");
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
    }
  };

  const handleOpenSelectedLogViewer = async () => {
    const [selected] = Array.from(selectedFiles);
    if (!selected) return;
    try {
      setShowEnhancedSyncModal(false);
      const data: LogViewerData = await invoke("read_archive_log_viewer", { fileName: selected });
      setLogViewerData(data);
      setShowLogViewerModal(true);
    } catch (e) {
      addToast(`ログ閲覧エラー: ${e}`);
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

  const openSettingsModal = () => {
    setArchiveLimitDraft(String(managementSettings.archive_limit_mb));
    setStartupEnabledDraft(managementSettings.startup_enabled);
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    const parsed = Number(archiveLimitDraft);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed % 100 !== 0) {
      addToast("archive 上限は 100MB 単位の正の数で指定してください。");
      return;
    }

    try {
      await saveManagementSettings(startupEnabledDraft, parsed);
      setShowSettingsModal(false);
      addToast("設定を保存しました。");
      pollStorage();
    } catch (e) {
      addToast(`設定保存に失敗しました: ${e}`);
    }
  };

  const handleStartupImport = async () => {
    try {
      setShowPendingArchiveModal(false);
      setAnalyzeRunning(true);
      const message: string = await invoke("launch_startup_archive_import");
      addToast(message);
    } catch (e) {
      setAnalyzeRunning(false);
      addToast(`起動時取り込みに失敗しました: ${e}`);
    }
  };

  useEffect(() => {
    const checkPendingArchiveLogs = async () => {
      try {
        const count: number = await invoke("get_pending_archive_log_count");
        setPendingArchiveLogCount(count);
        if (count > 0) {
          setShowPendingArchiveModal(true);
        }
      } catch (e) {
        console.error("Pending archive log check failed", e);
      }
    };

    checkPendingArchiveLogs();
  }, []);

  // --- Renderers ---
  const formatSize = (bytes: number) => {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
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
            {formatSize(storageStatus.current)} / {formatSize(storageStatus.limit)} ({storageStatus.percent.toFixed(1)}%)
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

        <div className="feature-card" onClick={() => setActiveSection("registry")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Pleiades /></div>
            <div className="feature-title">レジストリ</div>
          </div>
          <p className="feature-desc">
            登録済みツールを、ファーストパーティ製とサードパーティ製に分けて管理します。
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
            <button className="btn-action" onClick={openSettingsModal} style={{ flex: 1, padding: '0.5rem' }}>
              設定を開く
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

          {/* カード2: zstから読み取る */}
          <div className="sync-card">
            <h4>zstから取り込む</h4>
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

          {/* カード3: ログ閲覧 */}
          <div className="sync-card">
            <h4>ログを閲覧</h4>
            <p>圧縮済み (.tar.zst) を直接読み込み、ワールド移動・通知・参加離脱をハイライト表示します。</p>
            <button
              className="btn-action"
              style={{ width: '100%' }}
              onClick={handleOpenLogViewer}
            >
              ログを開く
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

    </div>
  );
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
      case "registry": return (
        <div className="view-container">
          <div className="back-link" onClick={() => setActiveSection("dashboard")}>
            <Icons.ArrowBack /> Dashboardに戻る
          </div>
          <div className="section-header"><h2>レジストリ</h2><p>登録済みツール一覧</p></div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>ファーストパーティ製</h3>
            <p style={{ color: "var(--text-dim)", marginTop: "0.35rem" }}>CosmoArtsStore 製ツール。</p>
            <div className="launcher-grid">
              {registryApps.fastparty.map(app => (
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

          <div className="card">
            <h3 style={{ marginTop: 0 }}>サードパーティ製</h3>
            <p style={{ color: "var(--text-dim)", marginTop: "0.35rem" }}>外部ツールや連携アプリ。</p>
            <div className="launcher-grid">
              {registryApps.thirdparty.map(app => (
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
          <button className="logo-gear-button" onClick={openSettingsModal} title="設定">
            <Icons.Gear />
          </button>
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
                <h3>{modalMode === "viewer" ? 'ログを閲覧' : 'zstから取り込む'}</h3>
                <p>
                  {modalMode === "viewer"
                    ? '閲覧する .tar.zst を1件選択してください。アプリ内で直接読み込み、ハイライト付きで表示します。'
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
                  起動時取り込み後の自動圧縮、または既存アーカイブを確認してください。
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
              <button className="btn-action" onClick={() => { setShowEnhancedSyncModal(false); setModalMode("import"); }}>キャンセル</button>
              <button
                className={`btn-action ${modalMode === "viewer" ? '' : 'primary'}`}
                disabled={selectedFiles.size === 0}
                onClick={modalMode === "viewer" ? handleOpenSelectedLogViewer : handleExecuteEnhancedSync}
              >
                {selectedFiles.size > 0
                  ? modalMode === "viewer" ? `${selectedFiles.size}件から閲覧する` : `${selectedFiles.size}件を取り込み開始`
                  : modalMode === "viewer" ? 'ログを開く' : '取り込み開始'}
              </button>
            </div>

          </div>
        </div>
      )}

      {showLogViewerModal && logViewerData && (
        <div className="modal-overlay fullscreen-modal">
          <div className="modal-content archive-selector log-viewer-modal">
            <div className="archive-modal-header">
              <div>
                <h3>ログビューア</h3>
                <p>{logViewerData.archive_name} / {logViewerData.source_name}</p>
              </div>
              <div className="archive-modal-meta">
                <span className="archive-count">{logViewerData.lines.length} 行</span>
              </div>
            </div>

            <div className="terminal-legend">
              <span className="legend-item category-world">WORLD</span>
              <span className="legend-item category-travel">MOVE</span>
              <span className="legend-item category-notification">NOTIFY</span>
              <span className="legend-item category-player_join">JOIN</span>
              <span className="legend-item category-player_left">LEFT</span>
              <span className="legend-item category-video">VIDEO</span>
              <span className="legend-item category-warning">WARN</span>
              <span className="legend-item category-error">ERROR</span>
              <span className="legend-item category-debug">DEBUG</span>
            </div>

            <div className="terminal-log-list">
              {logViewerData.lines.map((entry, index) => (
                <div key={`${index}-${entry.timestamp}`} className={`terminal-log-line category-${entry.category} level-${entry.level}`}>
                  <span className="terminal-log-time">{entry.timestamp || " "}</span>
                  <span className="terminal-log-text">{entry.raw_line}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-action" onClick={() => setShowLogViewerModal(false)}>
                閉じる
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

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>STELLA RECORD 設定</h3>
            <p>起動設定、DB 操作、archive ストレージ上限をここで管理します。</p>

            <div className="settings-section">
              <div>
                <div className="settings-label">ログイン時に起動</div>
                <div className="settings-help">Windows ログイン直後に STELLA RECORD を起動します。</div>
              </div>
              <button
                className={`btn-action ${startupEnabledDraft ? "primary" : ""}`}
                onClick={() => setStartupEnabledDraft((prev) => !prev)}
              >
                {startupEnabledDraft ? "有効" : "無効"}
              </button>
            </div>

            <div className="settings-section">
              <div>
                <div className="settings-label">archive 上限目安</div>
                <div className="settings-help">archive フォルダ全体の容量を MB 単位で監視します。100MB 単位で指定します。</div>
              </div>
              <div className="settings-input-row">
                <input
                  className="settings-number-input"
                  type="number"
                  min={100}
                  step={100}
                  value={archiveLimitDraft}
                  onChange={(event) => setArchiveLimitDraft(event.target.value)}
                />
                <span className="settings-unit">MB</span>
              </div>
            </div>

            <div className="settings-danger-box">
              <div className="settings-label danger-text-strong">データベース削除</div>
              <div className="settings-help">通常利用では不要です。削除後は再解析が必要です。</div>
              <div className="modal-actions settings-danger-actions">
                <button className="btn-action danger" onClick={handleDeleteTodayData}>
                  今日分削除
                </button>
                <button className="btn-action danger wipe" onClick={handleWipeDatabase}>
                  DBを完全初期化
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-action" onClick={() => setShowSettingsModal(false)}>
                閉じる
              </button>
              <button className="btn-action primary" onClick={handleSaveSettings}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showPendingArchiveModal && (
        <div className="modal-overlay">
          <div className="modal-content startup-choice-modal">
            <h3>archive に未圧縮ログがあります</h3>
            <p>
              `archive` フォルダに未取り込みの `.txt` ログが {pendingArchiveLogCount} 件あります。
              取り込み後は自動で `tar.zst` へ圧縮します。今すぐ処理しますか。
            </p>
            <div className="modal-actions">
              <button className="btn-action" onClick={() => setShowPendingArchiveModal(false)}>
                後で行う
              </button>
              <button className="btn-action primary" onClick={handleStartupImport}>
                取り込む
              </button>
            </div>
          </div>
        </div>
      )}


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
