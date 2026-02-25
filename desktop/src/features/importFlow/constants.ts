/**
 * インポートフロー（3択）の表示用定数
 */

import type { ImportFlowChoice } from './types';

export interface ImportFlowChoiceOption {
  id: ImportFlowChoice;
  label: string;
  description: string;
  /** この選択肢を無効にする条件（続きからはセッションに抽選結果が残っていないとき無効） */
  getDisabled: (canContinue: boolean) => boolean;
}

export const IMPORT_FLOW_CHOICES: ImportFlowChoiceOption[] = [
  {
    id: 'continue',
    label: '続きから',
    description: 'キャストリストのみ再読み込みして、前回の抽選結果と設定を引き継ぎます。',
    getDisabled: (canContinue) => !canContinue,
  },
  {
    id: 'new',
    label: '新規抽選',
    description: '応募者リストとキャストリストを読み込み、前回の抽選結果を使わずに新しく始めます。',
    getDisabled: () => false,
  },
  {
    id: 'loadSaved',
    label: '保存した抽選結果を読み取る',
    description: '応募者・キャストを読み込んだあと、保存済みの抽選結果シートから再スタートします。',
    getDisabled: () => false,
  },
];

export const IMPORT_FLOW_DISABLED_REASON = {
  continue: 'セッションに抽選結果が残っていないため選択できません',
} as const;
