import type { UserBean } from '@/common/types/entities';

export interface LotteryImportValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export function parseLotteryResultTsv(
    content: string
): {
    users: UserBean[];
    validation: LotteryImportValidation;
} {
    // UTF-8 BOM を除去 (Excelなどからの出力を考慮)
    const sanitizedContent = content.startsWith('\uFEFF') ? content.slice(1) : content;
    const lines = sanitizedContent.split(/\r?\n/).filter((line) => line.trim() !== '');

    if (lines.length === 0) {
        return {
            users: [],
            validation: { isValid: false, errors: ['ファイルが空です'], warnings: [] },
        };
    }

    const headers = lines[0].split('\t').map(h => h.trim());
    const errors: string[] = [];
    const warnings: string[] = [];

    // ヘッダー要素のインデックスをマッピング
    const colMap: Record<string, number> = {};
    headers.forEach((h, i) => { colMap[h] = i; });

    // 旧フォーマット名または新フォーマット名の両方を探索
    const nameIdx = colMap['ユーザー'] ?? colMap['name'] ?? -1;
    const xidIdx = colMap['X ID'] ?? colMap['x_id'] ?? -1;
    const guaranteedIdx = colMap['区分'] ?? colMap['確定'] ?? -1;

    // 「希望1」「希望2」などの列インデックスを収集
    const castIndices: number[] = [];
    for (let i = 1; i <= 20; i++) {
        const idx = colMap[`希望${i}`];
        if (idx !== undefined && idx >= 0) {
            castIndices.push(idx);
        }
    }

    if (nameIdx === -1 && xidIdx === -1) {
        errors.push('ヘッダーに「ユーザー」(または name)、「X ID」(または x_id)が見つかりません。');
        return { users: [], validation: { isValid: false, errors, warnings } };
    }

    const users: UserBean[] = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split('\t');
        const name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
        const x_id = xidIdx >= 0 ? (row[xidIdx] || '').trim() : '';

        // 必須フィールドチェック（警告にとどめず名前がない場合はスキップするか、エラーとして追加）
        if (!name && !x_id) {
            warnings.push(`行${i + 1}: ユーザーとX IDが両方空のためスキップしました。`);
            continue;
        }

        const casts: string[] = [];
        for (const cIdx of castIndices) {
            const val = row[cIdx]?.trim();
            if (val) casts.push(val);
        }

        const is_guaranteed = guaranteedIdx >= 0 ? (row[guaranteedIdx]?.trim() === '確定' || row[guaranteedIdx]?.trim() === '1') : false;

        users.push({
            name,
            x_id,
            casts,
            is_guaranteed,
            raw_extra: [],
        });
    }

    return {
        users,
        validation: {
            isValid: errors.length === 0,
            errors,
            warnings,
        },
    };
}
