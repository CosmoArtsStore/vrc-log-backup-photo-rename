import React, { useState } from 'react';
import { FileText, Database, Users, Settings, CheckCircle, BarChart3, HelpCircle, Sheet, Download } from 'lucide-react';
import { GUIDE } from '@/common/copy';

export const GuidePage: React.FC = () => {
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('flow');

  const tabs = [
    { id: 'flow', label: '基本的な流れ', icon: BarChart3 },
    { id: 'tsv', label: 'TSVの準備', icon: Sheet },
    { id: 'import', label: '1. データ読取', icon: FileText },
    { id: 'db', label: '2. DBデータ確認', icon: Database },
    { id: 'cast', label: '3. キャスト管理', icon: Users },
    { id: 'lottery', label: '4. 抽選条件', icon: Settings },
    { id: 'confirm', label: '5. マッチング確認', icon: CheckCircle },
    { id: 'result', label: '6. マッチング結果', icon: BarChart3 },
    { id: 'modes', label: 'マッチング方式', icon: Settings },
    { id: 'faq', label: 'よくある質問', icon: HelpCircle },
  ];

  // ツールチップ付き要素のコンポーネント
  const TooltipElement: React.FC<{
    id: string;
    tooltip: string;
    children: React.ReactNode;
    className?: string;
  }> = ({ id, tooltip, children, className }) => (
    <div
      className={`guide-tooltip-wrapper ${className ?? ''}`.trim()}
      onMouseEnter={() => setHoveredElement(id)}
      onMouseLeave={() => setHoveredElement(null)}
    >
      {children}
      {hoveredElement === id && (
        <div className="guide-tooltip-bubble">
          {tooltip}
          <div className="guide-tooltip-arrow" />
        </div>
      )}
    </div>
  );

  return (
    <div className="page-wrapper" style={{ display: 'flex', gap: '24px', height: '100%', maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <style>{`
        @media (max-width: 768px) {
          .guide-layout {
            flex-direction: column !important;
          }
          .guide-sidebar {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid var(--discord-border);
            padding-right: 0 !important;
            padding-bottom: 16px;
            margin-bottom: 16px;
          }
          .guide-section-grid {
            grid-template-columns: 1fr !important;
          }
          .guide-sample-preview {
            transform: scale(1) !important;
            transform-origin: top center !important;
            margin-top: 20px;
          }
          .guide-flow-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .guide-mode-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Sidebar Nav */}
      <aside className="guide-sidebar" style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--discord-border)', paddingRight: '16px', overflowY: 'auto' }}>
        <header style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HelpCircle size={24} color="var(--discord-text-normal)" />
          <h1 className="page-header-title page-header-title--md" style={{ margin: 0 }}>使い方ガイド</h1>
        </header>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? 'var(--discord-bg-modifier-selected)' : 'transparent',
                color: activeTab === tab.id ? 'var(--discord-text-normal)' : 'var(--discord-text-muted)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 500,
                transition: 'background-color 0.15s ease'
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', paddingBottom: '40px' }}>


        {/* データフロー */}
        {activeTab === 'flow' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <h2 className="page-header-title page-header-title--md guide-section-title">
              <BarChart3 size={22} />
              基本的な流れ
            </h2>
            <div className="guide-flow-box">
              <div className="guide-flow-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {[
                  { icon: FileText, text: GUIDE.FLOW_DATA_READ, desc: GUIDE.FLOW_DATA_READ_DESC },
                  { icon: Database, text: GUIDE.FLOW_DB, desc: GUIDE.FLOW_DB_DESC },
                  { icon: Users, text: GUIDE.FLOW_CAST, desc: GUIDE.FLOW_CAST_DESC },
                  { icon: Settings, text: GUIDE.FLOW_LOTTERY_CONDITION, desc: GUIDE.FLOW_LOTTERY_CONDITION_DESC },
                  { icon: CheckCircle, text: GUIDE.FLOW_MATCHING_CONFIRM, desc: GUIDE.FLOW_MATCHING_CONFIRM_DESC },
                  { icon: BarChart3, text: GUIDE.FLOW_MATCHING_RESULT, desc: GUIDE.FLOW_MATCHING_RESULT_DESC },
                ].map((item, idx) => (
                  <div key={idx} className="guide-flow-item">
                    <item.icon size={24} className="guide-flow-item-icon" />
                    <div className="guide-flow-item-title">
                      {idx + 1}. {item.text}
                    </div>
                    <div className="guide-flow-item-desc">
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TSV準備（事前） */}
        {activeTab === 'tsv' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <h2 className="page-header-title page-header-title--md guide-section-title">
              <Sheet size={22} />
              TSVを用意する（事前準備）
            </h2>
            <p className="page-header-subtitle" style={{ marginBottom: 20, color: 'var(--discord-text-muted)' }}>
              応募データがGoogleフォームで集まっている場合の、スプレッドシート化〜TSV出力までの手順です。
            </p>

            <div className="guide-stack-vertical">
              {/* Step 0a: Google Form → スプレッドシート */}
              <div className="guide-card">
                <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div>
                    <h3 style={{
                      color: 'var(--discord-text-header)',
                      fontSize: '18px',
                      fontWeight: 600,
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Sheet size={20} />
                      Step A. Googleフォームの回答をスプレッドシートに連携する
                    </h3>
                    <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                      Googleフォームで応募を募集している場合、回答をスプレッドシートに自動で集約できます。
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>① フォームを開き、画面上部の「回答」タブをクリック</li>
                      <li>② 真ん中のカード内の緑色ボタン「スプレッドシートにリンク」をクリック</li>
                      <li>③ ダイアログで「新しいスプレッドシートを作成」→「作成」をクリック</li>
                      <li>回答が自動でスプレッドシートに記録されます</li>
                    </ul>
                  </div>
                  <div className="guide-sample-preview" style={{
                    backgroundColor: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #dadce0',
                    transform: 'scale(0.95)',
                    transformOrigin: 'top right',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #dadce0' }}>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: 4 }}>フォーム名</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#3c4043' }}>抽選用フォーム</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368', borderBottom: '2px solid transparent' }}>質問</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#1a73e8', fontWeight: 600, borderBottom: '2px solid #1a73e8' }}>回答</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368', borderBottom: '2px solid transparent' }}>設定</div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dadce0', padding: 20 }}>
                      <div style={{ fontSize: 13, color: '#3c4043', marginBottom: 16 }}>0 件の回答</div>
                      <button style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 16px', backgroundColor: '#34a853', color: '#fff',
                        border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500
                      }}>
                        <span style={{ fontSize: 16 }}>＋</span>
                        スプレッドシートにリンク
                      </button>
                      <div style={{ fontSize: 10, color: '#5f6368', marginTop: 12 }}>← ② ここをクリック</div>
                    </div>
                    <div style={{ marginTop: 12, padding: 12, backgroundColor: '#fff', borderRadius: 6, border: '1px solid #dadce0' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#5f6368', marginBottom: 8 }}>③ 出たダイアログ</div>
                      <div style={{ fontSize: 11, color: '#3c4043', marginBottom: 8 }}>回答の送信先を選択</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #673ab7', backgroundColor: '#fff' }} />
                        <span style={{ fontSize: 11 }}>新しいスプレッドシートを作成</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #dadce0', backgroundColor: '#fff' }} />
                        <span style={{ fontSize: 11, color: '#5f6368' }}>既存のスプレッドシートを選択</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#5f6368' }}>キャンセル</span>
                        <span style={{ fontSize: 11, color: '#1a73e8', fontWeight: 600 }}>作成</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 0b: スプレッドシート → TSV */}
              <div className="guide-card">
                <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div>
                    <h3 style={{
                      color: 'var(--discord-text-header)',
                      fontSize: '18px',
                      fontWeight: 600,
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Download size={20} />
                      Step B. スプレッドシートからTSVをダウンロードする
                    </h3>
                    <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                      スプレッドシートのUIを操作して、タブ区切り形式（.tsv）で保存します。
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>① 画面上部のメニューから「ファイル」をクリック</li>
                      <li>② 出たメニューで「ダウンロード」にマウスを乗せる</li>
                      <li>③ 右に出るサブメニューから「タブ区切り形式 (.tsv)」をクリック</li>
                      <li>TSVファイルがPCに保存されます</li>
                    </ul>
                  </div>
                  <div className="guide-sample-preview" style={{
                    backgroundColor: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #dadce0',
                    transform: 'scale(0.95)',
                    transformOrigin: 'top right',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #dadce0' }}>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginBottom: 4 }}>スプレッドシート名 (回答)</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
                      <div style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.1)', borderRadius: 4 }}>ファイル</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>編集</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>表示</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>挿入</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>表示形式</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>データ</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>ツール</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>拡張機能</div>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: '#5f6368' }}>ヘルプ</div>
                    </div>
                    <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                      <div style={{
                        backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: 4,
                        padding: '6px 0', minWidth: 200, boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                      }}>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderBottom: '1px solid #eee' }}>新しいウィンドウで開く</div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderBottom: '1px solid #eee' }}>インポート</div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderBottom: '1px solid #eee' }}>コピーを作成</div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderBottom: '1px solid #eee' }}>共有</div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderBottom: '1px solid #eee' }}>メール</div>
                        <div style={{ padding: '6px 16px 8px', backgroundColor: '#f8f9fa' }}>
                          <div style={{ fontSize: 10, color: '#5f6368', marginBottom: 4 }}>② ダウンロード</div>
                          <div style={{ paddingLeft: 8, borderLeft: '2px solid #1a73e8' }}>
                            <div style={{ fontSize: 11, color: '#5f6368', padding: '4px 0' }}>Microsoft Excel (.xlsx)</div>
                            <div style={{ fontSize: 11, color: '#5f6368', padding: '4px 0' }}>OpenDocument (.ods)</div>
                            <div style={{ fontSize: 11, color: '#5f6368', padding: '4px 0' }}>PDF (.pdf)</div>
                            <div style={{ fontSize: 11, color: '#5f6368', padding: '4px 0' }}>ウェブページ (.html)</div>
                            <div style={{ fontSize: 11, color: '#5f6368', padding: '4px 0' }}>カンマ区切り形式 (.csv)</div>
                            <div style={{ fontSize: 11, color: '#1a73e8', fontWeight: 600, padding: '4px 0', backgroundColor: 'rgba(26,115,232,0.08)', margin: '2px -8px', paddingLeft: 8 }}>③ タブ区切り形式 (.tsv)</div>
                          </div>
                        </div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043', borderTop: '1px solid #eee' }}>名前を変更</div>
                        <div style={{ padding: '8px 16px', fontSize: 12, color: '#3c4043' }}>印刷</div>
                      </div>
                      <div style={{ width: 120, marginLeft: 12, fontSize: 10, color: '#5f6368' }}>
                        <div style={{ marginBottom: 4 }}>① ここをクリック</div>
                        <div>→ ② ダウンロードにマウス</div>
                        <div style={{ marginTop: 4 }}>→ ③ TSVを選択</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: 8, backgroundColor: '#e8f0fe', borderRadius: 4, fontSize: 11, color: '#1967d2' }}>
                      ファイル → ダウンロード → タブ区切り形式 (.tsv)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 各画面の説明 */}
        {/* データ読取 */}
        {activeTab === 'import' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <FileText size={20} />
                    1. データ読取
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    応募データはTSVで取り込みます。共通項目はユーザー名・アカウントID(X)・希望キャストのみ。列の割り当てでこれらを指定し、それ以外の列はDBデータ確認で「全て表示」から確認できます。
                  </p>
                  <p style={{ color: 'var(--discord-text-muted)', fontSize: '12px', marginBottom: '12px', lineHeight: '1.6' }}>
                    ※ 同じヘッダー形式のTSVを過去に取り込んだことがあると、列割り当てと希望キャストの形式が自動で復元されます（%LOCALAPPDATA%\\CosmoArtsStore\\Stargazer\\template に保存）。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      必要な操作：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>「TSVファイルを選択」で応募TSVを選ぶ</li>
                      <li>列の割り当てでユーザー名・アカウントID(X)・希望キャストを指定（複数指定可のときは希望キャストは1列のみ）</li>
                      <li>「この割り当てで取り込む」で確定。取り込み時に設定がテンプレートとして保存され、次回同じヘッダーで自動反映されます</li>
                    </ul>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '12px', marginTop: '10px', lineHeight: '1.6' }}>
                      ※ キャスト一覧は %LOCALAPPDATA%\\CosmoArtsStore\\Stargazer\\cast から読み込み。編集は「キャスト管理」で行います。
                    </p>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '20px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--discord-text-header)' }}>
                    データ読取
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--discord-text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                      応募データTSV
                    </div>
                    <TooltipElement id="tsv-select" tooltip="フォームの回答TSVを選択して取り込み">
                      <button
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: 'var(--discord-accent-green)',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        TSVファイルを選択
                      </button>
                    </TooltipElement>
                    <div style={{ fontSize: '10px', color: 'var(--discord-text-muted)', marginTop: '12px' }}>
                      列の割り当て：ユーザー名・アカウントID(X)・希望キャストを対象キャストと同じプルダウンで指定
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* DBデータ確認 */}
        {activeTab === 'db' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Database size={20} />
                    2. DBデータ確認
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    読み込んだ応募者名簿を一覧表示します。初期表示はユーザー名・アカウントID(X)・希望キャストのみ。マッピングされなかった列は「全て表示」ボタンで元データの列名のまま表示でき、横スクロールで確認できます。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      できること：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>応募者一覧（ユーザー名・アカウントID(X)・希望キャスト1〜N）の確認</li>
                      <li>X IDクリックでユーザーページに遷移</li>
                      <li>「全て表示」で取り込み時の全列を表示・横スクロール</li>
                    </ul>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--discord-text-header)' }}>
                    名簿データベース
                  </div>
                  <div style={{ overflow: 'hidden', borderRadius: '4px', border: '1px solid var(--discord-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>名前</th>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>X ID</th>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>希望1</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>ユーザー1</td>
                          <TooltipElement id="x-id-link" tooltip="クリックでXのユーザーページに遷移">
                            <td style={{ padding: '6px', color: 'var(--discord-text-link)', cursor: 'pointer', textDecoration: 'underline' }}>
                              @user1
                            </td>
                          </TooltipElement>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>キャストA</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>ユーザー2</td>
                          <td style={{ padding: '6px', color: 'var(--discord-text-link)', cursor: 'pointer', textDecoration: 'underline' }}>@user2</td>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>キャストB</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* キャスト管理 */}
        {activeTab === 'cast' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Users size={20} />
                    3. キャスト管理
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    キャストの出席管理とNGユーザー管理を行います。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      できること：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>キャストの新規登録・削除</li>
                      <li>キャストの出席状態の切り替え</li>
                      <li>NGユーザーの追加・削除</li>
                      <li>出席状況の確認</li>
                    </ul>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--discord-text-header)' }}>
                    キャスト・NG管理
                  </div>
                  <div style={{
                    backgroundColor: 'var(--discord-bg-secondary)',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--discord-border)',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--discord-text-normal)' }}>キャストA</div>
                      <TooltipElement id="presence-dot" tooltip="緑=出席中、グレー=欠席">
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--discord-accent-green)'
                        }} />
                      </TooltipElement>
                    </div>
                    <TooltipElement id="presence-button" tooltip="クリックで出席状態を切り替え">
                      <button
                        style={{
                          width: '100%',
                          padding: '6px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: 'var(--discord-accent-green)',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 600,
                          marginBottom: '8px',
                          cursor: 'default'
                        }}
                      >
                        出席中
                      </button>
                    </TooltipElement>
                    <div style={{ fontSize: '10px', color: 'var(--discord-text-muted)', marginBottom: '6px' }}>
                      NGユーザー (1)
                    </div>
                    <TooltipElement id="ng-user" tooltip="NGユーザーを削除するには×をクリック">
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: 'var(--discord-bg-dark)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: 'var(--discord-text-normal)'
                      }}>
                        ユーザー1
                        <span style={{ cursor: 'pointer', color: 'var(--discord-accent-red)' }}>×</span>
                      </div>
                    </TooltipElement>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 抽選条件 */}
        {activeTab === 'lottery' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Settings size={20} />
                    4. 抽選条件
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    抽選の条件を設定し、抽選を実行します。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      必要な操作：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>マッチング形式（M000～M003）を選択</li>
                      <li>ローテーション回数・当選人数（または当選者数・総テーブル数など）を入力</li>
                      <li>「抽選を開始する」をクリック</li>
                    </ul>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '20px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--discord-text-header)' }}>
                    抽選条件
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--discord-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                      マッチング形式・当選人数など
                    </div>
                    <TooltipElement id="winner-count" tooltip="抽選で選ぶ人数を入力">
                      <input
                        type="number"
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'var(--discord-bg-secondary)',
                          border: '1px solid var(--discord-border)',
                          borderRadius: '4px',
                          color: 'var(--discord-text-normal)',
                          fontSize: '11px',
                          pointerEvents: 'none'
                        }}
                        value="15"
                        readOnly
                      />
                    </TooltipElement>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--discord-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                      マッチング方式
                    </div>
                    <TooltipElement id="matching-mode-random" tooltip="希望キャストを優先的に割り当て">
                      <div style={{
                        padding: '10px',
                        backgroundColor: 'var(--discord-accent-blue)',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        fontSize: '11px',
                        color: '#fff',
                        fontWeight: 600
                      }}>
                        ランダムマッチング（希望優先）
                      </div>
                    </TooltipElement>
                    <TooltipElement id="matching-mode-rotation" tooltip="循環ローテーションで公平に割り当て">
                      <div style={{
                        padding: '10px',
                        backgroundColor: 'var(--discord-bg-secondary)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: 'var(--discord-text-normal)',
                        fontWeight: 600,
                        border: '1px solid var(--discord-border)'
                      }}>
                        循環方式マッチング（ローテーション）
                      </div>
                    </TooltipElement>
                  </div>

                  {/* Add WARNING Panel */}
                  <div style={{
                    backgroundColor: 'rgba(237, 66, 69, 0.1)',
                    border: '1px solid var(--discord-accent-red)',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{
                      color: 'var(--discord-accent-red)',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{ fontSize: '13px' }}>⚠️</span>
                      WARNING
                    </div>
                    <div style={{ color: 'var(--discord-text-normal)', fontSize: '11px', lineHeight: '1.5' }}>
                      現在、設定された条件に対してキャスト枠が不足しています。<br />
                      約<span style={{ color: 'var(--discord-accent-red)', fontWeight: 'bold' }}>5</span>名がマッチングされない可能性があります。
                    </div>
                  </div>

                  <TooltipElement id="lottery-start" tooltip="設定した条件で抽選を実行">
                    <button
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: 'var(--discord-accent-green)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'default'
                      }}
                    >
                      抽選を開始する
                    </button>
                  </TooltipElement>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* マッチング構成確認 */}
        {activeTab === 'confirm' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <CheckCircle size={20} />
                    5. マッチング構成確認
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    抽選結果を確認し、TSVでダウンロードできます。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      できること：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>当選者と希望キャストの確認</li>
                      <li>抽選結果をTSVでダウンロード</li>
                      <li>マッチング画面への遷移</li>
                    </ul>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--discord-text-header)' }}>
                    マッチング構成確認
                  </div>
                  <div style={{ overflow: 'hidden', borderRadius: '4px', border: '1px solid var(--discord-border)', marginBottom: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>ユーザー</th>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>希望1</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>ユーザー1</td>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>キャストA</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>ユーザー2</td>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>キャストB</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <TooltipElement id="export-result" tooltip="抽選結果をTSVでダウンロード">
                      <button
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--discord-border)',
                          backgroundColor: 'var(--discord-bg-secondary)',
                          color: 'var(--discord-text-normal)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        抽選結果をTSVでダウンロード
                      </button>
                    </TooltipElement>
                    <TooltipElement id="matching-start" tooltip="マッチング結果画面に遷移">
                      <button
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: 'var(--discord-accent-green)',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        マッチング開始
                      </button>
                    </TooltipElement>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* マッチング結果 */}
        {activeTab === 'result' && (
          <section className="guide-section" style={{ animation: 'fade-in 0.2s ease' }}>
            <div className="guide-card" style={{ marginTop: 0 }}>
              <div className="guide-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <BarChart3 size={20} />
                    6. マッチング結果
                  </h3>
                  <p style={{ color: 'var(--discord-text-normal)', marginBottom: '16px', lineHeight: '1.7' }}>
                    マッチング結果を表示します。ユーザー別とキャスト別の2つの視点で確認できます。
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: 'var(--discord-text-muted)', fontSize: '13px', marginBottom: '10px', fontWeight: 600 }}>
                      できること：
                    </p>
                    <ul style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.9'
                    }}>
                      <li>ユーザー別・キャスト別マッチング結果の確認</li>
                      <li>当選者別・キャスト別の表をPNG画像で保存（共有や撮影に便利）</li>
                      <li>マッチング結果をTSVでダウンロード</li>
                    </ul>
                  </div>
                </div>
                <div className="guide-sample-preview" style={{
                  backgroundColor: 'var(--discord-bg-dark)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--discord-border)',
                  transform: 'scale(0.85)',
                  transformOrigin: 'top right'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--discord-text-header)' }}>
                    マッチング結果
                  </div>
                  <div style={{ overflow: 'hidden', borderRadius: '4px', border: '1px solid var(--discord-border)', marginBottom: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--discord-bg-secondary)' }}>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>ユーザー</th>
                          <th style={{ padding: '6px', textAlign: 'left', fontSize: '9px', color: 'var(--discord-text-muted)', fontWeight: 600 }}>1ローテ目</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '6px', color: 'var(--discord-text-normal)' }}>ユーザー1</td>
                          <td style={{ padding: '6px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--discord-text-normal)', marginBottom: '2px' }}>キャストA</div>
                            <TooltipElement id="rank-badge" tooltip="第1希望=金色、第2希望=銀色、第3希望=銅色">
                              <span style={{
                                fontSize: '8px',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                backgroundColor: '#F5C400',
                                color: '#000',
                                fontWeight: 600
                              }}>
                                第1希望
                              </span>
                            </TooltipElement>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <TooltipElement id="export-png-user" tooltip="当選者別の表をPNG画像でダウンロード">
                      <button
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--discord-border)',
                          backgroundColor: 'var(--discord-bg-secondary)',
                          color: 'var(--discord-text-normal)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        PNGで保存（当選者別）
                      </button>
                    </TooltipElement>
                    <TooltipElement id="export-png-cast" tooltip="キャスト別の表をPNG画像でダウンロード">
                      <button
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--discord-border)',
                          backgroundColor: 'var(--discord-bg-secondary)',
                          color: 'var(--discord-text-normal)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        PNGで保存（キャスト別）
                      </button>
                    </TooltipElement>
                    <TooltipElement id="export-matching" tooltip="マッチング結果をTSVでダウンロード">
                      <button
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: 'var(--discord-accent-green)',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'default'
                        }}
                      >
                        マッチング結果をTSVでダウンロード
                      </button>
                    </TooltipElement>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* マッチング形式と方式の違い */}
        {activeTab === 'modes' && (
          <div style={{ animation: 'fade-in 0.2s ease' }}>
            {/* マッチング形式（M000～M003） */}
            <section style={{ marginBottom: '48px' }}>
              <h2 className="page-header-title page-header-title--md" style={{
                marginBottom: '20px',
                fontSize: '22px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Settings size={22} />
                マッチング形式（抽選条件）
              </h2>
              <div className="guide-card">
                <p style={{ color: 'var(--discord-text-normal)', fontSize: '14px', marginBottom: '16px', lineHeight: '1.7' }}>
                  抽選条件画面で、マッチング形式を M000～M003 から選択します。共通でローテーション回数を設定し、形式に応じて総テーブル数・1テーブルあたりのユーザー数などを入力します。
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--discord-text-normal)', fontSize: '14px', lineHeight: '2' }}>
                  <li>M000: マッチングは使用しない</li>
                  <li>M001: ランダムマッチング（総テーブル数指定・空席込み）</li>
                  <li>M002: ローテーションマッチング（総テーブル数指定・空席込み）</li>
                  <li>M003: 複数名マッチング（テーブル×キャストユニット）</li>
                </ul>
              </div>
            </section>

            {/* マッチング方式の違い */}
            <section style={{ marginBottom: '48px' }}>
              <h2 className="page-header-title page-header-title--md" style={{
                marginBottom: '20px',
                fontSize: '22px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <BarChart3 size={22} />
                マッチング方式の違い
              </h2>
              <div className="guide-card">
                <div className="guide-mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
                  <div style={{
                    backgroundColor: 'var(--discord-bg-dark)',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid var(--discord-border)'
                  }}>
                    <h4 style={{
                      color: 'var(--discord-text-header)',
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '12px'
                    }}>
                      ランダムマッチング（希望優先）
                    </h4>
                    <p style={{
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.7',
                      margin: 0
                    }}>
                      希望キャストを優先的に割り当てるランダムマッチングです。希望をできる限り叶えたい場合に適しています。
                    </p>
                  </div>
                  <div style={{
                    backgroundColor: 'var(--discord-bg-dark)',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid var(--discord-border)'
                  }}>
                    <h4 style={{
                      color: 'var(--discord-text-header)',
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '12px'
                    }}>
                      循環方式マッチング（ローテーション）
                    </h4>
                    <p style={{
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.7',
                      margin: 0
                    }}>
                      循環ローテーション＋重み付きランダムです。全員が公平にローテーションするため、公平性を重視する場合に適しています。
                    </p>
                  </div>
                  <div style={{
                    backgroundColor: 'var(--discord-bg-dark)',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid var(--discord-border)'
                  }}>
                    <h4 style={{
                      color: 'var(--discord-text-header)',
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '12px'
                    }}>
                      複数マッチング（M003）
                    </h4>
                    <p style={{
                      color: 'var(--discord-text-normal)',
                      fontSize: '14px',
                      lineHeight: '1.7',
                      margin: 0
                    }}>
                      1テーブルあたり複数名・1ローテあたり複数キャストを指定する形式です。当選者をテーブルごとにグループ分けし、各テーブルに複数のキャストがローテーションで入ります。イベントで「○名1テーブル・○キャストが順番に回る」運用に使えます。
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* よくある質問 */}
        {activeTab === 'faq' && (
          <section style={{ marginBottom: '40px', animation: 'fade-in 0.2s ease' }}>
            <h2 className="page-header-title page-header-title--md" style={{
              marginBottom: '20px',
              fontSize: '22px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <HelpCircle size={22} />
              よくある質問
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                {
                  q: 'TSVの作り方が分かりません。Googleフォームの回答をどうTSVにすればいいですか？',
                  a: 'ガイド上部の「TSVを用意する（事前準備）」を参照してください。Googleフォームの回答をスプレッドシートに連携し、スプレッドシートから「ファイル → ダウンロード → タブ区切り形式」でTSVを保存する手順を説明しています。'
                },
                {
                  q: '「列数が足りません」と出ます。',
                  a: '列の割り当てでユーザー名・アカウントID(X)・希望キャストに、TSVの該当する列を指定してください。アカウントID(X)は必須です。'
                },
                {
                  q: '抽選結果やマッチング結果はどこに保存されますか？',
                  a: GUIDE.EXPORT_DESCRIPTION
                },
                {
                  q: 'NGユーザーとは何ですか？',
                  a: '特定のキャストが接客しないように設定するユーザーです。NGユーザーに設定されたユーザーは、そのキャストにマッチングされません。'
                },
                {
                  q: '希望ランクのバッジの色は何を意味しますか？',
                  a: '第1希望は金色、第2希望は銀色、第3希望は銅色で表示されます。第4希望以降と希望外はグレーで表示されます。マッチング結果画面で確認できます。'
                },
                {
                  q: '抽選をやり直したい場合はどうすればいいですか？',
                  a: '「抽選条件」画面に戻って、再度「抽選を開始する」をクリックしてください。新しい抽選結果が生成されます。'
                },
              ].map((item, idx) => (
                <div key={idx} className="guide-card guide-card--compact">
                  <h4 style={{
                    color: 'var(--discord-text-header)',
                    fontSize: '15px',
                    fontWeight: 600,
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--discord-accent-blue)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      Q
                    </div>
                    {item.q}
                  </h4>
                  <p style={{
                    color: 'var(--discord-text-normal)',
                    fontSize: '14px',
                    lineHeight: '1.7',
                    margin: 0,
                    paddingLeft: '28px'
                  }}>
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div >
  );
};
