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
type DatePreset = "none" | "today" | "last7days" | "thisMonth" | "lastMonth" | "custom";
type ThemeMode = "light" | "dark";
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

  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from: formatDate(from), to: formatDate(to) };
};

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilters, setWorldFilters] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [startupPreferenceSet, setStartupPreferenceSet] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
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
    if (orientationFilter !== "all" && photo.orientation !== orientationFilter) {
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
  }), [photos, debouncedQuery, worldFilters, favoritesOnly, orientationFilter, dateFrom, dateTo, tagFilters]);

  const selectedPhotoView = useMemo(() => {
    if (!selectedPhoto) {
      return null;
    }
    return filteredPhotos.find((photo) => photo.photo_filename === selectedPhoto.photo_filename)
      ?? photos.find((photo) => photo.photo_filename === selectedPhoto.photo_filename)
      ?? selectedPhoto;
  }, [selectedPhoto, filteredPhotos, photos]);

  const updatePhoto = (filename: string, updater: (photo: Photo) => Photo) => {
    setPhotos((prev) => prev.map((photo) => (
      photo.photo_filename === filename ? updater(photo) : photo
    )));
  };

  const toggleFavorite = async (filename: string, current: boolean) => {
    try {
      await invoke("set_photo_favorite_cmd", { filename, isFavorite: !current });
      updatePhoto(filename, (photo) => ({ ...photo, is_favorite: !current }));
      addToast(current ? "お気に入りを解除しました。" : "お気に入りに追加しました。");
    } catch (err) {
      addToast(`お気に入りの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const addTag = async (filename: string, tag: string) => {
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }

    const currentPhoto = photos.find((photo) => photo.photo_filename === filename);
    if (currentPhoto?.tags.includes(normalized)) {
      return;
    }

    try {
      await invoke("add_photo_tag_cmd", { filename, tag: normalized });
      updatePhoto(filename, (photo) => ({
        ...photo,
        tags: [...photo.tags, normalized].sort((left, right) => left.localeCompare(right, "ja")),
      }));
      addToast("タグを追加しました。");
    } catch (err) {
      addToast(`タグの追加に失敗しました: ${String(err)}`, "error");
    }
  };

  const removeTag = async (filename: string, tag: string) => {
    try {
      await invoke("remove_photo_tag_cmd", { filename, tag });
      updatePhoto(filename, (photo) => ({
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

  const handleChooseFolder = async () => {
    try {
      const selected = await open({ directory: true });
      if (!selected) {
        return;
      }

      const newPath = Array.isArray(selected) ? selected[0] : selected;
      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath: newPath,
          enableStartup: startupEnabled,
          startupPreferenceSet,
          themeMode,
        },
      });
      await refreshSettings();
      await startScan();
      await loadPhotos();
    } catch (err) {
      addToast(`写真フォルダの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleStartupPreference = async (enabled: boolean) => {
    try {
      await invoke("save_startup_preference_cmd", { enabled });
      setStartupEnabled(enabled);
      setStartupPreferenceSet(true);
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
        setStartupPreferenceSet(!!setting.startupPreferenceSet);
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
          startupPreferenceSet,
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
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        scanStatus={scanStatus}
        startScan={startScan}
        cancelScan={cancelScan}
        setShowSettings={setShowSettings}
      />

      <main className="main-content">
        {scanStatus === "scanning" && (
          <ScanningOverlay
            progress={scanProgress}
            title="スキャン中..."
            description="一覧表示に必要な情報を取り込んでいます"
            onCancel={cancelScan}
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
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          tagFilters={tagFilters}
          setTagFilters={setTagFilters}
          tagOptions={tagOptions}
          onReset={resetFilters}
        />
        <div className="grid-area">
          <MonthNav
            monthsByYear={monthsByYear}
            monthGroups={monthGroups}
            activeMonthIndex={activeMonthIndex}
            handleJumpToMonth={(group) => handleJumpToRow(group.rowIndex)}
          />

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
          onClose={closePhotoModal}
          localMemo={localMemo}
          setLocalMemo={setLocalMemo}
          handleSaveMemo={handleSaveMemo}
          isSavingMemo={isSavingMemo}
          handleOpenWorld={handleOpenWorld}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
          onToggleFavorite={() => toggleFavorite(selectedPhotoView.photo_filename, selectedPhotoView.is_favorite)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_filename, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_filename, tag)}
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

      {!startupPreferenceSet && (
        <div className="modal-overlay">
          <div className="modal-content startup-choice-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => handleStartupPreference(false)} aria-label="閉じる">×</button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header"><h2>起動設定</h2></div>
                <p style={{ marginTop: 0, color: "var(--a-text-dim)" }}>
                  Windows ログイン時に Alpheratz を起動するか選べます。後から設定で変更できます。
                </p>
                <div className="startup-toggle-row">
                  <button className="save-button" onClick={() => handleStartupPreference(false)}>
                    今は不要
                  </button>
                  <button className="save-button" onClick={() => handleStartupPreference(true)}>
                    自動起動する
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
