import { Icons } from "./Icons";

interface ActionCardsProps {
    startScan: () => void;
    cancelScan: () => void;
    scanStatus: string;
    setShowSettings: (val: boolean) => void;
    setIsFilterOpen: (val: boolean) => void;
}

export const ActionCards = ({
    startScan,
    cancelScan,
    scanStatus,
    setShowSettings,
    setIsFilterOpen,
}: ActionCardsProps) => {
    return (
        <div className="action-cards-grid">
            {scanStatus === "scanning" ? (
                <div className="action-card cancel" onClick={cancelScan}>
                    <div className="action-icon"><Icons.Close /></div>
                    <div className="action-info"><h3>Cancel</h3><p>スキャンを中断</p></div>
                </div>
            ) : (
                <div className="action-card" onClick={startScan}>
                    <div className="action-icon"><Icons.Refresh /></div>
                    <div className="action-info"><h3>Refresh</h3><p>写真を再スキャン</p></div>
                </div>
            )}
            <div className="action-card" onClick={() => setShowSettings(true)}>
                <div className="action-icon"><Icons.Settings /></div>
                <div className="action-info"><h3>Settings</h3><p>フォルダ設定</p></div>
            </div>
            <div className="action-card" onClick={() => setIsFilterOpen(true)}>
                <div className="action-icon"><Icons.Search /></div>
                <div className="action-info"><h3>Filter</h3><p>条件検索を開く</p></div>
            </div>
        </div>
    );
};
