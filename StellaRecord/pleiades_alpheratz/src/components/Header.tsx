import { Icons } from "./Icons";

interface HeaderProps {
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    worldFilter: string;
    setWorldFilter: (val: string) => void;
    worldNameList: string[];
}

export const Header = ({
    searchQuery,
    setSearchQuery,
    worldFilter,
    setWorldFilter,
    worldNameList,
}: HeaderProps) => {
    return (
        <header className="header">
            <div className="logo-group">
                <h1>Alpheratz</h1>
            </div>
            <div className="search-bar">
                <div className="input-group">
                    <Icons.Search />
                    <input
                        type="text"
                        placeholder="ワールド名で検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}>
                    <option value="all">すべてのワールド</option>
                    {worldNameList.map((name) => (
                        <option key={name || "unknown"} value={name || "unknown"}>
                            {name || "ワールド不明"}
                        </option>
                    ))}
                </select>
            </div>
        </header>
    );
};
