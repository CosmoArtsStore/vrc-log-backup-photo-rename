import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export interface InputField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

interface InputModalProps {
  title: string;
  description?: string;
  fields: InputField[];
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}

/**
 * 入力フォーム付きモーダル。任意個のテキストフィールドを表示し、
 * 送信時に { [key]: value } のオブジェクトを返す。
 * Radix Dialog ベースでフォーカス管理・Esc 閉じ対応。
 */
export const InputModal: React.FC<InputModalProps> = ({
  title,
  description,
  fields,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = '登録',
  cancelLabel = 'キャンセル',
}) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = (initialValues && initialValues[f.key]) ?? '';
    return init;
  });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // モーダル表示後に最初のフィールドにフォーカス
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canSubmit = fields
    .filter((f) => f.required !== false)
    .every((f) => (values[f.key] ?? '').trim().length > 0);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const trimmed: Record<string, string> = {};
    for (const f of fields) trimmed[f.key] = values[f.key].trim();
    onSubmit(trimmed);
  }, [canSubmit, fields, values, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  const modalContainer =
    typeof document !== 'undefined'
      ? (document.getElementById('modal-root') ?? document.body)
      : undefined;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal container={modalContainer}>
        <Dialog.Overlay className="modal-overlay">
          <Dialog.Content className="modal-content input-modal" onKeyDown={handleKeyDown}>
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="modal-message input-modal__desc">
                {description}
              </Dialog.Description>
            )}

            <div className="input-modal__fields">
              {fields.map((field, idx) => (
                <div key={field.key} className="input-modal__field">
                  <label className="form-label">{field.label}</label>
                  <input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type="text"
                    className="form-input"
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>

            <div className="modal-buttons">
              <button type="button" className="modal-btn-cancel" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className="btn-primary modal-btn-confirm"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {submitLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
