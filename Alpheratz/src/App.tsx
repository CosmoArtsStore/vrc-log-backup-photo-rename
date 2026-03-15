import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

import { usePhotos } from "./hooks/usePhotos";
import { useScan } from "./hooks/useScan";
import { useGridDimensions } from "./hooks/useGridDimensions";
import { useScroll } from "./hooks/useScroll";
import { useMonthGroups } from "./hooks/useMonthGroups";
import { useToasts } from "./hooks/useToasts";
import { usePhotoActions } from "./hooks/usePhotoActions";
import { usePhashWorker } from "./hooks/usePhashWorker";
import { useOrientationWorker } from "./hooks/useOrientationWorker";

import { Header } from "./components/Header";
import { MonthNav } from "./components/MonthNav";
import { PhotoGrid } from "./components/PhotoGrid";
import { PhotoModal } from "./components/PhotoModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterSidebar } from "./components/FilterSidebar";
import { ScanningOverlay } from "./components/ScanningOverlay";
import { EmptyState } from "./components/EmptyState";
import { Photo } from "./types";

const CARD_WIDTH = 270;
const ROW_HEIGHT = 246;
type DatePreset = "none" | "today" | "last7days" | "thisMonth" | "lastMonth" | "halfYear" | "oneYear" | "custom";
type ThemeMode = "light" | "dark";
type ViewMode = "standard" | "gallery";
type AppSetting = {
  photoFolderPath?: string;
  enableStartup?: boolean;
  startupPreferenceSet?: boolean;
  themeMode?: ThemeMode;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getDateRangeFromPreset = (preset: Exclude<DatePreset, "none" | "custom">) => {
  const today = getToday();

  if (preset === "today") {
    const value = formatDate(today);
    return { from: value, to: value };
  }

  if (preset === "last7days") {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: formatDate(from), to: formatDate(today) };
  }

  if (preset === "thisMonth") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: formatDate(from), to: formatDate(to) };
  }

  if (preset === "halfYear") {
    const from = new Date(today);
    from.setMonth(today.getMonth() - 6);
    return { from: formatDate(from), to: formatDate(today) };
  }

  if (preset === "oneYear") {
    const from = new Date(today);
    from.setFullYear(today.getFullYear() - 1);
    return { from: formatDate(from), to: formatDate(today) };
  }

  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from: formatDate(from), to: formatDate(to) };
};

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilters, setWorldFilters] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);
  const [isApplyingFolderChange, setIsApplyingFolderChange] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("none");
  const [orientationFilter, setOrientationFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();
  const { progress: phashProgress, isRunning: isPhashRunning } = usePhashWorker();
  const { progress: orientationProgress, isRunning: isOrientationRunning } = useOrientationWorker();
  const { photos, setPhotos, loadPhotos, isLoading } = usePhotos("", "all", addToast);
  const {
    scanStatus,
    scanProgress,
    photoFolderPath,
    startScan,
    refreshSettings,
    cancelScan,
  } = useScan(addToast);

  const {
    selectedPhoto,
    setSelectedPhoto,
    closePhotoModal,
    photoHistory,
    goBackPhoto,
    localMemo,
    setLocalMemo,
    isSavingMemo,
    handleSaveMemo,
    handleOpenWorld,
    onSelectPhoto,
  } = usePhotoActions(setPhotos, addToast);

  const filteredPhotos = useMemo(() => photos.filter((photo) => {
    if (debouncedQuery) {
      const query = debouncedQuery.trim().toLowerCase();
      const worldName = (photo.world_name || "").toLowerCase();
      const worldId = (photo.world_id || "").toLowerCase();
      if (!worldName.includes(query) && !worldId.includes(query)) {
        return false;
      }
    }
    if (worldFilters.length > 0) {
      const worldKey = photo.world_name || "unknown";
      if (!worldFilters.includes(worldKey)) {
        return false;
      }
    }
    if (favoritesOnly && !photo.is_favorite) {
      return false;
    }
    if (!isOrientationRunning && orientationFilter !== "all" && photo.orientation !== orientationFilter) {
      return false;
    }
    if (dateFrom && photo.timestamp.slice(0, 10) < dateFrom) {
      return false;
    }
    if (dateTo && photo.timestamp.slice(0, 10) > dateTo) {
      return false;
    }
    if (tagFilters.length > 0) {
      const normalizedTags = photo.tags.map((tag) => tag.toLowerCase());
      if (!tagFilters.every((tag) => normalizedTags.includes(tag.toLowerCase()))) {
        return false;
      }
    }
    return true;
  }), [photos, debouncedQuery, worldFilters, favoritesOnly, orientationFilter, dateFrom, dateTo, tagFilters, isOrientationRunning]);

  const selectedPhotoView = useMemo(() => {
    if (!selectedPhoto) {
      return null;
    }
    return filteredPhotos.find((photo) => photo.photo_path === selectedPhoto.photo_path)
      ?? photos.find((photo) => photo.photo_path === selectedPhoto.photo_path)
      ?? selectedPhoto;
  }, [selectedPhoto, filteredPhotos, photos]);
  const selectedPhotoIndex = useMemo(() => (
    selectedPhotoView
      ? filteredPhotos.findIndex((photo) => photo.photo_path === selectedPhotoView.photo_path)
      : -1
  ), [filteredPhotos, selectedPhotoView]);

  const updatePhoto = (photoPath: string, updater: (photo: Photo) => Photo) => {
    setPhotos((prev) => prev.map((photo) => (
      photo.photo_path === photoPath ? updater(photo) : photo
    )));
  };

  const toggleFavorite = async (photoPath: string, current: boolean) => {
    try {
      await invoke("set_photo_favorite_cmd", { photoPath, isFavorite: !current });
      updatePhoto(photoPath, (photo) => ({ ...photo, is_favorite: !current }));
      addToast(current ? "お気に入りを解除しました。" : "お気に入りに追加しました。");
    } catch (err) {
      addToast(`お気に入りの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const addTag = async (photoPath: string, tag: string) => {
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }

    const currentPhoto = photos.find((photo) => photo.photo_path === photoPath);
    if (currentPhoto?.tags.includes(normalized)) {
      return;
    }

    try {
      await invoke("add_photo_tag_cmd", { photoPath, tag: normalized });
      updatePhoto(photoPath, (photo) => ({
        ...photo,
        tags: [...photo.tags, normalized].sort((left, right) => left.localeCompare(right, "ja")),
      }));
      addToast("タグを追加しました。");
    } catch (err) {
      addToast(`タグの追加に失敗しました: ${String(err)}`, "error");
    }
  };

  const removeTag = async (photoPath: string, tag: string) => {
    try {
      await invoke("remove_photo_tag_cmd", { photoPath, tag });
      updatePhoto(photoPath, (photo) => ({
        ...photo,
        tags: photo.tags.filter((item) => item !== tag),
      }));
      addToast("タグを削除しました。");
    } catch (err) {
      addToast(`タグの削除に失敗しました: ${String(err)}`, "error");
    }
  };

  const resetFilters = () => {
    setWorldFilters([]);
    setDateFrom("");
    setDateTo("");
    setDatePreset("none");
    setOrientationFilter("all");
    setFavoritesOnly(false);
    setTagFilters([]);
  };

  const handleDatePresetSelect = (preset: Exclude<DatePreset, "none" | "custom">) => {
    const range = getDateRangeFromPreset(preset);
    setDatePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleDateFromChange = (value: string) => {
    setDatePreset("custom");
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    setDatePreset("custom");
    setDateTo(value);
  };

  const {
    scrollTop,
    thumbTop,
    thumbHeight,
    isDragging,
    totalHeight,
    onGridRef,
    handleGridScroll,
    handleGridWheel,
    handleScrollbarMouseDown,
    handleTrackClick,
    handleJumpToRow,
  } = useScroll({ photosLength: filteredPhotos.length, columnCount, gridHeight, ROW_HEIGHT });

  const { monthGroups, monthsByYear, activeMonthIndex } = useMonthGroups(filteredPhotos, columnCount, scrollTop, ROW_HEIGHT);

  const applyFolderChange = async (newPath: string, resetExisting: boolean) => {
    setIsApplyingFolderChange(true);
    try {
      if (resetExisting) {
        await invoke("reset_photo_cache_cmd");
        setPhotos([]);
      }

      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath: newPath,
          enableStartup: startupEnabled,
          themeMode,
        },
      });
      await refreshSettings();
      await loadPhotos();
      await startScan();
      setPendingFolderPath(null);
      addToast(resetExisting ? "現在の写真データをリセットして再スキャンを開始します" : "写真フォルダを更新しました");
    } catch (err) {
      addToast(`蜀咏悄繝輔か繝ｫ繝縺ｮ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${String(err)}`, "error");
    } finally {
      setIsApplyingFolderChange(false);
    }
  };

  const handleChooseFolder = async () => {
    try {
      const selected = await open({ directory: true });
      if (!selected) {
        return;
      }

      const newPath = Array.isArray(selected) ? selected[0] : selected;
      if (newPath === photoFolderPath) {
        return;
      }
      if (photoFolderPath) {
        setPendingFolderPath(newPath);
        return;
      }
      await applyFolderChange(newPath, false);
    } catch (err) {
      addToast(`写真フォルダの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleStartupPreference = async (enabled: boolean) => {
    try {
      await invoke("save_startup_preference_cmd", { enabled });
      setStartupEnabled(enabled);
      addToast(enabled ? "Alpheratz をログイン時に起動する設定にしました。" : "Alpheratz のログイン時起動を無効にしました。");
    } catch (err) {
      addToast(`自動起動設定の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  useEffect(() => {
    const loadAppSetting = async () => {
      try {
        const setting = await invoke<AppSetting>("get_setting_cmd");
        setStartupEnabled(!!setting.enableStartup);
        setThemeMode(setting.themeMode === "dark" ? "dark" : "light");
      } catch (err) {
        addToast(`設定の読み込みに失敗しました: ${String(err)}`, "error");
      }
    };

    loadAppSetting();
  }, []);

  const handleThemeToggle = async () => {
    const nextTheme: ThemeMode = themeMode === "dark" ? "light" : "dark";
    try {
      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath,
          enableStartup: startupEnabled,
          themeMode: nextTheme,
        },
      });
      setThemeMode(nextTheme);
    } catch (err) {
      addToast(`テーマ設定の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const worldNameList = useMemo(
    () => Array.from(new Set(photos.map((photo) => photo.world_name || ""))).sort(),
    [photos],
  );
  const worldCounts = useMemo(() => (
    photos.reduce<Record<string, number>>((acc, photo) => {
      const key = photo.world_name || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ), [photos]);
  const tagOptions = useMemo(() => (
    Array.from(new Set(
      photos.flatMap((photo) => photo.tags.map((tag) => tag.trim()).filter(Boolean)),
    )).sort((left, right) => left.localeCompare(right, "ja"))
  ), [photos]);
  const activeFilterCount = useMemo(() => (
    [
      worldFilters.length > 0,
      !!dateFrom || !!dateTo,
      orientationFilter !== "all",
      favoritesOnly,
      tagFilters.length > 0,
    ].filter(Boolean).length
  ), [worldFilters, dateFrom, dateTo, orientationFilter, favoritesOnly, tagFilters]);
  const cellProps = useMemo(
    () => ({ data: filteredPhotos, onSelect: onSelectPhoto, columnCount }),
    [filteredPhotos, onSelectPhoto, columnCount],
  );
  const totalRows = Math.ceil(filteredPhotos.length / columnCount);

  return (
    <div className={`alpheratz-root ${themeMode === "dark" ? "theme-dark" : "theme-light"}`}>
      <Header
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        scanStatus={scanStatus}
        phashLabel={isPhashRunning ? `pHash 計算中... ${phashProgress.done} / ${phashProgress.total}` : null}
        startScan={startScan}
        cancelScan={cancelScan}
        setShowSettings={setShowSettings}
      />

      <main className={`main-content ${isFilterOpen ? "filter-open" : ""}`}>
        {(scanStatus === "scanning" || isOrientationRunning) && (
          <ScanningOverlay
            progress={isOrientationRunning ? {
              processed: orientationProgress.done,
              total: orientationProgress.total,
              current_world: orientationProgress.current || "",
              phase: "orientation",
            } : scanProgress}
            title={isOrientationRunning ? "縦横分析中..." : "スキャン中..."}
            description={isOrientationRunning ? "一覧表示に必要な縦横情報をバックグラウンドで解析しています" : "一覧表示に必要な情報を取り込んでいます"}
            onCancel={cancelScan}
            canCancel={!isOrientationRunning}
          />
        )}
        {isFilterOpen && <button className="filter-backdrop" onClick={() => setIsFilterOpen(false)} aria-label="絞り込みを閉じる" />}
        <FilterSidebar
          isOpen={isFilterOpen}
          activeFilterCount={activeFilterCount}
          filteredCount={filteredPhotos.length}
          worldFilters={worldFilters}
          setWorldFilters={setWorldFilters}
          worldNameList={worldNameList}
          worldCounts={worldCounts}
          datePreset={datePreset}
          onDatePresetSelect={handleDatePresetSelect}
          dateFrom={dateFrom}
          setDateFrom={handleDateFromChange}
          dateTo={dateTo}
          setDateTo={handleDateToChange}
          orientationFilter={orientationFilter}
          setOrientationFilter={setOrientationFilter}
          orientationFilterDisabled={isOrientationRunning}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          tagFilters={tagFilters}
          setTagFilters={setTagFilters}
          tagOptions={tagOptions}
          onReset={resetFilters}
        />
        <div className="grid-area">
          {viewMode === "standard" && (
            <MonthNav
              monthsByYear={monthsByYear}
              monthGroups={monthGroups}
              activeMonthIndex={activeMonthIndex}
              handleJumpToMonth={(group) => handleJumpToRow(group.rowIndex)}
            />
          )}

          <div className="right-panel" ref={rightPanelRef}>
            {(scanStatus !== "scanning" && !isLoading && filteredPhotos.length === 0) && (
              <EmptyState
                isFiltering={
                  !!searchQuery
                  || worldFilters.length > 0
                  || !!dateFrom
                  || !!dateTo
                  || favoritesOnly
                  || tagFilters.length > 0
                  || orientationFilter !== "all"
                }
              />
            )}

            <div ref={gridWrapperRef} style={{ flex: 1, minHeight: 0 }}>
              <PhotoGrid
                photos={filteredPhotos}
                viewMode={viewMode}
                columnCount={columnCount}
                CARD_WIDTH={CARD_WIDTH}
                totalRows={totalRows}
                ROW_HEIGHT={ROW_HEIGHT}
                gridHeight={gridHeight}
                panelWidth={panelWidth}
                handleGridScroll={handleGridScroll}
                handleGridWheel={handleGridWheel}
                isDragging={isDragging}
                thumbTop={thumbTop}
                thumbHeight={thumbHeight}
                handleTrackClick={handleTrackClick}
                handleScrollbarMouseDown={handleScrollbarMouseDown}
                totalHeight={totalHeight}
                cellProps={cellProps}
                onGridRef={onGridRef}
              />
            </div>
          </div>
        </div>
      </main>

      {selectedPhotoView && (
        <PhotoModal
          photo={selectedPhotoView}
          allTags={tagOptions}
          onClose={closePhotoModal}
          localMemo={localMemo}
          setLocalMemo={setLocalMemo}
          handleSaveMemo={handleSaveMemo}
          isSavingMemo={isSavingMemo}
          handleOpenWorld={handleOpenWorld}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
          canGoPrev={selectedPhotoIndex > 0}
          canGoNext={selectedPhotoIndex >= 0 && selectedPhotoIndex < filteredPhotos.length - 1}
          onGoPrev={() => {
            if (selectedPhotoIndex > 0) {
              setSelectedPhoto(filteredPhotos[selectedPhotoIndex - 1]);
            }
          }}
          onGoNext={() => {
            if (selectedPhotoIndex >= 0 && selectedPhotoIndex < filteredPhotos.length - 1) {
              setSelectedPhoto(filteredPhotos[selectedPhotoIndex + 1]);
            }
          }}
          onToggleFavorite={() => toggleFavorite(selectedPhotoView.photo_path, selectedPhotoView.is_favorite)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_path, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_path, tag)}
          addToast={addToast}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          photoFolderPath={photoFolderPath}
          handleChooseFolder={handleChooseFolder}
          startupEnabled={startupEnabled}
          onToggleStartup={() => handleStartupPreference(!startupEnabled)}
          themeMode={themeMode}
          onToggleTheme={handleThemeToggle}
        />
      )}
      {pendingFolderPath && (
        <div className="modal-overlay" onClick={() => !isApplyingFolderChange && setPendingFolderPath(null)}>
          <div className="modal-content settings-panel folder-change-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => !isApplyingFolderChange && setPendingFolderPath(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header"><h2>フォルダ変更の確認</h2></div>
                <div className="folder-change-warning">
                  <strong>現在のデータはすべてリセットされます。</strong>
                  <p>写真一覧、タグ、お気に入り、メモ、サムネイルキャッシュ、ログを削除してから新しいフォルダをスキャンします。</p>
                  <p>変更先: {pendingFolderPath}</p>
                </div>
                <div className="folder-change-actions">
                  <button
                    className="header-icon-button"
                    onClick={() => setPendingFolderPath(null)}
                    disabled={isApplyingFolderChange}
                  >
                    キャンセル
                  </button>
                  <button
                    className="world-link-button"
                    onClick={() => void applyFolderChange(pendingFolderPath, true)}
                    disabled={isApplyingFolderChange}
                  >
                    {isApplyingFolderChange ? "切替中..." : "リセットして続行"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <div className="toast-icon">★</div>
            <div className="toast-msg">{toast.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
