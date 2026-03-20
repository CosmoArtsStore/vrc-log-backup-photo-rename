import logoUrl from "../assets/Alpheratz-logo.png";
import { Icons } from "./Icons";

interface HeaderProps {
  onRefresh: () => void;
  onOpenSettings: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
}

export const Header = ({
  onRefresh,
  onOpenSettings,
  searchQuery,
  setSearchQuery,
}: HeaderProps) => {
  return (
    <header className="header">
      <div className="logo-group" aria-label="Alpheratz">
        <img className="header-logo-image" src={logoUrl} alt="Alpheratz" />
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
