import React, { useState } from 'react';
import { CastManagementPage } from '@/features/cast/CastManagementPage';
import { NGUserManagementPage } from '@/features/ng-user/NGUserManagementPage';
import { useAppContext } from '@/stores/AppContext';

type CastNgTab = 'cast' | 'ngManagement';

interface CastNgManagementPageProps {
  onPersistCasts: (casts: import('@/common/types/entities').CastBean[]) => Promise<void>;
}

export const CastNgManagementPage: React.FC<CastNgManagementPageProps> = ({ onPersistCasts }) => {
  const { repository } = useAppContext();
  const [activeTab, setActiveTab] = useState<CastNgTab>('cast');

  const tabs: { id: CastNgTab; label: string }[] = [
    { id: 'cast', label: 'キャスト管理' },
    { id: 'ngManagement', label: 'NGユーザー管理' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'cast':
        return <CastManagementPage repository={repository} onPersistCasts={onPersistCasts} />;
      case 'ngManagement':
        return <NGUserManagementPage repository={repository} onPersistCasts={onPersistCasts} />;
      default:
        return null;
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`page-tab ${activeTab === tab.id ? 'page-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="page-tab-content">{renderContent()}</div>
    </div>
  );
};
