import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  LockClosedIcon,
  LockOpenIcon,
  PhotoIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { uploadPublicationImage } from '@/lib/publishing/assets';
import { formatMm, pxToMm } from '@/lib/publishing/a4';
import { TEMPLATE_PRESET_DESCRIPTIONS, TEMPLATE_PRESET_LABELS, TemplatePresetKey } from '@/lib/publishing/templatePresets';
import { showToast } from '@/components/common/Toast';
import { usePublishingStore } from '@/stores/publishingStore';
import { PublishingPagePreview } from '@/components/publishing/PublishingEditorShell';
import { ContentZoneTemplate, DecorationElement, MasterTemplate, PagePreset } from '@/types/publishing';
import { logError } from '@/utils/errorHandler';

interface MasterStudioShellProps {
  publicationId: string;
}

const getDecorationTitle = (decoration: DecorationElement) => {
  if (decoration.textBinding === 'page.number') return '페이지 번호';
  if (decoration.textBinding === 'document.title') return '문서 제목';
  if (decoration.textBinding === 'section.number') return '섹션 번호';
  if (decoration.type === 'image') return '이미지';
  if (decoration.type === 'shape') return '라인';
  return '텍스트';
};

const MiniMasterCard: React.FC<{
  master: MasterTemplate;
  isActive: boolean;
  pageWidth: number;
  pageHeight: number;
  isDefault: boolean;
  onClick: () => void;
}> = ({ master, isActive, pageWidth, pageHeight, isDefault, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`block w-full rounded-[26px] border p-4 text-left transition ${
      isActive ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">{master.name}</p>
        <p className={`mt-1 text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
          {master.contentZones.length} 영역 · {master.decorations.length} 요소
        </p>
      </div>
      {isDefault ? (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'}`}>
          기본
        </span>
      ) : null}
    </div>

    <div className={`mt-4 rounded-2xl border p-3 ${isActive ? 'border-white/10 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>
      <div className="relative mx-auto aspect-[210/297] w-24 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="absolute inset-0" style={{ background: master.background.fill }} />
        {master.decorations.slice(0, 4).map((decoration) => (
          <div
            key={decoration.id}
            className="absolute rounded-[2px]"
            style={{
              left: `${(decoration.x / pageWidth) * 100}%`,
              top: `${(decoration.y / pageHeight) * 100}%`,
              width: `${(decoration.width / pageWidth) * 100}%`,
              height: `${Math.max(2, (decoration.height / pageHeight) * 100)}%`,
              background: decoration.type === 'shape' ? decoration.fill ?? '#cbd5e1' : decoration.type === 'image' ? '#cbd5e1' : '#64748b',
              opacity: 0.95,
            }}
          />
        ))}
        {master.contentZones.map((zone) => (
          <div
            key={zone.id}
            className="absolute border border-dashed border-sky-500/80"
            style={{
              left: `${(zone.frame.x / pageWidth) * 100}%`,
              top: `${(zone.frame.y / pageHeight) * 100}%`,
              width: `${(zone.frame.width / pageWidth) * 100}%`,
              height: `${(zone.frame.height / pageHeight) * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  </button>
);

const FrameFields: React.FC<{
  frame: { x: number; y: number; width: number; height: number };
  disabled?: boolean;
  onChange: (updates: Partial<{ x: number; y: number; width: number; height: number }>) => void;
}> = ({ frame, disabled, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    {(['x', 'y', 'width', 'height'] as const).map((key) => (
      <label key={key} className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{key}</span>
        <input
          type="number"
          value={frame[key]}
          disabled={disabled}
          onChange={(event) => onChange({ [key]: Math.max(0, Number(event.target.value) || 0) })}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </label>
    ))}
  </div>
);

const ZoneEditor: React.FC<{
  zone: ContentZoneTemplate;
  pagePreset: PagePreset;
  masterLocked: boolean;
  canDelete: boolean;
  onToggleLock: () => void;
  onUpdate: (updates: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  onStyleUpdate: (updates: Partial<ContentZoneTemplate['style']>) => void;
  onMetaUpdate: (updates: Partial<{ name: string; slotKey?: string; flowGroupId?: string; flowOrder?: number; allowThreadContinuation?: boolean }>) => void;
  onDelete: () => void;
}> = ({ zone, pagePreset, masterLocked, canDelete, onToggleLock, onUpdate, onStyleUpdate, onMetaUpdate, onDelete }) => (
  <div className="rounded-2xl bg-white p-4">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{zone.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {zone.flowOrder ? `Flow ${zone.flowOrder}` : '영역'} · {zone.kind === 'text-flow' ? 'text' : zone.kind === 'media-freeform' ? 'image' : zone.kind}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLock}
          disabled={masterLocked}
          className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {zone.locked ? '잠금 해제' : '잠금'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </div>
    <div className="mb-3 grid grid-cols-2 gap-2">
      <label className="block col-span-2">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">name</span>
        <input
          type="text"
          value={zone.name}
          disabled={masterLocked || zone.locked}
          onChange={(event) => onMetaUpdate({ name: event.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block col-span-2">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">slot key</span>
        <input
          type="text"
          value={zone.slotKey ?? ''}
          disabled={masterLocked || zone.locked}
          onChange={(event) => onMetaUpdate({ slotKey: event.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="body / title / authors / affiliation"
        />
      </label>
      {zone.kind === 'text-flow' ? (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">flow group</span>
            <input
              type="text"
              value={zone.flowGroupId ?? ''}
              disabled={masterLocked || zone.locked}
              onChange={(event) => onMetaUpdate({ flowGroupId: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">flow order</span>
            <input
              type="number"
              min={1}
              value={zone.flowOrder ?? ''}
              disabled={masterLocked || zone.locked}
              onChange={(event) => onMetaUpdate({ flowOrder: Number(event.target.value) || undefined })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <span>다음 영역으로 이어짐</span>
            <input
              type="checkbox"
              checked={zone.allowThreadContinuation !== false}
              disabled={masterLocked || zone.locked}
              onChange={(event) => onMetaUpdate({ allowThreadContinuation: event.target.checked })}
              className="h-4 w-4"
            />
          </label>
        </>
      ) : null}
    </div>
    <FrameFields frame={zone.frame} disabled={masterLocked || zone.locked} onChange={onUpdate} />
    {zone.kind === 'text-flow' ? (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">font family</span>
          <input
            type="text"
            value={zone.style.fontFamily}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ fontFamily: event.target.value || 'Noto Serif KR' })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">font size</span>
          <input
            type="number"
            value={zone.style.fontSize}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ fontSize: Number(event.target.value) || 12 })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">weight</span>
          <input
            type="number"
            value={zone.style.fontWeight}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ fontWeight: Number(event.target.value) || 400 })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">line</span>
          <input
            type="number"
            step="0.05"
            value={zone.style.lineHeight}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ lineHeight: Number(event.target.value) || 1.6 })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">spacing</span>
          <input
            type="number"
            step="0.1"
            value={zone.style.letterSpacing}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ letterSpacing: Number(event.target.value) || 0 })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">align</span>
          <select
            value={zone.style.textAlign}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ textAlign: event.target.value as 'left' | 'center' | 'right' | 'justify' })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
            <option value="justify">양쪽</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">color</span>
          <input
            type="color"
            value={zone.style.color}
            disabled={masterLocked || zone.locked}
            onChange={(event) => onStyleUpdate({ color: event.target.value })}
            className="h-10 w-full rounded-xl border border-slate-200 p-1"
          />
        </label>
      </div>
    ) : (
      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        이 영역은 콘텐츠 편집기에서 이미지 배치용으로 사용됩니다.
      </div>
    )}
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
      <p>{formatMm(pxToMm(zone.frame.x, pagePreset))}</p>
      <p>{formatMm(pxToMm(zone.frame.y, pagePreset))}</p>
      <p>{formatMm(pxToMm(zone.frame.width, pagePreset))}</p>
      <p>{formatMm(pxToMm(zone.frame.height, pagePreset))}</p>
    </div>
  </div>
);

const MasterStudioShell: React.FC<MasterStudioShellProps> = ({ publicationId }) => {
  const document = usePublishingStore((state) => state.document);
  const autosave = usePublishingStore((state) => state.autosave);
  const createMaster = usePublishingStore((state) => state.createMaster);
  const duplicateMaster = usePublishingStore((state) => state.duplicateMaster);
  const deleteMaster = usePublishingStore((state) => state.deleteMaster);
  const setDefaultMaster = usePublishingStore((state) => state.setDefaultMaster);
  const renameMaster = usePublishingStore((state) => state.renameMaster);
  const updateDocumentMeta = usePublishingStore((state) => state.updateDocumentMeta);
  const updatePageNumbering = usePublishingStore((state) => state.updatePageNumbering);
  const updatePrintGuides = usePublishingStore((state) => state.updatePrintGuides);
  const updateMasterBackground = usePublishingStore((state) => state.updateMasterBackground);
  const toggleMasterLock = usePublishingStore((state) => state.toggleMasterLock);
  const updateMasterDecoration = usePublishingStore((state) => state.updateMasterDecoration);
  const updateGlobalMasterDecoration = usePublishingStore((state) => state.updateGlobalMasterDecoration);
  const updateMasterZoneFrame = usePublishingStore((state) => state.updateMasterZoneFrame);
  const updateMasterZoneStyle = usePublishingStore((state) => state.updateMasterZoneStyle);
  const updateMasterZoneMeta = usePublishingStore((state) => state.updateMasterZoneMeta);
  const addMasterTextDecoration = usePublishingStore((state) => state.addMasterTextDecoration);
  const addMasterShapeDecoration = usePublishingStore((state) => state.addMasterShapeDecoration);
  const addMasterImageDecoration = usePublishingStore((state) => state.addMasterImageDecoration);
  const removeMasterDecoration = usePublishingStore((state) => state.removeMasterDecoration);
  const toggleMasterDecorationLock = usePublishingStore((state) => state.toggleMasterDecorationLock);
  const toggleMasterZoneLock = usePublishingStore((state) => state.toggleMasterZoneLock);
  const addMasterTextZone = usePublishingStore((state) => state.addMasterTextZone);
  const addMasterImageZone = usePublishingStore((state) => state.addMasterImageZone);
  const removeMasterZone = usePublishingStore((state) => state.removeMasterZone);

  const [activeMasterId, setActiveMasterId] = useState<string | null>(null);
  const [showCreateMasterModal, setShowCreateMasterModal] = useState(false);
  const [newMasterName, setNewMasterName] = useState('');
  const [newMasterPreset, setNewMasterPreset] = useState<TemplatePresetKey>('single-column');
  const [uploadingMasterImage, setUploadingMasterImage] = useState(false);
  const [masterUploadProgress, setMasterUploadProgress] = useState(0);
  const [templateSelection, setTemplateSelection] = useState<{ type: 'decoration' | 'zone' | null; id: string | null }>({ type: null, id: null });

  useEffect(() => {
    if (!activeMasterId || !document.masters.items.some((item) => item.id === activeMasterId)) {
      setActiveMasterId(document.masters.defaultMasterId || document.masters.items[0]?.id || null);
    }
  }, [activeMasterId, document.masters.defaultMasterId, document.masters.items]);

  const pagePreset = document.layout.pagePreset;
  const selectedMaster = document.masters.items.find((item) => item.id === activeMasterId) ?? document.masters.items[0];
  const templateDecorations = selectedMaster?.decorations.filter((item) => item.scope !== 'global-fixed') ?? [];
  const globalFixedDecorations = selectedMaster?.decorations.filter((item) => item.scope === 'global-fixed') ?? [];
  const previewPage = {
    id: 'master_preview',
    pageNumber: 1,
    masterId: selectedMaster.id,
    pageRole: 'body' as const,
    zones: selectedMaster.contentZones.map((zone) => ({ zoneId: zone.id, blocks: [] })),
  };

  const handleCreateMaster = useCallback(() => {
    createMaster(newMasterName.trim() || undefined, newMasterPreset);
    const createdMaster = usePublishingStore.getState().document.masters.items.at(-1);
    if (createdMaster) {
      setActiveMasterId(createdMaster.id);
    }
    setNewMasterName('');
    setNewMasterPreset('single-column');
    setShowCreateMasterModal(false);
    showToast('마스터를 만들었습니다.', 'success');
  }, [createMaster, newMasterName, newMasterPreset]);

  const handleUploadMasterFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedMaster) {
      return;
    }

    try {
      setUploadingMasterImage(true);
      setMasterUploadProgress(0);
      const uploaded = await uploadPublicationImage(publicationId, file, setMasterUploadProgress);
      addMasterImageDecoration(selectedMaster.id, uploaded);
      showToast('마스터 이미지를 추가했습니다.', 'success');
    } catch (error) {
      logError(error, 'MasterStudio-upload');
      showToast('마스터 이미지 업로드에 실패했습니다.', 'error');
    } finally {
      setUploadingMasterImage(false);
      event.target.value = '';
    }
  }, [addMasterImageDecoration, publicationId, selectedMaster]);

  const handleDeleteMaster = useCallback(() => {
    if (!selectedMaster || document.masters.items.length <= 1) {
      return;
    }

    const fallback = document.masters.items.find((item) => item.id !== selectedMaster.id);
    deleteMaster(selectedMaster.id);
    if (fallback) {
      setActiveMasterId(fallback.id);
    }
  }, [deleteMaster, document.masters.items, selectedMaster]);

  if (!selectedMaster) {
    return null;
  }

  const saveLabel = autosave.lastError
    ? autosave.lastError
    : autosave.isSaving
      ? '저장 중'
      : autosave.dirty
        ? '수정됨'
        : autosave.lastSavedAt
          ? '저장됨'
          : '편집 중';

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f3efe7] text-slate-900">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Master Studio</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{document.meta.title.ko}</h1>
            <p className="mt-1 text-sm text-slate-500">{saveLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = `/editor/${publicationId}`;
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              콘텐츠 편집
            </button>
            <button
              type="button"
              onClick={() => setShowCreateMasterModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              <PlusIcon className="h-4 w-4" />
              새 마스터
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1700px] gap-6 px-6 py-6 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <aside className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">마스터 카드</p>
                <p className="mt-1 text-xs text-slate-500">저장된 카드</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {document.masters.items.length}개
              </span>
            </div>
            <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <PhotoIcon className="h-4 w-4" />
              카드 이미지 추가
              <input type="file" accept="image/*" onChange={handleUploadMasterFile} className="hidden" />
            </label>
            <div className="space-y-3">
              {document.masters.items.map((master) => (
                <MiniMasterCard
                  key={master.id}
                  master={master}
                  isActive={master.id === selectedMaster.id}
                  pageWidth={pagePreset.widthPx}
                  pageHeight={pagePreset.heightPx}
                  isDefault={document.masters.defaultMasterId === master.id}
                  onClick={() => setActiveMasterId(master.id)}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[36px] border border-slate-200 bg-[#ece6da] p-6">
            <PublishingPagePreview
              page={previewPage}
              pageIndex={0}
              templateSelection={templateSelection}
              setTemplateSelection={setTemplateSelection}
              mode="interactive"
              globalFixedManagerMode={true}
              enableTemplateEditing={true}
              allowPageSelection={false}
              onTextBlockOpen={() => undefined}
              pageRef={() => undefined}
            />
          </div>
        </section>

        <aside className="space-y-4 [&_input]:bg-white [&_input]:text-slate-900 [&_select]:bg-white [&_select]:text-slate-900 [&_textarea]:bg-white [&_textarea]:text-slate-900">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-slate-900">문서 설정</p>
            <div className="space-y-3">
              <input
                value={document.meta.title.ko}
                onChange={(event) => updateDocumentMeta(event.target.value, document.meta.title.en || '')}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                  <span>번호 표시</span>
                  <input
                    type="checkbox"
                    checked={document.layout.pageNumbering.enabled}
                    onChange={(event) => updatePageNumbering({ enabled: event.target.checked })}
                    className="h-4 w-4"
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                  <span>표지 표시</span>
                  <input
                    type="checkbox"
                    checked={document.layout.pageNumbering.showOnCover}
                    onChange={(event) => updatePageNumbering({ showOnCover: event.target.checked })}
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  value={document.layout.pageNumbering.startAt}
                  onChange={(event) => updatePageNumbering({ startAt: Math.max(1, Number(event.target.value) || 1) })}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                />
                <select
                  value={document.layout.pageNumbering.alignmentPreset}
                  onChange={(event) => updatePageNumbering({ alignmentPreset: event.target.value as 'left' | 'center' | 'right' })}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                >
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </div>
              <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <span>안전영역 표시</span>
                <input
                  type="checkbox"
                  checked={document.layout.printGuides.showSafeArea}
                  onChange={(event) => updatePrintGuides({ showSafeArea: event.target.checked })}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">마스터 편집</p>
                <p className="mt-1 text-xs text-slate-500">선택 카드 수정</p>
              </div>
              <button
                type="button"
                onClick={() => toggleMasterLock(selectedMaster.id)}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {selectedMaster.locked ? '잠금 해제' : '잠금'}
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={selectedMaster.name}
                onChange={(event) => renameMaster(selectedMaster.id, event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    duplicateMaster(selectedMaster.id);
                    const created = usePublishingStore.getState().document.masters.items.at(-1);
                    if (created) setActiveMasterId(created.id);
                  }}
                  className="rounded-2xl border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700"
                >
                  다른 이름으로 저장
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultMaster(selectedMaster.id)}
                  className="rounded-2xl border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700"
                >
                  기본 지정
                </button>
              </div>
              <button
                type="button"
                onClick={handleDeleteMaster}
                disabled={document.masters.items.length <= 1 || document.masters.defaultMasterId === selectedMaster.id}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700 disabled:opacity-50"
              >
                삭제
              </button>
              <input
                type="color"
                value={selectedMaster.background.fill}
                onChange={(event) => updateMasterBackground(selectedMaster.id, event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 p-2"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">영역 설정</p>
              <span className="text-xs text-slate-500">{selectedMaster.contentZones.length}개</span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => addMasterTextZone(selectedMaster.id)}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700"
              >
                텍스트 영역 추가
              </button>
              <button
                type="button"
                onClick={() => addMasterImageZone(selectedMaster.id)}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700"
              >
                이미지 영역 추가
              </button>
            </div>
            <div className="space-y-3">
              {selectedMaster.contentZones.map((zone) => (
                <ZoneEditor
                  key={zone.id}
                  zone={zone}
                  pagePreset={pagePreset}
                  masterLocked={selectedMaster.locked}
                  canDelete={
                    selectedMaster.contentZones.length > 1
                    && !document.pages.some((page) =>
                      page.masterId === selectedMaster.id
                      && page.zones.some((pageZone) => pageZone.zoneId === zone.id && pageZone.blocks.length > 0),
                    )
                  }
                  onToggleLock={() => toggleMasterZoneLock(selectedMaster.id, zone.id)}
                  onUpdate={(updates) => updateMasterZoneFrame(selectedMaster.id, zone.id, updates)}
                  onStyleUpdate={(updates) => updateMasterZoneStyle(selectedMaster.id, zone.id, updates)}
                  onMetaUpdate={(updates) => updateMasterZoneMeta(selectedMaster.id, zone.id, updates)}
                  onDelete={() => removeMasterZone(selectedMaster.id, zone.id)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">마스터 요소</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addMasterTextDecoration(selectedMaster.id)}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  텍스트
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <PhotoIcon className="h-4 w-4" />
                  이미지
                  <input type="file" accept="image/*" onChange={handleUploadMasterFile} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => addMasterShapeDecoration(selectedMaster.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <Squares2X2Icon className="h-4 w-4" />
                  도형
                </button>
              </div>
            </div>
            {uploadingMasterImage ? (
              <p className="mb-3 text-xs text-slate-500">업로드 중... {Math.round(masterUploadProgress * 100)}%</p>
            ) : null}
            <div className="space-y-3">
              {templateDecorations.map((decoration) => (
                <div key={decoration.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{getDecorationTitle(decoration)}</p>
                      <p className="mt-1 text-xs text-slate-500">{decoration.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMasterDecorationLock(selectedMaster.id, decoration.id)}
                        className="rounded-full border border-slate-200 p-2 text-slate-700"
                      >
                        {decoration.locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
                      </button>
                      {!decoration.textBinding ? (
                        <button
                          type="button"
                          onClick={() => removeMasterDecoration(selectedMaster.id, decoration.id)}
                          className="rounded-full border border-rose-200 bg-white p-2 text-rose-700"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {decoration.type === 'text' && !decoration.textBinding ? (
                    <>
                      <input
                        value={decoration.text || ''}
                        onChange={(event) => updateMasterDecoration(selectedMaster.id, decoration.id, { text: event.target.value })}
                        className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">size</span>
                          <input
                            type="number"
                            value={decoration.style?.fontSize ?? 12}
                            onChange={(event) =>
                              updateMasterDecoration(selectedMaster.id, decoration.id, {
                                style: { ...(decoration.style ?? {}), fontSize: Number(event.target.value) || 12 },
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">weight</span>
                          <input
                            type="number"
                            value={decoration.style?.fontWeight ?? 500}
                            onChange={(event) =>
                              updateMasterDecoration(selectedMaster.id, decoration.id, {
                                style: { ...(decoration.style ?? {}), fontWeight: Number(event.target.value) || 500 },
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">align</span>
                          <select
                            value={decoration.style?.textAlign ?? 'left'}
                            onChange={(event) =>
                              updateMasterDecoration(selectedMaster.id, decoration.id, {
                                style: {
                                  ...(decoration.style ?? {}),
                                  textAlign: event.target.value as 'left' | 'center' | 'right' | 'justify',
                                },
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="left">왼쪽</option>
                            <option value="center">가운데</option>
                            <option value="right">오른쪽</option>
                            <option value="justify">양쪽</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">color</span>
                          <input
                            type="color"
                            value={decoration.style?.color ?? '#334155'}
                            onChange={(event) =>
                              updateMasterDecoration(selectedMaster.id, decoration.id, {
                                style: { ...(decoration.style ?? {}), color: event.target.value },
                              })
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 p-1"
                          />
                        </label>
                      </div>
                    </>
                  ) : null}
                  <FrameFields
                    frame={decoration}
                    disabled={selectedMaster.locked || decoration.locked}
                    onChange={(updates) => updateMasterDecoration(selectedMaster.id, decoration.id, updates)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">전역 고정 요소</p>
              <span className="text-xs text-slate-500">{globalFixedDecorations.length}개</span>
            </div>
            <div className="space-y-3">
              {globalFixedDecorations.map((decoration) => (
                <div key={decoration.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{getDecorationTitle(decoration)}</p>
                  <p className="mt-1 text-xs text-slate-500">{decoration.id}</p>
                  <div className="mt-3">
                    <FrameFields
                      frame={decoration}
                      onChange={(updates) => updateGlobalMasterDecoration(selectedMaster.id, decoration.id, updates)}
                    />
                  </div>
                  {decoration.type !== 'shape' ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">size</span>
                        <input
                          type="number"
                          value={decoration.style?.fontSize ?? 12}
                          onChange={(event) =>
                            updateGlobalMasterDecoration(selectedMaster.id, decoration.id, {
                              style: { fontSize: Number(event.target.value) || 12 },
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">color</span>
                        <input
                          type="color"
                          value={decoration.style?.color ?? '#475569'}
                          onChange={(event) =>
                            updateGlobalMasterDecoration(selectedMaster.id, decoration.id, {
                              style: { color: event.target.value },
                            })
                          }
                          className="h-10 w-full rounded-xl border border-slate-200 p-1"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {showCreateMasterModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Master Studio</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">새 마스터</h2>
                <p className="mt-2 text-sm text-slate-500">카드용 마스터 생성</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateMasterModal(false)}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                닫기
              </button>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">이름</span>
              <input
                value={newMasterName}
                onChange={(event) => setNewMasterName(event.target.value)}
                placeholder="예: 심포지엄 상세"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
              />
            </label>

            <div className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">프리셋</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(TEMPLATE_PRESET_LABELS) as TemplatePresetKey[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewMasterPreset(preset)}
                    className={`rounded-[24px] border px-4 py-4 text-left transition ${
                      newMasterPreset === preset
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <p className="text-sm font-semibold">{TEMPLATE_PRESET_LABELS[preset]}</p>
                    <p className={`mt-2 text-xs ${newMasterPreset === preset ? 'text-slate-200' : 'text-slate-500'}`}>
                      {TEMPLATE_PRESET_DESCRIPTIONS[preset]}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateMasterModal(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreateMaster}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MasterStudioShell;
