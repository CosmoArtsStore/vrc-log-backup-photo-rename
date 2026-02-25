import React, { useState, useEffect } from 'react';
import { Menu, X, HelpCircle, Database, Users } from 'lucide-react';
import { invoke } from '@/tauri';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { CastNgManagementPage } from '@/features/cast-ng-management/CastNgManagementPage';
import { EventManagementPage } from '@/features/event-management/EventManagementPage';
import { GuidePage } from '@/features/guide/GuidePage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmModal } from '@/components/ConfirmModal';
import { HeaderLogo } from '@/components/HeaderLogo';
import { useAppContext, type PageType } from '@/stores/AppContext';
import { mapRowToUserBeanWithMapping } from '@/common/sheetParsers';
import { isTauri } from '@/tauri';
import { NAV, IMPORT_OVERWRITE } from '@/common/copy';
import { STORAGE_KEYS } from '@/common/config';
import '@/common.css';
import '@/css/layout.css';
import { ThemeSelector } from '@/components/ThemeSelector';

export const AppContainer: React.FC = () => {
  const {
    activePage,
    setActivePage,
    repository,
    currentWinners,
    setCurrentWinners,
    themeId,
    setThemeId,
    setIsLotteryUnlocked,
  } = useAppContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [columnCheckError, setColumnCheckError] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showDirSetupConfirm, setShowDirSetupConfirm] = useState(false);
  const [setupEventName, setSetupEventName] = useState('stargazer');
  /** TSV取り込みで既存応募データがあるときに確認用に保持する取り込み予定データ */
  const [pendingImport, setPendingImport] = useState<{
    rows: string[][];
    mapping: import('@/common/importFormat').ColumnMapping;
    options?: import('@/common/sheetParsers').MapRowOptions;
  } | null>(null);

  /** キャスト一覧を cast.json 新形式（is_attend/ng_username/ng_userid）で保存する */
  const persistCastData = async (casts: import('@/common/types/entities').CastBean[]) => {
    if (!isTauri()) return;
    try {
      const payload = casts.map((c) => ({
        name: c.name,
        is_attend: c.is_present,
        urls: c.contact_urls ?? [],
        ng_username: (c.ng_entries ?? []).map((e) => e.username ?? ''),
        ng_userid: (c.ng_entries ?? []).map((e) => (e.accountId ? `@${String(e.accountId).replace(/^@/, '')}` : '')),
      }));
      const content = JSON.stringify({ casts: payload });
      await invoke('write_cast_db_json', { content });
    } catch (e) {
      console.error('キャストデータの保存に失敗しました', e);
    }
  };

  /** キャストデータを LocalAppData の JSON DB から読み込む */
  const loadCastFromLocal = React.useCallback(async () => {
    if (!isTauri()) return;
    try {
      const content = await invoke<string>('read_cast_db_json');
      const data = JSON.parse(content) as { casts?: Record<string, unknown>[] };
      const casts = Array.isArray(data.casts) ? data.casts : [];
      const normalized = casts.map((c) => {
        const is_present = c.is_attend !== undefined ? Boolean(c.is_attend) : Boolean(c.is_present);
        let ng_entries: import('@/common/types/entities').NGUserEntry[] | undefined;
        const rawEntries = Array.isArray(c.ng_entries) ? c.ng_entries : [];
        if (rawEntries.length > 0) {
          ng_entries = rawEntries.map((e) => {
            if (!e || typeof e !== 'object') return null;
            const o = e as Record<string, unknown>;
            const username = typeof o.username === 'string' ? o.username.trim() || undefined : undefined;
            const accountId = typeof o.accountId === 'string' ? o.accountId.trim() || undefined : undefined;
            if (!username && !accountId) return null;
            return { username, accountId };
          }).filter(Boolean) as import('@/common/types/entities').NGUserEntry[];
        } else {
          const ng_username = Array.isArray(c.ng_username) ? (c.ng_username as string[]) : Array.isArray(c.ng_usersname) ? (c.ng_usersname as string[]) : [];
          const ng_userid = Array.isArray(c.ng_userid) ? (c.ng_userid as string[]) : Array.isArray(c.ng_usersid) ? (c.ng_usersid as string[]) : [];
          if (ng_username.length > 0 || ng_userid.length > 0) {
            const maxLen = Math.max(ng_username.length, ng_userid.length);
            ng_entries = Array.from({ length: maxLen }, (_, i) => ({
              username: ng_username[i]?.trim() || undefined,
              accountId: (ng_userid[i] ?? '').toString().trim().replace(/^@/, '') || undefined,
            })).filter((e) => e.username || e.accountId);
          }
        }
        const ng_users = Array.isArray(c.ng_users) ? (c.ng_users as string[]) : [];
        const contact_urls = Array.isArray(c.urls)
          ? (c.urls as string[]).map((u) => String(u).trim()).filter(Boolean)
          : typeof c.url === 'string' && c.url.trim()
            ? [c.url.trim()]
            : undefined;
        return {
          name: String(c.name ?? ''),
          is_present,
          contact_urls: contact_urls?.length ? contact_urls : undefined,
          ng_users,
          ng_entries: ng_entries?.length ? ng_entries : undefined,
        };
      });
      repository.saveCasts(normalized as import('@/common/types/entities').CastBean[]);
    } catch (e) {
      console.warn('キャストデータの読み込みをスキップしました:', e);
    }
  }, [repository]);

  /** 起動時に Tauri 内なら LocalAppData の JSON DB（cast/cast.json）からキャストを読み込む。新形式(is_attend/ng_username/ng_userid/url)と旧形式の両方に対応 */
  useEffect(() => {
    if (!isTauri()) return;
    // ディレクトリが存在する場合のみ読み込み実行
    invoke<boolean>('check_app_dirs_exist')
      .then((exists) => {
        if (exists) {
          loadCastFromLocal();
        }
      })
      .catch(() => {
        console.warn('ディレクトリ確認失敗');
      });
  }, [loadCastFromLocal]);

  /** 起動時にフォルダ存在確認。初回はモーダル表示、2回目以降は消えている分を自動で作成 */
  useEffect(() => {
    if (!isTauri()) return;
    const checkDirs = async () => {
      try {
        const exists = await invoke<boolean>('check_app_dirs_exist');
        if (!exists) {
          setShowDirSetupConfirm(true);
        } else {
          await invoke('ensure_app_dirs');
        }
      } catch (e) {
        console.warn('フォルダ存在確認に失敗:', e);
      }
    };
    checkDirs();
  }, []);

  const handleDirSetupConfirm = async () => {
    try {
      const eventName = setupEventName.trim() || 'stargazer';
      await invoke('set_current_event', { eventName });
      await invoke('ensure_app_dirs');
      setShowDirSetupConfirm(false);
      // ディレクトリ作成後、キャストデータを読み込む
      await loadCastFromLocal();
    } catch (e) {
      setAlertMessage(`フォルダの作成に失敗しました: ${e}`);
      setShowDirSetupConfirm(false);
    }
  };

  /** ファイル選択で取り込んだ応募データ行とカラムマッピングで保存して DB 画面へ。既存の応募データ or 当選結果がある場合は上書き確認モーダルを表示。 */
  const handleImportUserRows = (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions
  ) => {
    const hasApplyUsers = repository.getAllApplyUsers().length > 0;
    const hasWinners = currentWinners.length > 0;
    if (hasApplyUsers || hasWinners) {
      setPendingImport({ rows, mapping, options });
      return;
    }
    applyImport(rows, mapping, options);
  };

  /** 実際に応募データを保存し DB 画面へ遷移（リセット＋取り込みまたはそのまま取り込み） */
  const applyImport = (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions
  ) => {
    const users = rows
      .map((row) =>
        mapRowToUserBeanWithMapping(row as unknown[], mapping, options)
      )
      .filter(
        (u) => u.name.trim() !== '' || u.x_id.trim() !== ''
      );
    repository.saveApplyUsers(users);
    setCurrentWinners([]);
    setIsLotteryUnlocked(false);
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEYS.SESSION);
    setActivePage('db');
  };

  const handleConfirmImportOverwrite = () => {
    if (!pendingImport) return;
    applyImport(pendingImport.rows, pendingImport.mapping, pendingImport.options);
    setPendingImport(null);
  };

  const sidebarButtons: { text: string; page: PageType; icon?: React.ReactNode }[] = [
    { text: NAV.DATA_MANAGEMENT, page: 'dataManagement', icon: <Database size={18} /> },
    { text: NAV.CAST_NG_MANAGEMENT, page: 'castNgManagement', icon: <Users size={18} /> },
    { text: 'イベント管理', page: 'eventManagement', icon: <Database size={18} /> },
    { text: NAV.GUIDE, page: 'guide', icon: <HelpCircle size={18} /> },
  ];

  const renderPage = () => {
    switch (activePage) {
      case 'guide':
        return <GuidePage />;
      case 'dataManagement':
        return <DataManagementPage onImportUserRows={handleImportUserRows} />;
      case 'castNgManagement':
        return <CastNgManagementPage onPersistCasts={persistCastData} />;
      case 'eventManagement':
        return <EventManagementPage />;
      default:
        return <DataManagementPage onImportUserRows={handleImportUserRows} />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="app-container" data-theme={themeId}>
        <div className="mobile-header">
          <HeaderLogo />
          <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-inner">
            <div className="sidebar-title">
              <HeaderLogo />
            </div>
            {sidebarButtons.map((button, index) => (
              <button
                key={index}
                className={`sidebar-button ${activePage === button.page ? 'active' : ''}`}
                onClick={() => {
                  setActivePage(button.page);
                  setIsMenuOpen(false);
                }}
                title={button.text}
              >
                {button.icon != null ? (
                  <>
                    {button.icon}
                    <span className="sidebar-button-label">{button.text}</span>
                  </>
                ) : (
                  button.text
                )}
              </button>
            ))}
            <div className="sidebar-block sidebar-block--push" />
            <div className="sidebar-block sidebar-theme-slider">
              <span className="sidebar-block-label">{NAV.SETTINGS}</span>
              <ThemeSelector themeId={themeId} setThemeId={setThemeId!} />
            </div>
          </div>
        </aside>
        {isMenuOpen && <div className="overlay" onClick={() => setIsMenuOpen(false)} />}
        {columnCheckError !== null && (
          <ConfirmModal type="alert" message={columnCheckError} onConfirm={() => setColumnCheckError(null)} confirmLabel="OK" />
        )}
        {alertMessage !== null && (
          <ConfirmModal type="alert" message={alertMessage} onConfirm={() => setAlertMessage(null)} confirmLabel="OK" />
        )}
        {showDirSetupConfirm && (
          <ConfirmModal
            type="confirm"
            title="初回起動"
            message={`データ保存のための初期設定を行います。イベント名（半角英数字）を入力してください。`}
            confirmLabel="開始する"
            cancelLabel="キャンセル"
            onConfirm={handleDirSetupConfirm}
            onCancel={() => setShowDirSetupConfirm(false)}
          >
            <div style={{ marginTop: '16px' }}>
              <input
                type="text"
                autoFocus
                placeholder="stargazer"
                value={setupEventName}
                onChange={(e) => setSetupEventName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--discord-bg-dark)',
                  border: '1px solid var(--discord-border)',
                  borderRadius: '4px',
                  color: 'var(--discord-text-normal)',
                  fontSize: '14px'
                }}
              />
            </div>
          </ConfirmModal>
        )}
        {pendingImport !== null && (
          <ConfirmModal
            type="confirm"
            title={IMPORT_OVERWRITE.MODAL_TITLE}
            message={IMPORT_OVERWRITE.MODAL_MESSAGE}
            confirmLabel={IMPORT_OVERWRITE.CONFIRM_LABEL}
            cancelLabel={IMPORT_OVERWRITE.CANCEL_LABEL}
            onConfirm={handleConfirmImportOverwrite}
            onCancel={() => setPendingImport(null)}
          />
        )}
        <main className="main-content">{renderPage()}</main>
        <div id="modal-root" />
      </div>
    </ErrorBoundary>
  );
};
