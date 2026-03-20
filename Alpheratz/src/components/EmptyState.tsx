interface EmptyStateProps {
    isFiltering: boolean;
}

export const EmptyState = ({ isFiltering }: EmptyStateProps) => {
    if (isFiltering) {
        return (
            <div className="empty-state empty-state-search">
                <div className="empty-icon-wrapper">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.72 }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </div>
                <h3>検索結果が見つかりません。</h3>
            </div>
        );
    }

    return (
        <div className="empty-state">
            <div className="empty-icon-wrapper">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <h3>写真が見つかりません</h3>
            <p>フォルダ設定を確認してください。</p>
        </div>
    );
};
