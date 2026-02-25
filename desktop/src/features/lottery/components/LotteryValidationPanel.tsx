import React from 'react';

interface LotteryValidationPanelProps {
    validation: {
        errors: string[];
        warnings: string[];
    };
    onImportClick: () => void;
    onRunClick: () => void;
}

export const LotteryValidationPanel: React.FC<LotteryValidationPanelProps> = ({
    validation,
    onImportClick,
    onRunClick,
}) => {
    return (
        <div className="page-card-narrow lottery-form-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
            <div className={`lottery-validation-panel ${validation.errors.length > 0 ? 'lottery-validation-panel--danger' : validation.warnings.length > 0 ? 'lottery-validation-panel--warning' : 'lottery-validation-panel--normal'}`}>
                <div className="lottery-validation-header">
                    WARNING
                </div>

                <div className="lottery-validation-content custom-scrollbar">
                    {validation.errors.length === 0 && validation.warnings.length === 0 ? (
                        <div className="lottery-validation-empty">
                            <div className="lottery-validation-icon-bg">
                                <div className="lottery-validation-icon-fg" />
                            </div>
                            <p className="lottery-validation-empty-text">設定に問題はありません</p>
                            <p className="lottery-validation-empty-subtext">抽選を行う準備が完了しています</p>
                        </div>
                    ) : (
                        <div className="lottery-validation-list">
                            {validation.errors.map((error: string, idx: number) => (
                                <div key={`err-${idx}`} className="lottery-validation-item lottery-validation-item--error">
                                    <strong className="lottery-validation-item-label lottery-validation-item-label--error">エラー（抽選不可）</strong>
                                    {error}
                                </div>
                            ))}
                            {validation.warnings.map((warning: string, idx: number) => (
                                <div key={`warn-${idx}`} className="lottery-validation-item lottery-validation-item--warning">
                                    <strong className="lottery-validation-item-label lottery-validation-item-label--warning">注意</strong>
                                    {warning}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="lottery-action-bar">
                <button onClick={onImportClick} className="btn-secondary btn-secondary--full lottery-action-btn-import">
                    抽選結果をインポート
                </button>
                <div className="lottery-action-btn-start-wrap">
                    <button
                        onClick={onRunClick}
                        className="btn-primary btn-primary--full lottery-action-btn-start"
                        disabled={validation.errors.length > 0}
                    >
                        抽選開始
                    </button>
                    {validation.errors.length > 0 && (
                        <div
                            className="lottery-action-btn-start-disabled-overlay"
                            title="エラーがあるため抽選を開始できません"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
