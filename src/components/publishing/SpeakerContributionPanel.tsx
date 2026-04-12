import React, { useEffect, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import RichTextThreadEditor from '@/components/publishing/RichTextThreadEditor';
import { renderRunsToReact } from '@/lib/publishing/richText';
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
    if (!showPresentationTracks || trackFilter === 'all') {
      return contributions;
    }

    if (trackFilter === 'unassigned') {
      return contributions.filter((contribution) => !contribution.presentationTrackId || !presentationTrackById.has(contribution.presentationTrackId));
    }

    return contributions.filter((contribution) => contribution.presentationTrackId === trackFilter);
  }, [contributions, presentationTrackById, showPresentationTracks, trackFilter]);

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
    estimateSize: () => 140,
    overscan: 5,
  });

  const selectedContributionTrackLabel = selectedContribution ? getContributionTrackLabel(selectedContribution) : '';

  return (
    <>
      <section className="flex flex-col h-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className={`h-full rounded-2xl border px-3 py-3 mx-1 ${isActive ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white/80'}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectContribution(contribution.pageId)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">발표 순서</p>
                          <p className="mt-1 text-base font-semibold text-slate-800">#{contribution.order}</p>
                          {showPresentationTracks ? (
                            <p className="mt-2 text-xs font-semibold text-sky-700">
                              {contribution.presentationCode || '번호 미지정'}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-500">{getContributionTrackLabel(contribution)}</p>
                          {contribution.sourceFileName ? (
                            <p className="mt-1 truncate text-[11px] text-slate-400">{contribution.sourceFileName}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                            {pageNumberByContribution[contribution.id] ?? '-'}p
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${contribution.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {contribution.status === 'completed' ? '완료' : '작성중'}
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onMoveContribution(contribution.id, 'up')}
                        disabled={contributionIndex <= 0}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                      >
                        위로
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveContribution(contribution.id, 'down')}
                        disabled={contributionIndex === -1 || contributionIndex >= contributions.length - 1}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                      >
                        아래로
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteContribution(contribution.id)}
                        className="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700"
                      >
                        삭제
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

      {selectedContribution ? (
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
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
            className="mb-3 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
          >
            완료 저장
          </button>
          {showPresentationTracks ? (
            <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
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
          <div className="space-y-3">
            {selectedContribution.slots.map((slot) => {
              const isEditing = editingSlotKey === slot.slotKey;
              const isBodySlot = slot.slotKey.startsWith('body');
              const slotRuns = slotRunsByKey[slot.slotKey] ?? [{ text: slot.text || '' }];
              return (
                <div key={slot.slotKey} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                      <p className="text-xs text-slate-500">{slot.slotKey}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                      {roleLabel[slot.role]}
                    </span>
                  </div>
                  {isEditing ? (
                    <>
                      {isBodySlot ? (
                        <>
                          <div className="mt-3">
                            <RichTextThreadEditor
                              runs={editingRuns}
                              onChange={onEditingRunsChange}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">본문은 굵게만 수동 보정하면 PDF에도 그대로 반영됩니다.</p>
                        </>
                      ) : (
                        <textarea
                          value={editingValue}
                          onChange={(event) => onEditingValueChange(event.target.value)}
                          rows={4}
                          className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                        />
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={onSaveSlot}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={onCancelSlot}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                        >
                          취소
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {slot.text ? renderRunsToReact(slotRuns) : '내용 없음'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onStartEditSlot(slot.slotKey, slotRuns)}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        >
                          {isBodySlot ? '볼드 수정' : '슬롯 수정'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
};

export default SpeakerContributionPanel;
