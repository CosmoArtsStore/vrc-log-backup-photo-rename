/**
 * ロジック2: ローテーションマッチング（仕様 v2.3 — M002）
 * 空席込み。totalTables で総テーブル数を指定し、空席テーブルもローテ対象にする。
 * 区分コードで完全分離。他ロジックと共通化しない。
 *
 * 配置ロジック:
 *   - totalTables スロットに当選者を配置。残りは空席（user: null）。
 *   - キャストは全スロット（空席含む）を循環ローテーション。
 *   - 希望キャスト第1〜第3のみ重み付け。
 *   - 最高スコアを持つオフセット一覧の中から確定で1つ選ぶ。
 */

import type { UserBean, CastBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot, MatchingResult } from './matching-result-types';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import { isUserNGForCast } from './ng-judgment';

const RANK_WEIGHTS: Record<number, number> = { 1: 50, 2: 30, 3: 20 };
const DEFAULT_WEIGHT = 0;

function getPreferenceRank(user: UserBean, castName: string): number {
    if (!user.casts || user.casts.length === 0) return 0;
    const idx = user.casts.indexOf(castName);
    return idx >= 0 && idx < 3 ? idx + 1 : 0;
}

function pickMaxScoreOffset(candidates: { offset: number; weight: number }[]): number {
    if (candidates.length === 0) return 0;
    const maxWeight = Math.max(...candidates.map((c) => c.weight));
    const maxCandidates = candidates.filter((c) => c.weight === maxWeight);
    const idx = Math.floor(Math.random() * maxCandidates.length);
    return maxCandidates[idx].offset;
}

export function runRotationMatching(
    winners: UserBean[],
    allCasts: CastBean[],
    totalTables: number,
    rotationCount: number,
    ngJudgmentType: NGJudgmentType,
    ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
    const userMap = new Map<string, MatchedCast[]>();
    const activeCasts = allCasts.filter((c) => c.is_present);
    if (winners.length === 0 || activeCasts.length === 0) return { userMap };

    const ROUNDS = Math.max(1, rotationCount || 1);
    const slotCount = totalTables;
    const shuffledWinners = [...winners].sort(() => Math.random() - 0.5);
    const shuffledCasts = [...activeCasts].sort(() => Math.random() - 0.5);
    const baseCasts = shuffledCasts.slice(0, Math.min(slotCount, shuffledCasts.length));

    const isNg = (user: UserBean, cast: CastBean): boolean =>
        isUserNGForCast(user, cast, ngJudgmentType);
    const isNgForExclusion = ngMatchingBehavior === 'warn' ? () => false : isNg;

    type OffsetCandidate = { offset: number; weight: number };
    const offsetCandidates: OffsetCandidate[] = [];
    const scoringRows = Math.min(shuffledWinners.length, baseCasts.length);

    for (let offset = 0; offset < baseCasts.length; offset++) {
        let totalScore = 0;
        let valid = true;
        for (let row = 0; row < scoringRows; row++) {
            const user = shuffledWinners[row];
            for (let r = 0; r < ROUNDS; r++) {
                const idx = (offset + row - r + baseCasts.length) % baseCasts.length;
                const cast = baseCasts[idx];
                if (isNgForExclusion(user, cast)) {
                    valid = false;
                    break;
                }
                const prefRank = getPreferenceRank(user, cast.name);
                totalScore += RANK_WEIGHTS[prefRank] ?? DEFAULT_WEIGHT;
            }
            if (!valid) break;
        }
        if (valid) offsetCandidates.push({ offset, weight: totalScore });
    }

    if (offsetCandidates.length === 0) {
        console.error(
            `[M002] NG排除不可: 全${baseCasts.length}オフセットにNGペアが含まれています。キャストの欠席設定または当選者の変更が必要です。`,
        );
        return { userMap, ngConflict: true };
    }

    // 最高スコアのオフセット一覧の中からランダムに確定で1つ選ぶ
    const chosenOffset = pickMaxScoreOffset(offsetCandidates);

    /* --- 結果構築 --- */
    const tableSlots: TableSlot[] = [];
    for (let row = 0; row < slotCount; row++) {
        const user = row < shuffledWinners.length ? shuffledWinners[row] : null;
        const history: MatchedCast[] = [];
        for (let r = 0; r < ROUNDS; r++) {
            const idx = (chosenOffset + row - r + baseCasts.length) % baseCasts.length;
            if (idx < baseCasts.length) {
                const cast = baseCasts[idx];
                const prefRank = user ? getPreferenceRank(user, cast.name) : 0;
                const rank = prefRank >= 1 && prefRank <= 3 ? prefRank : 0;
                history.push({ cast, rank });
            }
        }
        if (user) {
            userMap.set(user.x_id, history);
        }
        tableSlots.push({ user: user ?? null, matches: history });
    }

    return { userMap, tableSlots };
}
