import React, { useState, useMemo } from 'react';
import { IMPORT_COLUMN_LABELS } from '@/common/copy';
import { isTauri } from '@/tauri';
import { parseTSV } from '@/common/csvParse';
import {
  type ColumnMapping,
  createEmptyColumnMapping,
  hasRequiredIdentityColumn,
} from '@/common/importFormat';
import type { MapRowOptions } from '@/common/sheetParsers';
import { AppSelect, type AppSelectOption } from '@/components/AppSelect';

interface ImportPageProps {
  onImportUserRows: (
    rows: string[][],
    mapping: ColumnMapping,
    options?: MapRowOptions
  ) => void;
}

export const ImportPage: React.FC<ImportPageProps> = ({ onImportUserRows }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<string[][] | null>(null);
  /** カスタム時: TSVの1行目（ヘッダー）。列の選択肢に実際の値として表示する */
  const [customHeaderRow, setCustomHeaderRow] = useState<string[] | null>(null);
  const [customMapping, setCustomMapping] = useState<ColumnMapping>(() =>
    createEmptyColumnMapping()
  );
  /** カスタム時: この列をカンマ区切りで希望1・2・3に分割して使う（-1=使わない） */
  const [splitCommaColumnIndex, setSplitCommaColumnIndex] = useState<number>(-1);
  /** 希望キャストの入力形式: 'multiple' = 複数指定可(1列のみ), 'single' = 単一項目(＋で列追加) */
  const [castInputType, setCastInputType] = useState<'multiple' | 'single'>('multiple');
  /** 単一項目のときの希望キャスト列数（1〜10）。+ボタンで追加 */
  const [castColumnCount, setCastColumnCount] = useState(1);
  /** 希望の重みをつけるか(単一の場合のみ) */
  const [castUseWeight, setCastUseWeight] = useState<boolean>(false);


  /** カスタムで読み込んだデータのうち、3つ以上カンマを含むセルがある列のインデックス */
  const columnsWithMultipleCommas = useMemo(() => {
    if (!customRows || customRows.length === 0) return [];
    const safeLengths = customRows.map((r) => (Array.isArray(r) ? r.length : 0));
    const maxCol = Math.max(0, ...safeLengths);
    const result: number[] = [];
    for (let col = 0; col < maxCol; col++) {
      const hasThreeOrMore = customRows.some((row) => {
        if (!Array.isArray(row)) return false;
        const cell = String(row[col] ?? '').trim();
        const commaCount = (cell.match(/,/g) || []).length;
        return commaCount >= 2;
      });
      if (hasThreeOrMore) result.push(col);
    }
    return result;
  }, [customRows]);

  const handleSelectFile = async () => {
    setError('');
    if (!isTauri()) {
      setError(
        'TSVの取り込みはデスクトップアプリで利用できます。npm run tauri:dev で起動してください。'
      );
      return;
    }
    setLoading(true);
    setCustomRows(null);
    setCustomHeaderRow(null);
    setSplitCommaColumnIndex(-1);
    setCastInputType('multiple');
    setCastUseWeight(false);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await open({
        title: '応募データTSVを選択',
        filters: [{ name: 'TSV', extensions: ['tsv'] }],
      });
      if (selectedPath === null) {
        setLoading(false);
        return;
      }
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(selectedPath);
      const text = typeof content === 'string' ? content : (content != null ? String(content) : '');
      const rows = parseTSV(text);
      const headerRows = 1;
      if (!Array.isArray(rows) || rows.length <= headerRows) {
        setError('データ行がありません。');
        setLoading(false);
        return;
      }
      const dataRows = rows.slice(headerRows).filter((r): r is string[] => Array.isArray(r));

      const headerRow = (Array.isArray(rows[0]) ? rows[0] : []) as string[];
      setCustomHeaderRow(headerRow);
      setCustomRows(dataRows);
      const maxCol = Math.max(0, ...dataRows.map((r) => r.length), headerRow.length) - 1;
      const clamp = (v: number) => (v <= maxCol ? v : 0);
      const clampOrMinus = (v: number) => (v <= maxCol ? v : -1);
      let appliedPref = false;
      if (typeof window !== 'undefined' && (window as unknown as { __TAURI__?: unknown }).__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const prefJson = await invoke<string | null>('get_matching_import_pref', {
            headerJson: JSON.stringify(headerRow),
          });
          if (prefJson && typeof prefJson === 'string') {
            const pref = JSON.parse(prefJson) as {
              mapping?: ColumnMapping;
              castInputType?: 'multiple' | 'single';
              castUseWeight?: boolean;
              castColumnCount?: number;
              splitCommaColumnIndex?: number;
            };
            if (pref.mapping) {
              const m = { ...createEmptyColumnMapping(), ...pref.mapping };
              m.name = typeof m.name === 'number' && m.name >= 0 ? clamp(m.name) : -1;
              m.x_id = typeof m.x_id === 'number' && m.x_id >= 0 ? clamp(m.x_id) : -1;
              m.cast1 = typeof m.cast1 === 'number' && m.cast1 >= 0 ? clamp(m.cast1) : -1;
              m.cast2 = typeof m.cast2 === 'number' ? clampOrMinus(m.cast2) : -1;
              m.cast3 = typeof m.cast3 === 'number' ? clampOrMinus(m.cast3) : -1;
              m.vrc_url = typeof m.vrc_url === 'number' && m.vrc_url >= 0 ? clamp(m.vrc_url) : -1;
              setCustomMapping(m);
            }
            if (pref.castInputType != null) setCastInputType(pref.castInputType);
            if (pref.castUseWeight != null) setCastUseWeight(pref.castUseWeight);
            if (pref.castColumnCount != null) setCastColumnCount(Math.min(3, Math.max(1, pref.castColumnCount)));
            if (pref.splitCommaColumnIndex != null) setSplitCommaColumnIndex(pref.splitCommaColumnIndex >= 0 && pref.splitCommaColumnIndex <= maxCol ? pref.splitCommaColumnIndex : -1);
            appliedPref = true;
          }
        } catch (_) { }
      }
      if (!appliedPref) {
        setCustomMapping((prev) => {
          const next = { ...prev };
          next.name = next.name >= 0 ? clamp(next.name) : -1;
          next.x_id = next.x_id >= 0 ? clamp(next.x_id) : -1;
          next.vrc_url = next.vrc_url >= 0 ? clamp(next.vrc_url) : -1;
          next.cast1 = next.cast1 >= 0 ? clamp(next.cast1) : -1;
          next.cast2 = clampOrMinus(next.cast2 ?? -1);
          next.cast3 = clampOrMinus(next.cast3 ?? -1);
          return next;
        });
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました。';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomImport = () => {
    if (!customRows || customRows.length === 0) return;
    setError('');
    if (!hasRequiredIdentityColumn(customMapping)) {
      setError('アカウントID(X)は必ず指定してください。');
      return;
    }
    if (castInputType === 'single') {
      const mappedCasts = [customMapping.cast1, customMapping.cast2, customMapping.cast3].filter(c => c >= 0);
      if (mappedCasts.length >= 4) {
        setError('「希望キャスト」は最大3つまでしか指定できません。');
        return;
      }
    }
    const options: MapRowOptions | undefined =
      splitCommaColumnIndex >= 0
        ? { splitCommaColumnIndex }
        : undefined;

    const fixedIndices = new Set(
      [customMapping.name, customMapping.x_id, customMapping.cast1, customMapping.cast2, customMapping.cast3].filter(
        (i) => i >= 0
      )
    );
    const maxCol = Math.max(maxColIndex + 1, 0);
    const extraColumns: { columnIndex: number; label: string }[] = [];
    for (let i = 0; i < maxCol; i++) {
      if (fixedIndices.has(i)) continue;
      const headerLabel = String(customHeaderRow?.[i] ?? '').trim() || `列${i + 1}`;
      extraColumns.push({ columnIndex: i, label: headerLabel });
    }
    const mappingWithExtra = { ...customMapping, extraColumns };
    const finalMapping =
      castInputType === 'multiple'
        ? { ...mappingWithExtra, cast2: -1, cast3: -1 }
        : mappingWithExtra;

    onImportUserRows(customRows, { ...finalMapping, castInputType, castUseWeight }, options);

    if (customHeaderRow && typeof window !== 'undefined' && (window as unknown as { __TAURI__?: unknown }).__TAURI__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        const pref = {
          mapping: finalMapping,
          castInputType,
          castUseWeight,
          castColumnCount,
          splitCommaColumnIndex,
        };
        invoke('save_import_template', {
          headerJson: JSON.stringify(customHeaderRow),
          prefJson: JSON.stringify(pref),
        }).catch(() => { });
      });
    }
  };

  const safeRowLengths = (customRows ?? []).map((r) => (Array.isArray(r) ? r.length : 0));
  const headerLen = Array.isArray(customHeaderRow) ? customHeaderRow.length : 0;
  const maxColIndex = customRows?.length || customHeaderRow
    ? Math.max(0, ...safeRowLengths, headerLen) - 1
    : -1;
  const colCount = Math.max(0, maxColIndex + 1);
  /** 各列の表示ラベル: ヘッダーの値、なければ1行目の値。括弧で列番号を表示。 */
  const columnOptions = Array.from({ length: colCount }, (_, i) => {
    const headerVal = String(customHeaderRow?.[i] ?? '').trim();
    const firstRow = customRows?.[0];
    const sampleVal = Array.isArray(firstRow) ? String(firstRow[i] ?? '').trim() : '';
    const content = headerVal || sampleVal || '';
    const short = content.length > 20 ? `${content.slice(0, 18)}…` : content;
    const label = short ? `列${i + 1}: ${short}` : `列${i + 1}`;
    return { value: i, label };
  });
  /** Radix Select は Item の value に空文字列を許容しないため、「使わない」に非空のセンチネル値を使う */
  const NONE_VALUE = '__none__';
  const columnSelectOptions: AppSelectOption[] = useMemo(
    () => [{ value: NONE_VALUE, label: '使わない' }, ...columnOptions.map((o) => ({ value: String(o.value), label: o.label }))],
    [columnOptions],
  );
  /** AppSelect に渡す value。options に存在しない値だと Radix が落ちるため、必ず options 内の値にそろえる */
  const safeColumnValue = (num: number | undefined): string => {
    if (typeof num !== 'number' || num < 0 || Number.isNaN(num)) return NONE_VALUE;
    const s = String(num);
    return columnSelectOptions.some((o) => o.value === s) ? s : NONE_VALUE;
  };
  const castTypeOptions: AppSelectOption[] = [
    { value: 'multiple', label: '複数指定可（カンマ区切りまたはチェックボックス）' },
    { value: 'single', label: '単一項目（希望キャスト1、希望キャスト2...）' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-card-narrow">
        <h2 className="page-header-title page-header-title--md">データ読取</h2>
        <p className="page-header-subtitle form-subtitle-mb">
          応募データ（TSV・タブ区切り）をファイルで取り込みます。TSVを選択後、列の割り当てと希望キャスト列内のカンマ区切り分割の有無を指定できます。
        </p>

        {/* インポート形式の選択は不要になったため削除 */}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="btn-primary btn-full-width"
            onClick={handleSelectFile}
            disabled={loading}
          >
            {loading ? '読み込み中...' : 'TSVファイルを選択'}
          </button>
          {/* ここにCSVダウンロードリンクがあったがデバッグタブに移動 */}
        </div>

        {customRows !== null && customRows.length > 0 && (
          <div className="form-group form-group-spacing" style={{ marginTop: 24 }}>
            <label className="form-label">列の割り当て</label>
            <p className="form-inline-note form-note-mt" style={{ marginBottom: 8 }}>
              {customRows.length} 行読み込みました。アカウントID(X)は必須指定です。その他の項目（応募者名、VRCリンク、希望キャスト）は任意（オプション）です。同じヘッダー形式で取り込んだ過去の設定は自動で復元されます。
            </p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ fontSize: 14, marginBottom: 4 }}>
                希望キャスト欄の形式
              </label>
              <AppSelect
                value={castInputType}
                onValueChange={(value) => {
                  const v = value as 'multiple' | 'single';
                  setCastInputType(v);
                  if (v === 'multiple') {
                    setCastUseWeight(false);
                    setCastColumnCount(1);
                  }
                }}
                options={castTypeOptions}
                placeholder="形式を選択"
              />
              {castInputType === 'single' && (
                <div className="import-weight-option" style={{ marginTop: 12 }}>
                  <div className="import-weight-option__card">
                    <div className="import-weight-option__header">
                      <span className="import-weight-option__label">希望の重みをつける</span>
                      <label className="import-weight-option__toggle">
                        <input
                          type="checkbox"
                          checked={castUseWeight}
                          onChange={(e) => setCastUseWeight(e.target.checked)}
                        />
                        <span className="import-weight-option__switch" />
                      </label>
                    </div>
                    <p className="import-weight-option__desc">
                      第一希望・第二希望…の順でマッチング時に優先します。オフの場合は希望の区別をしません。
                    </p>
                  </div>
                </div>
              )}
            </div>
            {columnsWithMultipleCommas.length > 0 && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontSize: 12 }}>
                  カンマ区切りが3つ以上ある列を希望1・2・3に分割して使う
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {columnsWithMultipleCommas.map((col) => (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="radio"
                        name="splitComma"
                        checked={splitCommaColumnIndex === col}
                        onChange={() =>
                          setSplitCommaColumnIndex(splitCommaColumnIndex === col ? -1 : col)
                        }
                      />
                      列{col + 1}を分割する
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="radio"
                      name="splitComma"
                      checked={splitCommaColumnIndex < 0}
                      onChange={() => setSplitCommaColumnIndex(-1)}
                    />
                    分割しない
                  </label>
                </div>
              </div>
            )}
            <p className="form-inline-note" style={{ marginBottom: 8 }}>
              割り当てなかった列は、取り込み後、DBデータ確認画面で「全て表示」をオンにすることで確認できます。
            </p>
            <div className="import-column-mapping">
              <div className="import-column-mapping__row">
                <label className="import-column-mapping__label">
                  {IMPORT_COLUMN_LABELS.x_id} <span style={{ color: 'var(--discord-accent-red)', fontSize: '10px' }}>必須</span>
                </label>
                <div className="import-column-mapping__select-wrap">
                  <AppSelect
                    value={safeColumnValue(customMapping.x_id)}
                    onValueChange={(v) =>
                      setCustomMapping((prev) => ({ ...prev, x_id: v === NONE_VALUE ? -1 : parseInt(v, 10) }))
                    }
                    options={columnSelectOptions}
                    placeholder="列を選択"
                  />
                </div>
              </div>
              <div className="import-column-mapping__row">
                <label className="import-column-mapping__label">
                  {IMPORT_COLUMN_LABELS.name} <span style={{ color: 'var(--discord-text-muted)', fontSize: '10px' }}>任意</span>
                </label>
                <div className="import-column-mapping__select-wrap">
                  <AppSelect
                    value={safeColumnValue(customMapping.name)}
                    onValueChange={(v) =>
                      setCustomMapping((prev) => ({ ...prev, name: v === NONE_VALUE ? -1 : parseInt(v, 10) }))
                    }
                    options={columnSelectOptions}
                    placeholder="列を選択"
                  />
                </div>
              </div>
              <div className="import-column-mapping__row">
                <label className="import-column-mapping__label">
                  VRCアカウントリンク <span style={{ color: 'var(--discord-text-muted)', fontSize: '10px' }}>任意</span>
                </label>
                <div className="import-column-mapping__select-wrap">
                  <AppSelect
                    value={safeColumnValue(customMapping.vrc_url)}
                    onValueChange={(v) =>
                      setCustomMapping((prev) => ({ ...prev, vrc_url: v === NONE_VALUE ? -1 : parseInt(v, 10) }))
                    }
                    options={columnSelectOptions}
                    placeholder="列を選択"
                  />
                </div>
              </div>
              {castInputType === 'multiple' ? (
                <div className="import-column-mapping__row">
                  <label className="import-column-mapping__label">希望キャスト</label>
                  <div className="import-column-mapping__select-wrap">
                    <AppSelect
                      value={safeColumnValue(customMapping.cast1)}
                      onValueChange={(v) =>
                        setCustomMapping((prev) => ({
                          ...prev,
                          cast1: v === NONE_VALUE ? -1 : parseInt(v, 10),
                          cast2: -1,
                          cast3: -1,
                        }))
                      }
                      options={columnSelectOptions}
                      placeholder="列を選択"
                    />
                  </div>
                </div>
              ) : (
                <>
                  {([1, 2, 3] as const).slice(0, castColumnCount).map((n) => (
                    <div key={n} className="import-column-mapping__row">
                      <label className="import-column-mapping__label">
                        {IMPORT_COLUMN_LABELS[`cast${n}` as keyof typeof IMPORT_COLUMN_LABELS]} <span style={{ color: 'var(--discord-text-muted)', fontSize: '10px' }}>任意</span>
                      </label>
                      <div className="import-column-mapping__select-wrap">
                        <AppSelect
                          value={safeColumnValue(
                            n === 1 ? customMapping.cast1 : n === 2 ? customMapping.cast2 : customMapping.cast3,
                          )}
                          onValueChange={(v) => {
                            const num = v === NONE_VALUE ? -1 : parseInt(v, 10);
                            setCustomMapping((prev) => {
                              const next = { ...prev };
                              if (n === 1) next.cast1 = num;
                              else if (n === 2) next.cast2 = num;
                              else if (n === 3) next.cast3 = num;
                              return next;
                            });
                          }}
                          options={columnSelectOptions}
                          placeholder="列を選択"
                        />
                      </div>
                    </div>
                  ))}
                  {castColumnCount < 3 && (
                    <div className="import-column-mapping__row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setCastColumnCount((c) => Math.min(3, c + 1))}
                      >
                        + 希望キャスト列を追加
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              className="btn-primary btn-full-width"
              onClick={handleCustomImport}
              style={{ marginTop: 16 }}
            >
              この割り当てで取り込む
            </button>
          </div>
        )}

        {error && (
          <p
            style={{
              marginTop: 12,
              color: 'var(--discord-accent-red)',
              fontSize: 14,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
