import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

// Hooks
import { usePhotos } from "./hooks/usePhotos";
import { useScan } from "./hooks/useScan";
import { useGridDimensions } from "./hooks/useGridDimensions";
import { useScroll } from "./hooks/useScroll";
import { useMonthGroups } from "./hooks/useMonthGroups";
import { useToasts } from "./hooks/useToasts";
import { usePhotoActions } from "./hooks/usePhotoActions";

// Components
import { Header } from "./components/Header";
import { MonthNav } from "./components/MonthNav";
import { ActionCards } from "./components/ActionCards";
import { PhotoGrid } from "./components/PhotoGrid";
import { PhotoModal } from "./components/PhotoModal";
import { SettingsModal } from "./components/SettingsModal";

import { ScanningOverlay } from "./components/ScanningOverlay";
import { EmptyState } from "./components/EmptyState";

const CARD_WIDTH = 270;
const ROW_HEIGHT = 246;

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilter, setWorldFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

  // --- Search Debounce ---
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // --- Logic Extraction via Hooks ---
  const { photos, setPhotos, loadPhotos, isLoading } = usePhotos(debouncedQuery, worldFilter);
  const { scanStatus, scanProgress, photoFolderPath, startScan, refreshSettings, cancelScan } = useScan();
  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();

  const {
    scrollTop, thumbTop, thumbHeight, isDragging, totalHeight, onGridRef,
    handleGridScroll, handleScrollbarMouseDown, handleTrackClick, handleJumpToRow
  } = useScroll({ photosLength: photos.length, columnCount, gridHeight, ROW_HEIGHT });

  const { monthGroups, monthsByYear, activeMonthIndex } = useMonthGroups(photos, columnCount, scrollTop, ROW_HEIGHT);

  const {
    selectedPhoto, closePhotoModal, photoHistory, goBackPhoto, localMemo, setLocalMemo, isSavingMemo,
    handleSaveMemo, handleOpenWorld, onSelectPhoto
  } = usePhotoActions(setPhotos, addToast);

  // --- Handlers ---
  const handleRegisterToStellaRecord = async () => {
    addToast("StellaRecord への連携を同期中...");
    try {
      const res: string = await invoke("register_to_stellarecord");
      addToast(res);
    } catch (err) {
      addToast("連携エラー: " + String(err));
    }
  };

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      const newPath = Array.isArray(selected) ? selected[0] : selected;
      await invoke("save_setting_cmd", { setting: { photoFolderPath: newPath } });
      await refreshSettings();
      await startScan();
      await loadPhotos();
    }
  };

  const worldNameList = useMemo(() => Array.from(new Set(photos.map((p) => p.world_name || ""))).sort(), [photos]);
  const cellProps = useMemo(() => ({ data: photos, onSelect: onSelectPhoto, columnCount }), [photos, onSelectPhoto, columnCount]);
  const totalRows = Math.ceil(photos.length / columnCount);

  return (
    <div className="alpheratz-root">
      <Header
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        worldFilter={worldFilter} setWorldFilter={setWorldFilter}
        worldNameList={worldNameList}
      />

      <main className="main-content">
        {scanStatus === "scanning" && <ScanningOverlay progress={scanProgress} onCancel={cancelScan} />}

        <div className="grid-area">
          <MonthNav monthsByYear={monthsByYear} monthGroups={monthGroups} activeMonthIndex={activeMonthIndex} handleJumpToMonth={(g) => handleJumpToRow(g.rowIndex)} />

          <div className="right-panel" ref={rightPanelRef}>
            <ActionCards
              handleRegisterToStellaRecord={handleRegisterToStellaRecord}
              startScan={startScan}
              cancelScan={cancelScan}
              scanStatus={scanStatus}
              setShowSettings={setShowSettings}
            />

            {(scanStatus !== "scanning" && !isLoading && photos.length === 0) && (
              <EmptyState isFiltering={!!searchQuery || worldFilter !== "all"} />
            )}

            <div ref={gridWrapperRef} style={{ flex: 1, minHeight: 0 }}>
              <PhotoGrid
                photos={photos} columnCount={columnCount} CARD_WIDTH={CARD_WIDTH} totalRows={totalRows} ROW_HEIGHT={ROW_HEIGHT}
                gridHeight={gridHeight} panelWidth={panelWidth} handleGridScroll={handleGridScroll} isDragging={isDragging}
                thumbTop={thumbTop} thumbHeight={thumbHeight} handleTrackClick={handleTrackClick} handleScrollbarMouseDown={handleScrollbarMouseDown}
                monthGroups={monthGroups} activeMonthIndex={activeMonthIndex} totalHeight={totalHeight} cellProps={cellProps}
                onGridRef={onGridRef}
              />
            </div>
          </div>
        </div>
      </main>

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto} onClose={closePhotoModal}
          localMemo={localMemo} setLocalMemo={setLocalMemo}
          handleSaveMemo={handleSaveMemo} isSavingMemo={isSavingMemo}
          handleOpenWorld={handleOpenWorld}
          allPhotos={photos}
          onSelectSimilar={(p) => onSelectPhoto(p, true)}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          photoFolderPath={photoFolderPath} handleChooseFolder={handleChooseFolder}
        />
      )}

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <div className="toast-icon">★</div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;