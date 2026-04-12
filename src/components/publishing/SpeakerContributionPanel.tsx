import React, { useEffect, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import RichTextThreadEditor from '@/components/publishing/RichTextThreadEditor';
import { renderRunsToReact } from '@/lib/publishing/richText';
import Modal from '@/components/common/Modal';
import { ContributionItem, PresentationTrackOption, TextRole, TextRun } from '@/types/publishing';

interface SpeakerContributionPanelProps {
  contributions: ContributionItem[];
  selectedContribution: ContributionItem | null;
  presentationTracks: PresentationTrackOption[];
  showPresentationTracks: boolean;
  pageNumberByContribution: Record<string, number>;
  roleLabel: Record<TextRole, string>;
  onCreateContribution: () => void;
  onCompleteContribution: () => void;
  onChangePresentationTrack: (contributionId: string, trackId: string) => void;
  editingSlotKey: string | null;
  editingValue: string;
  editingRuns: TextRun[];
  slotRunsByKey: Record<string, TextRun[]>;
  onSelectContribution: (pageId: string) => void;
  onMoveContribution: (contributionId: string, direction: 'up' | 'down') => void;
  onDeleteContribution: (contributionId: string) => void;
  onStartEditSlot: (slotKey: string, runs: TextRun[]) => void;
  onEditingValueChange: (value: string) => void;
  onEditingRunsChange: (runs: TextRun[]) => void;
  onSaveSlot: () => void;
  onCancelSlot: () => void;
}

const SpeakerContributionPanel: React.FC<SpeakerContributionPanelProps> = ({
  contributions,
  selectedContribution,
  presentationTracks,
  showPresentationTracks,
  pageNumberByContribution,
  roleLabel,
  onCreateContribution,
  onCompleteContribution,
  onChangePresentationTrack,
  editingSlotKey,
  editingValue,
  editingRuns,
  slotRunsByKey,
  onSelectContribution,
  onMoveContribution,
  onDeleteContribution,
  onStartEditSlot,
  onEditingValueChange,
  onEditingRunsChange,
  onSaveSlot,
  onCancelSlot,
}) => {
  const [trackFilter, setTrackFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');

  const presentationTrackById = useMemo(
    () => new Map(presentationTracks.map((track) => [track.id, track])),
    [presentationTracks],
  );

  const getContributionTrackLabel = useMemo(
    () => (contribution: ContributionItem) => {
      const matchedTrack = contribution.presentationTrackId
        ? presentationTrackById.get(contribution.presentationTrackId)
        : undefined;

      if (matchedTrack) {
        return `${matchedTrack.prefix}. ${matchedTrack.label}`;
      }

      return contribution.track || contribution.sourceFileName || '트랙 정보 없음';
    },
    [presentationTrackById],
  );

  const hasUnassignedTrack = useMemo(
    () => contributions.some((contribution) => !contribution.presentationTrackId || !presentationTrackById.has(contribution.presentationTrackId)),
    [contributions, presentationTrackById],
  );

  const trackFilterOptions = useMemo(() => {
    const options = presentationTracks.map((track) => ({
      value: track.id,
      label: `${track.prefix}. ${track.label}`,
      count: contributions.filter((contribution) => contribution.presentationTrackId === track.id).length,
    }));

    if (hasUnassignedTrack) {
      options.push({
        value: 'unassigned',
        label: '트랙 미지정',
        count: contributions.filter((contribution) => !contribution.presentationTrackId || !presentationTrackById.has(contribution.presentationTrackId)).length,
      });
    }

    return options;
  }, [contributions, hasUnassignedTrack, presentationTrackById, presentationTracks]);

  const filteredContributions = useMemo(() => {
    let result = contributions;

    if (showPresentationTracks && trackFilter !== 'all') {
      if (trackFilter === 'unassigned') {
        result = result.filter((contribution) => !contribution.presentationTrackId || !presentationTrackById.has(contribution.presentationTrackId));
      } else {
        result = result.filter((contribution) => contribution.presentationTrackId === trackFilter);
      }
    }

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((contribution) => {
        const titleMatch = contribution.title?.toLowerCase().includes(lowerQuery);
        const authorMatch = contribution.slots.some(
          (slot) => (slot.slotKey.includes('author') || slot.slotKey.includes('speaker') || slot.slotKey.includes('affiliation')) 
            && slot.text?.toLowerCase().includes(lowerQuery)
        );
        return titleMatch || authorMatch;
      });
    }

    return result;
  }, [contributions, presentationTrackById, showPresentationTracks, trackFilter, searchQuery]);

  useEffect(() => {
    if (!showPresentationTracks) {
      setTrackFilter('all');
      return;
    }

    if (trackFilter === 'all') {
      return;
    }

    if (trackFilter === 'unassigned' && hasUnassignedTrack) {
      return;
    }

    if (!trackFilterOptions.some((option) => option.value === trackFilter)) {
      setTrackFilter('all');
    }
  }, [hasUnassignedTrack, showPresentationTracks, trackFilter, trackFilterOptions]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredContributions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  const selectedContributionTrackLabel = selectedContribution ? getContributionTrackLabel(selectedContribution) : '';

  useEffect(() => {
    if (selectedContribution) {
      setActiveTab('detail');
    } else {
      setActiveTab('list');
    }
  }, [selectedContribution?.id]);

  const handleSelectContribution = (pageId: string) => {
    onSelectContribution(pageId);
    setActiveTab('detail');
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 p-2 gap-2">
      <div className="flex shrink-0 gap-2 p-1 bg-slate-200/50 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition ${activeTab === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          발표자 목록 관리
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedContribution) setActiveTab('detail');
          }}
          disabled={!selectedContribution}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition ${activeTab === 'detail' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600 disabled:opacity-50'}`}
        >
          선택된 슬롯 편집
        </button>
      </div>

      {activeTab === 'list' && (
        <section className="flex flex-col flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex-shrink-0 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">발표자 순서</p>
            <p className="text-xs text-slate-500">제목 대신 순번과 트랙 기준으로 관리합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
              {filteredContributions.length}/{contributions.length} items
            </span>
            <button
              type="button"
              onClick={onCreateContribution}
              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
            >
              새로 생성
            </button>
          </div>
        </div>
        {showPresentationTracks ? (
          <div className="mb-3 flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-500">발표 트랙 목록</span>
              <select
                value={trackFilter}
                onChange={(event) => setTrackFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">전체 트랙</option>
                {trackFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        
        <div className="mb-3 flex-shrink-0 relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="제목, 저자, 소속 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-9 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          ) : null}
        </div>

        <div ref={parentRef} className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const contribution = filteredContributions[virtualRow.index];
              const isActive = contribution.id === selectedContribution?.id;
              const contributionIndex = contributions.findIndex((item) => item.id === contribution.id);
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className={`rounded-xl border px-3 py-2 mx-1 flex items-center justify-between gap-3 ${isActive ? 'border-slate-900 bg-white shadow-sm' : 'border-slate-200 bg-white/60'}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectContribution(contribution.pageId)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400 w-6">#{contribution.order}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {contribution.title || '제목 없음'}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 whitespace-nowrap">
                              {pageNumberByContribution[contribution.id] ?? '-'}p
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {showPresentationTracks && contribution.presentationCode ? `[${contribution.presentationCode}] ` : ''}
                            {getContributionTrackLabel(contribution)}
                          </p>
                        </div>
                      </div>
                    </button>
                    
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="flex flex-col gap-0.5 mr-1">
                        <button
                          type="button"
                          onClick={() => onMoveContribution(contribution.id, 'up')}
                          disabled={contributionIndex <= 0}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3 w-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.5l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveContribution(contribution.id, 'down')}
                          disabled={contributionIndex === -1 || contributionIndex >= contributions.length - 1}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3 w-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.5l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteContribution(contribution.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="삭제"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!filteredContributions.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
              {contributions.length ? '선택한 트랙에 등록된 발표자 원고가 없습니다.' : '아직 등록된 발표자 원고가 없습니다.'}
            </div>
          ) : null}
        </div>
      </section>

      )}

      {activeTab === 'detail' && selectedContribution ? (
        <section className="flex flex-col flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 shrink-0 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">발표자 슬롯 점검</p>
              <p className="text-xs text-slate-500">
                발표 순서 #{selectedContribution.order}
                {selectedContributionTrackLabel ? ` · ${selectedContributionTrackLabel}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedContribution.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {selectedContribution.status === 'completed' ? '완료 저장됨' : '작성중'}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                {selectedContribution.slots.length} slots
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCompleteContribution}
            className="mb-3 shrink-0 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
          >
            완료 저장
          </button>
          {showPresentationTracks ? (
            <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">발표 번호</p>
                  <p className="text-xs text-slate-500">우측 목록 순서대로 같은 그룹 안에서 자동 넘버링됩니다.</p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {selectedContribution.presentationCode || '미지정'}
                </span>
              </div>
              <select
                value={selectedContribution.presentationTrackId ?? ''}
                onChange={(event) => onChangePresentationTrack(selectedContribution.id, event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">그룹 선택</option>
                {presentationTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.prefix}. {track.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {selectedContribution.slots.map((slot) => {
              const isEditing = editingSlotKey === slot.slotKey;
              const isBodySlot = slot.slotKey.startsWith('body');
              const slotRuns = slotRunsByKey[slot.slotKey] ?? [{ text: slot.text || '' }];
              return (
                <div key={slot.slotKey} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                      <p className="text-xs text-slate-400">{slot.slotKey}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500">
                        {roleLabel[slot.role]}
                      </span>
                      <button
                        type="button"
                        onClick={() => onStartEditSlot(slot.slotKey, slotRuns)}
                        className="flex h-7 items-center justify-center rounded-full bg-slate-900 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                      >
                        {isBodySlot ? '볼드 수정' : '내용 수정'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-3 max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100 custom-scrollbar">
                    {slot.text ? renderRunsToReact(slotRuns) : <span className="text-slate-400 italic">입력된 내용이 없습니다.</span>}
                  </div>

                  {/* 수정 레이어 팝업 (모달) */}
                  <Modal
                    isOpen={isEditing}
                    onClose={onCancelSlot}
                    title={`${slot.label} 수정`}
                  >
                    <div className="flex flex-col gap-4">
                      {isBodySlot ? (
                        <>
                          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <RichTextThreadEditor
                              runs={editingRuns}
                              onChange={onEditingRunsChange}
                            />
                          </div>
                          <div className="rounded-lg bg-sky-50 p-3 flex gap-2 items-start border border-sky-100">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-sky-500 shrink-0 mt-0.5">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                            </svg>
                            <p className="text-xs text-sky-800 leading-relaxed">
                              본문은 볼드(굵게)와 이탤릭 등 기본 서식만 수동으로 보정하세요. 여기서 지정한 서식과 줄바꿈은 PDF 생성 시 캔버스에 그대로 반영됩니다.
                            </p>
                          </div>
                        </>
                      ) : (
                        <textarea
                          value={editingValue}
                          onChange={(event) => onEditingValueChange(event.target.value)}
                          rows={6}
                          placeholder={`${slot.label} 내용을 입력하세요...`}
                          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm transition"
                        />
                      )}
                      
                      <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={onCancelSlot}
                          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={onSaveSlot}
                          className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                        >
                          변경사항 저장
                        </button>
                      </div>
                    </div>
                  </Modal>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default SpeakerContributionPanel;
