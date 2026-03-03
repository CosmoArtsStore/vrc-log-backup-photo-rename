import { Icons } from "./Icons";

interface ActionCardsProps {
    handleRegisterToStellaRecord: () => void;
    startScan: () => void;
    cancelScan: () => void;
    scanStatus: string;
    setShowSettings: (val: boolean) => void;
}

export const ActionCards = ({
    handleRegisterToStellaRecord,
    startScan,
    cancelScan,
    scanStatus,
    setShowSettings,
}: ActionCardsProps) => {
    return (
        <div className="action-cards-grid">
            <div className="action-card" onClick={handleRegisterToStellaRecord}>
                <div className="action-icon"><Icons.Link /></div>
                <div className="action-info"><h3>Connect</h3><p>StellaRecord 連携登録</p></div>
            </div>
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
        </div>
    );
};
