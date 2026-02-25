import React, { useState, useEffect } from 'react';
import { useAppContext, type PageType } from '@/stores/AppContext';
import { ImportPage } from '@/features/import/ImportPage';
import { DBViewPage } from '@/features/db/DBViewPage';
import { LotteryPage } from '@/features/lottery/LotteryPage';
import { LotteryResultPage } from '@/features/lottery/LotteryResultPage';
import { MatchingPage } from '@/features/matching/MatchingPage';

type DataManagementTab = 'import' | 'db' | 'lotteryCondition' | 'lottery' | 'matching';
const DATA_MANAGEMENT_TABS: DataManagementTab[] = ['import', 'db', 'lotteryCondition', 'lottery', 'matching'];

interface DataManagementPageProps {
  onImportUserRows: (
    rows: string[][],
    mapping: import('@/common/importFormat').ColumnMapping,
    options?: import('@/common/sheetParsers').MapRowOptions
  ) => void;
}

function toTabOrDefault(page: PageType): DataManagementTab {
  return DATA_MANAGEMENT_TABS.includes(page as DataManagementTab)
    ? (page as DataManagementTab)
    : 'import';
}

export const DataManagementPage: React.FC<DataManagementPageProps> = ({ onImportUserRows }) => {
  const {
    activePage,
    setActivePage,
    repository,
    currentWinners,
    matchingTypeCode,
    rotationCount,
    totalTables: contextTotalTables,
    usersPerTable,
    castsPerRotation,
    matchingSettings,
    isLotteryUnlocked,
  } = useAppContext();

  const totalTables = matchingTypeCode === 'M003' && usersPerTable > 0
    ? Math.floor(currentWinners.length / usersPerTable)
    : contextTotalTables;

  const [activeTab, setActiveTab] = useState<DataManagementTab>(() => toTabOrDefault(activePage));

  useEffect(() => {
    const mapped = toTabOrDefault(activePage);
    if (mapped !== 'import' || activePage === 'import') {
      setActiveTab(mapped);
    }
  }, [activePage]);

  const tabs: { id: DataManagementTab; label: string }[] = [
    { id: 'import', label: 'データ読取' },
    { id: 'db', label: '応募データ一覧' },
    { id: 'lotteryCondition', label: '抽選条件' },
    { id: 'lottery', label: '抽選' },
    { id: 'matching', label: 'マッチング' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'import':
        return <ImportPage onImportUserRows={onImportUserRows} />;
      case 'db':
        return <DBViewPage />;
      case 'lotteryCondition':
        return <LotteryPage />;
      case 'lottery':
        return <LotteryResultPage />;
      case 'matching':
        return (
          <MatchingPage
            winners={currentWinners}
            repository={repository}
            matchingTypeCode={matchingTypeCode}
            rotationCount={rotationCount}
            totalTables={totalTables}
            usersPerTable={usersPerTable}
            castsPerRotation={castsPerRotation}
            matchingSettings={matchingSettings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-tabs">
        {tabs.map((tab) => {
          const isLocked = !isLotteryUnlocked && ['lotteryCondition', 'lottery', 'matching'].includes(tab.id);
          return (
            <button
              key={tab.id}
              className={`page-tab ${activeTab === tab.id ? 'page-tab--active' : ''} ${isLocked ? 'page-tab--disabled' : ''}`}
              onClick={() => {
                if (!isLocked) {
                  setActiveTab(tab.id);
                  setActivePage(tab.id);
                }
              }}
              disabled={isLocked}
              title={isLocked ? "応募データ一覧から「抽選条件へ」進むと解放されます" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="page-tab-content">{renderContent()}</div>
    </div>
  );
};
