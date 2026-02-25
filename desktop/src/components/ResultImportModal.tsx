import React from 'react';

interface ResultImportModalProps {
  show: boolean;
  onClose: () => void;
  resultSheets: string[];
  selectedResultSheet: string;
  onSelectSheet: (name: string) => void;
  matchingMode: 'random' | 'rotation';
  onMatchingModeChange: (mode: 'random' | 'rotation') => void;
  onConfirm: () => void;
  isImporting: boolean;
}

export const ResultImportModal: React.FC<ResultImportModalProps> = ({
  show,
  onClose,
  resultSheets,
  selectedResultSheet,
  onSelectSheet,
  matchingMode,
  onMatchingModeChange,
  onConfirm,
  isImporting,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content--narrow"
        onClick={(e) => e.stopPropagation()}
      >
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
            onClick={onClose}
            className="modal-btn-cancel btn-secondary"
          >
            取り込まない（DB確認へ）
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isImporting}
            className="btn-primary modal-btn-confirm"
          >
            {isImporting ? '読み込み中...' : 'このシートを取り込む'}
          </button>
        </div>
      </div>
    </div>
  );
};
