import { ScanProgress } from "../types";

interface ScanningOverlayProps {
    progress: ScanProgress;
    title?: string;
    description?: string;
    onCancel: () => void;
    canCancel?: boolean;
}

export const ScanningOverlay = ({
    progress,
    title = "スキャン中...",
    description,
    onCancel,
    canCancel = true,
}: ScanningOverlayProps) => {
    return (
        <div className="overlay-loader">
            <div className="loader-content">
                <div className="spinner" />
                <h3>{title}</h3>
                {description && <p className="overlay-description">{description}</p>}
                <div className="progress-container">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : "0%" }} />
                    </div>
                    <div className="progress-text">
                        {progress.processed} / {progress.total}
                        {progress.current_world && <span className="current-world"> — {progress.current_world}</span>}
                    </div>
                </div>
                {canCancel && (
                    <button className="cancel-button-overlay" onClick={onCancel}>
                        スキャンを中断
                    </button>
                )}
            </div>
        </div>
    );
};
