/**
 * 画面・メッセージの文言を一元管理するファイル
 */

export const APP_NAME = 'Stargazer';

/** 共通設定: ローテーション回数の初期値（仕様 4-1） */
export const DEFAULT_ROTATION_COUNT = 2;

export const NAV = {
  GUIDE: 'ヘルプ',
  DATA_MANAGEMENT: '応募データ管理',
  CAST_NG_MANAGEMENT: 'キャスト管理',
  SETTINGS: 'テーマ',
  DEBUG: 'デバッグ',
  // 旧ナビゲーション（後方互換性のため残す）
  IMPORT: 'データ読取',
  DB: '応募データ一覧',
  LOTTERY_CONDITION: '抽選条件',
  LOTTERY: '抽選',
  MATCHING: 'マッチング',
  CAST: 'キャスト管理',
  NG_MANAGEMENT: 'NGユーザー管理',
} as const;

export const EXTERNAL_LINK = {
  MODAL_TITLE: '外部リンク',
  MODAL_MESSAGE: '外部リンクを開きますか？',
  CONFIRM_LABEL: '開く',
  CANCEL_LABEL: 'キャンセル',
} as const;

export const RESET_APPLICATION = {
  BUTTON_LABEL: '応募データリセット',
  MODAL_TITLE: '応募データのリセット',
  MODAL_MESSAGE: '応募データをリセットします。\n取り込んだ応募者・当選結果・マッチング結果がすべてクリアされます。\nよろしいですか？',
  CONFIRM_LABEL: 'リセットする',
  CANCEL_LABEL: 'キャンセル',
} as const;

/** CSV取り込み時に既存の応募データがある場合の確認 */
export const IMPORT_OVERWRITE = {
  MODAL_TITLE: '応募データの上書き',
  MODAL_MESSAGE: '応募データが既にあります。\n上書きして取り込みますか？（現在の応募者・当選結果・マッチング結果はクリアされます）',
  CONFIRM_LABEL: '取り込む',
  CANCEL_LABEL: 'キャンセル',
} as const;

export const ALERT = {
  LOAD_FAILED: 'データの読み取りに失敗しました。ファイルを確認するか、データ読取でCSVを取り込み直してください。',
  NO_WINNERS_EXPORT: '当選者がいないため、エクスポートできません。',
} as const;

export const CAST_PAGE_NOTICE =
  '※ キャストは起動時にローカルから読み込まれます。ここでキャストの新規登録・削除・出席・NG設定ができます。応募データは「データ読取」でCSVファイルを選択して取り込んでください。';

/** 基本テンプレート用スタブCSVのパス（public 配下） */
export const STUB_IMPORT_BASIC_PATH = '/stub-import-basic.csv';
/** チェックボックス式（カンマ区切り希望キャスト）スタブCSVのパス */
export const STUB_IMPORT_CHECKBOX_PATH = '/stub-import-checkbox.csv';

/** テスト用CSVパス一覧（各ロジック向け） */
export const TEST_CSV_PATHS = {
  /** NG/要注意人物テスト（NG一致10名 + 通常190名） */
  ng: '/test-200-ng.csv',
} as const;

export const IMPORT_COLUMN_LABELS = {
  timestamp: 'タイムスタンプ',
  name: 'ユーザー名',
  x_id: 'アカウントID(X)',
  vrc_url: 'VRCアカウントURL',
  first_flag: '初回フラグ',
  cast1: '希望キャスト1',
  cast2: '希望キャスト2',
  cast3: '希望キャスト3',
  note: '備考',
  is_pair_ticket: 'ペアチケット',
} as const;

export const GUIDE = {
  SUBTITLE: `${APP_NAME}の基本的な使い方を説明します`,
  FLOW_DATA_READ: 'データ読取',
  FLOW_DATA_READ_DESC: 'CSVで応募データを取り込み、キャストはローカルから読み込み',
  FLOW_DB: '応募データ一覧',
  FLOW_DB_DESC: '読み込んだデータを確認',
  FLOW_CAST: 'キャスト管理',
  FLOW_CAST_DESC: '出席状態を設定',
  FLOW_LOTTERY_CONDITION: '抽選条件',
  FLOW_LOTTERY_CONDITION_DESC: '条件を設定して抽選実行',
  FLOW_MATCHING_CONFIRM: 'マッチング構成確認',
  FLOW_MATCHING_CONFIRM_DESC: '抽選結果を確認・CSVダウンロード',
  FLOW_MATCHING_RESULT: 'マッチング結果',
  FLOW_MATCHING_RESULT_DESC: 'マッチング結果を確認・TSVダウンロード',
  /** よくある質問: 抽選・マッチング結果の保存先 */
  EXPORT_DESCRIPTION: '抽選結果・マッチング結果は各画面の「TSVでダウンロード」からファイルで保存できます。',
} as const;
