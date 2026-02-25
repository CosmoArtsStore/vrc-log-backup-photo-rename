import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '@/stores/AppContext';
import './lottery.css';
import { ConfirmModal } from '@/components/ConfirmModal';
import { AppSelect } from '@/components/AppSelect';
import { MATCHING_TYPE_CODES_SELECTABLE, MATCHING_TYPE_LABELS } from '@/features/matching/types/matching-type-codes';
import { buildTsvContent } from '@/common/downloadCsv';
import { parseLotteryResultTsv } from '@/common/lotteryImport';
import { invoke } from '@/tauri';
import { isTauri } from '@/tauri';
import { InputModal } from '@/components/InputModal';
import { LotteryTemplate } from './types/lottery-template';
import { useLotteryValidation } from './hooks/useLotteryValidation';
import { useLotteryTemplates } from './hooks/useLotteryTemplates';
import { LotteryTemplateManager } from './components/LotteryTemplateManager';
import { LotteryValidationPanel } from './components/LotteryValidationPanel';
const PREF_NAME = 'lottery-pref';


interface LotteryPref {
  count: number;
  matchingTypeCode: string;
  rotationCount: number;
  totalTables: number;
  usersPerTable: number;
  castsPerRotation: number;
  allowM003EmptySeats?: boolean;
}

export const LotteryPage: React.FC = () => {
  const {
    setActivePage,
    repository,
    setCurrentWinners,
    guaranteedWinners,
    setGuaranteedWinners,
    matchingTypeCode,
    setMatchingTypeCode,
    rotationCount,
    setRotationCount,
    totalTables,
    setTotalTables,
    usersPerTable,
    setUsersPerTable,
    castsPerRotation,
    setCastsPerRotation,
    allowM003EmptySeats,
    setAllowM003EmptySeats,
    currentWinners,
    setGlobalMatchingResult,
    setGlobalTableSlots,
    setGlobalMatchingError,
  } = useAppContext();

  const [count, setCount] = useState(1);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showGuaranteedSelect, setShowGuaranteedSelect] = useState(false);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSettings = useMemo(() => ({
    matchingTypeCode,
    rotationCount,
    totalTables,
    usersPerTable,
    castsPerRotation,
    allowM003EmptySeats,
  }), [matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats]);

  const {
    templates,
    selectedTemplateId,
    setSelectedTemplateId,
    showSaveTemplateModal,
    setShowSaveTemplateModal,
    templateConfirmMessage,
    setTemplateConfirmMessage,
    handleSaveTemplateSubmit,
    handleDeleteTemplate,
    handleOverwriteTemplate,
  } = useLotteryTemplates(currentSettings);

  const handleSelectTemplate = useCallback((id: string, template?: LotteryTemplate) => {
    setSelectedTemplateId(id);
    if (template) {
      setMatchingTypeCode(template.settings.matchingTypeCode as typeof matchingTypeCode);
      setRotationCount(template.settings.rotationCount);
      setTotalTables(template.settings.totalTables);
      setUsersPerTable(template.settings.usersPerTable);
      setCastsPerRotation(template.settings.castsPerRotation);
      setAllowM003EmptySeats(template.settings.allowM003EmptySeats ?? false);
    }
  }, [setSelectedTemplateId, setMatchingTypeCode, setRotationCount, setTotalTables, setUsersPerTable, setCastsPerRotation, setAllowM003EmptySeats]);

  // pref読み込み（初回マウント時）
  useEffect(() => {
    if (!isTauri()) { setPrefLoaded(true); return; }
    invoke<string | null>('read_pref_json', { name: PREF_NAME })
      .then((raw) => {
        if (raw) {
          try {
            const pref: LotteryPref = JSON.parse(raw);
            if (typeof pref.count === 'number' && pref.count >= 1) setCount(pref.count);
            if (pref.matchingTypeCode) setMatchingTypeCode(pref.matchingTypeCode as typeof matchingTypeCode);
            if (typeof pref.rotationCount === 'number' && pref.rotationCount >= 1) setRotationCount(pref.rotationCount);
            if (typeof pref.totalTables === 'number' && pref.totalTables >= 1) setTotalTables(pref.totalTables);
            if (typeof pref.usersPerTable === 'number' && pref.usersPerTable >= 1) setUsersPerTable(pref.usersPerTable);
            if (typeof pref.castsPerRotation === 'number' && pref.castsPerRotation >= 1) setCastsPerRotation(pref.castsPerRotation);
            if (typeof pref.allowM003EmptySeats === 'boolean') setAllowM003EmptySeats(pref.allowM003EmptySeats);
          } catch { /* ignore parse errors */ }
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => setPrefLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pref保存（値が変更されたとき）
  useEffect(() => {
    if (!prefLoaded || !isTauri()) return;
    const pref: LotteryPref = {
      count,
      matchingTypeCode,
      rotationCount,
      totalTables,
      usersPerTable,
      castsPerRotation,
      allowM003EmptySeats,
    };
    invoke('write_pref_json', { name: PREF_NAME, content: JSON.stringify(pref) }).catch(() => { /* ignore */ });
  }, [count, matchingTypeCode, rotationCount, totalTables, usersPerTable, castsPerRotation, allowM003EmptySeats, prefLoaded]);

  // TSVインポートハンドラー
  const handleImportTsv = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        setAlertMessage('ファイルの読み込みに失敗しました');
        return;
      }

      const { users, validation } = parseLotteryResultTsv(content);

      if (!validation.isValid) {
        const errorMessage = [
          '抽選結果TSVの形式が不正です:',
          '',
          ...validation.errors,
          ...(validation.warnings.length > 0 ? ['', '警告:', ...validation.warnings] : []),
        ].join('\n');
        setAlertMessage(errorMessage);
        return;
      }

      if (validation.warnings.length > 0) {
        const warningMessage = [
          `${users.length} 名の当選者をインポートしました`,
          '',
          '警告:',
          ...validation.warnings,
        ].join('\n');
        setAlertMessage(warningMessage);
      }

      // 当選者を設定
      setCurrentWinners(users);
      const importedGuaranteed = users.filter(u => u.is_guaranteed);
      setGuaranteedWinners(importedGuaranteed);
      setActivePage('lottery');
    };

    reader.onerror = () => {
      setAlertMessage('ファイルの読み込み中にエラーが発生しました');
    };

    reader.readAsText(file, 'UTF-8');

    // ファイル選択をリセット（同じファイルを再選択可能にする）
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setCurrentWinners, setGuaranteedWinners, setActivePage]);

  const allUsers = repository.getAllApplyUsers();
  const allCasts = repository.getAllCasts();
  const activeCastCount = allCasts.filter((c) => c.is_present).length;
  const totalWinners = count + guaranteedWinners.length;

  // リアルタイムバリデーション
  const validation = useLotteryValidation({
    matchingTypeCode,
    totalWinners,
    totalTables,
    activeCastCount,
    castsPerRotation,
    usersPerTable,
    allowM003EmptySeats,
  });

  const doRun = useCallback(() => {
    const all = repository.getAllApplyUsers();
    const guaranteedIds = new Set(guaranteedWinners.map(w => w.x_id));
    const eligible = all.filter(u => !guaranteedIds.has(u.x_id));
    const shuffled = [...eligible].sort(() => 0.5 - Math.random());
    const lotteryWinners = shuffled.slice(0, count);
    const winners = [...guaranteedWinners.map(w => ({ ...w, is_guaranteed: true })), ...lotteryWinners];
    setCurrentWinners(winners);
    setGlobalMatchingResult(null);
    setGlobalTableSlots(undefined);
    setGlobalMatchingError(null);
    setActivePage('lottery');
    if (isTauri() && winners.length > 0) {
      // 現在の表の形に合わせたヘッダーを作成
      const maxCastCols = winners.reduce((max, u) => {
        const c = u.casts.filter(x => x && x.trim() !== '').length;
        return c > max ? c : max;
      }, 3);

      const header = ['ユーザー', 'X ID'];
      for (let i = 0; i < maxCastCols; i++) header.push(`希望${i + 1} `);
      header.push('区分');

      const rows = winners.map((u) => {
        const r = [u.name || '', u.x_id || ''];
        for (let i = 0; i < maxCastCols; i++) r.push(u.casts[i] || '');
        r.push(u.is_guaranteed ? '確定' : '抽選');
        return r;
      });

      const content = buildTsvContent([header, ...rows]);
      invoke('write_backup_lottery_tsv', { content }).catch(() => { });
    }
  }, [count, repository, setActivePage, setCurrentWinners, guaranteedWinners, setGlobalMatchingResult, setGlobalTableSlots, setGlobalMatchingError]);

  const run = useCallback(() => {
    if (validation.errors.length > 0) return;

    if (currentWinners && currentWinners.length > 0) {
      setConfirmMessage('前回の抽選結果（またはマッチング結果）が残っていますが、新しく抽選を行いますか？\n※前回の抽選結果・マッチング結果は削除されます');
    } else {
      doRun();
    }
  }, [validation.errors.length, currentWinners, doRun]);

  const handleConfirmOk = useCallback(() => {
    doRun();
    setConfirmMessage(null);
  }, [doRun]);

  const handleConfirmCancel = useCallback(() => {
    setConfirmMessage(null);
  }, []);

  const countLabel = '当選者数（抽選枠）';

  const handleToggleGuaranteed = (user: import('@/common/types/entities').UserBean) => {
    const isSelected = guaranteedWinners.some(w => w.x_id === user.x_id);
    let newGuaranteed: typeof guaranteedWinners;
    if (isSelected) {
      newGuaranteed = guaranteedWinners.filter(w => w.x_id !== user.x_id);
    } else {
      newGuaranteed = [...guaranteedWinners, user];
    }
    setGuaranteedWinners(newGuaranteed);
  };

  return (
    <div className="lottery-page-container fade-in">
      <div className="lottery-page-header">
        <h1 className="page-header-title page-header-title--sm">抽選条件</h1>
        <p className="page-header-subtitle page-header-subtitle--tight">
          マッチング形式と条件を選択してください
        </p>
      </div>

      <div className="lottery-split-pane">
        {/* 左カラム：入力フォーム */}
        <div className="lottery-split-left custom-scrollbar">
          <div className="page-card-narrow lottery-form-card">

            {/* テンプレート操作エリア */}
            <LotteryTemplateManager
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={handleSelectTemplate}
              onSaveNewClick={() => setShowSaveTemplateModal(true)}
              onOverwriteClick={handleOverwriteTemplate}
              onDeleteClick={handleDeleteTemplate}
            />

            {/* 1. ローテーション回数＋総テーブル数（2列グリッド） */}
            <div className="lottery-grid-2col lottery-grid-2col--margin-bottom">
              {/* 左列: ローテーション回数（共通） */}
              <div className="form-group lottery-form-group--no-margin">
                <label className="form-label lottery-label--margin-bottom">ローテーション回数</label>
                <div className="form-inline-group">
                  <input
                    type="number"
                    value={rotationCount}
                    min={1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRotationCount(Number.isFinite(v) && v >= 1 ? v : rotationCount);
                    }}
                    className="form-number-input"
                  />
                </div>
              </div>

              {/* 右列: 総テーブル数 */}
              <div className="form-group lottery-form-group--no-margin">
                <label className="form-label lottery-label--margin-bottom">総テーブル数</label>
                <input
                  type="number"
                  value={totalTables}
                  min={1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTotalTables(Number.isFinite(v) && v >= 1 ? v : totalTables);
                  }}
                  className="form-number-input"
                />
                <p className="form-inline-note lottery-note--margin-top">
                  ※ 全形式で共通
                </p>
              </div>
            </div>

            {/* 2. マッチング形式 */}
            <div className="form-group lottery-form-group--matching-type">
              <label className="form-label lottery-label--margin-bottom">マッチング形式（コード M001～M002）</label>
              <AppSelect
                value={MATCHING_TYPE_CODES_SELECTABLE.includes(matchingTypeCode) ? matchingTypeCode : 'M001'}
                onValueChange={(v) => setMatchingTypeCode(v as typeof matchingTypeCode)}
                options={MATCHING_TYPE_CODES_SELECTABLE.map((code) => ({
                  value: code,
                  label: `${code}: ${MATCHING_TYPE_LABELS[code]} `,
                }))}
              />
            </div>

            {/* 3. 確定当選枠＋当選者数（2列グリッド） */}
            <div className="lottery-grid-2col lottery-grid-2col--margin-bottom">
              {/* 左列: 確定当選枠 */}
              <div className="form-group lottery-form-group--no-margin">
                <label className="form-label lottery-label--margin-bottom">確定当選枠</label>
                <div className="lottery-guaranteed-select-btn-wrap">
                  <button
                    type="button"
                    onClick={() => setShowGuaranteedSelect(true)}
                    className="btn-secondary lottery-guaranteed-select-btn"
                  >
                    確定当選者を選択
                  </button>
                  <span className="form-inline-note lottery-guaranteed-count">({guaranteedWinners.length}名)</span>
                </div>
                <p className="form-inline-note lottery-note--compact">
                  抽選せずに確定で当選させるユーザー
                </p>
              </div>

              {/* 右列: 当選者数（抽選枠） */}
              <div className="form-group lottery-form-group--no-margin">
                <label className="form-label lottery-label--margin-bottom">{countLabel}</label>
                <div className="form-inline-group lottery-count-input-wrap">
                  <input
                    type="number"
                    value={count}
                    min={1}
                    step={1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 1) {
                        setCount(v);
                      }
                    }}
                    className="lottery-count-input"
                  />
                </div>
                {matchingTypeCode === 'M003' && usersPerTable > 1 && (count + guaranteedWinners.length) % usersPerTable !== 0 && (
                  <p className="form-inline-note lottery-note--warning">※ 最後のテーブルに{usersPerTable - ((count + guaranteedWinners.length) % usersPerTable)}名分の空席が発生します</p>
                )}
              </div>
            </div>

            {showGuaranteedSelect && (
              <ConfirmModal
                type="alert"
                title="確定当選者を選択"
                message={`抽選せずに当選させるユーザーにチェックを付けます。${guaranteedWinners.length} 名選択中。`}
                confirmLabel="閉じる"
                onConfirm={() => setShowGuaranteedSelect(false)}
                children={
                  <div className="guaranteed-select-modal-list">
                    {allUsers.length === 0 ? (
                      <p className="form-inline-note">応募者データがありません</p>
                    ) : (
                      <div className="guaranteed-select-modal-list__scroll">
                        {allUsers.map((user) => {
                          const isSelected = guaranteedWinners.some((w) => w.x_id === user.x_id);
                          return (
                            <label key={user.x_id} className="guaranteed-select-modal-list__item">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleGuaranteed(user)}
                              />
                              <span className="guaranteed-select-modal-list__name">{user.name}</span>
                              <span className="guaranteed-select-modal-list__id">@{user.x_id.replace(/^@/, '')}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                }
              />
            )}

            {/* 4. 多対多ローテーション条件設定 (タイトル部) */}
            {matchingTypeCode === 'M003' && (
              <div className="lottery-m003-section">
                <h3 className="lottery-m003-title">
                  多対多ローテーション条件設定
                </h3>

                {/* 1テーブルあたりのユーザー数＋1ローテあたりのキャスト数（2列グリッド） */}
                <div className="lottery-grid-2col">
                  <div className="form-group lottery-form-group--no-margin">
                    <label className="form-label lottery-label--margin-bottom">1テーブルのユーザー数</label>
                    <div className="form-inline-group">
                      <input
                        type="number"
                        value={usersPerTable}
                        min={1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setUsersPerTable(Number.isFinite(v) && v >= 1 ? v : usersPerTable);
                        }}
                        className="form-number-input"
                      />
                    </div>
                  </div>

                  <div className="form-group lottery-form-group--no-margin">
                    <label className="form-label lottery-label--margin-bottom">1ローテのキャスト数</label>
                    <div className="form-inline-group">
                      <input
                        type="number"
                        value={castsPerRotation}
                        min={1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCastsPerRotation(Number.isFinite(v) && v >= 1 ? v : castsPerRotation);
                        }}
                        className="form-number-input"
                      />
                    </div>
                    <p className="form-inline-note lottery-note--margin-top">※ 総数がこの倍数でないと警告</p>
                  </div>
                </div>

                {/* 空席・空きテーブルの許容設定 */}
                <div className="form-group lottery-checkbox-group">
                  <label className="form-label lottery-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allowM003EmptySeats}
                      onChange={(e) => setAllowM003EmptySeats(e.target.checked)}
                    />
                    端数の空席・手動指定による空きテーブルを許可する
                  </label>
                </div>
              </div>
            )}

            {/* 隠しファイル入力 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv"
              className="lottery-hidden-input"
              onChange={handleFileChange}
            />

          </div>
        </div>

        {/* 右カラム：WARNING（バリデーション結果）とアクションボタン */}
        <div className="lottery-split-right">
          <LotteryValidationPanel
            validation={validation}
            onImportClick={handleImportTsv}
            onRunClick={run}
          />
        </div>
      </div>

      {confirmMessage && (
        <ConfirmModal
          title="再抽選の確認"
          message={confirmMessage}
          onConfirm={handleConfirmOk}
          onCancel={handleConfirmCancel}
          confirmLabel="再抽選実行"
          cancelLabel="キャンセル"
          type="confirm"
        />
      )}
      {alertMessage && (
        <ConfirmModal
          message={alertMessage}
          onConfirm={() => setAlertMessage(null)}
          confirmLabel="OK"
          type="alert"
        />
      )}
      {templateConfirmMessage && (
        <ConfirmModal
          message={templateConfirmMessage.message}
          onConfirm={templateConfirmMessage.action}
          onCancel={() => setTemplateConfirmMessage(null)}
          confirmLabel="OK"
          type="confirm"
        />
      )}
      {showSaveTemplateModal && (
        <InputModal
          title="テンプレートの保存"
          description="現在の条件設定に名前をつけて保存します。"
          fields={[{ key: 'templateName', label: 'テンプレート名', placeholder: '例：通常営業、多対多イベント' }]}
          onSubmit={handleSaveTemplateSubmit}
          onCancel={() => setShowSaveTemplateModal(false)}
          submitLabel="保存する"
        />
      )}
    </div>
  );
};
