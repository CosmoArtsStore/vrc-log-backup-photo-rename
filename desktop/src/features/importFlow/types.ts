/**
 * インポートフロー（3択モーダル + 保存結果読み取り）の型定義
 */

/** モーダル内の表示ステップ */
export type ImportFlowStep = 'choice' | 'loading' | 'result' | 'noResult';

/** 3択で選べる操作 */
export type ImportFlowChoice = 'continue' | 'new' | 'loadSaved';

const STEP_ORDER: ImportFlowStep[] = ['choice', 'loading', 'result', 'noResult'];

/** スライダー用の 0〜3 インデックス */
export function getImportFlowStepIndex(step: ImportFlowStep): number {
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 ? i : 0;
}
