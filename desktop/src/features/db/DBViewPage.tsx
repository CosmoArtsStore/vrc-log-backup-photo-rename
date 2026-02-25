import React, { useMemo, useState, useCallback } from 'react';
import { useAppContext } from '@/stores/AppContext';
import type { UserBean } from '@/stores/AppContext';
import { DiscordTable, DiscordTableColumn } from '@/components/DiscordTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { isCautionUser, computeAutoCautionUsers } from '@/features/matching/logics/caution-user';
import { openInDefaultBrowser } from '@/common/openExternal';
import { EXTERNAL_LINK } from '@/common/copy';

/**
 * X IDセル専用コンポーネント
 */
const XLinkCell: React.FC<{
  xId: string | undefined;
  isCaution: boolean;
  onConfirmOpen: (url: string) => void;
  className?: string;
}> = ({ xId, isCaution, onConfirmOpen, className }) => {
  const handle = (xId != null && xId !== '') ? String(xId).replace(/^@/, '') : '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handle) return;
    onConfirmOpen(`https://x.com/${handle}`);
  };

  const cls = [
    'db-table__cell',
    isCaution ? 'db-table__cell--caution' : '',
    handle ? 'db-table__cell--link' : '',
    className || ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td className={cls} onClick={handleClick}>
      {handle ? `@${handle}` : '—'}
    </td>
  );
};

const DBViewPageComponent: React.FC = () => {
  const {
    repository,
    setActivePage,
    matchingSettings,
    setIsLotteryUnlocked,
  } = useAppContext();
  const rawUsers = repository.getAllApplyUsers();
  const userData = Array.isArray(rawUsers) ? rawUsers : [];
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<UserBean | null>(null);
  /** true = その他列も含め全列を表示（元データの通り）、false = 共通列のみ（ユーザー名・アカウントID(X)・希望キャスト） */
  const [showAllColumns, setShowAllColumns] = useState(false);

  const casts = repository.getAllCasts();
  const cautionList = useMemo(() => {
    const auto = computeAutoCautionUsers(
      casts,
      userData,
      matchingSettings.ngJudgmentType,
      matchingSettings.caution.autoRegisterThreshold,
    );
    const manual = matchingSettings.caution.cautionUsers.filter((c) => c.registrationType === 'manual');
    const key = (u: { username: string; accountId: string }) => `${u.username.trim().toLowerCase()}::${u.accountId.trim().toLowerCase()}`;
    const seen = new Set<string>();
    const out: typeof manual = [];
    for (const m of manual) {
      const k = key(m);
      if (!seen.has(k)) { seen.add(k); out.push(m); }
    }
    for (const a of auto) {
      const k = key(a);
      if (!seen.has(k)) { seen.add(k); out.push(a); }
    }
    return out;
  }, [casts, userData, matchingSettings.caution.cautionUsers, matchingSettings.caution.autoRegisterThreshold, matchingSettings.ngJudgmentType]);

  const showCautionWarning = cautionList.length > 0 && userData.some(
    (u) => isCautionUser(u, cautionList),
  );

  const handleRemoveFromList = useCallback(() => {
    if (!confirmRemoveUser) return;
    const next = userData.filter(
      (u) => !(u.x_id === confirmRemoveUser.x_id && u.name === confirmRemoveUser.name),
    );
    repository.saveApplyUsers(next);
    setConfirmRemoveUser(null);
  }, [confirmRemoveUser, userData, repository]);

  const handleConfirmOpen = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const handleOpenUrl = useCallback(async () => {
    if (pendingUrl) {
      await openInDefaultBrowser(pendingUrl);
      setPendingUrl(null);
    }
  }, [pendingUrl]);

  const handleCancelOpen = useCallback(() => {
    setPendingUrl(null);
  }, []);

  /** カスタム列のキー一覧（全ユーザーの raw_extra から出現順でユニーク化）。元データの列名のまま */
  const customColumnKeys = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const user of userData) {
      const raw = user.raw_extra;
      const extras = Array.isArray(raw) ? (raw as { key?: string; value?: string }[]) : [];
      for (const e of extras) {
        const k = e?.key != null ? String(e.key).trim() : '';
        if (k && !seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    return keys;
  }, [userData]);

  /** 希望キャスト列数：デフォルトは最大3、全て表示時は全件（最大長） */
  const maxCastCount = useMemo(() => {
    const actualMax = Math.max(1, ...userData.map((u) => (Array.isArray(u.casts) ? u.casts.length : 0)));
    return showAllColumns ? actualMax : Math.min(3, actualMax);
  }, [userData, showAllColumns]);

  const totalColumns =
    (showAllColumns ? 2 + maxCastCount + customColumnKeys.length : 2 + maxCastCount) + 1; // +1 は操作列
  const emptyRow = useMemo(
    () => (
      <tr>
        <td colSpan={totalColumns} className="db-table__cell db-table__cell--empty">
          データがありません。左メニューの「データ読取」からTSVファイルを取り込んでください。
        </td>
      </tr>
    ),
    [totalColumns],
  );

  const isCautionRow = useCallback(
    (user: UserBean) =>
      isCautionUser(user, cautionList),
    [cautionList],
  );

  const columns: DiscordTableColumn<(typeof userData)[number]>[] = useMemo(() => {
    const base: DiscordTableColumn<(typeof userData)[number]>[] = [];
    base.push({
      header: (
        <>
          アカウントID(X)
          <span className="db-table__th-hint">（クリックで遷移）</span>
        </>
      ),
      headerClassName: 'db-table__th db-table__th--sticky-left',
      renderCell: (user) => (
        <XLinkCell xId={user.x_id} isCaution={isCautionRow(user)} onConfirmOpen={handleConfirmOpen} className="db-table__cell--sticky-left" />
      ),
    });
    base.push({
      header: '応募者名',
      headerClassName: 'db-table__th',
      renderCell: (user) => <td className={`db-table__cell${isCautionRow(user) ? ' db-table__cell--caution' : ''}`}>{user.name ?? '—'}</td>,
    });
    base.push({
      header: 'VRCアカウント',
      headerClassName: 'db-table__th',
      renderCell: (user) => (
        <td className={`db-table__cell${isCautionRow(user) ? ' db-table__cell--caution' : ''}`}>
          {user.vrc_url ? (
            <span
              className="db-table__cell--link"
              onClick={(e) => { e.stopPropagation(); handleConfirmOpen(user.vrc_url!); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); e.stopPropagation();
                  handleConfirmOpen(user.vrc_url!);
                }
              }}
            >
              リンクを開く
            </span>
          ) : (
            '—'
          )}
        </td>
      ),
    });
    for (let i = 0; i < maxCastCount; i++) {
      const idx = i;
      base.push({
        header: `希望キャスト${idx + 1}`,
        headerClassName: 'db-table__th',
        renderCell: (user) => (
          <td className={`db-table__cell${isCautionRow(user) ? ' db-table__cell--caution' : ''}`}>
            {Array.isArray(user.casts) ? (user.casts[idx] ?? '—') : '—'}
          </td>
        ),
      });
    }
    if (showAllColumns && customColumnKeys.length > 0) {
      for (const k of customColumnKeys) {
        base.push({
          header: k,
          headerClassName: 'db-table__th db-table__th--custom',
          renderCell: (user: UserBean) => {
            const raw = user.raw_extra;
            const extras = Array.isArray(raw) ? (raw as { key?: string; value?: string }[]) : [];
            const entry = extras.find((e) => (e?.key ?? '').trim() === k);
            const val = entry?.value ?? '—';
            return (
              <td className={`db-table__cell db-table__cell--note${isCautionRow(user) ? ' db-table__cell--caution' : ''}`}>
                {val}
              </td>
            );
          },
        });
      }
    }

    const operationCol: DiscordTableColumn<(typeof userData)[number]> = {
      header: '',
      headerClassName: 'db-table__th',
      renderCell: (user) => {
        const caution = isCautionRow(user);
        return (
          <td className={`db-table__cell${caution ? ' db-table__cell--caution' : ''}`}>
            {caution ? (
              <button
                type="button"
                onClick={() => setConfirmRemoveUser(user)}
                className="db-view-remove-caution-btn"
                title="このユーザーをリストから削除"
                aria-label="リストから削除"
              >
                ❌
              </button>
            ) : (
              '—'
            )}
          </td>
        );
      },
    };
    return [...base, operationCol];
  }, [isCautionRow, handleConfirmOpen, customColumnKeys, showAllColumns, maxCastCount]);

  return (
    <div className="page-wrapper page-wrapper--flex" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header-row">
        <h1 className="page-header-title page-header-title--md">名簿データベース</h1>
        <button
          onClick={() => {
            setIsLotteryUnlocked(true);
            setActivePage('lotteryCondition');
          }}
          className="btn-accent-yellow"
        >
          抽選条件へ
        </button>
      </div>

      {showCautionWarning && (
        <div
          className="banner-muted banner-muted--danger"
          role="alert"
        >
          要注意人物が含まれています。該当行は赤でマークされ、右端の❌からリストから削除できます。
        </div>
      )}

      {customColumnKeys.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowAllColumns((prev) => !prev)}
            className="btn-secondary"
          >
            {showAllColumns ? '共通列のみに戻す' : '全て表示'}
          </button>
          <p className="form-inline-note" style={{ marginTop: 8, fontSize: 13 }}>
            {showAllColumns
              ? 'マッピングされなかった列を元データの列名のまま表示しています。横にスクロールできます。'
              : '「全て表示」で取り込み時の全列を元データの通り表示します。'}
          </p>
        </div>
      )}

      <DiscordTable
        columns={columns}
        rows={userData}
        containerClassName="table-container db-view-table-wrapper db-view-table-scroll"
        containerStyle={{
          overflow: 'auto',
          width: '100%',
          maxHeight: 'calc(100vh - 280px)'
        }}
        tableClassName="db-table db-table--fixed"
        emptyRow={emptyRow}
      />

      {pendingUrl && (
        <ConfirmModal
          type="confirm"
          title={EXTERNAL_LINK.MODAL_TITLE}
          message={`${EXTERNAL_LINK.MODAL_MESSAGE}\n\n${pendingUrl}`}
          confirmLabel={EXTERNAL_LINK.CONFIRM_LABEL}
          cancelLabel={EXTERNAL_LINK.CANCEL_LABEL}
          onConfirm={handleOpenUrl}
          onCancel={handleCancelOpen}
        />
      )}

      {confirmRemoveUser && (
        <ConfirmModal
          message="このユーザーをリストから削除しますか？"
          onConfirm={handleRemoveFromList}
          onCancel={() => setConfirmRemoveUser(null)}
          confirmLabel="削除する"
          type="confirm"
        />
      )}
    </div>
  );
};

export const DBViewPage = React.memo(DBViewPageComponent);