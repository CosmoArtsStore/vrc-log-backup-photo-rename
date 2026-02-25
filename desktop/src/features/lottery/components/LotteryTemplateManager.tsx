import React from 'react';
import { Save, Trash2 } from 'lucide-react';
import { AppSelect } from '@/components/AppSelect';
import { LotteryTemplate } from '../types/lottery-template';

interface LotteryTemplateManagerProps {
    templates: LotteryTemplate[];
    selectedTemplateId: string;
    onSelectTemplate: (id: string, template?: LotteryTemplate) => void;
    onSaveNewClick: () => void;
    onOverwriteClick: () => void;
    onDeleteClick: () => void;
}

export const LotteryTemplateManager: React.FC<LotteryTemplateManagerProps> = ({
    templates,
    selectedTemplateId,
    onSelectTemplate,
    onSaveNewClick,
    onOverwriteClick,
    onDeleteClick,
}) => {
    return (
        <div className="form-group lottery-template-area">
            <div className="lottery-template-area-inner">
                <div style={{ flex: 1 }}>
                    <label className="form-label lottery-template-label">
                        <Save size={14} /> テンプレート
                    </label>
                    <AppSelect
                        value={selectedTemplateId || 'unselected'}
                        onValueChange={(v) => {
                            const newId = v === 'unselected' ? '' : v;
                            const template = templates.find(t => t.id === newId);
                            onSelectTemplate(newId, template);
                        }}
                        options={[
                            { value: 'unselected', label: templates.length > 0 ? '未選択（読み込み）' : '保存されたテンプレートなし' },
                            ...templates.map(t => ({ value: t.id, label: t.name }))
                        ]}
                    />
                </div>
                <div className="lottery-template-actions">
                    <button
                        type="button"
                        className="btn-secondary lottery-btn-small"
                        onClick={onSaveNewClick}
                        title="現在の条件を新規保存"
                    >
                        新規保存
                    </button>
                    {selectedTemplateId && (
                        <>
                            <button
                                type="button"
                                className="btn-secondary lottery-btn-small"
                                onClick={onOverwriteClick}
                                title="現在の条件で上書き保存"
                            >
                                上書き
                            </button>
                            <button
                                type="button"
                                className="btn-danger lottery-btn-danger lottery-btn-small"
                                onClick={onDeleteClick}
                                title="テンプレートを削除"
                            >
                                <Trash2 size={16} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
