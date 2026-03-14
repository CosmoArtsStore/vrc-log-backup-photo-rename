import { Icons } from "./Icons";

interface HeaderProps {
    isFilterOpen: boolean;
    setIsFilterOpen: (val: boolean) => void;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
}

export const Header = ({
    isFilterOpen,
    setIsFilterOpen,
    searchQuery,
    setSearchQuery,
}: HeaderProps) => {
    return (
        <header className="header">
            <div className="logo-group">
                <button
                    className={`menu-button ${isFilterOpen ? "active" : ""}`}
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    aria-label="検索サイドバーを切り替え"
                >
                    <Icons.Menu />
                </button>
                <img src="/Alpheratz-logo.png" alt="Alpheratz" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
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
            </div>
        </header>
    );
};
