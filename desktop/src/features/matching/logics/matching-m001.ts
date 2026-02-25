/**
 * ロジック1: ランダムマッチング（仕様 v2.3 — M001）
 * 空席込み。totalTables で総テーブル数を指定し、空席テーブルもローテ対象にする。
 * 区分コードで完全分離。他ロジックと共通化しない。
 *
 * 配置ロジック:
 *   - 希望キャスト第1〜第3のみ重み付けで優先配置。
 *   - 上位3枠を逃したフォールバック時も重みづけスコアに基づく選定に修正。
 *   - 空席テーブル分のキャストは毎ラウンドランダムに消費される。
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

function weightedRandomIndex(items: { weight: number }[]): number {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    if (total <= 0) return Math.floor(Math.random() * items.length);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        if (items[i].weight <= 0) continue;
        r -= items[i].weight;
        if (r <= 0) return i;
    }
    return items.length - 1;
}

export function runRandomMatching(
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
    const vacantCount = Math.max(0, totalTables - winners.length);
    const shuffledCasts = [...activeCasts].sort(() => Math.random() - 0.5);
    const isNg = (user: UserBean, cast: CastBean): boolean =>
        isUserNGForCast(user, cast, ngJudgmentType);
    const isNgForExclusion = ngMatchingBehavior === 'warn' ? () => false : isNg;

    const hasPreferredInHistory = (history: MatchedCast[]): boolean =>
        history.some((m) => m.rank >= 1 && m.rank <= 3);
    const resultMap = new Map<string, MatchedCast[]>();
    winners.forEach((w) => resultMap.set(w.x_id, []));

    for (let round = 0; round < ROUNDS; round++) {
        let availableThisRound = [...shuffledCasts].sort(() => Math.random() - 0.5);

        // 空席テーブル分のキャストをランダムに消費
        if (vacantCount > 0 && availableThisRound.length > vacantCount) {
            availableThisRound = availableThisRound.slice(vacantCount);
        }

        const shuffledWinnersForRound = [...winners].sort(() => Math.random() - 0.5);
        const needsPreferred: UserBean[] = [];
        const others: UserBean[] = [];
        for (const user of shuffledWinnersForRound) {
            const history = resultMap.get(user.x_id) ?? [];
            if (hasPreferredInHistory(history)) others.push(user);
            else needsPreferred.push(user);
        }
        const orderedUsers = [...needsPreferred, ...others];

        for (const user of orderedUsers) {
            const history = resultMap.get(user.x_id) ?? [];
            type PreferredCandidate = { cast: CastBean; rank: number; weight: number };
            const candidates: PreferredCandidate[] = [];

            for (const cast of availableThisRound) {
                if (isNgForExclusion(user, cast) || history.some((h) => h.cast.name === cast.name)) {
                    continue;
                }
                const rank = getPreferenceRank(user, cast.name);
                candidates.push({
                    cast,
                    rank,
                    weight: rank >= 1 && rank <= 3 ? RANK_WEIGHTS[rank] : DEFAULT_WEIGHT,
                });
            }

            let selected: { cast: CastBean; rank: number } | null = null;
            if (candidates.length > 0) {
                const idx = weightedRandomIndex(candidates);
                selected = {
                    cast: candidates[idx].cast,
                    rank: candidates[idx].rank,
                };
            }

            if (selected) {
                resultMap.set(user.x_id, [...history, { cast: selected.cast, rank: selected.rank }]);
                availableThisRound = availableThisRound.filter((c) => c.name !== selected!.cast.name);
            }
        }
    }

    // tableSlots 構築（空席込み）
    const tableSlots: TableSlot[] = winners.map((user) => ({
        user,
        matches: resultMap.get(user.x_id) ?? [],
    }));
    for (let v = 0; v < vacantCount; v++) {
        tableSlots.push({ user: null, matches: [] });
    }

    return { userMap: resultMap, tableSlots };
}
