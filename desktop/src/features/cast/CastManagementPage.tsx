import React, { useState, useEffect } from 'react';
import type { CastBean } from '@/common/types/entities';
import { Repository } from '@/stores/AppContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CAST_PAGE_NOTICE, EXTERNAL_LINK } from '@/common/copy';
import { openInDefaultBrowser } from '@/common/openExternal';

type PersistCastsFn = (casts: CastBean[]) => void | Promise<void>;

export const CastManagementPage: React.FC<{
  repository: Repository;
  onPersistCasts?: PersistCastsFn;
}> = ({ repository, onPersistCasts }) => {
  const [casts, setCasts] = useState<CastBean[]>([]);
  const [selectedCastName, setSelectedCastName] = useState('');
  const [inputCastName, setInputCastName] = useState('');
  const [castSearchQuery, setCastSearchQuery] = useState('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    const allCasts = repository.getAllCasts();
    setCasts(allCasts);
    if (allCasts.length > 0 && !selectedCastName) {
      setSelectedCastName(allCasts[0].name);
    }
  }, [repository, selectedCastName]);

  const handleAddCast = () => {
    const newName = inputCastName.trim();
    if (!newName) return;
    if (casts.some(c => c.name === newName)) {
      setAlertMessage('そのキャストは既に登録されています');
      return;
    }

    const newCast: CastBean = {
      name: newName,
      is_present: false,
    };

    const updatedList = [...casts, newCast];
    repository.saveCasts(updatedList);
    setCasts(updatedList);
    setInputCastName('');
    if (updatedList.length === 1) setSelectedCastName(newName);
    onPersistCasts?.(updatedList);
  };

  const handleDeleteCast = (castName: string) => {
    const allCasts = repository.getAllCasts();
    if (allCasts.findIndex((c) => c.name === castName) === -1) return;

    setConfirmMessage({
      message: `「${castName}」を削除しますか？`,
      onConfirm: () => {
        setConfirmMessage(null);
        const updated = allCasts.filter((c) => c.name !== castName);
        repository.saveCasts(updated);
        setCasts(updated);
        if (selectedCastName === castName) {
          setSelectedCastName(updated[0]?.name ?? '');
        }
        onPersistCasts?.(updated);
      },
    });
  };

  const togglePresence = (cast: CastBean) => {
    const newStatus = !cast.is_present;
    repository.updateCastPresence(cast.name, newStatus);
    const nextCasts = [...repository.getAllCasts()];
    setCasts(nextCasts);
    onPersistCasts?.(nextCasts);
  };

  const handleRenameCast = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (casts.some((c) => c.name !== oldName && c.name === trimmed)) {
      setAlertMessage('そのキャスト名は既に使われています');
      return;
    }
    const nextCasts = casts.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c));
    repository.saveCasts(nextCasts);
    setCasts(nextCasts);
    if (selectedCastName === oldName) setSelectedCastName(trimmed);
    onPersistCasts?.(nextCasts);
  };

  const contactUrlsList = (c: CastBean): string[] =>
    (c.contact_urls && c.contact_urls.length > 0 ? c.contact_urls : ['']);

  const handleContactUrlChange = (castName: string, index: number, value: string) => {
    const nextCasts = casts.map((c) => {
      if (c.name !== castName) return c;
      const list = [...contactUrlsList(c)];

      let finalValue = value;
      if (finalValue.startsWith('dscsv@')) {
        finalValue = `https://discord.com/channels/${finalValue.slice(6)}`;
      } else if (finalValue.startsWith('dscdm@')) {
        finalValue = `https://discord.com/channels/@me/${finalValue.slice(6)}`;
      }

      list[index] = finalValue;
      const contact_urls = list.filter((u) => u.trim()).length ? list.map((u) => u.trim()).filter(Boolean) : undefined;
      return { ...c, contact_urls };
    });
    repository.saveCasts(nextCasts);
    setCasts(nextCasts);
    onPersistCasts?.(nextCasts);
  };

  const handleAddContactUrl = (castName: string) => {
    const nextCasts = casts.map((c) =>
      c.name === castName
        ? { ...c, contact_urls: [...(c.contact_urls ?? []), ''] }
        : c
    );
    repository.saveCasts(nextCasts);
    setCasts(nextCasts);
    onPersistCasts?.(nextCasts);
  };

  const handleConfirmOpenUrl = async () => {
    if (pendingOpenUrl) {
      await openInDefaultBrowser(pendingOpenUrl);
      setPendingOpenUrl(null);
    }
  };

  const castSearchLower = castSearchQuery.trim().toLowerCase();
  const filteredCasts = castSearchLower
    ? casts.filter((c) => c.name.toLowerCase().includes(castSearchLower))
    : casts;
  const presentCount = casts.filter((c) => c.is_present).length;
  const totalCount = casts.length;
  const presentCasts = casts.filter((c) => c.is_present);
  const absentCasts = casts.filter((c) => !c.is_present);

  return (
    <div className="page-wrapper page-wrapper--cast">
      <header className="page-header">
        <div className="page-header-row page-header-row--flex-start">
          <h1 className="page-header-title page-header-title--lg">キャスト管理</h1>
          <div className="status-card">
            <div className="status-card__label">出席状況</div>
            <div className="status-card__value">
              <span className="status-card__value-accent">{presentCount}</span>
              <span className="status-card__value-suffix">/ {totalCount}</span>
            </div>
          </div>
        </div>
      </header>

      <div
        className="cast-page-notice"
        role="alert"
      >
        {CAST_PAGE_NOTICE}
      </div>

      {/* 出席者・欠席者 一覧（一目でわかる枠） */}
      <div className="cast-presence-summary">
        <div className="cast-presence-summary__col cast-presence-summary__col--present">
          <div className="cast-presence-summary__label">出席者 ({presentCasts.length})</div>
          <div className="cast-presence-summary__list">
            {presentCasts.length > 0 ? (
              presentCasts.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="cast-presence-summary__chip cast-presence-summary__chip--present"
                  onClick={() => togglePresence(c)}
                  title="クリックで欠席に切り替え"
                >
                  {c.name}
                </button>
              ))
            ) : (
              <span className="cast-presence-summary__empty">—</span>
            )}
          </div>
        </div>
        <div className="cast-presence-summary__col cast-presence-summary__col--absent">
          <div className="cast-presence-summary__label">欠席者 ({absentCasts.length})</div>
          <div className="cast-presence-summary__list">
            {absentCasts.length > 0 ? (
              absentCasts.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="cast-presence-summary__chip cast-presence-summary__chip--absent"
                  onClick={() => togglePresence(c)}
                  title="クリックで出席に切り替え"
                >
                  {c.name}
                </button>
              ))
            ) : (
              <span className="cast-presence-summary__empty">—</span>
            )}
          </div>
        </div>
      </div>
      <p className="cast-presence-summary__hint">
        名前をタップ／クリックすると出席・欠席を切り替えられます。
      </p>

      <div className="flex-col-gap20">
        {/* キャスト新規登録フォーム */}
        <div className="form-card form-card--flex-row">
          <div className="flex-col-flex1">
            <label className="form-label">キャストを新規登録</label>
            <input
              placeholder="キャスト名を入力..."
              className="form-input"
              value={inputCastName}
              onChange={(e) => setInputCastName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCast()}
            />
          </div>
          <button onClick={handleAddCast} className="btn-success btn-fixed-h">
            登録
          </button>
        </div>


        <p className="form-inline-note text-muted-color mt-4">
          NGユーザーの登録・解除は「NGユーザー管理」で行います。
        </p>
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="form-input"
          placeholder="キャスト名で検索..."
          value={castSearchQuery}
          onChange={(e) => setCastSearchQuery(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </div>

      {/* カード一覧表示 */}
      <div className="cast-grid">
        {filteredCasts.map((cast) => (
          <div key={cast.name} className="cast-card">
            <div className="cast-card__header">
              <input
                type="text"
                className="cast-card__name-input"
                defaultValue={cast.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== cast.name) handleRenameCast(cast.name, v);
                  else if (e.target.value !== cast.name) e.target.value = cast.name;
                }}
                style={{ width: '100%', maxWidth: 160, padding: '2px 6px', fontSize: 'inherit', fontWeight: 700 }}
              />
              <div
                className={
                  'cast-card__status-dot ' +
                  (cast.is_present ? 'cast-card__status-dot--present' : 'cast-card__status-dot--absent')
                }
              />
            </div>

            <button
              onClick={() => togglePresence(cast)}
              className={
                'cast-card__presence-button ' +
                (cast.is_present
                  ? 'cast-card__presence-button--present'
                  : 'cast-card__presence-button--absent')
              }
            >
              {cast.is_present ? '出席中' : '欠席'}
            </button>

            <div className="form-group mt-8" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 12 }}>連絡先</label>
              <div className="litlink">
                {contactUrlsList(cast).map((url, idx) => (
                  <div key={idx} className="litlink__item">
                    <span className="litlink__icon litlink__icon--custom" aria-hidden>🔗</span>
                    <div className="litlink__body">
                      <input
                        type="text"
                        className="litlink__input"
                        placeholder="VRC・X・DiscordなどのURL（任意）"
                        value={url}
                        onChange={(e) => handleContactUrlChange(cast.name, idx, e.target.value)}
                      />
                    </div>
                    {(url.startsWith('http://') || url.startsWith('https://')) && (
                      <button
                        type="button"
                        className="litlink__open"
                        title="ブラウザで開く"
                        onClick={() => setPendingOpenUrl(url)}
                        aria-label="リンクを開く"
                      >
                        →
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="litlink__add"
                  onClick={() => handleAddContactUrl(cast.name)}
                >
                  ＋ 連絡先を追加
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDeleteCast(cast.name)}
              className="cast-card__delete-button mt-8"
            >
              キャストを削除
            </button>
          </div>
        ))}
      </div>

      {alertMessage && (
        <ConfirmModal
          message={alertMessage}
          onConfirm={() => setAlertMessage(null)}
          confirmLabel="OK"
          type="alert"
        />
      )}
      {confirmMessage && (
        <ConfirmModal
          message={confirmMessage.message}
          onConfirm={confirmMessage.onConfirm}
          onCancel={() => setConfirmMessage(null)}
          confirmLabel="OK"
          type="confirm"
        />
      )}
      {pendingOpenUrl && (
        <ConfirmModal
          title={EXTERNAL_LINK.MODAL_TITLE}
          message={`${pendingOpenUrl}\n\n${EXTERNAL_LINK.MODAL_MESSAGE}`}
          onConfirm={handleConfirmOpenUrl}
          onCancel={() => setPendingOpenUrl(null)}
          confirmLabel={EXTERNAL_LINK.CONFIRM_LABEL}
          cancelLabel={EXTERNAL_LINK.CANCEL_LABEL}
          type="confirm"
        />
      )}
    </div>
  );
};