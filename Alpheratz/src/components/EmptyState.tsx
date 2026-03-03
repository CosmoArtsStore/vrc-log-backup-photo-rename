interface EmptyStateProps {
    isFiltering: boolean;
}

export const EmptyState = ({ isFiltering }: EmptyStateProps) => {
    return (
        <div className="empty-state">
            <div className="empty-icon-wrapper">
                {isFiltering ? (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                ) : (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                )}
            </div>
            <h3>{isFiltering ? "検索結果が見つかりません" : "写真が見つかりません"}</h3>
            <p>{isFiltering ? "検索条件を変えてみてください。" : "フォルダ設定を確認してください。"}</p>
        </div>
    );
};
