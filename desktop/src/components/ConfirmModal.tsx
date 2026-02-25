import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

/** ポップアップメッセージ用モーダル（alert / confirm でUI統一）。Radix Dialog ベースでフォーカス管理・Esc 閉じを提供。 */
interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  /** 省略時: type=alert → 「お知らせ」、type=confirm → 「確認」 */
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'confirm' | 'alert';
  /** message の下に追加で表示するカスタムコンテンツ */
  children?: React.ReactNode;
}

const DEFAULT_TITLE_ALERT = 'お知らせ';
const DEFAULT_TITLE_CONFIRM = '確認';

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  message,
  onConfirm,
  onCancel,
  title,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  type = 'confirm',
  children,
}) => {
  const displayTitle = title ?? (type === 'alert' ? DEFAULT_TITLE_ALERT : DEFAULT_TITLE_CONFIRM);
  const open = true;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (type === 'confirm' && onCancel) {
      onCancel();
    } else {
      onConfirm();
    }
  };

  const modalContainer =
    typeof document !== 'undefined' ? (document.getElementById('modal-root') ?? document.body) : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={modalContainer}>
        <Dialog.Overlay className="modal-overlay">
          <Dialog.Content className="modal-content">
            <Dialog.Title className="modal-title">{displayTitle}</Dialog.Title>
            <Dialog.Description className="modal-message">{message}</Dialog.Description>
            {children}
            <div className="modal-buttons">
              {type === 'confirm' && onCancel && (
                <button type="button" className="modal-btn-cancel" onClick={onCancel}>
                  {cancelLabel}
                </button>
              )}
              <button type="button" className="btn-primary modal-btn-confirm" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
