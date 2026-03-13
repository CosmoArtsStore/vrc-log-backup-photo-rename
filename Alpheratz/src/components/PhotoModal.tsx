import { useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";
import { Icons } from "./Icons";

interface PhotoModalProps {
    photo: Photo;
    onClose: () => void;
    localMemo: string;
    setLocalMemo: (val: string) => void;
    handleSaveMemo: () => void;
    isSavingMemo: boolean;
    handleOpenWorld: () => void;
    allPhotos: Photo[];
    onSelectSimilar: (photo: Photo) => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
}

const POPCNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    let count = 0;
    let n = i;
    while (n > 0) {
        count += n & 1;
        n >>= 1;
    }
    POPCNT_TABLE[i] = count;
}

function base64ToBytes(base64: string): Uint8Array | null {
    try {
        const binString = atob(base64);
        return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    } catch {
        return null;
    }
}

const MAX_SUGGESTIONS = 5;
const MAX_MAYBE_SUGGESTIONS = 3;
type SimilarPhotoEntry = { item: Photo; distance: number };
type WorldSuggestion = { world_id: string; world_name: string; min_dist: number; photo: Photo };

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
    let dist = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dist += POPCNT_TABLE[a[i] ^ b[i]];
    }
    return dist;
}

function buildWorldSuggestions(
    similarPhotos: SimilarPhotoEntry[],
    unknownWorld: boolean,
    opts: {
        limit: number;
        filter: (entry: SimilarPhotoEntry) => boolean;
        requireNonEmpty?: boolean;
    }
): WorldSuggestion[] {
    if (!unknownWorld || (opts.requireNonEmpty && similarPhotos.length === 0)) return [];

    const knowns = similarPhotos.filter(
        (entry) => entry.item.world_id && entry.item.world_name && opts.filter(entry)
    );
    const map = new Map<string, WorldSuggestion>();
    for (const entry of knowns) {
        const wid = entry.item.world_id as string;
        const current = map.get(wid);
        if (!current || current.min_dist > entry.distance) {
            map.set(wid, {
                world_id: wid,
                world_name: entry.item.world_name ?? "不明",
                min_dist: entry.distance,
                photo: entry.item,
            });
        }
    }
    return Array.from(map.values())
        .sort((a, b) => a.min_dist - b.min_dist)
        .slice(0, opts.limit);
}

export const PhotoModal = ({
    photo,
    onClose,
    localMemo,
    setLocalMemo,
    handleSaveMemo,
    isSavingMemo,
    handleOpenWorld,
    allPhotos,
    onSelectSimilar,
    canGoBack,
    onGoBack,
}: PhotoModalProps) => {
    const unknownWorld = !photo.world_id;

    const [similarPhotos, setSimilarPhotos] = useState<SimilarPhotoEntry[]>([]);
    const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearchSimilar = async () => {
        setIsSearchingSimilar(true);
        setHasSearched(true);

        try {
            const rotatedHashes: string[] = await invoke("get_rotated_phashes", { path: photo.photo_path });
            const allTargetHashes = rotatedHashes
                .map(base64ToBytes)
                .filter((bytes): bytes is Uint8Array => bytes !== null);

            if (allTargetHashes.length === 0) {
                return;
            }

            const results: SimilarPhotoEntry[] = [];

            for (const p of allPhotos) {
                if (p.photo_filename === photo.photo_filename || !p.phash) continue;

                const pBytes = base64ToBytes(p.phash);
                if (!pBytes) continue;
                let minDist = 64;
                for (const targetBytes of allTargetHashes) {
                    const dist = hammingDistance(targetBytes, pBytes);
                    if (dist < minDist) minDist = dist;
                }
                // 通常類似標準: 10 / 「もしかして」用緩い標準: 20
                if (minDist <= 20) {
                    results.push({ item: p, distance: minDist });
                }
            }
            results.sort((a, b) => a.distance - b.distance);
            setSimilarPhotos(results);
        } catch (err) {
            console.error("Failed to get rotated hashes:", err);
        } finally {
            setIsSearchingSimilar(false);
        }
    };

    // suggestion logic: world_idありの写真から類似ワールドを推測する
    const suggestions = useMemo(() => {
        return buildWorldSuggestions(similarPhotos, unknownWorld, {
            filter: () => true,
            limit: MAX_SUGGESTIONS,
        });
    }, [similarPhotos, unknownWorld]);

    // 「もしかして」候補: world_idなしの写真で側だからworld_idありの候補求め
    const maybeSuggestions = useMemo(() => {
        return buildWorldSuggestions(similarPhotos, unknownWorld, {
            filter: (entry) => entry.distance > 10 && entry.distance <= 20,
            limit: MAX_MAYBE_SUGGESTIONS,
            requireNonEmpty: true,
        });
    }, [similarPhotos, unknownWorld]);

    const confident = suggestions.filter(s => s.min_dist <= 6);
    const possible = suggestions.filter(s => s.min_dist > 6 && s.min_dist <= 10);


    const handleOpenWorldId = async (id: string) => {
        await invoke("open_world_url", { worldId: id });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
                {canGoBack && onGoBack && (
                    <button className="modal-back" onClick={onGoBack} style={{
                        position: 'absolute', top: '0.75rem', left: '0.75rem', width: '32px', height: '32px', borderRadius: '50%',
                        border: 'none', background: 'var(--a-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'background 0.2s'
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                )}
                <button className="modal-close" onClick={onClose} aria-label="閉じる">
                    <Icons.Close />
                </button>
                <div className="modal-body photo-modal-body">
                    <div className="modal-image-container photo-modal-image" style={{ position: 'relative' }}>
                        <img src={convertFileSrc(photo.photo_path)} alt="" />
                        <div style={{
                            position: 'absolute', bottom: '8px', right: '12px', background: 'rgba(0,0,0,0.5)',
                            padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.7)',
                            pointerEvents: 'none'
                        }}>
                            {photo.photo_filename}
                        </div>
                    </div>
                    <div className="modal-info photo-modal-info">
                        <div className="info-header">
                            <h2 onClick={handleOpenWorld} style={{ cursor: photo.world_id ? "pointer" : "default" }}>
                                {photo.world_name || "ワールド不明"}{photo.world_id && " ↗"}
                            </h2>
                            <div className="info-meta">
                                <span className="timestamp">{photo.timestamp}</span>
                            </div>
                        </div>
                        <div className="action-buttons-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {photo.world_id && (
                                <button className="world-link-button" onClick={handleOpenWorld}>
                                    <svg className="world-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M2 12h20" />
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                    </svg>
                                    VRChat ワールドページを開く
                                    <svg className="world-link-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                </button>
                            )}
                            <button className="world-link-button" onClick={() => invoke("show_in_explorer", { path: photo.photo_path })} style={{ background: 'transparent', border: '1px solid var(--a-border)', color: 'var(--a-text)' }}>
                                <svg className="world-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                エクスプローラーで表示
                            </button>
                        </div>

                        {unknownWorld && !hasSearched && (
                            <div className="suggestions-section" style={{ marginTop: '20px', padding: '16px', background: 'var(--a-bg)', borderRadius: '12px', textAlign: 'center' }}>
                                <p style={{ fontSize: '13px', color: 'var(--a-text)', marginBottom: '12px' }}>メタデータがありません。似た写真から推測しますか？</p>
                                <button className="world-link-button" onClick={handleSearchSimilar} disabled={isSearchingSimilar} style={{ width: '100%', justifyContent: 'center' }}>
                                    {isSearchingSimilar ? (
                                        <>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255, 255, 255, 0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'a-spin 0.8s linear infinite' }} />
                                            検索中...
                                        </>
                                    ) : "類似ワールドを調べる"}
                                </button>
                            </div>
                        )}

                        {unknownWorld && hasSearched && suggestions.length > 0 && (
                            <div className="suggestions-section" style={{ marginTop: '20px', padding: '12px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                                {confident.length > 0 ? (
                                    <>
                                        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4ade80' }}>ワールドが見つかったかも！</h3>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>高信頼度（距離: {confident[0].min_dist}）</p>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <img src={convertFileSrc(confident[0].photo.photo_path)} alt="" style={{ width: '80px', height: '56px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => onSelectSimilar(confident[0].photo)} />
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{confident[0].world_name}</div>
                                                <button className="world-link-button" onClick={() => handleOpenWorldId(confident[0].world_id)} style={{ padding: '4px 8px', fontSize: '12px', marginTop: '4px' }}>
                                                    ワールドページを開く
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : possible.length > 0 ? (
                                    <>
                                        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#fbbf24' }}>雰囲気が似てるワールド</h3>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>近い写真から推測しました。</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {possible.map(s => (
                                                <div key={s.world_id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <img src={convertFileSrc(s.photo.photo_path)} alt="" style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => onSelectSimilar(s.photo)} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{s.world_name}</div>
                                                        <button className="world-link-button" onClick={() => handleOpenWorldId(s.world_id)} style={{ padding: '2px 6px', fontSize: '11px', marginTop: '2px' }}>開く</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        {/* 「もしかして」: 距離 11-20 の緩い類似候補 */}
                        {unknownWorld && hasSearched && maybeSuggestions.length > 0 && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(251,191,36,0.07)', borderRadius: '8px', border: '1px dashed rgba(251,191,36,0.4)', marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>📍</span> もしかして...
                                </h3>
                                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--a-text)', opacity: 0.7 }}>
                                    雰囲気が少し似ているワールドがあります。ヒント程度にどうぞ。
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {maybeSuggestions.map(s => (
                                        <div key={s.world_id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <img src={convertFileSrc(s.photo.photo_path)} alt="" style={{ width: '52px', height: '36px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', opacity: 0.85 }} onClick={() => onSelectSimilar(s.photo)} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold', opacity: 0.9 }}>{s.world_name}</div>
                                                <div style={{ fontSize: '10px', color: 'var(--a-text)', opacity: 0.5 }}>部分一致 (dist {s.min_dist})</div>
                                            </div>
                                            <button className="world-link-button" onClick={() => handleOpenWorldId(s.world_id)} style={{ padding: '2px 6px', fontSize: '10px', opacity: 0.8 }}>開く</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="memo-section">
                            <label>メモ</label>
                            <textarea value={localMemo} onChange={(e) => setLocalMemo(e.target.value)} placeholder="メモを入力..." />
                            <button className="save-button" onClick={handleSaveMemo} disabled={isSavingMemo}>
                                {isSavingMemo ? "保存中..." : "メモを保存"}
                            </button>
                        </div>

                        {!unknownWorld && !hasSearched && (
                            <div className="suggestions-section" style={{ marginTop: '20px' }}>
                                <button className="world-link-button" onClick={handleSearchSimilar} disabled={isSearchingSimilar} style={{ width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid var(--a-border)', color: 'var(--a-text)' }}>
                                    {isSearchingSimilar ? (
                                        <>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid var(--a-border)', borderTopColor: 'var(--a-accent)', borderRadius: '50%', animation: 'a-spin 0.8s linear infinite' }} />
                                            検索中...
                                        </>
                                    ) : "類似画像を調べる"}
                                </button>
                            </div>
                        )}

                        {!unknownWorld && hasSearched && similarPhotos.length > 0 && (
                            <div className="similar-photos-section" style={{ marginTop: '20px' }}>
                                <h3>類似写真 ({similarPhotos.length}件)</h3>
                                <div className="similar-photos-list" style={{
                                    display: 'flex',
                                    gap: '8px',
                                    overflowX: 'auto',
                                    paddingBottom: '8px',
                                    scrollbarWidth: 'thin'
                                }}>
                                    {similarPhotos.map(sp => (
                                        <div
                                            key={sp.item.photo_filename}
                                            style={{ flexShrink: 0, width: '100px', cursor: 'pointer', position: 'relative' }}
                                            onClick={() => onSelectSimilar(sp.item)}
                                        >
                                            <img
                                                src={convertFileSrc(sp.item.photo_path)}
                                                alt="similar"
                                                style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '4px' }}
                                            />
                                            <div style={{
                                                position: 'absolute', bottom: 2, right: 2,
                                                background: 'rgba(0,0,0,0.6)', color: '#fff',
                                                fontSize: '10px', padding: '2px 4px', borderRadius: '4px'
                                            }}>
                                                dist: {sp.distance}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
