import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/tauri';
import { isTauri } from '@/tauri';
import { LotteryTemplate } from '../types/lottery-template';

export const TEMPLATES_PREF_NAME = 'lottery-templates';

export interface CurrentLotterySettings {
    matchingTypeCode: string;
    rotationCount: number;
    totalTables: number;
    usersPerTable: number;
    castsPerRotation: number;
    allowM003EmptySeats?: boolean;
}

export function useLotteryTemplates(currentSettings: CurrentLotterySettings) {
    const [templates, setTemplates] = useState<LotteryTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
    const [templateConfirmMessage, setTemplateConfirmMessage] = useState<{ message: string, action: () => void } | null>(null);

    // 初回マウント時にテンプレート一覧を読み込む
    useEffect(() => {
        if (!isTauri()) return;
        invoke<string | null>('read_pref_json', { name: TEMPLATES_PREF_NAME })
            .then((raw) => {
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw) as LotteryTemplate[];
                        if (Array.isArray(parsed)) setTemplates(parsed);
                    } catch { /* ignore parse errors */ }
                }
            })
            .catch(() => { /* ignore */ });
    }, []);

    const saveTemplates = useCallback((newTemplates: LotteryTemplate[]) => {
        setTemplates(newTemplates);
        if (isTauri()) {
            invoke('write_pref_json', { name: TEMPLATES_PREF_NAME, content: JSON.stringify(newTemplates) }).catch(() => { });
        }
    }, []);

    const handleSaveTemplateSubmit = useCallback((values: Record<string, string>) => {
        const name = values.templateName;
        if (!name) return;

        const newTemplate: LotteryTemplate = {
            id: Date.now().toString(),
            name,
            settings: { ...currentSettings }
        };

        saveTemplates([...templates, newTemplate]);
        setSelectedTemplateId(newTemplate.id);
        setShowSaveTemplateModal(false);
    }, [
        currentSettings.matchingTypeCode,
        currentSettings.rotationCount,
        currentSettings.totalTables,
        currentSettings.usersPerTable,
        currentSettings.castsPerRotation,
        currentSettings.allowM003EmptySeats,
        templates,
        saveTemplates
    ]);

    const handleDeleteTemplate = useCallback(() => {
        if (!selectedTemplateId) return;

        setTemplateConfirmMessage({
            message: '選択中のテンプレートを削除します。\nよろしいですか？',
            action: () => {
                const newTemplates = templates.filter(t => t.id !== selectedTemplateId);
                saveTemplates(newTemplates);
                setSelectedTemplateId('');
                setTemplateConfirmMessage(null);
            }
        });
    }, [selectedTemplateId, templates, saveTemplates]);

    const handleOverwriteTemplate = useCallback(() => {
        if (!selectedTemplateId) return;
        const target = templates.find(t => t.id === selectedTemplateId);
        if (!target) return;

        setTemplateConfirmMessage({
            message: `選択中のテンプレート「${target.name}」を現在の設定で上書きします。\nよろしいですか？`,
            action: () => {
                const newTemplates = templates.map(t => {
                    if (t.id === selectedTemplateId) {
                        return {
                            ...t,
                            settings: { ...currentSettings }
                        };
                    }
                    return t;
                });
                saveTemplates(newTemplates);
                setTemplateConfirmMessage(null);
            }
        });
    }, [
        selectedTemplateId,
        templates,
        currentSettings.matchingTypeCode,
        currentSettings.rotationCount,
        currentSettings.totalTables,
        currentSettings.usersPerTable,
        currentSettings.castsPerRotation,
        currentSettings.allowM003EmptySeats,
        saveTemplates
    ]);

    return {
        templates,
        selectedTemplateId,
        setSelectedTemplateId,
        showSaveTemplateModal,
        setShowSaveTemplateModal,
        templateConfirmMessage,
        setTemplateConfirmMessage,
        handleSaveTemplateSubmit,
        handleDeleteTemplate,
        handleOverwriteTemplate,
    };
}
