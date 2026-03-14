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
                    <div className="action-info"><h3>スキャンを中断</h3><p>写真の再スキャンを停止します</p></div>
                </div>
            ) : (
                <div className="action-card" onClick={startScan}>
                    <div className="action-icon"><Icons.Refresh /></div>
                    <div className="action-info"><h3>再スキャン</h3><p>写真を最新状態へ更新します</p></div>
                </div>
            )}
            <div className="action-card" onClick={() => setShowSettings(true)}>
                <div className="action-icon"><Icons.Settings /></div>
                <div className="action-info"><h3>設定</h3><p>フォルダと起動方法を変更します</p></div>
            </div>
            <div className="action-card" onClick={() => setIsFilterOpen(true)}>
                <div className="action-icon"><Icons.Search /></div>
                <div className="action-info"><h3>絞り込み</h3><p>条件検索パネルを開きます</p></div>
            </div>
        </div>
    );
};
