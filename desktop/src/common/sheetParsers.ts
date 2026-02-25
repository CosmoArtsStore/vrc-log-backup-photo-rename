import type { UserBean, CastBean } from './types/entities';
import { CAST_SHEET } from './sheetColumns';
import type { ColumnMapping } from './importFormat';
import { parseXUsername } from './xIdUtils';

function getCell(row: unknown[] | null | undefined, colIndex: number): string {
  if (row == null || !Array.isArray(row) || colIndex < 0 || colIndex >= row.length) return '';
  return (row[colIndex] ?? '').toString().trim();
}

/** 1行を UserBean に変換するときのオプション（カスタム用） */
export interface MapRowOptions {
  /** この列をカンマ区切りで分割し希望1・2・3に充てる（-1のときは使わない） */
  splitCommaColumnIndex?: number;
}

/** カラムマッピングに従って1行を UserBean に変換する（テンプレート／カスタム用） */
export function mapRowToUserBeanWithMapping(
  row: unknown[],
  mapping: ColumnMapping,
  options?: MapRowOptions
): UserBean {
  let casts: string[];
  const splitCol = options?.splitCommaColumnIndex;
  const useSplitComma =
    splitCol !== undefined && splitCol >= 0 && mapping.cast1 === splitCol;
  /** 希望キャストが1列（カンマ区切り or 単一列）のとき */
  const useSingleCastColumn =
    mapping.cast2 < 0 && mapping.cast3 < 0 && mapping.cast1 >= 0;

  /** 複数指定可（カンマ区切り）のときの最大希望数。DB確認で希望キャスト1〜Nとして表示 */
  const MAX_CAST_COMMA = 20;
  if (useSplitComma) {
    const cast1Val = getCell(row, mapping.cast1);
    if (!cast1Val) {
      casts = [];
    } else {
      casts = cast1Val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_CAST_COMMA);
    }
  } else if (useSingleCastColumn) {
    const cast1Val = getCell(row, mapping.cast1);
    if (!cast1Val || mapping.cast1 < 0) {
      casts = [];
    } else {
      casts = cast1Val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_CAST_COMMA);
      casts = Array.from(new Set(casts));
    }
  } else {
    const c1 = mapping.cast1 >= 0 ? getCell(row, mapping.cast1) : '';
    const c2 = mapping.cast2 >= 0 ? getCell(row, mapping.cast2) : '';
    const c3 = mapping.cast3 >= 0 ? getCell(row, mapping.cast3) : '';
    casts = [c1, c2, c3];
    while (casts.length < 3) casts.push('');
  }

  const namePrimary = mapping.name >= 0 ? getCell(row, mapping.name) : '';
  const nameFallback = mapping.nameColumn2 != null && mapping.nameColumn2 >= 0 ? getCell(row, mapping.nameColumn2) : '';
  const name = namePrimary || nameFallback;

  // Xアカウントの正規化処理: 4パターン対応
  // (1) https://x.com/username
  // (2) https://twitter.com/username
  // (3) @username
  // (4) username
  // → すべてusernameに正規化する
  const rawXId = mapping.x_id >= 0 ? getCell(row, mapping.x_id) : '';
  const normalizedXId = rawXId ? (parseXUsername(rawXId) ?? rawXId) : '';

  const vrcUrl = mapping.vrc_url >= 0 ? getCell(row, mapping.vrc_url) : '';

  const rawExtra: { key: string; value: string }[] = [];
  if (mapping.extraColumns?.length) {
    for (const e of mapping.extraColumns) {
      rawExtra.push({ key: e.label, value: getCell(row, e.columnIndex) });
    }
  }

  return {
    name,
    x_id: normalizedXId,
    vrc_url: vrcUrl,
    casts,
    raw_extra: rawExtra,
  };
}

export function parseCastSheetRows(rows: unknown[][]): CastBean[] {
  return rows
    .map((row) => ({
      name: (row[CAST_SHEET.NAME] ?? '').toString().trim(),
      is_present: (row[CAST_SHEET.IS_PRESENT] ?? '') === '1',
      ng_entries: (row[CAST_SHEET.NG_USERS] ?? '')
        ? (row[CAST_SHEET.NG_USERS] as string).split(',').map((s: string) => ({ username: s.trim() }))
        : [],
    }))
    .filter((c) => c.name);
}

/**
 * キャスト一覧を cast-data.csv 用の CSV 文字列に変換する（ヘッダー付き）。
 * 現在は未使用。将来の CSV エクスポート機能で使用予定。
 */
function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function castBeansToCsvContent(casts: CastBean[]): string {
  const header = 'キャストリスト,欠勤フラグ,NGユーザー';
  const dataLines = casts.map((c) => {
    const name = escapeCsvCell(c.name);
    const isPresent = c.is_present ? '1' : '0';
    const ngParts =
      c.ng_entries && c.ng_entries.length > 0
        ? c.ng_entries.map((e) => (e.accountId ? `${e.username ?? ''}@${e.accountId}` : e.username ?? '')).filter(Boolean)
        : [];
    const ngUsers = escapeCsvCell(Array.isArray(ngParts) ? ngParts.join(',') : '');
    return `${name},${isPresent},${ngUsers}`;
  });
  return [header, ...dataLines].join('\n');
}
