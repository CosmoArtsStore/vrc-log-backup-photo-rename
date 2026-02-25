import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserBean, CastBean } from '@/common/types/entities';
import { STORAGE_KEYS } from '@/common/config';
import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from '@/common/themes';
import {
  getInitialMatchingSettings,
  persistMatchingSettings,
  type MatchingSettingsState,
} from '@/features/matching/stores/matching-settings-store';
import { MATCHING_TYPE_CODES, type MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
import { DEFAULT_ROTATION_COUNT } from '@/common/copy';
import type { MatchedCast, TableSlot } from '@/features/matching/logics/matching-io';
export type { UserBean, CastBean } from '@/common/types/entities';

const VALID_PAGES: readonly string[] = ['guide', 'dataManagement', 'castNgManagement', 'eventManagement', 'import', 'db', 'cast', 'ngManagement', 'lotteryCondition', 'lottery', 'matching'];

const VALID_MATCHING_CODES: readonly string[] = [...MATCHING_TYPE_CODES];

function getInitialSession(): PersistedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    if (!Array.isArray(o.winners)) return null;
    let matchingTypeCode: MatchingTypeCode = 'M001';
    if (typeof o.matchingTypeCode === 'string' && VALID_MATCHING_CODES.includes(o.matchingTypeCode)) {
      const restored = o.matchingTypeCode as MatchingTypeCode;
      matchingTypeCode = restored === 'M003' ? 'M001' : restored;
    }
    const rotationCount = typeof (o as { rotationCount?: number }).rotationCount === 'number' && (o as { rotationCount: number }).rotationCount >= 1
      ? (o as { rotationCount: number }).rotationCount
      : DEFAULT_ROTATION_COUNT;
    const activePage = typeof o.activePage === 'string' && VALID_PAGES.includes(o.activePage)
      ? (o.activePage as PageType)
      : 'dataManagement';
    const totalTables = typeof (o as { totalTables?: number }).totalTables === 'number' && (o as { totalTables: number }).totalTables >= 1
      ? (o as { totalTables: number }).totalTables
      : 15;
    const usersPerTable = typeof (o as { usersPerTable?: number }).usersPerTable === 'number' && (o as { usersPerTable: number }).usersPerTable >= 1
      ? (o as { usersPerTable: number }).usersPerTable
      : 1;
    const castsPerRotation = typeof (o as { castsPerRotation?: number }).castsPerRotation === 'number' && (o as { castsPerRotation: number }).castsPerRotation >= 1
      ? (o as { castsPerRotation: number }).castsPerRotation
      : 1;
    const isLotteryUnlocked = typeof (o as { isLotteryUnlocked?: boolean }).isLotteryUnlocked === 'boolean'
      ? (o as { isLotteryUnlocked: boolean }).isLotteryUnlocked
      : false;
    const allowM003EmptySeats = typeof (o as { allowM003EmptySeats?: boolean }).allowM003EmptySeats === 'boolean'
      ? (o as { allowM003EmptySeats: boolean }).allowM003EmptySeats
      : false;
    return {
      winners: o.winners as UserBean[],
      matchingTypeCode,
      rotationCount,
      totalTables,
      usersPerTable,
      castsPerRotation,
      activePage,
      isLotteryUnlocked,
      allowM003EmptySeats,
    };
  } catch {
    return null;
  }
}

export type PageType = 'guide' | 'dataManagement' | 'castNgManagement' | 'eventManagement' | 'import' | 'db' | 'cast' | 'ngManagement' | 'lotteryCondition' | 'lottery' | 'matching';
export type { MatchingTypeCode } from '@/features/matching/types/matching-type-codes';
export type { ThemeId } from '@/common/themes';

function getInitialThemeId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.THEME);
    if (!raw) return DEFAULT_THEME_ID;
    const id = raw.trim();
    return THEME_IDS.includes(id as ThemeId) ? (id as ThemeId) : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export interface PersistedSession {
  winners: UserBean[];
  matchingTypeCode: MatchingTypeCode;
  rotationCount: number;
  /** M001/M002用: 総テーブル数（空席込み） */
  totalTables: number;
  /** M003用: 1テーブルあたりのユーザー数 */
  usersPerTable: number;
  /** M003用: 1ローテあたりのキャスト数 */
  castsPerRotation: number;
  activePage: PageType;
  isLotteryUnlocked: boolean;
  allowM003EmptySeats: boolean;
}

export class Repository {
  private users: UserBean[] = [];
  private casts: CastBean[] = [];

  saveApplyUsers(users: UserBean[]) { this.users = users; }
  getAllApplyUsers(): UserBean[] { return this.users; }
  saveCasts(casts: CastBean[]) { this.casts = casts; }
  getAllCasts(): CastBean[] { return this.casts; }
  updateCastPresence(name: string, isPresent: boolean) {
    const cast = this.casts.find((c) => c.name === name);
    if (cast) cast.is_present = isPresent;
  }
  resetAll() {
    this.users = [];
    this.casts = [];
  }
}

interface AppContextType {
  activePage: PageType;
  setActivePage: (page: PageType) => void;
  repository: Repository;
  currentWinners: UserBean[];
  setCurrentWinners: (winners: UserBean[]) => void;
  guaranteedWinners: UserBean[];
  setGuaranteedWinners: (winners: UserBean[]) => void;
  matchingTypeCode: MatchingTypeCode;
  setMatchingTypeCode: (code: MatchingTypeCode) => void;
  rotationCount: number;
  setRotationCount: (n: number) => void;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  totalTables: number;
  setTotalTables: (n: number) => void;
  usersPerTable: number;
  setUsersPerTable: (n: number) => void;
  castsPerRotation: number;
  setCastsPerRotation: (n: number) => void;
  matchingSettings: MatchingSettingsState;
  setMatchingSettings: (state: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => void;
  isLotteryUnlocked: boolean;
  setIsLotteryUnlocked: (val: boolean) => void;
  globalMatchingResult: Map<string, MatchedCast[]> | null;
  setGlobalMatchingResult: (res: Map<string, MatchedCast[]> | null) => void;
  globalTableSlots: TableSlot[] | undefined;
  setGlobalTableSlots: (slots: TableSlot[] | undefined) => void;
  globalMatchingError: string | null;
  setGlobalMatchingError: (err: string | null) => void;
  allowM003EmptySeats: boolean;
  setAllowM003EmptySeats: (val: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const repositoryInstance = new Repository();

/** 起動時は毎回応募データ管理ページを表示する（前回のページは復元しない） */
function getInitialActivePage(): PageType {
  return 'dataManagement';
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialSession = useState(() => getInitialSession())[0];
  const [activePage, setActivePage] = useState<PageType>(getInitialActivePage);
  const [currentWinners, setCurrentWinners] = useState<UserBean[]>(initialSession?.winners ?? []);
  const [guaranteedWinners, setGuaranteedWinners] = useState<UserBean[]>([]);
  const [matchingTypeCode, setMatchingTypeCode] = useState<MatchingTypeCode>(initialSession?.matchingTypeCode ?? 'M001');
  const [rotationCount, setRotationCount] = useState<number>(initialSession?.rotationCount ?? DEFAULT_ROTATION_COUNT);
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitialThemeId());
  const [totalTables, setTotalTables] = useState<number>(initialSession?.totalTables ?? 15);
  const [usersPerTable, setUsersPerTable] = useState<number>(initialSession?.usersPerTable ?? 1);
  const [castsPerRotation, setCastsPerRotation] = useState<number>(initialSession?.castsPerRotation ?? 1);
  const [matchingSettings, setMatchingSettingsState] = useState<MatchingSettingsState>(() => getInitialMatchingSettings());
  const [isLotteryUnlocked, setIsLotteryUnlocked] = useState<boolean>(initialSession?.isLotteryUnlocked ?? false);
  const [allowM003EmptySeats, setAllowM003EmptySeats] = useState<boolean>(initialSession?.allowM003EmptySeats ?? false);

  const [globalMatchingResult, setGlobalMatchingResult] = useState<Map<string, MatchedCast[]> | null>(null);
  const [globalTableSlots, setGlobalTableSlots] = useState<TableSlot[] | undefined>(undefined);
  const [globalMatchingError, setGlobalMatchingError] = useState<string | null>(null);

  const setMatchingSettings = (stateOrUpdater: MatchingSettingsState | ((prev: MatchingSettingsState) => MatchingSettingsState)) => {
    setMatchingSettingsState((prev) => {
      const next = typeof stateOrUpdater === 'function' ? stateOrUpdater(prev) : stateOrUpdater;
      persistMatchingSettings(next);
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const session: PersistedSession = {
      winners: currentWinners,
      matchingTypeCode,
      rotationCount,
      totalTables,
      usersPerTable,
      castsPerRotation,
      activePage,
      isLotteryUnlocked,
      allowM003EmptySeats,
    };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  }, [currentWinners, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, activePage, isLotteryUnlocked, allowM003EmptySeats]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.THEME, themeId);
  }, [themeId]);

  return (
    <AppContext.Provider value={{
      activePage,
      setActivePage,
      repository: repositoryInstance,
      currentWinners,
      setCurrentWinners,
      guaranteedWinners,
      setGuaranteedWinners,
      matchingTypeCode,
      setMatchingTypeCode,
      rotationCount,
      setRotationCount,
      themeId,
      setThemeId,
      totalTables,
      setTotalTables,
      usersPerTable,
      setUsersPerTable,
      castsPerRotation,
      setCastsPerRotation,
      matchingSettings,
      setMatchingSettings,
      isLotteryUnlocked,
      setIsLotteryUnlocked,
      globalMatchingResult,
      setGlobalMatchingResult,
      globalTableSlots,
      setGlobalTableSlots,
      globalMatchingError,
      setGlobalMatchingError,
      allowM003EmptySeats,
      setAllowM003EmptySeats,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
