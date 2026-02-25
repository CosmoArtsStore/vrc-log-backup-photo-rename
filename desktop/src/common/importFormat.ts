/**
 * インポート形式：カスタム（列マッピング or ファイル読み取り）
 * ユーザー名・VRCアカウントID・アカウントID(X)のいずれかは必須。希望キャストはオプション。
 */

/** 0始まりの列インデックス。-1 = 使わない */
export interface ColumnMapping {
  name: number;
  x_id: number;
  vrc_url: number; // VRCアカウントURL
  cast1: number;
  cast2: number;
  cast3: number;
  /** カスタム用: 2列目ユーザー名(例: VRC名)。name が空のときのフォールバック */
  nameColumn2?: number;
  /** カスタム用: 応募リストに出す追加列(ラベル付きで raw_extra に入る) */
  extraColumns?: { columnIndex: number; label: string }[];
  /** 希望キャストの形式: 'multiple' = 複数指定可(カンマ区切り), 'single' = 単一項目 */
  castInputType?: 'multiple' | 'single';
  /** 希望の重みをつけるか(単一の場合のみ有効) */
  castUseWeight?: boolean;
}

export type ImportStyle = 'custom';

/** カスタム用プリセット: VRCアカウント名,ツイッターユーザー名,アカウントＩＤ,希望キャスト(カンマ),確認事項１,確認事項２,自由記入欄 */
export const CUSTOM_PRESET_VRC: ColumnMapping = {
  name: 1,
  x_id: 2,
  vrc_url: -1,
  cast1: 3,
  cast2: -1,
  cast3: -1,
  nameColumn2: 0,
  extraColumns: [
    { columnIndex: 4, label: '確認事項１' },
    { columnIndex: 5, label: '確認事項２' },
  ],
};

/** カスタム用：全項目を「未選択」で初期化（-1 = 使わない） */
export function createEmptyColumnMapping(): ColumnMapping {
  return {
    name: -1,
    x_id: -1,
    vrc_url: -1,
    cast1: -1,
    cast2: -1,
    cast3: -1,
  };
}

/** アカウントID(X)が指定されていれば true（必須） */
export function hasRequiredIdentityColumn(m: ColumnMapping): boolean {
  return m.x_id >= 0;
}

/** マッピングで参照する最大列インデックス＋1 ＝ 必要な最小列数 */
export function getMinColumnsFromMapping(m: ColumnMapping): number {
  const indices: number[] = [
    m.name,
    m.x_id,
    m.vrc_url,
    m.cast1,
    m.cast2,
    m.cast3,
  ];
  if (m.nameColumn2 != null && m.nameColumn2 >= 0) indices.push(m.nameColumn2);
  if (m.extraColumns?.length) {
    m.extraColumns.forEach((e) => indices.push(e.columnIndex));
  }
  const valid = indices.filter((i) => i >= 0);
  if (valid.length === 0) return 0;
  return Math.max(...valid) + 1;
}
