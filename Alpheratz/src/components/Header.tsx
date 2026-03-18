import { Icons } from "./Icons";

interface HeaderProps {
  isFilterOpen: boolean;
  setIsFilterOpen: (val: boolean) => void;
  isExtensionOpen: boolean;
  setIsExtensionOpen: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
}

export const Header = ({
  isFilterOpen,
  setIsFilterOpen,
  isExtensionOpen,
  setIsExtensionOpen,
  searchQuery,
  setSearchQuery,
}: HeaderProps) => {
  return (
    <header className="header">
      <div className="header-left-tools">
        <button
          className={`header-icon-button ${isFilterOpen ? "active" : ""}`}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          aria-label="絞り込み"
          title="絞り込み"
          type="button"
        >
          <Icons.Menu />
        </button>
        <button
          className={`header-icon-button ${isExtensionOpen ? "active" : ""}`}
          onClick={() => setIsExtensionOpen(!isExtensionOpen)}
          aria-label="拡張機能"
          title="拡張機能"
          type="button"
        >
          <Icons.Extension />
        </button>
      </div>

      <div className="header-center">
        <div className="logo-group" aria-label="Alpheratz">
          <img className="header-logo-image" src="/Alpheratz-logo.png" alt="Alpheratz" />
        </div>
        <div className="search-bar">
          <div className="input-group">
            <Icons.Search />
            <input
              type="text"
              placeholder="ワールド名で検索..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
