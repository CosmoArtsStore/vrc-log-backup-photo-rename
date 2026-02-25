import React, { useState, useEffect } from 'react';
import {
  type ImportFlowStep,
  type ImportFlowChoice,
  getImportFlowStepIndex,
  IMPORT_FLOW_CHOICES,
  IMPORT_FLOW_DISABLED_REASON,
} from '@/features/importFlow';

interface ImportFlowModalProps {
  show: boolean;
  step: ImportFlowStep;
  canContinue: boolean;
  onClose: () => void;
  onConfirmChoice: (choice: ImportFlowChoice) => void;
  resultSheets: string[];
  selectedResultSheet: string;
  onSelectSheet: (name: string) => void;
  matchingMode: 'random' | 'rotation';
  onMatchingModeChange: (mode: 'random' | 'rotation') => void;
  onConfirmImportResult: () => void;
  onSkipImportResult: () => void;
  onConfirmNoResult: () => void;
  isImportingResult: boolean;
}

export const ImportFlowModal: React.FC<ImportFlowModalProps> = ({
  show,
  step,
  canContinue,
  onClose,
  onConfirmChoice,
  resultSheets,
  selectedResultSheet,
  onSelectSheet,
  matchingMode,
  onMatchingModeChange,
  onConfirmImportResult,
  onSkipImportResult,
  onConfirmNoResult,
  isImportingResult,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<ImportFlowChoice | null>(null);

  useEffect(() => {
    if (show && step === 'choice') setSelectedChoice(null);
  }, [show, step]);

  const handleChoiceOk = () => {
    if (selectedChoice === null) return;
    if (selectedChoice === 'continue' && !canContinue) return;
    onConfirmChoice(selectedChoice);
  };

  const canOk =
    selectedChoice !== null && (selectedChoice !== 'continue' || canContinue);

  if (!show) return null;

  const renderChoice = () => (
    <>
      <h2 className="modal-title">インポート方法を選択</h2>
      <p className="modal-message modal-message--block">
        前回のセッションが見つかりました。どのようにデータを取り込みますか？
      </p>

      <div className="btn-option-group form-group--mb-lg">
        {IMPORT_FLOW_CHOICES.map((opt) => {
          const disabled = opt.getDisabled(canContinue);
          const isSelected = selectedChoice === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`btn-option ${disabled ? 'btn-option--disabled' : ''} ${isSelected ? 'active' : ''}`}
              onClick={disabled ? undefined : () => setSelectedChoice(opt.id)}
              disabled={disabled}
            >
              <div>
                <div>{opt.label}</div>
                <div className="btn-option-status">{opt.description}</div>
              </div>
              {opt.id === 'continue' && disabled && (
                <span className="btn-option-status">
                  {IMPORT_FLOW_DISABLED_REASON.continue}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="modal-buttons">
        <button type="button" className="modal-btn-cancel btn-secondary" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn-primary modal-btn-confirm"
          onClick={handleChoiceOk}
          disabled={!canOk}
        >
          OK
        </button>
      </div>
    </>
  );

  const renderLoading = () => (
    <>
      <h2 className="modal-title">保存した抽選結果を読み込んでいます</h2>
      <div className="import-loading-message">
        <p className="import-loading-message__text">
          スプレッドシートから応募者リストとキャストリストを取得中です…
        </p>
        <p className="import-loading-dots" aria-hidden>
          読み込み中...
        </p>
      </div>
    </>
  );

  const renderResultStep = () => (
    <>
      <h2 className="modal-title">既存の抽選結果を取り込みますか？</h2>
      <p className="modal-message modal-message--block">
        このブックには過去の抽選結果シートが見つかりました。読み込むシートとマッチング方式を選択できます。
      </p>

      <div className="form-group form-group--mb-sm">
        <label className="form-label">抽選結果シート</label>
        <select
          value={selectedResultSheet}
          onChange={(e) => onSelectSheet(e.target.value)}
          className="form-input"
        >
          {resultSheets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group form-group--mb-md">
        <label className="form-label">マッチング方式</label>
        <div className="btn-toggle-group">
          <button
            type="button"
            onClick={() => onMatchingModeChange('random')}
            className={`btn-toggle ${matchingMode === 'random' ? 'active' : ''}`}
          >
            ランダム（希望優先）
          </button>
          <button
            type="button"
            onClick={() => onMatchingModeChange('rotation')}
            className={`btn-toggle ${matchingMode === 'rotation' ? 'active' : ''}`}
          >
            循環方式（ローテーション）
          </button>
        </div>
      </div>

      <div className="modal-buttons">
        <button
          type="button"
          onClick={onSkipImportResult}
          className="modal-btn-cancel btn-secondary"
        >
          取り込まない（DB確認へ）
        </button>
        <button
          type="button"
          onClick={onConfirmImportResult}
          disabled={isImportingResult}
          className="btn-primary modal-btn-confirm"
        >
          {isImportingResult ? '読み込み中...' : 'このシートを取り込む'}
        </button>
      </div>
    </>
  );

  const renderNoResult = () => (
    <>
      <h2 className="modal-title">過去抽選結果シートが見つかりませんでした</h2>
      <p className="modal-message modal-message--block">
        過去抽選結果シートが存在しないため、現在の応募リストとキャストリストのみを読み込みました。
        {'\n'}
        このまま新規抽選としてご利用ください。
      </p>
      <div className="modal-buttons">
        <button
          type="button"
          className="btn-primary modal-btn-confirm"
          onClick={onConfirmNoResult}
        >
          OK
        </button>
      </div>
    </>
  );

  const stepIndex = getImportFlowStepIndex(step);
  const trackStyle = { transform: `translateX(-${stepIndex * 25}%)` };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content--narrow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="import-flow-slider">
          <div className="import-flow-slider__track" style={trackStyle}>
            <div className="import-flow-slider__panel" aria-hidden={stepIndex !== 0}>
              {renderChoice()}
            </div>
            <div className="import-flow-slider__panel" aria-hidden={stepIndex !== 1}>
              {renderLoading()}
            </div>
            <div className="import-flow-slider__panel" aria-hidden={stepIndex !== 2}>
              {renderResultStep()}
            </div>
            <div className="import-flow-slider__panel" aria-hidden={stepIndex !== 3}>
              {renderNoResult()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
