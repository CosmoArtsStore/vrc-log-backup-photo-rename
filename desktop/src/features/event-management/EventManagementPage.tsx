import React, { useState, useEffect } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
import { invoke } from '@/tauri';
import { ConfirmModal } from '@/components/ConfirmModal';
import './event-management.css';

export const EventManagementPage: React.FC = () => {
    const [events, setEvents] = useState<string[]>([]);
    const [currentEvent, setCurrentEvent] = useState<string | null>(null);
    const [newEventName, setNewEventName] = useState('');
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [switchTarget, setSwitchTarget] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchEvents = async () => {
        try {
            setIsLoading(true);
            const list = await invoke<string[]>('list_events');
            setEvents(list || []);
            const current = await invoke<string | null>('get_current_event');
            setCurrentEvent(current);
        } catch (e) {
            console.error(e);
            setAlertMessage('イベントの取得に失敗しました。');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const handleCreateEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newEventName.trim();
        if (!name) return;
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            setAlertMessage('イベント名は半角英数字、ハイフン、アンダースコアのみ使用可能です。');
            return;
        }
        if (events.includes(name)) {
            setAlertMessage('すでに同じ名前のイベントが存在します。');
            return;
        }
        try {
            await invoke('create_event', { eventName: name });
            setNewEventName('');
            await fetchEvents();
        } catch (err) {
            console.error(err);
            setAlertMessage(`イベントの作成に失敗しました: ${err}`);
        }
    };

    const confirmSwitchEvent = async () => {
        if (!switchTarget) return;
        try {
            await invoke('set_current_event', { eventName: switchTarget });
            setSwitchTarget(null);
            window.location.reload();
        } catch (err) {
            console.error(err);
            setAlertMessage(`イベントの切り替えに失敗しました: ${err}`);
            setSwitchTarget(null);
        }
    };

    return (
        <div className="event-management-page">
            <header className="page-header">
                <h1 className="page-title"><Database className="page-title-icon" /> イベント管理</h1>
                <p className="page-description">複数のイベントデータを切り替えて管理します。</p>
            </header>

            {alertMessage && (
                <ConfirmModal
                    type="alert"
                    message={alertMessage}
                    onConfirm={() => setAlertMessage(null)}
                    confirmLabel="OK"
                />
            )}

            {switchTarget && (
                <ConfirmModal
                    type="confirm"
                    title="イベント切り替え"
                    message={`イベント「${switchTarget}」に切り替えますか？\n※アプリケーションが再起動され、現在のデータは保存されません。`}
                    confirmLabel="切り替える"
                    cancelLabel="キャンセル"
                    onConfirm={confirmSwitchEvent}
                    onCancel={() => setSwitchTarget(null)}
                />
            )}

            <div className="event-management-content">
                <section className="event-section current-event">
                    <h2>現在のイベント</h2>
                    <div className="event-badge">
                        {isLoading ? '読込中...' : currentEvent ?? '未設定'}
                    </div>
                </section>

                <section className="event-section create-event">
                    <h2>新規イベントの作成</h2>
                    <form onSubmit={handleCreateEvent} className="create-event-form">
                        <input
                            type="text"
                            placeholder="イベント名 (半角英数字)"
                            value={newEventName}
                            onChange={e => setNewEventName(e.target.value)}
                            className="event-input"
                        />
                        <button type="submit" className="btn-primary" disabled={!newEventName.trim()}>
                            <Plus size={16} /> 作成
                        </button>
                    </form>
                </section>

                <section className="event-section event-list-section">
                    <div className="section-header">
                        <h2>保存されているイベント</h2>
                        <button className="btn-icon" onClick={fetchEvents} title="再読込">
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    <div className="event-list">
                        {isLoading ? (
                            <p>読み込み中...</p>
                        ) : events.length === 0 ? (
                            <p>イベントがありません。</p>
                        ) : (
                            events.map(ev => (
                                <div key={ev} className={`event-card ${ev === currentEvent ? 'active' : ''}`}>
                                    <div className="event-card-name">
                                        <Database size={16} /> {ev}
                                    </div>
                                    {ev !== currentEvent && (
                                        <button className="btn-secondary" onClick={() => setSwitchTarget(ev)}>
                                            <RefreshCw size={14} /> 切り替える
                                        </button>
                                    )}
                                    {ev === currentEvent && (
                                        <span className="event-card-current-label">使用中</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};
