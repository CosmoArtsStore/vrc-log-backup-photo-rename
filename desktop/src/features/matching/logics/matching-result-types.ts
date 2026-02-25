/**
 * マッチング結果の型定義（仕様書 5. ファイル構成案）。
 * 各ロジックが返す共通の型。ロジック間の共通化は行わない。
 */

import type { UserBean, CastBean } from '@/common/types/entities';

export interface MatchedCast {
  cast: CastBean;
  rank: number;
  isNGWarning?: boolean;
  ngReason?: string;
}

export interface TableSlot {
  user: UserBean | null;
  matches: MatchedCast[];
  tableIndex?: number; // M003用: 1-based テーブル番号
}

export type MatchingResult = {
  userMap: Map<string, MatchedCast[]>;
  tableSlots?: TableSlot[];
  /** NG排除が不可能な組み合わせが検出された場合 true（UIで警告表示用） */
  ngConflict?: boolean;
};
