/**
 * テーマ一覧。プレビュー用に各テーマの代表色を保持。
 */

export const THEME_IDS = [
  'dark',
  'skyblue',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemePreview {
  /** 背景色 */
  bg: string;
  /** サイドバー色 */
  sidebar: string;
  /** カード色 */
  card: string;
  /** アクセント色（ボタン等） */
  accent: string;
  /** テキスト色 */
  text: string;
}

export interface ThemeEntry {
  id: ThemeId;
  preview: ThemePreview;
}

export const THEMES: readonly ThemeEntry[] = [
  {
    id: 'dark',
    preview: { bg: '#0d0b1e', sidebar: '#1a1b1f', card: '#1f2026', accent: '#5865f2', text: '#dbdee1' },
  },
  {
    id: 'skyblue',
    preview: { bg: '#92D7E7', sidebar: '#f2f6fa', card: '#f8fbff', accent: '#4a8ec8', text: '#1e3a5f' },
  },
];

/** ツールチップ・ラベル用 */
export const THEME_NAMES: Record<ThemeId, string> = {
  dark: 'デフォルト',
  skyblue: 'チェック',
};

export const DEFAULT_THEME_ID: ThemeId = 'dark';
