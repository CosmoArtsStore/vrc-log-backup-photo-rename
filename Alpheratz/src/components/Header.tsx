import { Icons } from "./Icons";

interface HeaderProps {
    isFilterOpen: boolean;
    setIsFilterOpen: (val: boolean) => void;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    scanStatus: string;
    phashLabel?: string | null;
    startScan: () => void;
    cancelScan: () => void;
    setShowSettings: (val: boolean) => void;
}

export const Header = ({
    isFilterOpen,
    setIsFilterOpen,
    searchQuery,
    setSearchQuery,
    scanStatus,
    phashLabel,
    startScan,
    cancelScan,
    setShowSettings,
}: HeaderProps) => {
    return (
        <header className="header">
            <div className="logo-group">
                <button
                    className={`header-icon-button ${isFilterOpen ? "active" : ""}`}
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    aria-label="検索条件を切り替え"
                    title="検索条件"
                >
                    <Icons.Menu />
                </button>
                <div className="wordmark-group" aria-label="Alpheratz">
                    <img
                        className="header-logo-image"
                        src="/Alpheratz-logo.png"
                        alt="Alpheratz"
                    />
                </div>
            </div>
            <div className="search-bar">
                {phashLabel && <div className="header-phash-status">{phashLabel}</div>}
                <div className="input-group">
                    <Icons.Search />
                    <input
                        type="text"
                        placeholder="ワールド名で検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="header-actions">
                    {scanStatus === "scanning" ? (
                        <button
                            className="header-icon-button danger"
                            onClick={cancelScan}
                            aria-label="リロードを中断"
                            title="リロードを中断"
                        >
                            <Icons.Close />
                        </button>
                    ) : (
                        <button
                            className="header-icon-button"
                            onClick={startScan}
                            aria-label="リロード"
                            title="リロード"
                        >
                            <Icons.Refresh />
                        </button>
                    )}
                    <button
                        className="header-icon-button"
                        onClick={() => setShowSettings(true)}
                        aria-label="設定を開く"
                        title="設定"
                    >
                        <Icons.Settings />
                    </button>
                </div>
            </div>
        </header>
    );
};
