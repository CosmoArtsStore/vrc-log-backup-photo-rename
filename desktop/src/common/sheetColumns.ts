/**
 * スプレッドシート列インデックス定義（0始まり）。CSV/ローカル用。
 */

export const CAST_SHEET = {
  NAME: 0,
  IS_PRESENT: 1,
  NG_USERS: 2,
} as const;

/** PNG ファイル名プレフィックス用 */
export const MATCHING_SHEET_PREFIX = 'マッチング結果_';
