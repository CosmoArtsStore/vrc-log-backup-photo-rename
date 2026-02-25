import React, { useState, useCallback, useMemo } from 'react';
import { useAppContext } from '@/stores/AppContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { InputModal } from '@/components/InputModal';
import { ALERT, EXTERNAL_LINK } from '@/common/copy';
import { downloadTsv } from '@/common/downloadCsv';
import { openInDefaultBrowser } from '@/common/openExternal';
import { isUserNGForCast } from '@/features/matching/logics/ng-judgment';
import { MatchingService } from '@/features/matching/logics/matching-io';

function defaultLotteryFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `抽選結果_${yyyy}${mm}${dd}.tsv`;
}

export const LotteryResultPage: React.FC = () => {
  const {
    currentWinners,
    guaranteedWinners,
    setActivePage,
    repository,
    matchingSettings,
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    globalMatchingResult,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setGlobalMatchingError,
    allowM003EmptySeats,
  } = useAppContext();
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showNgCast, setShowNgCast] = useState(false);
  const [showRematchConfirm, setShowRematchConfirm] = useState(false);

  const guaranteedIds = new Set(guaranteedWinners.map(w => w.x_id));
  const casts = repository.getAllCasts();
  const ngCastByWinner = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const user of currentWinners) {
      const names: string[] = [];
      for (const cast of casts) {
        if (isUserNGForCast(user, cast, matchingSettings.ngJudgmentType)) names.push(cast.name);
      }
      if (names.length > 0) map.set(user.x_id, names);
    }
    return map;
  }, [currentWinners, casts, matchingSettings.ngJudgmentType]);
  const hasAnyNg = ngCastByWinner.size > 0;

  // 動的な希望列の数を算出（全員の中で最も多く希望を書いている人の数）
  const maxCastCols = useMemo(() => {
    if (currentWinners.length === 0) return 3; // デフォルトは3列
    let max = 0;
    for (const user of currentWinners) {
      // 実際の入力がある要素数のみカウント
      const actualCount = user.casts.filter(c => c && c.trim() !== '').length;
      if (actualCount > max) max = actualCount;
    }
    return Math.max(3, max); // 最低でも「希望1」「希望2」「希望3」は表示する（単一項目時の想定通り）
  }, [currentWinners]);

  const doExport = useCallback((filename: string) => {
    const name = filename.trim().endsWith('.tsv') ? filename.trim() : `${filename.trim()}.tsv`;

    // 現在の表の形に合わせたヘッダーを作成
    const header = ['ユーザー', 'X ID'];
    for (let i = 0; i < maxCastCols; i++) header.push(`希望${i + 1}`);
    header.push('区分');

    const rows = currentWinners.map((user) => {
      const isGuaranteed = guaranteedIds.has(user.x_id) || !!user.is_guaranteed;
      const row = [user.name || '', user.x_id || ''];
      for (let i = 0; i < maxCastCols; i++) row.push(user.casts[i] || '');
      row.push(isGuaranteed ? '確定' : '抽選');
      return row;
    });

    downloadTsv([header, ...rows], name || defaultLotteryFilename());
    setAlertMessage('TSV をダウンロードしました。');
  }, [currentWinners, maxCastCols]);

  const handleExportClick = () => {
    if (currentWinners.length === 0) {
      setAlertMessage(ALERT.NO_WINNERS_EXPORT);
      return;
    }
    setShowExportModal(true);
  };

  const handleExportSubmit = (values: Record<string, string>) => {
    doExport(values.filename?.trim() || defaultLotteryFilename());
    setShowExportModal(false);
  };

  const executeMatchingAndNavigate = useCallback(() => {
    const runOptions = {
      rotationCount,
      totalTables: totalTables,
      usersPerTable: matchingTypeCode === 'M003' ? usersPerTable : undefined,
      castsPerRotation: matchingTypeCode === 'M003' ? castsPerRotation : undefined,
    };

    const result = MatchingService.runMatching(
      currentWinners,
      repository.getAllCasts(),
      matchingTypeCode,
      runOptions,
      matchingSettings.ngJudgmentType,
      matchingSettings.ngMatchingBehavior,
    );

    if (result.ngConflict) {
      setGlobalMatchingResult(null);
      setGlobalTableSlots(undefined);
      setGlobalMatchingError(
        'NGユーザーを排除できる組み合わせが見つかりませんでした。\n\n' +
        '以下のいずれかの対応を行ってください:\n' +
        '・抽選をやり直す\n' +
        '・NGの原因となるキャストを欠席にする\n' +
        '・NGユーザー設定を見直す'
      );
    } else {
      setGlobalMatchingResult(result.userMap);
      setGlobalTableSlots(result.tableSlots);
      setGlobalMatchingError(null);
    }

    setActivePage('matching');
  }, [
    currentWinners,
    repository,
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    matchingSettings,
    allowM003EmptySeats,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setGlobalMatchingError,
    setActivePage
  ]);

  const handleStartMatching = useCallback(() => {
    if (currentWinners.length === 0) return;

    if (globalMatchingResult && globalMatchingResult.size > 0) {
      setShowRematchConfirm(true);
    } else {
      executeMatchingAndNavigate();
    }
  }, [currentWinners.length, globalMatchingResult, executeMatchingAndNavigate]);

  return (
    <div className="fade-in page-wrapper">
      <header className="page-header" style={{ marginBottom: '16px' }}>
        <h1 className="page-header-title page-header-title--lg">マッチング構成確認</h1>
        <p className="page-header-subtitle">当選者と希望キャストを再度確認してください</p>
      </header>

      <div className="table-container">
        <table style={{ minWidth: '800px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
              <th className="table-header-cell">ユーザー</th>
              <th className="table-header-cell">X ID</th>
              {Array.from({ length: maxCastCols }).map((_, i) => (
                <th key={i} className="table-header-cell">希望{i + 1}</th>
              ))}
              {showNgCast && <th className="table-header-cell">NGキャスト</th>}
            </tr>
          </thead>
          <tbody>
            {currentWinners.length === 0 ? (
              <tr>
                <td colSpan={showNgCast ? 2 + maxCastCols + 1 : 2 + maxCastCols} className="table-cell" style={{ padding: '32px', textAlign: 'center', color: 'var(--discord-text-muted)' }}>
                  まだ抽選が行われていません。左メニューの「抽選条件」から抽選を実行してください。
                </td>
              </tr>
            ) : (
              currentWinners.map((user, index) => {
                const isGuaranteed = guaranteedIds.has(user.x_id) || !!user.is_guaranteed;
                const ngCasts = showNgCast ? (ngCastByWinner.get(user.x_id) ?? []) : [];
                return (
                  <tr
                    key={`${user.x_id ?? user.name ?? ''}-${index}`}
                    style={{
                      color: isGuaranteed ? 'var(--discord-accent-gold)' : undefined
                    }}
                  >
                    <td className="table-cell" style={{ fontSize: '14px', fontWeight: isGuaranteed ? 'bold' : 'normal' }}>
                      {user.name}
                    </td>
                    <td
                      className="table-cell text-x-id--clickable"
                      style={{ fontSize: '13px', color: isGuaranteed ? 'var(--discord-accent-gold)' : 'var(--discord-text-link)', cursor: user.x_id ? 'pointer' : 'default' }}
                      onClick={() => {
                        const handle = user.x_id?.replace(/^@/, '');
                        if (handle) setPendingUrl(`https://x.com/${handle}`);
                      }}
                    >
                      {user.x_id ? `@${user.x_id.replace(/^@/, '')}` : '—'}
                    </td>
                    {Array.from({ length: maxCastCols }).map((_, i) => (
                      <td key={i} className="table-header-cell" style={{ fontSize: '13px', fontWeight: 'normal' }}>
                        {user.casts[i] || '—'}
                      </td>
                    ))}
                    {showNgCast && (
                      <td className="table-cell" style={{ fontSize: '12px', color: 'var(--discord-accent-red)' }}>
                        {ngCasts.length > 0 ? ngCasts.join(', ') : '—'}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasAnyNg && (
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowNgCast((v) => !v)}
          >
            {showNgCast ? 'NGキャストを非表示' : '枠外にNGキャストを表示'}
          </button>
        </div>
      )}
      <div
        style={{
          marginTop: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '8px',
          maxWidth: '480px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <button
          onClick={handleExportClick}
          style={{
            padding: '10px 24px',
            borderRadius: '4px',
            backgroundColor: 'var(--discord-bg-secondary)',
            color: 'var(--discord-text-normal)',
            border: '1px solid var(--discord-border)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: currentWinners.length === 0 ? 'not-allowed' : 'pointer',
            opacity: currentWinners.length === 0 ? 0.6 : 1,
          }}
          disabled={currentWinners.length === 0}
        >
          抽選結果をTSVでダウンロード
        </button>
        {showExportModal && (
          <InputModal
            title="抽選結果のダウンロード"
            description="ファイル名を入力してください（UTF-8 BOMなし TSV）"
            fields={[{ key: 'filename', label: 'ファイル名', required: false }]}
            initialValues={{ filename: defaultLotteryFilename() }}
            onSubmit={handleExportSubmit}
            onCancel={() => setShowExportModal(false)}
            submitLabel="ダウンロード"
            cancelLabel="キャンセル"
          />
        )}
        <button
          onClick={handleStartMatching}
          style={{
            padding: '10px 24px',
            borderRadius: '4px',
            backgroundColor: 'var(--discord-accent-green)',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: '15px',
            cursor: currentWinners.length === 0 ? 'not-allowed' : 'pointer',
            opacity: currentWinners.length === 0 ? 0.6 : 1,
          }}
          disabled={currentWinners.length === 0}
        >
          マッチング開始
        </button>
      </div>

      {pendingUrl && (
        <ConfirmModal
          title={EXTERNAL_LINK.MODAL_TITLE}
          message={`${pendingUrl}\n\nXのプロフィールページを開きますか？`}
          onConfirm={async () => {
            await openInDefaultBrowser(pendingUrl);
            setPendingUrl(null);
          }}
          onCancel={() => setPendingUrl(null)}
          confirmLabel={EXTERNAL_LINK.CONFIRM_LABEL}
          cancelLabel={EXTERNAL_LINK.CANCEL_LABEL}
          type="confirm"
        />
      )}

      {showRematchConfirm && (
        <ConfirmModal
          title="再マッチングの確認"
          message={"前回のマッチング結果が残っていますが再度マッチングを行いますか？\n※前回のマッチング結果は削除されます"}
          onConfirm={() => {
            setShowRematchConfirm(false);
            executeMatchingAndNavigate();
          }}
          onCancel={() => setShowRematchConfirm(false)}
          confirmLabel="OK"
          cancelLabel="キャンセル"
          type="confirm"
        />
      )}

      {alertMessage && (
        <ConfirmModal
          message={alertMessage}
          onConfirm={() => setAlertMessage(null)}
          confirmLabel="OK"
          type="alert"
        />
      )}
    </div>
  );
};
