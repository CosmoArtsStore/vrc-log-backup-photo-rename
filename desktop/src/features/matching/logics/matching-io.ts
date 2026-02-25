/**
 * マッチング実行の入出力エントリポイント。
 * 取込データの初期化、各種アルゴリズムへのプロキシ、警告判定付与を集約する。
 */

import type { UserBean, CastBean } from '@/common/types/entities';
import type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { isUserNGForCast, getNGReasonForCast } from './ng-judgment';
import type { NGJudgmentType, NGMatchingBehavior } from '@/features/matching/types/matching-system-types';
import type { MatchedCast, TableSlot, MatchingResult } from './matching-result-types';
import { runRandomMatching } from './matching-m001';
import { runRotationMatching } from './matching-m002';
import { runMultipleMatching } from './matching-m003';

export type { MatchedCast, TableSlot, MatchingResult } from './matching-result-types';

export interface MatchingRunOptions {
    rotationCount: number;
    totalTables?: number;
    usersPerTable?: number;
    castsPerRotation?: number;
}

export class MatchingService {
    static runMatching(
        winners: UserBean[],
        allCasts: CastBean[],
        matchingTypeCode: MatchingTypeCode,
        options: MatchingRunOptions,
        ngJudgmentType: NGJudgmentType = 'either',
        ngMatchingBehavior: NGMatchingBehavior = 'exclude',
    ): MatchingResult {
        const activeCasts = allCasts.filter((c) => c.is_present);
        const userMap = new Map<string, MatchedCast[]>();
        if (winners.length === 0 || activeCasts.length === 0) {
            return attachWarnings(
                { userMap },
                winners,
                ngJudgmentType,
                ngMatchingBehavior,
            );
        }

        const ROUNDS = Math.max(1, options.rotationCount || 1);
        let result: MatchingResult;

        const totalTables = options.totalTables ?? winners.length;

        switch (matchingTypeCode) {
            case 'M001':
                result = runRandomMatching(
                    winners,
                    allCasts,
                    totalTables,
                    ROUNDS,
                    ngJudgmentType,
                    ngMatchingBehavior,
                );
                break;
            case 'M002':
                result = runRotationMatching(
                    winners,
                    allCasts,
                    totalTables,
                    ROUNDS,
                    ngJudgmentType,
                    ngMatchingBehavior,
                );
                break;
            case 'M003':
                result = runMultipleMatching(
                    winners,
                    allCasts,
                    {
                        usersPerTable: options.usersPerTable ?? 1,
                        castsPerRotation: options.castsPerRotation ?? 1,
                        rotationCount: ROUNDS,
                        totalTables: options.totalTables,
                    },
                    ngJudgmentType,
                    ngMatchingBehavior,
                );
                break;
            default:
                result = { userMap };
        }

        return attachWarnings(result, winners, ngJudgmentType, ngMatchingBehavior);
    }
}

function attachWarnings(
    res: MatchingResult,
    winners: UserBean[],
    ngJudgmentType: NGJudgmentType,
    ngMatchingBehavior: NGMatchingBehavior,
): MatchingResult {
    if (ngMatchingBehavior !== 'warn') return res;
    res.userMap.forEach((matches, xId) => {
        const user = winners.find((w) => w.x_id === xId);
        if (!user) return;
        matches.forEach((m) => {
            m.isNGWarning = isUserNGForCast(user, m.cast, ngJudgmentType);
            m.ngReason = m.isNGWarning ? getNGReasonForCast(m.cast.name) : undefined;
        });
    });
    res.tableSlots?.forEach((slot: TableSlot) => {
        const user = slot.user;
        slot.matches.forEach((m) => {
            m.isNGWarning = user ? isUserNGForCast(user, m.cast, ngJudgmentType) : false;
            m.ngReason = m.isNGWarning ? getNGReasonForCast(m.cast.name) : undefined;
        });
    });
    return res;
}
