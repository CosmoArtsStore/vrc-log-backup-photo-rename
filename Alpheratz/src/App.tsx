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
import { ActionCards } from "./components/ActionCards";
import { PhotoGrid } from "./components/PhotoGrid";
import { PhotoModal } from "./components/PhotoModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterSidebar } from "./components/FilterSidebar";
import { ScanningOverlay } from "./components/ScanningOverlay";
import { EmptyState } from "./components/EmptyState";
import { Photo } from "./types";

const CARD_WIDTH = 270;
const ROW_HEIGHT = 246;
const HUE_SEGMENTS = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

function classifyPhotoColor(photo: Photo): string {
  const histogram = photo.histogram;
  if (!histogram || histogram.length < 14) {
    return "unknown";
  }

  const hueBins = histogram.slice(0, 12);
  const saturation = histogram[12] ?? 0;
  const value = histogram[13] ?? 0;

  if (saturation < 0.18) {
    return "mono";
  }
  if (value < 0.25) {
    return "dark";
  }
  if (value > 0.82 && saturation < 0.45) {
    return "bright";
  }

  let dominantIndex = 0;
  for (let i = 1; i < hueBins.length; i += 1) {
    if (hueBins[i] > hueBins[dominantIndex]) {
      dominantIndex = i;
    }
  }

  return HUE_SEGMENTS[Math.floor(dominantIndex / 12 * HUE_SEGMENTS.length)] ?? "unknown";
}

function matchesColorFilter(photo: Photo, colorFilter: string): boolean {
  if (colorFilter === "all") {
    return true;
  }

  const histogram = photo.histogram;
  if (!histogram || histogram.length < 14) {
    return false;
  }

  const saturation = histogram[12] ?? 0;
  const value = histogram[13] ?? 0;

  if (colorFilter === "mono") {
    return saturation < 0.18;
  }
  if (colorFilter === "dark") {
    return value < 0.25;
  }
  if (colorFilter === "bright") {
    return value > 0.82;
  }

  return classifyPhotoColor(photo) === colorFilter;
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilter, setWorldFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orientationFilter, setOrientationFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [colorFilter, setColorFilter] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();
  const { photos, setPhotos, loadPhotos, isLoading } = usePhotos(debouncedQuery, worldFilter);
  const {
    scanStatus,
    scanProgress,
    isEnriching,
    enrichProgress,
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
    if (tagQuery) {
      const query = tagQuery.trim().toLowerCase();
      if (query && !photo.tags.some((tag) => tag.toLowerCase().includes(query))) {
        return false;
      }
    }
    if (!matchesColorFilter(photo, colorFilter)) {
      return false;
    }
    return true;
  }), [photos, favoritesOnly, orientationFilter, dateFrom, dateTo, tagQuery, colorFilter]);

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
      console.error("Failed to toggle favorite:", err);
      addToast("お気に入りの更新に失敗しました。");
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
      console.error("Failed to add tag:", err);
      addToast("タグの追加に失敗しました。");
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
      console.error("Failed to remove tag:", err);
      addToast("タグの削除に失敗しました。");
    }
  };

  const resetFilters = () => {
    setWorldFilter("all");
    setDateFrom("");
    setDateTo("");
    setOrientationFilter("all");
    setFavoritesOnly(false);
    setTagQuery("");
    setColorFilter("all");
  };

  const {
    scrollTop,
    thumbTop,
    thumbHeight,
    isDragging,
    totalHeight,
    onGridRef,
    handleGridScroll,
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
      await invoke("save_setting_cmd", { setting: { photoFolderPath: newPath } });
      await refreshSettings();
      await startScan();
      await loadPhotos();
    } catch (err) {
      console.error("Failed to update photo folder:", err);
      addToast("写真フォルダの更新に失敗しました。");
    }
  };

  const worldNameList = useMemo(
    () => Array.from(new Set(photos.map((photo) => photo.world_name || ""))).sort(),
    [photos],
  );
  const cellProps = useMemo(
    () => ({ data: filteredPhotos, onSelect: onSelectPhoto, columnCount }),
    [filteredPhotos, onSelectPhoto, columnCount],
  );
  const totalRows = Math.ceil(filteredPhotos.length / columnCount);

  return (
    <div className="alpheratz-root">
      <Header
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
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
        {scanStatus !== "scanning" && isEnriching && (
          <ScanningOverlay
            progress={enrichProgress}
            title="補足情報を更新中..."
            description="ヒストグラムや類似判定用データを裏で登録しています"
            onCancel={cancelScan}
            canCancel={false}
          />
        )}

        <div className="grid-area">
          <FilterSidebar
            isOpen={isFilterOpen}
            worldFilter={worldFilter}
            setWorldFilter={setWorldFilter}
            worldNameList={worldNameList}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            orientationFilter={orientationFilter}
            setOrientationFilter={setOrientationFilter}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            tagQuery={tagQuery}
            setTagQuery={setTagQuery}
            colorFilter={colorFilter}
            setColorFilter={setColorFilter}
            onReset={resetFilters}
          />
          <MonthNav
            monthsByYear={monthsByYear}
            monthGroups={monthGroups}
            activeMonthIndex={activeMonthIndex}
            handleJumpToMonth={(group) => handleJumpToRow(group.rowIndex)}
          />

          <div className="right-panel" ref={rightPanelRef}>
            <ActionCards
              startScan={startScan}
              cancelScan={cancelScan}
              scanStatus={scanStatus}
              setShowSettings={setShowSettings}
              setIsFilterOpen={setIsFilterOpen}
            />

            {(scanStatus !== "scanning" && !isLoading && filteredPhotos.length === 0) && (
              <EmptyState
                isFiltering={
                  !!searchQuery
                  || worldFilter !== "all"
                  || !!dateFrom
                  || !!dateTo
                  || favoritesOnly
                  || !!tagQuery
                  || orientationFilter !== "all"
                  || colorFilter !== "all"
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
                isDragging={isDragging}
                thumbTop={thumbTop}
                thumbHeight={thumbHeight}
                handleTrackClick={handleTrackClick}
                handleScrollbarMouseDown={handleScrollbarMouseDown}
                monthGroups={monthGroups}
                activeMonthIndex={activeMonthIndex}
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
          allPhotos={photos}
          onSelectSimilar={(photo) => onSelectPhoto(photo, true)}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
          onToggleFavorite={() => toggleFavorite(selectedPhotoView.photo_filename, selectedPhotoView.is_favorite)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_filename, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_filename, tag)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          photoFolderPath={photoFolderPath}
          handleChooseFolder={handleChooseFolder}
        />
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
