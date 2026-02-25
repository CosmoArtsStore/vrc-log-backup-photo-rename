import React from 'react';
import { APP_NAME } from '@/common/copy';

/**
 * アプリ共通のヘッダーロゴ。
 * - デスクトップのサイドバー上部
 * - モバイルヘッダー
 * で再利用する想定。
 */
export const HeaderLogo: React.FC = () => {
  return (
    <div className="header-logo">
      <div className="header-logo__text">
        <div className="header-logo__title">{APP_NAME.toUpperCase()}</div>
        <div className="header-logo__tagline">MATCHING &amp; LOTTERY</div>
      </div>
    </div>
  );
};

