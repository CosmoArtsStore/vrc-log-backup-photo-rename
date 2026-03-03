interface EmptyStateProps {
    isFiltering: boolean;
}

export const EmptyState = ({ isFiltering }: EmptyStateProps) => {
    return (
        <div className="empty-state">
            <div className="empty-icon">{isFiltering ? "🔍" : "📂"}</div>
            <h3>{isFiltering ? "検索結果が見つかりません" : "写真が見つかりません"}</h3>
            <p>{isFiltering ? "検索条件を変えてみてください。" : "フォルダ設定を確認してください。"}</p>
        </div>
    );
};
