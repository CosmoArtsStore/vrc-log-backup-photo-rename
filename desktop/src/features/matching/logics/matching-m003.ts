/**
 * M003: 多対多マッチング
 * ユーザーをテーブルに固定（着席）、キャストをユニット（固定編成）で巡回。
 * 区分コードで完全分離。他ロジックと共通化しない。
 *
 * 配置ロジック:
 *   - テーブル内の各キャストへの希望数をカウント
 *   - キャストユニットごとにスコアリング（ユニット内の全キャスト希望数を合算）
 *   - スコア合算が最高のオフセットパターンの中から確定で1つ選ぶ。
 */

import type { UserBean, CastBean } from '@/common/types/entities';
import type { MatchedCast, TableSlot, MatchingResult } from './matching-result-types';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import { isUserNGForCast } from './ng-judgment';

export interface MultipleMatchingParams {
    usersPerTable: number;
    castsPerRotation: number;
    rotationCount: number;
    totalTables?: number;
}

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

export function runMultipleMatching(
    winners: UserBean[],
    allCasts: CastBean[],
    params: MultipleMatchingParams,
    ngJudgmentType: NGJudgmentType,
    ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
    const { usersPerTable, castsPerRotation, rotationCount } = params;
    const userMap = new Map<string, MatchedCast[]>();

    const activeCasts = allCasts.filter((c) => c.is_present);
    if (winners.length === 0 || activeCasts.length === 0) return { userMap };

    if (activeCasts.length % castsPerRotation !== 0) {
        console.error(
            `[M003] キャスト数不整合: ${activeCasts.length} は ${castsPerRotation} で割り切れません`,
        );
        return { userMap };
    }

    const ROUNDS = Math.max(1, rotationCount);
    const unitCount = activeCasts.length / castsPerRotation;

    const userTableCount = Math.ceil(winners.length / usersPerTable);
    const minTableCount = Math.max(userTableCount, unitCount);
    const tableCount = params.totalTables !== undefined
        ? Math.max(params.totalTables, minTableCount)
        : minTableCount;

    if (unitCount < tableCount) {
        console.error(
            `[M003] ユニット数不足: ${unitCount}ユニット < ${tableCount}テーブル。同ローテで同じキャストが複数テーブルに配置されます。`,
        );
        return { userMap };
    }

    const shuffledUsers = [...winners].sort(() => Math.random() - 0.5);
    const tables: UserBean[][] = [];
    for (let t = 0; t < userTableCount; t++) {
        const start = t * usersPerTable;
        const end = Math.min(start + usersPerTable, shuffledUsers.length);
        tables.push(shuffledUsers.slice(start, end));
    }
    for (let t = userTableCount; t < tableCount; t++) {
        tables.push([]);
    }

    const shuffledCasts = [...activeCasts].sort(() => Math.random() - 0.5);
    const units: CastBean[][] = [];
    for (let u = 0; u < unitCount; u++) {
        units.push(shuffledCasts.slice(u * castsPerRotation, (u + 1) * castsPerRotation));
    }

    const isNg = (user: UserBean, cast: CastBean): boolean =>
        isUserNGForCast(user, cast, ngJudgmentType);
    const isNgForExclusion = ngMatchingBehavior === 'warn' ? () => false : isNg;

    type OffsetCandidate = { offset: number; weight: number };
    const offsetCandidates: OffsetCandidate[] = [];

    for (let base = 0; base < unitCount; base++) {
        let totalScore = 0;
        let valid = true;

        for (let t = 0; t < tableCount && valid; t++) {
            for (let r = 0; r < ROUNDS && valid; r++) {
                const unitIdx = (base - t + r + unitCount * ROUNDS) % unitCount;
                const unit = units[unitIdx];
                for (const cast of unit) {
                    for (const user of tables[t]) {
                        if (isNgForExclusion(user, cast)) {
                            valid = false;
                            break;
                        }
                        const rank = getPreferenceRank(user, cast.name);
                        totalScore += RANK_WEIGHTS[rank] ?? DEFAULT_WEIGHT;
                    }
                    if (!valid) break;
                }
            }
        }

        if (valid) {
            offsetCandidates.push({ offset: base, weight: totalScore });
        }
    }

    if (offsetCandidates.length === 0) {
        console.error(
            `[M003] NG排除不可: 全${unitCount}オフセットにNGペアが含まれています。キャストの欠席設定または当選者の変更が必要です。`,
        );
        return { userMap, ngConflict: true };
    }

    // 最高スコアのオフセット一覧の中からランダムに確定で1つ選ぶ
    const chosenOffset = pickMaxScoreOffset(offsetCandidates);

    /* --- 結果を構築 --- */
    const tableSlots: TableSlot[] = [];

    for (let t = 0; t < tableCount; t++) {
        const tableMatches: MatchedCast[] = [];
        for (let r = 0; r < ROUNDS; r++) {
            const unitIdx = (chosenOffset - t + r + unitCount * ROUNDS) % unitCount;
            const unit = units[unitIdx];
            for (const cast of unit) {
                tableMatches.push({ cast, rank: 0 });
            }
        }

        for (const user of tables[t]) {
            const matches: MatchedCast[] = [];
            for (let r = 0; r < ROUNDS; r++) {
                const unitIdx = (chosenOffset - t + r + unitCount * ROUNDS) % unitCount;
                const unit = units[unitIdx];
                for (const cast of unit) {
                    const prefRank = getPreferenceRank(user, cast.name);
                    const rank = prefRank >= 1 && prefRank <= 3 ? prefRank : 0;
                    matches.push({
                        cast,
                        rank,
                    });
                }
            }
            userMap.set(user.x_id, matches);
            tableSlots.push({
                user,
                matches,
                tableIndex: t + 1,
            });
        }

        const vacantCount = usersPerTable - tables[t].length;
        for (let v = 0; v < vacantCount; v++) {
            tableSlots.push({
                user: null,
                matches: tableMatches.map((m) => ({ ...m })),
                tableIndex: t + 1,
            });
        }
    }

    return { userMap, tableSlots };
}
