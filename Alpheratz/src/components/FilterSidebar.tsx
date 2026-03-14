interface FilterSidebarProps {
    isOpen: boolean;
    worldFilter: string;
    setWorldFilter: (val: string) => void;
    worldNameList: string[];
    dateFrom: string;
    setDateFrom: (val: string) => void;
    dateTo: string;
    setDateTo: (val: string) => void;
    orientationFilter: string;
    setOrientationFilter: (val: string) => void;
    favoritesOnly: boolean;
    setFavoritesOnly: (val: boolean) => void;
    tagQuery: string;
    setTagQuery: (val: string) => void;
    colorFilter: string;
    setColorFilter: (val: string) => void;
    onReset: () => void;
}

export const FilterSidebar = ({
    isOpen,
    worldFilter,
    setWorldFilter,
    worldNameList,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    orientationFilter,
    setOrientationFilter,
    favoritesOnly,
    setFavoritesOnly,
    tagQuery,
    setTagQuery,
    colorFilter,
    setColorFilter,
    onReset,
}: FilterSidebarProps) => {
    return (
        <aside className={`filter-sidebar ${isOpen ? "open" : ""}`}>
            <div className="filter-sidebar-header">
                <h3>条件検索</h3>
                <button className="filter-reset-button" onClick={onReset}>
                    リセット
                </button>
            </div>

            <div className="filter-section">
                <label>ワールド</label>
                <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}>
                    <option value="all">すべてのワールド</option>
                    {worldNameList.map((name) => (
                        <option key={name || "unknown"} value={name || "unknown"}>
                            {name || "ワールド不明"}
                        </option>
                    ))}
                </select>
            </div>

            <div className="filter-section">
                <label>撮影日 From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="filter-section">
                <label>撮影日 To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="filter-section">
                <label>縦横向き</label>
                <select value={orientationFilter} onChange={(e) => setOrientationFilter(e.target.value)}>
                    <option value="all">すべて</option>
                    <option value="portrait">縦長</option>
                    <option value="landscape">横長</option>
                    <option value="square">正方形</option>
                    <option value="unknown">不明</option>
                </select>
            </div>

            <div className="filter-section">
                <label>タグ検索</label>
                <input
                    type="text"
                    value={tagQuery}
                    placeholder="タグ名を入力"
                    onChange={(e) => setTagQuery(e.target.value)}
                />
            </div>

            <div className="filter-section checkbox">
                <label>
                    <input
                        type="checkbox"
                        checked={favoritesOnly}
                        onChange={(e) => setFavoritesOnly(e.target.checked)}
                    />
                    お気に入りのみ
                </label>
            </div>

            <div className="filter-section">
                <label>色フィルター</label>
                <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}>
                    <option value="all">すべて</option>
                    <option value="red">赤</option>
                    <option value="orange">オレンジ</option>
                    <option value="yellow">黄色</option>
                    <option value="green">緑</option>
                    <option value="cyan">シアン</option>
                    <option value="blue">青</option>
                    <option value="purple">紫</option>
                    <option value="pink">ピンク</option>
                    <option value="mono">低彩度</option>
                    <option value="dark">暗め</option>
                    <option value="bright">明るめ</option>
                </select>
            </div>
        </aside>
    );
};
