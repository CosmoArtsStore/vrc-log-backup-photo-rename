/**
 * X（旧Twitter）ID をクリッカブルリンクとして表示するセルコンポーネント。
 * クリックで x.com のプロフィールページを規定ブラウザで開く。
 *
 * 使い方:
 *   <XLinkCell xId={user.x_id} />                    ← td 要素として
 *   <XLinkInline xId={user.x_id} />                  ← インライン span として
 */

import React, { useState, useCallback } from 'react';
import { openInDefaultBrowser } from '@/common/openExternal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { EXTERNAL_LINK } from '@/common/copy';

interface XLinkProps {
  xId: string;
  /** 追加CSSクラス */
  className?: string;
  /** 要注意人物ハイライト */
  isCaution?: boolean;
}

/**
 * テーブルセル（<td>）としてのXリンク。
 * DBViewPage や LotteryResultPage のテーブル行で使用。
 */
export const XLinkCell: React.FC<XLinkProps & {
  /** 外部で確認モーダルを管理する場合のコールバック */
  onConfirmOpen?: (url: string) => void;
}> = ({ xId, className, isCaution, onConfirmOpen }) => {
  const handle = xId ? xId.replace(/^@/, '') : '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handle) return;
    if (onConfirmOpen) {
      onConfirmOpen(`https://x.com/${handle}`);
    }
  };

  const cls = [
    'db-table__cell',
    className,
    isCaution ? 'db-table__cell--caution' : '',
    handle ? 'db-table__cell--link' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td className={cls} onClick={handleClick}>
      {handle ? `@${handle}` : '—'}
    </td>
  );
};

/**
 * インライン（<span>）としてのXリンク。
 * テーブルセル内で他のコンテンツと並べて使う場合に利用。
 * 自前で確認モーダルを内蔵する。
 */
export const XLinkInline: React.FC<XLinkProps> = ({ xId, className, isCaution }) => {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const handle = xId ? xId.replace(/^@/, '') : '';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!handle) return;
      setPendingUrl(`https://x.com/${handle}`);
    },
    [handle],
  );

  const handleConfirm = useCallback(async () => {
    if (pendingUrl) {
      await openInDefaultBrowser(pendingUrl);
    }
    setPendingUrl(null);
  }, [pendingUrl]);

  const cls = [
    'text-x-id',
    'text-x-id--clickable',
    isCaution ? 'text-x-id--caution' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <span className={cls} onClick={handleClick} role="link" tabIndex={0}>
        {handle ? `@${handle}` : '—'}
      </span>
      {pendingUrl && (
        <ConfirmModal
          title={EXTERNAL_LINK.MODAL_TITLE}
          message={`${pendingUrl}\n\nXのプロフィールページを開きますか？`}
          onConfirm={handleConfirm}
          onCancel={() => setPendingUrl(null)}
          confirmLabel={EXTERNAL_LINK.CONFIRM_LABEL}
          cancelLabel={EXTERNAL_LINK.CANCEL_LABEL}
          type="confirm"
        />
      )}
    </>
  );
};
