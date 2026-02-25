import React from 'react';
import type { ThemeId } from '@/common/themes';

export const ThemeSelector: React.FC<{
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}> = ({ themeId, setThemeId }) => {
  return (
    <div className="btn-toggle-group" role="group" aria-label="テーマを選択">
      <button
        type="button"
        className={`btn-toggle ${themeId === 'dark' ? 'active' : ''}`}
        onClick={() => setThemeId('dark')}
      >
        デフォルト
      </button>
      <button
        type="button"
        className={`btn-toggle ${themeId === 'skyblue' ? 'active' : ''}`}
        onClick={() => setThemeId('skyblue')}
      >
        チェック
      </button>
    </div>
  );
};
