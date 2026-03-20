import { Icons } from "./Icons";

interface HeaderProps {
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggleFilters: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  hashProgressLabel?: string | null;
  activeFilterCount?: number;
}

export const Header = ({
  onRefresh,
  onOpenSettings,
  onToggleFilters,
  searchQuery,
  setSearchQuery,
  hashProgressLabel,
  activeFilterCount = 0,
}: HeaderProps) => {
  return (
    <header className="header">
      <div className="header-left-tools">
        <button
          className={`header-filter-button ${activeFilterCount > 0 ? "active" : ""}`}
          onClick={onToggleFilters}
          aria-label="検索条件"
          title="検索条件"
          type="button"
        >
          <span className="header-filter-icon">
            <Icons.Menu />
          </span>
          <span className="header-filter-label">検索条件</span>
          {activeFilterCount > 0 && <span className="header-filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      <div className="header-search">
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

      <div className="header-right-tools">
        <button
          className="header-icon-button"
          onClick={onRefresh}
          aria-label="再読み込み"
          title="再読み込み"
          type="button"
        >
          <Icons.Refresh />
        </button>
        {hashProgressLabel && (
          <div className="header-progress-chip" role="status" aria-live="polite">
            {hashProgressLabel}
          </div>
        )}
        <button
          className="header-icon-button"
          onClick={onOpenSettings}
          aria-label="設定"
          title="設定"
          type="button"
        >
          <Icons.Settings />
        </button>
      </div>
    </header>
  );
};
