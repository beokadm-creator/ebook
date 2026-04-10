import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  LockClosedIcon,
  LockOpenIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { getRenderableImageUrl, uploadMasterImage, uploadPublicationImage } from '@/lib/publishing/assets';
import { formatMm, getPxPerMm, pxToMm } from '@/lib/publishing/a4';
import { getChainRootPageId, inferZoneSlotKey } from '@/lib/publishing/contributionLayout';
import { getThreadPlainText } from '@/lib/publishing/defaultDocument';
import { parseDocxManuscriptWithAI } from '@/lib/publishing/docxImport';
import { glmClient } from '@/lib/ai/glmClient';
import { downloadPagesAsPdf } from '@/lib/publishing/pdf';
import { TEMPLATE_PRESET_DESCRIPTIONS, TEMPLATE_PRESET_LABELS, TemplatePresetKey } from '@/lib/publishing/templatePresets';
import { renderRunsToReact } from '@/lib/publishing/richText';
import { showToast } from '@/components/common/Toast';
import { usePublishingStore } from '@/stores/publishingStore';
import { ElementScope, MasterTemplate, PageBlock, PublicationPage, PublishingDocument, TextRole, ZoneKind } from '@/types/publishing';
import { logError } from '@/utils/errorHandler';
import FlowGroupContainer from './FlowGroupContainer';
import SpeakerContributionPanel from './SpeakerContributionPanel';

interface PublishingEditorShellProps {
  publicationId: string;
}

interface TemplateSelection {
  type: 'decoration' | 'zone' | null;
  id: string | null;
}

type RenderMode = 'interactive' | 'export';

interface ValidationReport {
  pageSizeDeltaPx: {
    width: number;
    height: number;
  };
  markerDeltaPx: Record<string, { x: number; y: number }>;
}

interface ActiveSnapGuides {
  vertical: number[];
  horizontal: number[];
}

interface PreflightIssue {
  id: string;
  severity: 'warning' | 'error';
  message: string;
  pageId?: string;
  blockId?: string;
}

const roleLabel: Record<TextRole, string> = {
  title: '표지 제목',
  subtitle: '부제',
  heading: '섹션 제목',
  subheading: '서브 섹션',
  paragraph: '본문',
  caption: '캡션',
  quote: '인용문',
};

const TextBlockView: React.FC<{
  block: Extract<PageBlock, { type: 'text' }>;
  zoneStyle: MasterTemplate['contentZones'][number]['style'];
}> = ({ block, zoneStyle }) => (
  <div
    style={{
      display: 'block',
      width: '100%',
      maxWidth: '100%',
      fontFamily: zoneStyle.fontFamily ?? 'NanumSquare',
      fontSize: block.styleOverride?.fontSize ?? zoneStyle.fontSize,
      fontWeight: block.styleOverride?.fontWeight ?? zoneStyle.fontWeight,
      lineHeight: block.styleOverride?.lineHeight ?? zoneStyle.lineHeight,
      letterSpacing: block.styleOverride?.letterSpacing ?? zoneStyle.letterSpacing,
      color: block.styleOverride?.color ?? zoneStyle.color,
      textAlign: block.styleOverride?.textAlign ?? zoneStyle.textAlign,
      textAlignLast: (block.styleOverride?.textAlign ?? zoneStyle.textAlign) === 'justify' ? 'left' : undefined,
      textJustify: (block.styleOverride?.textAlign ?? zoneStyle.textAlign) === 'justify' ? 'inter-character' : undefined,
      textRendering: 'optimizeLegibility',
      fontKerning: 'normal',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      hyphens: 'auto',
    }}
  >
    {renderRunsToReact(block.content.runs)}
  </div>
);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getSlotIdentity = (zone: MasterTemplate['contentZones'][number]) => inferZoneSlotKey(zone) || zone.flowGroupId || zone.id;

const getDefaultRoleForZone = (zone?: MasterTemplate['contentZones'][number]): TextRole => {
  const slot = `${inferZoneSlotKey(zone) ?? ''} ${zone?.name ?? ''}`.toLowerCase();
  if (slot.includes('section_title')) return 'heading';
  if (slot.includes('title')) return 'title';
  if (slot.includes('subtitle')) return 'subtitle';
  if (slot.includes('caption')) return 'caption';
  return 'paragraph';
};

const getMaxValidationDeltaPx = (report: ValidationReport | null) => {
  if (!report) {
    return 0;
  }

  const markerDeltas = Object.values(report.markerDeltaPx).flatMap((delta) => [Math.abs(delta.x), Math.abs(delta.y)]);
  return Math.max(
    Math.abs(report.pageSizeDeltaPx.width),
    Math.abs(report.pageSizeDeltaPx.height),
    ...markerDeltas,
    0,
  );
};

const getDecorationCategoryLabel = (decoration: MasterTemplate['decorations'][number]) => {
  if (decoration.textBinding === 'page.number') {
    return '페이지 번호';
  }
  if (decoration.textBinding === 'section.number') {
    return '섹션 번호';
  }
  if (decoration.textBinding === 'presentation.code') {
    return '발표 번호';
  }
  if (decoration.textBinding === 'document.title') {
    return '헤더';
  }
  if (decoration.type === 'image') {
    return '로고/이미지';
  }
  if (decoration.y >= 1000) {
    return '푸터';
  }
  if (decoration.y <= 120) {
    return '헤더';
  }
  return decoration.type === 'shape' ? '라인/도형' : '기타 텍스트';
};

const getDecorationImageSrc = (decoration: MasterTemplate['decorations'][number], assets: PublishingDocument['assets']) =>
  getRenderableImageUrl(decoration.src || assets.find((asset) => asset.id === decoration.assetId)?.src || '');

const SNAP_THRESHOLD_PX = 8;

const bindPointerDrag = (
  event: React.PointerEvent<HTMLElement>,
  onMove: (deltaX: number, deltaY: number) => void,
  onEnd?: () => void,
) => {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;

  const handleMove = (pointerEvent: PointerEvent) => {
    onMove(pointerEvent.clientX - startX, pointerEvent.clientY - startY);
  };

  const stopMove = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', stopMove);
    onEnd?.();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', stopMove);
};

const ImageBlockView: React.FC<{
  block: Extract<PageBlock, { type: 'image' }>;
  selected: boolean;
  onSelect: () => void;
  onMove: (deltaX: number, deltaY: number) => void;
  onResize: (deltaX: number, deltaY: number) => void;
}> = ({ block, selected, onSelect, onMove, onResize }) => {
  const startDrag = (event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => {
    if (block.locked) {
      onSelect();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect();

    const startX = event.clientX;
    const startY = event.clientY;

    const handleMove = (pointerEvent: PointerEvent) => {
      const deltaX = pointerEvent.clientX - startX;
      const deltaY = pointerEvent.clientY - startY;
      if (mode === 'move') {
        onMove(deltaX, deltaY);
      } else {
        onResize(deltaX, deltaY);
      }
    };

    const stopMove = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopMove);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopMove);
  };

  return (
    <div
      className={`absolute overflow-hidden rounded-md border bg-gray-50 shadow-sm ${
        selected ? 'editor-selection-ring border-amber-400' : 'border-gray-200'
      }`}
      style={{
        left: block.placement.x,
        top: block.placement.y,
        width: block.placement.width,
        height: block.placement.height,
        zIndex: block.placement.zIndex,
        transform: `rotate(${block.placement.rotation}deg)`,
      }}
      onPointerDown={(event) => startDrag(event, 'move')}
    >
      <img
        src={getRenderableImageUrl(block.assetRef.src)}
        alt={block.alt?.ko || ''}
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        className="absolute max-w-none"
        draggable={false}
        style={{
          width: `${100 / block.crop.width}%`,
          height: `${100 / block.crop.height}%`,
          left: `${-block.crop.originX * (100 / block.crop.width)}%`,
          top: `${-block.crop.originY * (100 / block.crop.height)}%`,
        }}
      />
      {block.caption ? (
        <figcaption className="absolute bottom-0 left-0 right-0 bg-white/90 px-2 py-1 text-xs text-gray-700">
          {block.caption.ko}
        </figcaption>
      ) : null}
      {selected && !block.locked ? (
        <div
          data-html2canvas-ignore="true"
          className="editor-handle absolute bottom-[-10px] right-[-10px] h-5 w-5 rounded-full border-2 border-white bg-slate-900 shadow"
          onPointerDown={(event) => startDrag(event, 'resize')}
        />
      ) : null}
    </div>
  );
};

export const PublishingPagePreview: React.FC<{
  page: PublicationPage;
  pageIndex: number;
  pageRef: (node: HTMLDivElement | null) => void;
  templateSelection: TemplateSelection;
  setTemplateSelection: React.Dispatch<React.SetStateAction<TemplateSelection>>;
  mode: RenderMode;
  globalFixedManagerMode: boolean;
  onTextBlockOpen: (threadId: string) => void;
  onZoneActivate?: (zoneId: string, kind: ZoneKind) => void;
  enableTemplateEditing?: boolean;
  allowPageSelection?: boolean;
}> = ({ page, pageIndex, pageRef, templateSelection, setTemplateSelection, mode, globalFixedManagerMode, onTextBlockOpen, onZoneActivate, enableTemplateEditing = true, allowPageSelection = true }) => {
  const {
    document,
    selectPage,
    selectBlock,
    selection,
    updateImageBlock,
    updateMasterDecoration,
    updateGlobalMasterDecoration,
    updateMasterZoneFrame,
  } = usePublishingStore();
  const master = document.masters.items.find((item) => item.id === page.masterId);
  const pageSize = document.layout.pagePreset;
  const pageNumbering = document.layout.pageNumbering;
  const printGuides = document.layout.printGuides;
  const [activeSnapGuides, setActiveSnapGuides] = useState<ActiveSnapGuides>({ vertical: [], horizontal: [] });
  const imageRenderProps = mode === 'export'
    ? ({ crossOrigin: 'anonymous' as const, referrerPolicy: 'no-referrer' as const })
    : {};

  if (!master) {
    return null;
  }

  const displayPageNumber = (() => {
    if (!pageNumbering.enabled) {
      return '';
    }

    if (page.pageRole === 'cover' && !pageNumbering.showOnCover) {
      return '';
    }

    const printablePages = document.pages.filter((item) => pageNumbering.showOnCover || item.pageRole !== 'cover');
    const displayIndex = printablePages.findIndex((item) => item.id === page.id);
    if (displayIndex < 0) {
      return '';
    }

    return String(pageNumbering.startAt + displayIndex);
  })();

  const displaySectionNumber = (() => {
    const topLevelTocItems = document.toc.items.filter((item) => item.level === 1);
    if (!topLevelTocItems.length) {
      return '';
    }

    const currentTocItem =
      topLevelTocItems.find((item) => item.source.pageId === page.id)
      ?? [...topLevelTocItems]
        .reverse()
        .find((item) => {
          const targetPage = document.pages.find((candidate) => candidate.id === item.source.pageId);
          return targetPage ? targetPage.pageNumber <= page.pageNumber : false;
        });

    if (!currentTocItem) {
      return '';
    }

    const index = topLevelTocItems.findIndex((item) => item.id === currentTocItem.id);
    return String(index + 1).padStart(2, '0');
  })();
  const displayPresentationCode = (() => {
    const rootPageId = getChainRootPageId(document, page.id);
    return document.contributions.find((item) => item.pageId === rootPageId)?.presentationCode ?? '';
  })();

  const getPageNumberLayout = (decoration: MasterTemplate['decorations'][number]) => {
    const left =
      decoration.x;

    return {
      left,
      textAlign: decoration.style?.textAlign ?? 'center',
    } as const;
  };

  const updateDecorationPosition = (decorationId: string, updates: { x?: number; y?: number; width?: number; height?: number }) => {
    if (master.decorations.find((item) => item.id === decorationId)?.scope === 'global-fixed') {
      updateGlobalMasterDecoration(master.id, decorationId, updates);
      return;
    }
    updateMasterDecoration(master.id, decorationId, updates);
  };

  const canEditDecoration = (scope: ElementScope, locked: boolean) =>
    enableTemplateEditing && mode === 'interactive' && !locked && (scope !== 'global-fixed' || globalFixedManagerMode);

  const snapHorizontal = (x: number, width: number) => {
    const candidates = [
      pageSize.safeMarginPx.left,
      pageSize.widthPx - pageSize.safeMarginPx.right - width,
      pageSize.widthPx / 2 - width / 2,
    ];

    return candidates.reduce((best, candidate) => (
      Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best
    ), x);
  };

  const snapVertical = (y: number, height: number) => {
    const candidates = [
      pageSize.safeMarginPx.top,
      pageSize.heightPx - pageSize.safeMarginPx.bottom - height,
    ];

    const nearest = candidates.reduce((best, candidate) => (
      Math.abs(candidate - y) < Math.abs(best - y) ? candidate : best
    ), y);

    return Math.abs(nearest - y) <= SNAP_THRESHOLD_PX ? nearest : y;
  };

  const snapDecorationPosition = (x: number, y: number, width: number, height: number) => {
    const snappedX = snapHorizontal(x, width);
    const snappedY = snapVertical(y, height);
    const vertical: number[] = [];
    const horizontal: number[] = [];
    if (Math.abs(snappedX - x) <= SNAP_THRESHOLD_PX) {
      vertical.push(snappedX + width / 2);
    }
    if (Math.abs(snappedY - y) <= SNAP_THRESHOLD_PX) {
      horizontal.push(snappedY);
    }
    setActiveSnapGuides({ vertical, horizontal });
    return {
      x: Math.abs(snappedX - x) <= SNAP_THRESHOLD_PX ? snappedX : x,
      y: snappedY,
    };
  };

  const snapZoneFrame = (x: number, y: number, width: number, height: number) => {
    const horizontalCandidates = [
      pageSize.safeMarginPx.left,
      pageSize.widthPx - pageSize.safeMarginPx.right - width,
      pageSize.widthPx / 2 - width / 2,
    ];
    const verticalCandidates = [
      pageSize.safeMarginPx.top,
      pageSize.heightPx - pageSize.safeMarginPx.bottom - height,
    ];

    const nearestX = horizontalCandidates.reduce((best, candidate) => (
      Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best
    ), x);
    const nearestY = verticalCandidates.reduce((best, candidate) => (
      Math.abs(candidate - y) < Math.abs(best - y) ? candidate : best
    ), y);

    const vertical: number[] = [];
    const horizontal: number[] = [];
    if (Math.abs(nearestX - x) <= SNAP_THRESHOLD_PX) {
      vertical.push(nearestX, nearestX + width);
    }
    if (Math.abs(nearestY - y) <= SNAP_THRESHOLD_PX) {
      horizontal.push(nearestY, nearestY + height);
    }
    setActiveSnapGuides({ vertical, horizontal });

    return {
      x: Math.abs(nearestX - x) <= SNAP_THRESHOLD_PX ? nearestX : x,
      y: Math.abs(nearestY - y) <= SNAP_THRESHOLD_PX ? nearestY : y,
    };
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
        Page {pageIndex + 1}
      </div>
      <div
        ref={pageRef}
        className={`pdf-page relative overflow-hidden bg-white ${mode === 'interactive' ? 'rounded-[24px] border border-gray-300 shadow-[0_30px_90px_rgba(15,23,42,0.12)]' : ''}`}
        style={{ width: pageSize.widthPx, height: pageSize.heightPx }}
        onClick={() => {
          if (mode === 'interactive' && allowPageSelection) {
            selectPage(page.id);
          }
        }}
      >
        <div className="absolute inset-0" style={{ background: master.background.fill }} />
        {printGuides.showValidationMarks ? (
          <>
            <div data-validation-marker="top-left" className="absolute left-0 top-0 h-3 w-3 border-r border-b border-black" />
            <div data-validation-marker="top-center" className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-black" />
            <div data-validation-marker="top-right" className="absolute right-0 top-0 h-3 w-3 border-l border-b border-black" />
            <div data-validation-marker="bottom-left" className="absolute bottom-0 left-0 h-3 w-3 border-r border-t border-black" />
            <div data-validation-marker="bottom-center" className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-black" />
            <div data-validation-marker="bottom-right" className="absolute bottom-0 right-0 h-3 w-3 border-l border-t border-black" />
          </>
        ) : null}
        {mode === 'interactive' && printGuides.showSafeArea ? (
          <div
            data-html2canvas-ignore="true"
            className="pointer-events-none absolute border border-emerald-400/70"
            style={{
              left: pageSize.safeMarginPx.left,
              top: pageSize.safeMarginPx.top,
              width: pageSize.widthPx - pageSize.safeMarginPx.left - pageSize.safeMarginPx.right,
              height: pageSize.heightPx - pageSize.safeMarginPx.top - pageSize.safeMarginPx.bottom,
            }}
          />
        ) : null}
        {mode === 'interactive' && printGuides.showCenterLine ? (
          <div
            data-html2canvas-ignore="true"
            className="pointer-events-none absolute top-0 w-px bg-rose-400/70"
            style={{ left: pageSize.widthPx / 2, height: pageSize.heightPx }}
          />
        ) : null}
        {mode === 'interactive'
          ? activeSnapGuides.vertical.map((guide, index) => (
              <div
                key={`snap-v-${index}-${guide}`}
                data-html2canvas-ignore="true"
                className="pointer-events-none absolute top-0 w-px bg-sky-500/80"
                style={{ left: guide, height: pageSize.heightPx }}
              />
            ))
          : null}
        {mode === 'interactive'
          ? activeSnapGuides.horizontal.map((guide, index) => (
              <div
                key={`snap-h-${index}-${guide}`}
                data-html2canvas-ignore="true"
                className="pointer-events-none absolute left-0 h-px bg-sky-500/80"
                style={{ top: guide, width: pageSize.widthPx }}
              />
            ))
          : null}
{(() => {
          // flowGroupId별로 zone들을 그룹핑
          const flowGroups = new Map<string, typeof master.contentZones>();
          const standaloneZones: typeof master.contentZones = [];

          master.contentZones.forEach((zoneTemplate) => {
            if (!zoneTemplate?.frame) {
              return;
            }

            if (zoneTemplate.flowGroupId) {
              const existing = flowGroups.get(zoneTemplate.flowGroupId) || [];
              existing.push(zoneTemplate);
              flowGroups.set(zoneTemplate.flowGroupId, existing);
            } else {
              standaloneZones.push(zoneTemplate);
            }
          });

          const renderedElements: React.ReactElement[] = [];

          // FlowGroupContainer로 flowGroup 렌더링
          flowGroups.forEach((zonesInGroup, flowGroupId) => {
            if (!zonesInGroup.length) {
              return;
            }

            renderedElements.push(
              <FlowGroupContainer
                key={`flowgroup-${flowGroupId}`}
                zonesInGroup={zonesInGroup}
                page={page}
                document={document}
                showContentBounds={mode === 'interactive' && printGuides.showContentBounds}
              />
            );
          });

          // standalone zone들은 기존 방식으로 렌더링
          standaloneZones.forEach((zoneTemplate) => {
            const zoneInstance = page.zones.find((item) => item.zoneId === zoneTemplate.id) ?? { zoneId: zoneTemplate.id, blocks: [] };

            renderedElements.push(
              <div
                key={zoneInstance.zoneId}
                className={`absolute ${mode === 'interactive' && printGuides.showContentBounds ? 'editor-guide border border-dashed border-slate-200' : ''}`}
                style={{
                  left: zoneTemplate.frame.x,
                  top: zoneTemplate.frame.y,
                  width: zoneTemplate.frame.width,
                  height: zoneTemplate.frame.height,
                  overflow: 'hidden',
                  paddingTop: zoneTemplate.constraints.padding.top,
                  paddingRight: zoneTemplate.constraints.padding.right,
                  paddingBottom: zoneTemplate.constraints.padding.bottom,
                  paddingLeft: zoneTemplate.constraints.padding.left,
                }}
                onClick={() => {
                  if (mode === 'interactive' && !enableTemplateEditing) {
                    onZoneActivate?.(zoneInstance.zoneId, zoneTemplate.kind);
                  }
                }}
              >
                {mode === 'interactive' && enableTemplateEditing ? <div
                  data-html2canvas-ignore="true"
                  className={`absolute left-2 top-2 z-20 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/85 ${templateSelection.type === 'zone' && templateSelection.id === zoneTemplate.id ? 'bg-sky-600' : 'bg-slate-900'}`}
                  onPointerDown={(event) => {
                    if (master.locked || zoneTemplate.scope === 'global-fixed' || zoneTemplate.locked) {
                      return;
                    }
                    setTemplateSelection({ type: 'zone', id: zoneTemplate.id });
                    bindPointerDrag(
                      event,
                      (deltaX, deltaY) => {
                        const nextX = clamp(zoneTemplate.frame.x + deltaX, 0, pageSize.widthPx - 40);
                        const nextY = clamp(zoneTemplate.frame.y + deltaY, 0, pageSize.heightPx - 40);
                        const snapped = snapZoneFrame(nextX, nextY, zoneTemplate.frame.width, zoneTemplate.frame.height);
                        updateMasterZoneFrame(master.id, zoneTemplate.id, snapped);
                      },
                      () => setActiveSnapGuides({ vertical: [], horizontal: [] }),
                    );
                  }}
                >
                  {zoneTemplate.name}
                  {zoneTemplate.flowOrder ? ` · Flow ${zoneTemplate.flowOrder}` : ''}
                </div> : null}
                {mode === 'interactive' && enableTemplateEditing && !master.locked && zoneTemplate.scope !== 'global-fixed' && !zoneTemplate.locked ? <div
                  data-html2canvas-ignore="true"
                  className={`editor-handle absolute bottom-[-10px] right-[-10px] h-5 w-5 rounded-full border-2 border-white shadow ${templateSelection.type === 'zone' && templateSelection.id === zoneTemplate.id ? 'bg-sky-600' : 'bg-slate-900'}`}
                  onPointerDown={(event) => {
                    setTemplateSelection({ type: 'zone', id: zoneTemplate.id });
                    bindPointerDrag(event, (deltaX, deltaY) =>
                      updateMasterZoneFrame(master.id, zoneTemplate.id, {
                        width: clamp(zoneTemplate.frame.width + deltaX, 80, pageSize.widthPx - zoneTemplate.frame.x),
                        height: clamp(zoneTemplate.frame.height + deltaY, 80, pageSize.heightPx - zoneTemplate.frame.y),
                      }),
                      );
                  }}
                /> : null}
                {zoneInstance.blocks.map((block) => {
                  const isSelected = selection.blockId === block.id;

                  if (block.type === 'image') {
                    return (
                      <ImageBlockView
                        key={block.id}
                        block={block}
                        selected={isSelected}
                        onSelect={() => {
                          selectBlock(page.id, zoneInstance.zoneId, block.id);
                        }}
                        onMove={(deltaX, deltaY) =>
                          updateImageBlock(page.id, zoneInstance.zoneId, block.id, {
                            placement: {
                              ...block.placement,
                              x: clamp(block.placement.x + deltaX, 0, zoneTemplate.frame.width - 40),
                              y: clamp(block.placement.y + deltaY, 0, zoneTemplate.frame.height - 40),
                            },
                          })
                        }
                        onResize={(deltaX, deltaY) =>
                          updateImageBlock(page.id, zoneInstance.zoneId, block.id, {
                            placement: {
                              ...block.placement,
                              width: clamp(block.placement.width + deltaX, 80, zoneTemplate.frame.width - block.placement.x),
                              height: clamp(block.placement.height + deltaY, 80, zoneTemplate.frame.height - block.placement.y),
                            },
                          })
                        }
                      />
                    );
                  }

                  return (
                    <div
                      key={block.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectBlock(page.id, zoneInstance.zoneId, block.id);
                        onTextBlockOpen(block.flow.sourceThreadId);
                      }}
                      className={`cursor-text rounded-md transition ${isSelected ? 'editor-selection-ring ring-2 ring-amber-400 ring-offset-2' : ''}`}
                      style={{
                        maxWidth: '100%',
                        overflow: 'hidden',
                      }}
                    >
                      <TextBlockView block={block} zoneStyle={zoneTemplate.style} />
                    </div>
                  );
                })}
              </div>
            );
          });

          return renderedElements;
        })()}

        {master.decorations.map((decoration) => (
          decoration.type === 'image' ? (
            <div
              key={decoration.id}
              className={`absolute z-40 ${mode === 'interactive' && templateSelection.type === 'decoration' && templateSelection.id === decoration.id ? 'editor-selection-ring ring-2 ring-sky-400 ring-offset-2' : ''} ${decoration.scope === 'global-fixed' ? (globalFixedManagerMode ? 'cursor-move' : 'cursor-default') : 'cursor-move'}`}
              style={{
                left: decoration.x,
                top: decoration.y,
                width: decoration.width,
                height: decoration.height,
              }}
              onPointerDown={(event) => {
                if (!canEditDecoration(decoration.scope, decoration.locked)) {
                  return;
                }
                setTemplateSelection({ type: 'decoration', id: decoration.id });
                bindPointerDrag(
                  event,
                  (deltaX, deltaY) => {
                    const nextX = clamp(decoration.x + deltaX, 0, pageSize.widthPx - 20);
                    const nextY = clamp(decoration.y + deltaY, 0, pageSize.heightPx - 20);
                    const snapped = snapDecorationPosition(nextX, nextY, decoration.width, decoration.height);
                    updateDecorationPosition(decoration.id, snapped);
                  },
                  () => setActiveSnapGuides({ vertical: [], horizontal: [] }),
                );
              }}
            >
              {getDecorationImageSrc(decoration, document.assets) ? (
                <img
                  src={getDecorationImageSrc(decoration, document.assets)}
                  alt=""
                  {...imageRenderProps}
                  className="h-full w-full object-contain"
                  style={{ display: 'block' }}
                />
              ) : null}
              {!getDecorationImageSrc(decoration, document.assets) ? (
                <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-300 bg-slate-100 text-[11px] text-slate-500">
                  이미지 없음
                </div>
              ) : null}
              {canEditDecoration(decoration.scope, decoration.locked) && templateSelection.type === 'decoration' && templateSelection.id === decoration.id ? (
                <div
                  data-html2canvas-ignore="true"
                  className="editor-handle absolute bottom-[-10px] right-[-10px] h-5 w-5 rounded-full border-2 border-white bg-slate-900 shadow"
                  onPointerDown={(event) => {
                    setTemplateSelection({ type: 'decoration', id: decoration.id });
                    bindPointerDrag(event, (deltaX, deltaY) =>
                      updateDecorationPosition(decoration.id, {
                        width: clamp(decoration.width + deltaX, 20, pageSize.widthPx - decoration.x),
                        height: clamp(decoration.height + deltaY, 20, pageSize.heightPx - decoration.y),
                      }),
                    );
                  }}
                />
              ) : null}
            </div>
          ) : (
            (() => {
              const pageNumberLayout = decoration.textBinding === 'page.number' ? getPageNumberLayout(decoration) : null;
              return (
                <div
                  key={decoration.id}
                  className={`absolute z-40 ${mode === 'interactive' && templateSelection.type === 'decoration' && templateSelection.id === decoration.id ? 'editor-selection-ring ring-2 ring-sky-400 ring-offset-2' : ''} ${decoration.scope === 'global-fixed' ? (globalFixedManagerMode ? 'cursor-move' : 'cursor-default') : 'cursor-move'}`}
                  style={{
                    left: pageNumberLayout?.left ?? decoration.x,
                    top: decoration.y,
                    width: decoration.width,
                    height: decoration.height,
                    background: decoration.type === 'shape' ? decoration.fill ?? '#cbd5e1' : 'transparent',
                    borderTop: decoration.type === 'shape' && decoration.shape === 'line' ? `2px solid ${decoration.fill ?? '#cbd5e1'}` : undefined,
                    borderRadius: decoration.type === 'shape' && decoration.shape === 'ellipse' ? 9999 : undefined,
                    color: decoration.style?.color ?? '#666666',
                    fontSize: decoration.style?.fontSize ?? 12,
                    fontWeight: decoration.style?.fontWeight ?? 400,
                    lineHeight: decoration.style?.lineHeight ?? 1.4,
                    letterSpacing: decoration.style?.letterSpacing ?? 0,
                    textAlign: pageNumberLayout?.textAlign ?? decoration.style?.textAlign ?? 'center',
                    fontFamily: decoration.style?.fontFamily ?? 'NanumSquare',
                  }}
                  onPointerDown={(event) => {
                    if (!canEditDecoration(decoration.scope, decoration.locked)) {
                      return;
                    }
                    setTemplateSelection({ type: 'decoration', id: decoration.id });
                    bindPointerDrag(
                      event,
                      (deltaX, deltaY) => {
                        const nextX = clamp(decoration.x + deltaX, 0, pageSize.widthPx - 20);
                        const nextY = clamp(decoration.y + deltaY, 0, pageSize.heightPx - 20);
                        const snapped = snapDecorationPosition(nextX, nextY, decoration.width, decoration.height);
                        updateDecorationPosition(decoration.id, snapped);
                      },
                      () => setActiveSnapGuides({ vertical: [], horizontal: [] }),
                    );
                  }}
                >
                  {decoration.textBinding === 'page.number'
                    ? displayPageNumber
                    : decoration.textBinding === 'document.title'
                      ? document.meta.title.ko
                      : decoration.textBinding === 'section.number'
                        ? displaySectionNumber
                        : decoration.textBinding === 'presentation.code'
                          ? displayPresentationCode
                          : decoration.text}
                  {canEditDecoration(decoration.scope, decoration.locked) && templateSelection.type === 'decoration' && templateSelection.id === decoration.id ? (
                    <div
                      data-html2canvas-ignore="true"
                      className="editor-handle absolute bottom-[-10px] right-[-10px] h-5 w-5 rounded-full border-2 border-white bg-slate-900 shadow"
                      onPointerDown={(event) => {
                        setTemplateSelection({ type: 'decoration', id: decoration.id });
                        bindPointerDrag(event, (deltaX, deltaY) =>
                          updateDecorationPosition(decoration.id, {
                            width: clamp(decoration.width + deltaX, 20, pageSize.widthPx - decoration.x),
                            height: clamp(decoration.height + deltaY, 20, pageSize.heightPx - decoration.y),
                          }),
                        );
                      }}
                    />
                  ) : null}
                </div>
              );
            })()
          )
        ))}
      </div>
    </div>
  );
};

const PublishingEditorShell: React.FC<PublishingEditorShellProps> = ({ publicationId }) => {
  const {
    document,
    selection,
    history,
    autosave,
    selectPage,
    addPage,
    deletePage,
    createMaster,
    duplicateMaster,
    deleteMaster,
    setDefaultMaster,
    renameMaster,
    updatePageMaster,
    updateDocumentMeta,
    addPresentationTrack,
    updatePresentationTrack,
    deletePresentationTrack,
    updatePageNumbering,
    updatePrintGuides,
    updateMasterBackground,
    toggleMasterLock,
    updateMasterDecoration,
    updateGlobalMasterDecoration,
    addMasterTextDecoration,
    addMasterImageDecoration,
    removeMasterDecoration,
    toggleMasterDecorationLock,
    toggleMasterZoneLock,
    updateThreadText,
    toggleThreadToc,
    deleteThread,
    addThreadWithText,
    addContribution,
    createSpeakerContribution,
    updateContributionSlotText,
    updateContributionPresentationTrack,
    updateContributionStatus,
    moveContribution,
    deleteContribution,
    addImageBlock,
    updateImageBlock,
    toggleBlockLock,
    undo,
    redo,
  } = usePublishingStore();
  const selectBlockInStore = usePublishingStore((state) => state.selectBlock);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingMasterImage, setUploadingMasterImage] = useState(false);
  const [masterUploadProgress, setMasterUploadProgress] = useState(0);
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection>({ type: null, id: null });
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [globalFixedManagerMode, setGlobalFixedManagerMode] = useState(false);
  const [showPreflightModal, setShowPreflightModal] = useState(false);
  const [newMasterName, setNewMasterName] = useState('');
  const [newMasterPreset, setNewMasterPreset] = useState<TemplatePresetKey>('single-column');
  const [showCreateMasterModal, setShowCreateMasterModal] = useState(false);
  const [activeMasterId, setActiveMasterId] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textModalThreadId, setTextModalThreadId] = useState<string | null>(null);
  const [textModalZoneId, setTextModalZoneId] = useState<string | null>(null);
  const [textModalValue, setTextModalValue] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalZoneId, setImageModalZoneId] = useState<string | null>(null);
  const [activeContentZoneId, setActiveContentZoneId] = useState<string | null>(null);
  const [pageJumpInput, setPageJumpInput] = useState('');
  const [importingDocx, setImportingDocx] = useState(false);
  const [useAIParsing, setUseAIParsing] = useState(true);
  const [testingAI, setTestingAI] = useState(false);
  const [editingContributionSlot, setEditingContributionSlot] = useState<string | null>(null);
  const [editingContributionValue, setEditingContributionValue] = useState('');
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pdfPageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const measurementRootRef = useRef<HTMLDivElement | null>(null);



  const selectedPage = document.pages.find((item) => item.id === selection.pageId) ?? document.pages[1] ?? document.pages[0];
  const pageMaster = document.masters.items.find((item) => item.id === selectedPage?.masterId) ?? document.masters.items[0];
  const selectedMaster = document.masters.items.find((item) => item.id === activeMasterId) ?? pageMaster ?? document.masters.items[0];
  const selectedContribution = useMemo(() => {
    const rootPageId = selectedPage ? getChainRootPageId(document, selectedPage.id) : null;
    return document.contributions.find((item) => item.pageId === rootPageId) ?? null;
  }, [document, selectedPage]);
  const isSpeakerThreadPage = pageMaster?.mode === 'speaker-thread';
  const currentSpeakerMasterUsesPresentationTracks = Boolean(isSpeakerThreadPage && pageMaster?.usesPresentationTracks);
  const selectedContributionPages = useMemo(() => {
    if (!selectedContribution) {
      return selectedPage ? [selectedPage] : [];
    }

    return document.pages.filter((page) => getChainRootPageId(document, page.id) === selectedContribution.pageId);
  }, [document, selectedContribution, selectedPage]);
  const presentationTrackById = useMemo(
    () => new Map((document.meta.presentationTracks ?? []).map((track) => [track.id, track])),
    [document.meta.presentationTracks],
  );
  const selectedContributionTrackLabel = useMemo(() => {
    if (!selectedContribution) {
      return '-';
    }

    const matchedTrack = selectedContribution.presentationTrackId
      ? presentationTrackById.get(selectedContribution.presentationTrackId)
      : undefined;

    if (matchedTrack) {
      return `${matchedTrack.prefix}. ${matchedTrack.label}`;
    }

    return selectedContribution.track || selectedContribution.sourceFileName || '-';
  }, [presentationTrackById, selectedContribution]);
  const pageNumberByContribution = useMemo(
    () => Object.fromEntries(document.contributions.map((item) => {
      const page = document.pages.find((candidate) => candidate.id === item.pageId);
      return [item.id, page?.pageNumber ?? 0];
    })),
    [document.contributions, document.pages],
  );
  const selectedZoneId =
    (activeContentZoneId && pageMaster?.contentZones.some((zone) => zone.id === activeContentZoneId) ? activeContentZoneId : undefined)
    ?? (selection.zoneId && pageMaster?.contentZones.some((zone) => zone.id === selection.zoneId) ? selection.zoneId : undefined)
    ?? pageMaster?.contentZones
      .filter((zone) => zone.kind === 'text-flow')
      .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]?.id
    ?? selectedPage?.zones[0]?.zoneId
    ?? 'body_main';
  const primaryPageZoneId =
    pageMaster?.contentZones
      .filter((zone) => zone.kind === 'text-flow')
      .sort((left, right) => (left.flowOrder ?? 0) - (right.flowOrder ?? 0))[0]?.id
    ?? selectedZoneId;
  const primaryImageZoneId =
    (selection.zoneId && pageMaster?.contentZones.some((zone) => zone.id === selection.zoneId && zone.kind !== 'text-flow') ? selection.zoneId : undefined)
    ?? pageMaster?.contentZones.find((zone) => zone.kind === 'media-freeform' || zone.kind === 'mixed')?.id
    ?? selectedPage?.zones.find((zone) =>
      pageMaster?.contentZones.some((template) => template.id === zone.zoneId && template.kind !== 'text-flow'),
    )?.zoneId
    ?? selectedZoneId;

  useEffect(() => {
    if (!activeMasterId && pageMaster?.id) {
      setActiveMasterId(pageMaster.id);
      return;
    }

    if (activeMasterId && !document.masters.items.some((item) => item.id === activeMasterId)) {
      setActiveMasterId(pageMaster?.id ?? document.masters.items[0]?.id ?? null);
    }
  }, [activeMasterId, document.masters.items, pageMaster?.id]);

  const handleCreateMaster = () => {
    createMaster(newMasterName || undefined, newMasterPreset);
    const createdMaster = usePublishingStore.getState().document.masters.items.at(-1);
    if (createdMaster) {
      setActiveMasterId(createdMaster.id);
    }
    setNewMasterName('');
    setNewMasterPreset('single-column');
    setShowCreateMasterModal(false);
  };
  const openTextModalForCreate = (zoneId?: string | null) => {
    const resolvedZoneId = zoneId ?? selectedZoneId;
    if (!selectedPage || !resolvedZoneId) {
      showToast('영역을 먼저 선택하세요.', 'error');
      return;
    }

    setTextModalThreadId(null);
    setTextModalZoneId(resolvedZoneId);
    setTextModalValue('');
    setShowTextModal(true);
  };

  const openTextModalForEdit = (threadId: string) => {
    const thread = document.threads.find((item) => item.id === threadId);
    if (!thread) {
      return;
    }

    setTextModalThreadId(threadId);
    setTextModalZoneId(thread.sourceZoneId);
    setTextModalValue(getThreadPlainText(document, threadId));
    setShowTextModal(true);
  };

  const handleCanvasTextOpen = (threadId: string) => {
    openTextModalForEdit(threadId);
  };

  const findImportTargetZone = useCallback((slotKey: string) => {
    if (!selectedPage) {
      return null;
    }

    const rootPageId = getChainRootPageId(document, selectedPage.id);
    const rootPage = document.pages.find((page) => page.id === rootPageId) ?? selectedPage;
    const rootMaster = document.masters.items.find((item) => item.id === rootPage.masterId) ?? pageMaster;
    if (!rootMaster) {
      return null;
    }

    const normalizedSlotKey = slotKey.toLowerCase();
    const baseSlotKey = normalizedSlotKey.replace(/_(ko|en)$/, '');

    return (
      rootMaster.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === normalizedSlotKey)
      ?? rootMaster.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === baseSlotKey)
      ?? rootMaster.contentZones.find((zone) => zone.kind === 'text-flow' && zone.name.toLowerCase().includes(baseSlotKey))
      ?? rootMaster.contentZones.find((zone) => zone.kind === 'text-flow' && inferZoneSlotKey(zone)?.toLowerCase() === 'body')
      ?? rootMaster.contentZones.find((zone) => zone.kind === 'text-flow')
      ?? null
    );
  }, [document, pageMaster, selectedPage]);

  const findThreadForZoneSlot = useCallback((zoneId: string) => {
    if (!selectedPage || !pageMaster) {
      return null;
    }

    const zoneTemplate =
      pageMaster.contentZones.find((zone) => zone.id === zoneId)
      ?? pageMaster.contentZones.find((zone) => zone.id === selectedZoneId);
    if (!zoneTemplate) {
      return null;
    }

    const rootPageId = getChainRootPageId(document, selectedPage.id);
    const inferredSlotKey = inferZoneSlotKey(zoneTemplate);
    const slotKey = inferredSlotKey ? `slot:${inferredSlotKey}` : zoneTemplate.flowGroupId ? `group:${zoneTemplate.flowGroupId}` : `zone:${zoneTemplate.id}`;

    return document.threads.find((thread) => {
      if (thread.semanticRole !== 'paragraph') {
        return false;
      }

      const threadPage = document.pages.find((page) => page.id === thread.sourcePageId);
      if (!threadPage) {
        return false;
      }

      const threadRootPageId = getChainRootPageId(document, thread.sourcePageId);
      if (threadRootPageId !== rootPageId) {
        return false;
      }

      const threadMaster = document.masters.items.find((item) => item.id === threadPage.masterId);
      const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
      const threadInferredSlotKey = inferZoneSlotKey(threadZone);
      const threadSlotKey = threadInferredSlotKey ? `slot:${threadInferredSlotKey}` : threadZone?.flowGroupId ? `group:${threadZone.flowGroupId}` : `zone:${thread.sourceZoneId}`;
      return threadSlotKey === slotKey;
    }) ?? null;
  }, [document, pageMaster, selectedPage, selectedZoneId]);

  const handleZoneActivate = (zoneId: string, kind: ZoneKind) => {
    setActiveContentZoneId(zoneId);
    const zone = selectedPage?.zones.find((item) => item.zoneId === zoneId);
    if (kind === 'text-flow') {
      const slotThread = findThreadForZoneSlot(zoneId);
      if (slotThread) {
        openTextModalForEdit(slotThread.id);
        return;
      }

      const existingTextBlock = zone?.blocks.find((block): block is Extract<PageBlock, { type: 'text' }> => block.type === 'text');
      if (existingTextBlock) {
        openTextModalForEdit(existingTextBlock.flow.sourceThreadId);
        return;
      }
      openTextModalForCreate(zoneId);
      return;
    }

    const existingImageBlock = zone?.blocks.find((block): block is Extract<PageBlock, { type: 'image' }> => block.type === 'image');
    if (existingImageBlock && selectedPage) {
      selectBlockInStore(selectedPage.id, zoneId, existingImageBlock.id);
      return;
    }
    setImageModalZoneId(zoneId);
    setShowImageModal(true);
  };

  const closeTextModal = () => {
    setShowTextModal(false);
    setTextModalThreadId(null);
    setTextModalZoneId(null);
    setTextModalValue('');
  };

  const handleSubmitTextModal = () => {
    const trimmed = textModalValue.trim();
    if (!trimmed) {
      showToast('본문을 입력하세요.', 'error');
      return;
    }

    if (textModalThreadId) {
      updateThreadText(textModalThreadId, trimmed);
      showToast('글을 수정했습니다.', 'success');
      closeTextModal();
      return;
    }

    const targetZoneId = textModalZoneId ?? primaryPageZoneId;
    if (!selectedPage || !targetZoneId) {
      showToast('영역을 먼저 선택하세요.', 'error');
      return;
    }

    const targetZone =
      pageMaster?.contentZones.find((zone) => zone.id === targetZoneId)
      ?? pageMaster?.contentZones.find((zone) => getSlotIdentity(zone) === targetZoneId);
    const threadId = addThreadWithText(selectedPage.id, targetZoneId, trimmed, getDefaultRoleForZone(targetZone));
    if (!threadId) {
      showToast('본문을 입력하세요.', 'error');
      return;
    }

    showToast('글을 추가했습니다.', 'success');
    closeTextModal();
  };

  const handleImportDocx = async (file: File) => {
    if (!selectedPage) {
      showToast('페이지를 먼저 선택하세요.', 'error');
      return;
    }

    try {
      setImportingDocx(true);
      const parsed = await parseDocxManuscriptWithAI(file, useAIParsing);
      const rootPageId = getChainRootPageId(document, selectedPage.id);
      const blankSelectedContribution =
        selectedContribution
        && selectedContribution.pageId === rootPageId
        && selectedContribution.slots.every((slot) => !slot.text.trim());
      let applied = 0;

      // AI 파싱이 성공한 경우
      if (parsed.contributionDraft.slots.length > 0) {
        if (blankSelectedContribution) {
          parsed.contributionDraft.slots.forEach((slot) => {
            updateContributionSlotText(selectedContribution.id, slot.slotKey, slot.text);
          });
          applied = parsed.contributionDraft.slots.length;
          showToast(`발표자 원고 ${parsed.contributionDraft.title} 반영 완료`, 'success');
          return;
        }

        const contributionId = addContribution(rootPageId, parsed.contributionDraft);
        if (contributionId) {
          applied = parsed.contributionDraft.slots.length;
          showToast(`발표자 원고 ${parsed.contributionDraft.title} 반영 완료`, 'success');
          return;
        }
      }

      // AI 파싱 실패 또는 비활성화 시 기존 방식 사용
      if (parsed.aiParsingError) {
        showToast(`AI 파싱 실패: ${parsed.aiParsingError}. 기본 파싱으로 진행합니다.`, 'info');
      }

      parsed.slots.forEach((slot) => {
        const zone = findImportTargetZone(slot.slotKey);
        if (!zone) {
          return;
        }
        addThreadWithText(rootPageId, zone.id, slot.text, slot.role);
        applied += 1;
      });

      if (!applied && parsed.rawText.trim()) {
        const fallbackZone = findImportTargetZone('body');
        if (fallbackZone) {
          addThreadWithText(rootPageId, fallbackZone.id, parsed.rawText.trim(), 'paragraph');
          applied = 1;
        }
      }

      showToast(applied ? `원고 슬롯 ${applied}개 반영` : '맞는 텍스트 슬롯이 없습니다.', applied ? 'success' : 'error');
    } catch (error) {
      logError(error, 'PublishingEditor-docx-import');
      showToast('워드 원고 분석에 실패했습니다.', 'error');
    } finally {
      setImportingDocx(false);
    }
  };

  const handleCreateSpeakerContribution = useCallback(() => {
    if (!selectedPage) {
      showToast('페이지를 먼저 선택하세요.', 'error');
      return;
    }

    const rootPageId = getChainRootPageId(document, selectedPage.id);
    const contributionId = createSpeakerContribution(rootPageId, pageMaster?.id);
    if (!contributionId) {
      showToast('새 발표자 스레드를 만들지 못했습니다.', 'error');
      return;
    }

    showToast('빈 발표자 스레드를 생성했습니다. 슬롯을 채우거나 워드를 가져오세요.', 'success');
  }, [createSpeakerContribution, document, pageMaster?.id, selectedPage]);

  const handleTestAIConnection = async () => {
    if (!glmClient.isConfigured()) {
      showToast('GLM API Key가 설정되지 않았습니다. AI 기능 없이도 일반 편집은 가능합니다.', 'info');
      return;
    }

    try {
      setTestingAI(true);
      const isConnected = await glmClient.testConnection();
      showToast(isConnected ? 'AI 엔진 연결 성공!' : 'AI 엔진 연결 실패', isConnected ? 'success' : 'error');
    } catch (error) {
      showToast(`AI 연결 오류: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setTestingAI(false);
    }
  };

  const handleStartContributionSlotEdit = useCallback((slotKey: string, value: string) => {
    setEditingContributionSlot(slotKey);
    setEditingContributionValue(value);
  }, []);

  const handleSaveContributionSlotEdit = useCallback(() => {
    if (!selectedContribution || !editingContributionSlot) {
      return;
    }

    updateContributionSlotText(selectedContribution.id, editingContributionSlot, editingContributionValue);
    setEditingContributionSlot(null);
    setEditingContributionValue('');
    showToast('발표자 원고 슬롯을 수정했습니다.', 'success');
  }, [editingContributionSlot, editingContributionValue, selectedContribution, updateContributionSlotText]);

  const handleCompleteContribution = useCallback(() => {
    if (!selectedContribution) {
      return;
    }

    updateContributionStatus(selectedContribution.id, 'completed');
    showToast('발표자 원고를 완료 저장했습니다.', 'success');
  }, [selectedContribution, updateContributionStatus]);

  const handlePresentationTrackChange = useCallback((contributionId: string, trackId: string) => {
    updateContributionPresentationTrack(contributionId, trackId);
    showToast('발표 번호 그룹을 변경했습니다.', 'success');
  }, [updateContributionPresentationTrack]);
  const handleAddPresentationTrack = useCallback((kind: 'oral' | 'poster') => {
    addPresentationTrack(kind);
    showToast(`${kind === 'oral' ? '구연' : '포스터'} 트랙을 추가했습니다.`, 'success');
  }, [addPresentationTrack]);
  const selectedBlock = useMemo(() => {
    const page = document.pages.find((item) => item.id === selection.pageId);
    const zone = page?.zones.find((item) => item.zoneId === selection.zoneId);
    return zone?.blocks.find((item) => item.id === selection.blockId) ?? null;
  }, [document.pages, selection.blockId, selection.pageId, selection.zoneId]);
  const currentPageTextSlots = useMemo(() => {
    if (!selectedPage || !pageMaster) {
      return [];
    }

    const rootPageId = getChainRootPageId(document, selectedPage.id);
    const seen = new Set<string>();

    return pageMaster.contentZones
      .filter((zone) => zone.kind === 'text-flow')
      .filter((zone) => {
        const key = getSlotIdentity(zone);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((zone) => {
        const slotThread = document.threads.find((thread) => {
          const threadPage = document.pages.find((page) => page.id === thread.sourcePageId);
          if (!threadPage) {
            return false;
          }
          const threadRootPageId = getChainRootPageId(document, thread.sourcePageId);
          if (threadRootPageId !== rootPageId) {
            return false;
          }
          const threadMaster = document.masters.items.find((item) => item.id === threadPage.masterId);
          const threadZone = threadMaster?.contentZones.find((item) => item.id === thread.sourceZoneId);
          return threadZone ? getSlotIdentity(threadZone) === getSlotIdentity(zone) : false;
        }) ?? null;

        return {
          key: getSlotIdentity(zone),
          zone,
          thread: slotThread,
        };
      });
  }, [document, pageMaster, selectedPage]);
  const pxPerMm = getPxPerMm(document.layout.pagePreset);
  const alignmentWarningThresholdPx = document.layout.printGuides.alignmentWarningThresholdPx ?? 0.75;
  const pageNumberAlignmentPreset = document.layout.pageNumbering.alignmentPreset ?? 'center';
  const pageNumberMirrorOnEvenPages = document.layout.pageNumbering.mirrorOnEvenPages ?? false;
  const globalFixedDecorations = selectedMaster?.decorations.filter((item) => item.scope === 'global-fixed') ?? [];
  const groupedGlobalFixedDecorations = useMemo(() => {
    return globalFixedDecorations.reduce<Record<string, typeof globalFixedDecorations>>((acc, decoration) => {
      const category = getDecorationCategoryLabel(decoration);
      acc[category] = acc[category] ?? [];
      acc[category].push(decoration);
      return acc;
    }, {});
  }, [globalFixedDecorations]);
  const preflightIssues = useMemo<PreflightIssue[]>(() => {
    const issues: PreflightIssue[] = [];

    if (!document.meta.title.ko.trim()) {
      issues.push({
        id: 'missing-document-title',
        severity: 'error',
        message: '문서 제목이 비어 있습니다.',
      });
    }

    if (validationReport) {
      const maxDeltaPx = getMaxValidationDeltaPx(validationReport);
      if (maxDeltaPx > alignmentWarningThresholdPx) {
        issues.push({
          id: 'alignment-delta',
          severity: 'error',
          message: `출력 오차가 기준치를 초과했습니다: ${maxDeltaPx.toFixed(3)}px`,
          pageId: selectedPage?.id,
        });
      }
    }

    const pageNumberDecorations = document.masters.items.flatMap((master) =>
      master.decorations.filter((decoration) => decoration.textBinding === 'page.number'),
    );
    if (document.layout.pageNumbering.enabled && pageNumberDecorations.length === 0) {
      issues.push({
        id: 'missing-page-number-decoration',
        severity: 'error',
        message: '페이지 번호 표시가 켜져 있지만 페이지 번호 장식이 없습니다.',
      });
    }

    const tocEnabledThreads = document.threads.filter((thread) => thread.ebook.toc.enabled);
    if (tocEnabledThreads.length > 0 && document.toc.items.length === 0) {
      issues.push({
        id: 'empty-toc',
        severity: 'warning',
        message: 'TOC가 활성화된 텍스트가 있지만 목차 항목이 비어 있습니다.',
      });
    }

    document.pages.forEach((page) => {
      const master = document.masters.items.find((item) => item.id === page.masterId);
      if (!master) {
        return;
      }

      const hasSectionNumberDecoration = master.decorations.some((decoration) => decoration.textBinding === 'section.number');
      if (hasSectionNumberDecoration) {
        const hasTopLevelToc = document.toc.items.some((item) => item.level === 1 && item.source.pageId === page.id);
        if (!hasTopLevelToc) {
          issues.push({
            id: `${page.id}-section-number-missing`,
            severity: 'warning',
            message: `${page.id}의 섹션 번호 기준이 없습니다.`,
            pageId: page.id,
          });
        }
      }

      page.zones.forEach((zoneInstance) => {
        const zoneTemplate = master.contentZones.find((item) => item.id === zoneInstance.zoneId && item.frame);
        zoneInstance.blocks.forEach((block) => {
          if (block.type === 'image') {
            if (!block.assetRef.src.trim()) {
              issues.push({
                id: `${page.id}-${block.id}-missing-image-src`,
                severity: 'error',
                message: `${page.id}의 이미지 ${block.id} 소스가 비어 있습니다.`,
                pageId: page.id,
                blockId: block.id,
              });
            }

            const imageRight = zoneTemplate ? zoneTemplate.frame.x + block.placement.x + block.placement.width : block.placement.x + block.placement.width;
            const imageBottom = zoneTemplate ? zoneTemplate.frame.y + block.placement.y + block.placement.height : block.placement.y + block.placement.height;
            const zoneWidth = zoneTemplate?.frame.width ?? document.layout.pagePreset.widthPx;
            const zoneHeight = zoneTemplate?.frame.height ?? document.layout.pagePreset.heightPx;
            if (
              block.placement.x < 0
              || block.placement.y < 0
              || block.placement.x + block.placement.width > zoneWidth
              || block.placement.y + block.placement.height > zoneHeight
            ) {
              issues.push({
                id: `${page.id}-${block.id}-zone-overflow`,
                severity: 'warning',
                message: `${page.id}의 이미지 ${block.id}가 텍스트 영역을 벗어날 수 있습니다.`,
                pageId: page.id,
                blockId: block.id,
              });
            }
            if (
              imageRight > document.layout.pagePreset.widthPx - document.layout.pagePreset.safeMarginPx.right
              || imageBottom > document.layout.pagePreset.heightPx - document.layout.pagePreset.safeMarginPx.bottom
            ) {
              issues.push({
                id: `${page.id}-${block.id}-safe-overflow`,
                severity: 'error',
                message: `${page.id}의 이미지 ${block.id}가 안전영역 하단 또는 우측을 침범했습니다.`,
                pageId: page.id,
                blockId: block.id,
              });
            }
          }

          if (block.type === 'text') {
            const plainText = block.content.runs.map((run) => run.text).join('').trim();
            if (!plainText) {
              issues.push({
                id: `${page.id}-${block.id}-empty-text`,
                severity: 'warning',
                message: `${page.id}의 텍스트 ${block.id} 내용이 비어 있습니다.`,
                pageId: page.id,
                blockId: block.id,
              });
            }

            const resolvedFontSize = block.styleOverride?.fontSize ?? zoneTemplate?.style.fontSize ?? 14;
            if (resolvedFontSize < 10) {
              issues.push({
                id: `${page.id}-${block.id}-small-font`,
                severity: 'warning',
                message: `${page.id}의 텍스트 ${block.id} 폰트 크기가 너무 작습니다 (${resolvedFontSize}px).`,
                pageId: page.id,
                blockId: block.id,
              });
            }
          }
        });
      });
    });

    return issues.filter((issue, index, array) => array.findIndex((item) => item.id === issue.id) === index);
  }, [alignmentWarningThresholdPx, document.layout.pageNumbering.enabled, document.layout.pagePreset, document.masters.items, document.pages, document.threads, document.toc.items.length, selectedPage?.id, validationReport]);
  const templateDecorations = selectedMaster?.decorations.filter((item) => item.scope !== 'global-fixed') ?? [];
  const editableZones = selectedMaster?.contentZones.filter((item) => item.scope !== 'global-fixed') ?? [];
  const validationMarkers = {
    topLeft: { x: 0, y: 0 },
    topCenter: { x: document.layout.pagePreset.widthPx / 2, y: 0 },
    topRight: { x: document.layout.pagePreset.widthPx, y: 0 },
    bottomLeft: { x: 0, y: document.layout.pagePreset.heightPx },
    bottomCenter: { x: document.layout.pagePreset.widthPx / 2, y: document.layout.pagePreset.heightPx },
    bottomRight: { x: document.layout.pagePreset.widthPx, y: document.layout.pagePreset.heightPx },
  };

  useEffect(() => {
    if (!selectedPage) {
      setValidationReport(null);
      return;
    }

    const interactivePage = pageRefs.current[selectedPage.id];
    const exportPage = pdfPageRefs.current[selectedPage.id];
    if (!interactivePage || !exportPage) {
      setValidationReport(null);
      return;
    }

    const interactiveRect = interactivePage.getBoundingClientRect();
    const exportRect = exportPage.getBoundingClientRect();
    const markerKeys = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    const markerDeltaPx: Record<string, { x: number; y: number }> = {};

    markerKeys.forEach((key) => {
      const interactiveMarker = interactivePage.querySelector<HTMLElement>(`[data-validation-marker="${key}"]`);
      const exportMarker = exportPage.querySelector<HTMLElement>(`[data-validation-marker="${key}"]`);
      if (!interactiveMarker || !exportMarker) {
        return;
      }

      const interactiveMarkerRect = interactiveMarker.getBoundingClientRect();
      const exportMarkerRect = exportMarker.getBoundingClientRect();
      markerDeltaPx[key] = {
        x: Number(
          (
            (interactiveMarkerRect.left - interactiveRect.left) -
            (exportMarkerRect.left - exportRect.left)
          ).toFixed(3),
        ),
        y: Number(
          (
            (interactiveMarkerRect.top - interactiveRect.top) -
            (exportMarkerRect.top - exportRect.top)
          ).toFixed(3),
        ),
      };
    });

    setValidationReport({
      pageSizeDeltaPx: {
        width: Number((interactiveRect.width - exportRect.width).toFixed(3)),
        height: Number((interactiveRect.height - exportRect.height).toFixed(3)),
      },
      markerDeltaPx,
    });
  }, [document, history.revision, selectedPage]);

  const handleDownloadPdf = useCallback(async () => {
    if (preflightIssues.length > 0) {
      setShowPreflightModal(true);
      return;
    }

    const maxDeltaPx = getMaxValidationDeltaPx(validationReport);
    if (validationReport && maxDeltaPx > alignmentWarningThresholdPx) {
      const maxDeltaMm = formatMm(pxToMm(maxDeltaPx, document.layout.pagePreset));
      const shouldContinue = window.confirm(
        `편집기와 PDF 출력 기준 사이에 최대 ${maxDeltaPx.toFixed(3)} px (${maxDeltaMm}) 오차가 감지되었습니다. 그대로 PDF를 다운로드할까요?`,
      );
      if (!shouldContinue) {
        showToast('PDF 다운로드 취소', 'error');
        return;
      }
    }

    await downloadPagesAsPdf(
      document.pages
        .map((page) => pdfPageRefs.current[page.id] ?? pageRefs.current[page.id])
        .filter((page): page is HTMLDivElement => page instanceof HTMLDivElement),
      document.meta.title.ko,
      document.layout.pagePreset,
    );
  }, [alignmentWarningThresholdPx, document.layout.pagePreset, document.meta.title.ko, document.pages, preflightIssues, validationReport]);

  const handleConfirmPdfDownload = useCallback(async () => {
    setShowPreflightModal(false);

    const maxDeltaPx = getMaxValidationDeltaPx(validationReport);
    if (validationReport && maxDeltaPx > alignmentWarningThresholdPx) {
      const maxDeltaMm = formatMm(pxToMm(maxDeltaPx, document.layout.pagePreset));
      const shouldContinue = window.confirm(
        `편집기와 PDF 출력 기준 사이에 최대 ${maxDeltaPx.toFixed(3)} px (${maxDeltaMm}) 오차가 감지되었습니다. 그대로 PDF를 다운로드할까요?`,
      );
      if (!shouldContinue) {
        showToast('PDF 다운로드 취소', 'error');
        return;
      }
    }

    await downloadPagesAsPdf(
      document.pages
        .map((page) => pdfPageRefs.current[page.id] ?? pageRefs.current[page.id])
        .filter((page): page is HTMLDivElement => page instanceof HTMLDivElement),
      document.meta.title.ko,
      document.layout.pagePreset,
    );
  }, [alignmentWarningThresholdPx, document.layout.pagePreset, document.meta.title.ko, document.pages, validationReport]);

  const handleAddImage = useCallback(() => {
    const targetZoneId = imageModalZoneId ?? primaryImageZoneId;
    if (!selectedPage || !targetZoneId || !imageUrl.trim()) {
      return;
    }

    addImageBlock(selectedPage.id, targetZoneId, {
      src: imageUrl.trim(),
      naturalWidth: 1600,
      naturalHeight: 1200,
    });
    setImageUrl('');
    setShowImageModal(false);
    setImageModalZoneId(null);
  }, [addImageBlock, imageModalZoneId, imageUrl, primaryImageZoneId, selectedPage]);

  const handleUploadFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const targetZoneId = imageModalZoneId ?? primaryImageZoneId;
      if (!file || !selectedPage || !targetZoneId) {
        return;
      }

      try {
        setUploadingImage(true);
        setUploadProgress(0);
        const uploaded = await uploadPublicationImage(publicationId, file, setUploadProgress);
        addImageBlock(selectedPage.id, targetZoneId, uploaded);
        setShowImageModal(false);
        setImageModalZoneId(null);
        showToast('이미지가 Firebase Storage에 업로드되었습니다.', 'success');
      } catch (error) {
        logError(error, 'PublishingEditor-uploadImage');
        showToast('이미지 업로드에 실패했습니다.', 'error');
      } finally {
        setUploadingImage(false);
        setUploadProgress(0);
        event.target.value = '';
      }
    },
    [addImageBlock, imageModalZoneId, primaryImageZoneId, publicationId, selectedPage],
  );

  const handleUploadMasterFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !selectedMaster) {
        return;
      }

      try {
        setUploadingMasterImage(true);
        setMasterUploadProgress(0);
        const uploaded = await uploadMasterImage(file, setMasterUploadProgress);
        addMasterImageDecoration(selectedMaster.id, uploaded);
        showToast('마스터 이미지가 업로드되었습니다.', 'success');
      } catch (error) {
        logError(error, 'PublishingEditor-uploadMasterImage');
        showToast('마스터 이미지 업로드에 실패했습니다.', 'error');
      } finally {
        setUploadingMasterImage(false);
        setMasterUploadProgress(0);
        event.target.value = '';
      }
    },
    [addMasterImageDecoration, selectedMaster],
  );

  const updateSelectedDecorationFields = useCallback(
    (
      decorationId: string,
      updates: Partial<{
        x: number;
        y: number;
        width: number;
        height: number;
        text: string;
        fill: string;
        style: {
          fontSize?: number;
          fontWeight?: number;
          textAlign?: 'left' | 'center' | 'right' | 'justify';
          color?: string;
        };
      }>,
    ) => {
      if (!selectedMaster) {
        return;
      }

      const decoration = selectedMaster.decorations.find((item) => item.id === decorationId);
      if (!decoration) {
        return;
      }

      if (decoration.scope === 'global-fixed') {
        if (!globalFixedManagerMode) {
          return;
        }
        updateGlobalMasterDecoration(selectedMaster.id, decorationId, updates);
        return;
      }

      updateMasterDecoration(selectedMaster.id, decorationId, updates);
    },
    [globalFixedManagerMode, selectedMaster, updateGlobalMasterDecoration, updateMasterDecoration],
  );

  const jumpToIssue = useCallback((issue: PreflightIssue) => {
    if (!issue.pageId) {
      return;
    }

    selectPage(issue.pageId);
    const pageNode = pageRefs.current[issue.pageId];
    pageNode?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (issue.blockId) {
      const page = document.pages.find((item) => item.id === issue.pageId);
      const zone = page?.zones.find((zoneItem) => zoneItem.blocks.some((block) => block.id === issue.blockId));
      if (zone) {
        selectBlockInStore(issue.pageId, zone.zoneId, issue.blockId);
      }
    }
  }, [document.pages, selectBlockInStore, selectPage]);

  const handleJumpToPageNumber = useCallback(() => {
    const pageNumber = Math.max(1, Number(pageJumpInput) || 0);
    const targetPage = document.pages.find((page) => page.pageNumber === pageNumber);
    if (!targetPage) {
      showToast('페이지를 찾을 수 없습니다.', 'error');
      return;
    }

    selectPage(targetPage.id);
    pageRefs.current[targetPage.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPageJumpInput('');
  }, [document.pages, pageJumpInput, selectPage]);
  const handlePrevPage = useCallback(() => {
    if (!selectedPage) {
      return;
    }
    const target = document.pages.find((page) => page.pageNumber === selectedPage.pageNumber - 1);
    if (target) {
      selectPage(target.id);
    }
  }, [document.pages, selectedPage, selectPage]);
  const handleNextPage = useCallback(() => {
    if (!selectedPage) {
      return;
    }
    const target = document.pages.find((page) => page.pageNumber === selectedPage.pageNumber + 1);
    if (target) {
      selectPage(target.id);
    }
  }, [document.pages, selectedPage, selectPage]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-[#f3efe7] text-slate-900">
      <aside className="editor-sidebar w-[360px] border-r border-slate-200 bg-white/90 px-5 py-6 [&_input]:bg-white [&_input]:text-slate-900 [&_select]:bg-white [&_select]:text-slate-900 [&_textarea]:bg-white [&_textarea]:text-slate-900">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Document</p>
          <input
            value={document.meta.title.ko}
            onChange={(event) => updateDocumentMeta(event.target.value, document.meta.title.en || '')}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold outline-none transition focus:border-slate-400"
          />
          {selectedPage ? (
            <select
              value={selectedPage.masterId}
              onChange={(event) => updatePageMaster(selectedPage.id, event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400"
            >
              {document.masters.items.map((master) => (
                <option key={master.id} value={master.id}>
                  {master.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => {
              window.location.href = `/studio/${publicationId}`;
            }}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            마스터 스튜디오
          </button>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-900 bg-slate-900 p-4 text-white">
          <div className="text-sm font-semibold">{isSpeakerThreadPage ? '발표자 원고' : '페이지 편집'}</div>
          <div className="mt-1 text-xs text-slate-300">
            {isSpeakerThreadPage
              ? 'DOCX 한 개를 발표자 1명 단위로 등록하고, 슬롯별로 내용을 점검합니다.'
              : '현재 페이지에 텍스트와 이미지를 수동 배치할 수 있습니다.'}
          </div>
          <div className="mt-4 grid gap-2">
            {!isSpeakerThreadPage ? (
              <button
                type="button"
                onClick={() => openTextModalForCreate()}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900"
              >
                텍스트 넣기
              </button>
            ) : null}
            <label className={`rounded-2xl ${isSpeakerThreadPage ? 'bg-white text-slate-900' : 'border border-white/20 text-white'} px-4 py-3 text-sm font-semibold ${importingDocx ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}>
              원고 가져오기
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={importingDocx}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImportDocx(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setImageModalZoneId(primaryImageZoneId);
                setShowImageModal(true);
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${isSpeakerThreadPage ? 'border border-white/20 text-white' : 'border border-white/20 text-white'}`}
            >
              이미지 넣기
            </button>
          </div>
        </div>

        <div className="editor-toolbar mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={undo} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium">
            실행 취소
          </button>
          <button type="button" onClick={redo} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium">
            다시 실행
          </button>
          {selectedPage ? (
            <>
              {!isSpeakerThreadPage ? (
                <button
                  type="button"
                  onClick={() => openTextModalForCreate()}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4" />
                  텍스트 추가
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setImageModalZoneId(primaryImageZoneId);
                  setShowImageModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
              >
                <PhotoIcon className="h-4 w-4" />
                이미지 추가
              </button>
              {!isSpeakerThreadPage ? (
                <>
                  <button
                    type="button"
                    onClick={() => addPage(selectedPage.masterId)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                  >
                    <PlusIcon className="h-4 w-4" />
                    페이지 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePage(selectedPage.id)}
                    disabled={document.pages.length <= 1 || selectedPage.pageRole === 'cover'}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    페이지 삭제
                  </button>
                </>
              ) : null}
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useAIParsing}
                  onChange={(e) => setUseAIParsing(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                AI 파싱{!glmClient.isConfigured() ? ' (키 필요)' : ''}
              </label>
              <button
                type="button"
                onClick={handleTestAIConnection}
                disabled={testingAI}
                className={`inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-2 text-sm font-medium ${testingAI ? 'cursor-wait opacity-60' : 'text-blue-700 hover:bg-blue-50'}`}
              >
                GLM 연결 테스트
              </button>
              {!isSpeakerThreadPage ? null : (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  발표자형 마스터
                </span>
              )}
            </>
          ) : null}
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PhotoIcon className="h-4 w-4" />
            이미지 추가
          </div>
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleAddImage}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <PhotoIcon className="h-4 w-4" />
            현재 페이지에 삽입
          </button>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <PhotoIcon className="h-4 w-4" />
            Storage 업로드
            <input type="file" accept="image/*" onChange={handleUploadFile} className="hidden" />
          </label>
          {uploadingImage ? <p className="mt-3 text-xs text-slate-500">업로드 중... {Math.round(uploadProgress * 100)}%</p> : null}
          <p className="mt-2 text-xs text-slate-400">업로드 후 배치</p>
        </div>

        {isSpeakerThreadPage && currentSpeakerMasterUsesPresentationTracks ? (
          <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">발표 트랙 목록</p>
                <p className="mt-1 text-xs text-slate-500">GLM 감지 보조와 발표 번호 그룹에 함께 사용됩니다.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAddPresentationTrack('oral')}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  구연 추가
                </button>
                <button
                  type="button"
                  onClick={() => handleAddPresentationTrack('poster')}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  포스터 추가
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {(document.meta.presentationTracks ?? []).map((track) => (
                <div key={track.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${track.kind === 'oral' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
                      {track.kind === 'oral' ? '구연' : '포스터'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        deletePresentationTrack(track.id);
                        showToast('발표 트랙을 삭제했습니다.', 'success');
                      }}
                      className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-700"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <input
                      value={track.prefix}
                      onChange={(event) => updatePresentationTrack(track.id, { prefix: event.target.value.toUpperCase() })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                      placeholder="O1"
                    />
                    <input
                      value={track.label}
                      onChange={(event) => updatePresentationTrack(track.id, { label: event.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="트랙 이름"
                    />
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">GLM 힌트 문구</span>
                    <textarea
                      value={(track.glmHints ?? []).join('\n')}
                      onChange={(event) =>
                        updatePresentationTrack(track.id, {
                          glmHints: event.target.value
                            .split('\n')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder={`예:\n${track.prefix}.${track.label}\n${track.label}`}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {false && /* eslint-disable-line no-constant-binary-expression */ <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">페이지 번호</div>
          <label className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>표시</span>
            <input
              type="checkbox"
              checked={document.layout.pageNumbering.enabled}
              onChange={(event) => updatePageNumbering({ enabled: event.target.checked })}
            />
          </label>
          <label className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>표지에도 표시</span>
            <input
              type="checkbox"
              checked={document.layout.pageNumbering.showOnCover}
              onChange={(event) => updatePageNumbering({ showOnCover: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>시작 번호</span>
            <input
              type="number"
              min={1}
              value={document.layout.pageNumbering.startAt}
              onChange={(event) => updatePageNumbering({ startAt: Math.max(1, Number(event.target.value) || 1) })}
              className="w-20 rounded-xl border border-slate-200 px-3 py-1 text-right"
            />
          </label>
          <label className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>기본 정렬</span>
            <select
              value={pageNumberAlignmentPreset}
              onChange={(event) =>
                updatePageNumbering({
                  alignmentPreset: event.target.value as 'left' | 'center' | 'right',
                })
              }
              className="rounded-xl border border-slate-200 px-3 py-1"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => updatePageNumbering({ alignmentPreset: 'center', mirrorOnEvenPages: false })}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              중앙 하단
            </button>
            <button
              type="button"
              onClick={() => updatePageNumbering({ alignmentPreset: 'right', mirrorOnEvenPages: true })}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              바깥쪽 하단
            </button>
            <button
              type="button"
              onClick={() => updatePageNumbering({ alignmentPreset: 'left', mirrorOnEvenPages: true })}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              안쪽 하단
            </button>
          </div>
          <label className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>짝수 페이지 미러링</span>
            <input
              type="checkbox"
              checked={pageNumberMirrorOnEvenPages}
              onChange={(event) => updatePageNumbering({ mirrorOnEvenPages: event.target.checked })}
            />
          </label>
        </div>}

        {false && /* eslint-disable-line no-constant-binary-expression */ <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">출력 가이드</div>
          <label className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>안전 영역</span>
            <input
              type="checkbox"
              checked={document.layout.printGuides.showSafeArea}
              onChange={(event) => updatePrintGuides({ showSafeArea: event.target.checked })}
            />
          </label>
          <label className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>중앙선</span>
            <input
              type="checkbox"
              checked={document.layout.printGuides.showCenterLine}
              onChange={(event) => updatePrintGuides({ showCenterLine: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>컨텐츠 경계</span>
            <input
              type="checkbox"
              checked={document.layout.printGuides.showContentBounds}
              onChange={(event) => updatePrintGuides({ showContentBounds: event.target.checked })}
            />
          </label>
          <label className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>검증 마커</span>
            <input
              type="checkbox"
              checked={document.layout.printGuides.showValidationMarks}
              onChange={(event) => updatePrintGuides({ showValidationMarks: event.target.checked })}
            />
          </label>
          <label className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>오차 경고 기준 (px)</span>
            <input
              type="number"
              min={0}
              step="0.05"
              value={alignmentWarningThresholdPx}
              onChange={(event) =>
                updatePrintGuides({ alignmentWarningThresholdPx: Math.max(0, Number(event.target.value) || 0) })
              }
              className="w-24 rounded-xl border border-slate-200 px-3 py-1 text-right"
            />
          </label>
          <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
            <p>A4: {document.layout.pagePreset.widthMm} x {document.layout.pagePreset.heightMm} mm</p>
            <p>Canvas: {document.layout.pagePreset.widthPx} x {document.layout.pagePreset.heightPx} px</p>
            <p>Scale: 1 mm = {pxPerMm.toFixed(3)} px</p>
            <p>Safe Top: {formatMm(pxToMm(document.layout.pagePreset.safeMarginPx.top, document.layout.pagePreset))}</p>
            <p>
              Warning Threshold: {alignmentWarningThresholdPx.toFixed(2)} px /{' '}
              {formatMm(pxToMm(alignmentWarningThresholdPx, document.layout.pagePreset))}
            </p>
          </div>
        </div>}

        {false && /* eslint-disable-line no-constant-binary-expression, no-constant-condition */ selectedMaster ? (
          <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">전역 고정 요소</div>
                <div className="text-xs text-slate-500">공통 요소</div>
              </div>
              <button
                type="button"
                onClick={() => setGlobalFixedManagerMode((value) => !value)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${globalFixedManagerMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
              >
                {globalFixedManagerMode ? '관리자 모드 ON' : '관리자 모드 OFF'}
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(groupedGlobalFixedDecorations).map(([category, decorations]) => (
                <div key={category} className="space-y-3">
                  <div className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{category}</div>
                  {decorations.map((decoration) => (
                    <div key={decoration.id} className="rounded-2xl bg-white p-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {decoration.textBinding === 'page.number'
                              ? '페이지 번호'
                              : decoration.type === 'image'
                                ? '전역 이미지'
                                : decoration.type === 'shape'
                                  ? '전역 도형'
                                  : '전역 텍스트'}
                          </p>
                          <p className="text-xs text-slate-500">{decoration.id}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">global-fixed</span>
                      </div>
                      {globalFixedManagerMode ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-400">X</span>
                              <input
                                type="number"
                                value={decoration.x}
                                onChange={(event) => updateSelectedDecorationFields(decoration.id, { x: Number(event.target.value) || 0 })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-400">Y</span>
                              <input
                                type="number"
                                value={decoration.y}
                                onChange={(event) => updateSelectedDecorationFields(decoration.id, { y: Number(event.target.value) || 0 })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-400">Width</span>
                              <input
                                type="number"
                                value={decoration.width}
                                onChange={(event) => updateSelectedDecorationFields(decoration.id, { width: Number(event.target.value) || 1 })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-400">Height</span>
                              <input
                                type="number"
                                value={decoration.height}
                                onChange={(event) => updateSelectedDecorationFields(decoration.id, { height: Number(event.target.value) || 1 })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                          {decoration.type !== 'shape' ? (
                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <span className="mb-1 block text-xs text-slate-400">글자 크기</span>
                                <input
                                  type="number"
                                  value={decoration.style?.fontSize ?? 12}
                                  onChange={(event) =>
                                    updateSelectedDecorationFields(decoration.id, { style: { fontSize: Number(event.target.value) || 12 } })
                                  }
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs text-slate-400">글자 두께</span>
                                <input
                                  type="number"
                                  value={decoration.style?.fontWeight ?? 400}
                                  onChange={(event) =>
                                    updateSelectedDecorationFields(decoration.id, { style: { fontWeight: Number(event.target.value) || 400 } })
                                  }
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs text-slate-400">정렬</span>
                                <select
                                  value={decoration.style?.textAlign ?? 'center'}
                                  onChange={(event) =>
                                    updateSelectedDecorationFields(decoration.id, {
                                      style: { textAlign: event.target.value as 'left' | 'center' | 'right' | 'justify' },
                                    })
                                  }
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="left">Left</option>
                                  <option value="center">Center</option>
                                  <option value="right">Right</option>
                                  <option value="justify">Justify</option>
                                </select>
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs text-slate-400">색상</span>
                                <input
                                  type="color"
                                  value={decoration.style?.color ?? '#666666'}
                                  onChange={(event) =>
                                    updateSelectedDecorationFields(decoration.id, { style: { color: event.target.value } })
                                  }
                                  className="h-10 w-full rounded-xl border border-slate-200 p-1"
                                />
                              </label>
                            </div>
                          ) : null}
                          <p className="text-xs text-slate-500">위치/스타일 편집</p>
                        </div>
                      ) : (
                        <>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                            <p>X: {decoration.x}px / {formatMm(pxToMm(decoration.x, document.layout.pagePreset))}</p>
                            <p>Y: {decoration.y}px / {formatMm(pxToMm(decoration.y, document.layout.pagePreset))}</p>
                            <p>W: {decoration.width}px / {formatMm(pxToMm(decoration.width, document.layout.pagePreset))}</p>
                            <p>H: {decoration.height}px / {formatMm(pxToMm(decoration.height, document.layout.pagePreset))}</p>
                          </div>
                          <p className="mt-2 text-xs text-amber-700">관리자 모드 필요</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {false && /* eslint-disable-line no-constant-binary-expression, no-constant-condition */ selectedMaster ? (
          <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 rounded-2xl bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">마스터 관리</div>
                  <div className="text-xs text-slate-500">생성, 복제, 삭제</div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {document.masters.defaultMasterId === selectedMaster.id ? 'default' : 'custom'}
                </span>
              </div>
              <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">새 마스터</p>
                <p className="mt-1 text-xs text-slate-500">이름과 프리셋 선택</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateMasterModal(true)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  새 마스터
                </button>
                <button
                  type="button"
                  onClick={() => {
                    duplicateMaster(selectedMaster.id);
                    const createdMaster = usePublishingStore.getState().document.masters.items.at(-1);
                    if (createdMaster) {
                      setActiveMasterId(createdMaster.id);
                    }
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  현재 마스터 복제
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultMaster(selectedMaster.id)}
                  disabled={document.masters.defaultMasterId === selectedMaster.id}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  기본 마스터 지정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fallbackMaster = document.masters.items.find((master) => master.id !== selectedMaster.id);
                    deleteMaster(selectedMaster.id);
                    if (fallbackMaster) {
                      setActiveMasterId(fallbackMaster.id);
                    }
                  }}
                  disabled={document.masters.items.length <= 1 || document.masters.defaultMasterId === selectedMaster.id}
                  className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  현재 마스터 삭제
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {document.masters.items.map((master) => (
                  <button
                    key={master.id}
                    type="button"
                    onClick={() => {
                      setActiveMasterId(master.id);
                      const pageUsingMaster = document.pages.find((page) => page.masterId === master.id);
                      if (pageUsingMaster) {
                        selectPage(pageUsingMaster.id);
                      }
                    }}
                    className={`block w-full rounded-[24px] border px-4 py-3 text-left transition ${master.id === selectedMaster.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{master.name}</span>
                      <span className="text-xs uppercase tracking-[0.16em]">
                        {document.masters.defaultMasterId === master.id ? 'default' : 'master'}
                      </span>
                    </div>
                    <div className={`mt-3 rounded-2xl border px-3 py-3 ${master.id === selectedMaster.id ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'}`}>
                      <div className="relative mx-auto aspect-[210/297] w-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="absolute inset-0" style={{ background: master.background.fill }} />
                        {master.decorations.slice(0, 3).map((decoration) => (
                          <div
                            key={decoration.id}
                            className="absolute rounded-[2px]"
                            style={{
                              left: `${(decoration.x / document.layout.pagePreset.widthPx) * 100}%`,
                              top: `${(decoration.y / document.layout.pagePreset.heightPx) * 100}%`,
                              width: `${(decoration.width / document.layout.pagePreset.widthPx) * 100}%`,
                              height: `${Math.max(2, (decoration.height / document.layout.pagePreset.heightPx) * 100)}%`,
                              background: decoration.type === 'shape' ? decoration.fill ?? '#cbd5e1' : decoration.type === 'image' ? '#cbd5e1' : '#94a3b8',
                              opacity: 0.9,
                            }}
                          />
                        ))}
                        {master.contentZones.filter((zone) => zone?.frame).slice(0, 4).map((zone) => (
                          <div
                            key={zone.id}
                            className="absolute border border-dashed border-sky-400/80"
                            style={{
                              left: `${(zone.frame.x / document.layout.pagePreset.widthPx) * 100}%`,
                              top: `${(zone.frame.y / document.layout.pagePreset.heightPx) * 100}%`,
                              width: `${(zone.frame.width / document.layout.pagePreset.widthPx) * 100}%`,
                              height: `${(zone.frame.height / document.layout.pagePreset.heightPx) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${master.id === selectedMaster.id ? 'text-slate-200' : 'text-slate-500'}`}>
                        <p>Zones {master.contentZones.length}</p>
                        <p>Decor {master.decorations.length}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">마스터 템플릿</div>
                <div className="text-xs text-slate-500">{selectedMaster.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMasterLock(selectedMaster.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  {selectedMaster.locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
                  {selectedMaster.locked ? '마스터 잠금 해제' : '마스터 잠금'}
                </button>
                <button
                  type="button"
                  onClick={() => addMasterTextDecoration(selectedMaster.id)}
                  disabled={selectedMaster.locked}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  장식 추가
                </button>
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">마스터 이름</span>
              <input
                value={selectedMaster.name}
                onChange={(event) => renameMaster(selectedMaster.id, event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium"
              />
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">배경 색상</span>
              <input
                type="color"
                value={selectedMaster.background.fill}
                disabled={selectedMaster.locked}
                onChange={(event) => updateMasterBackground(selectedMaster.id, event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-2"
              />
            </label>

            <div className="space-y-3">
              {templateDecorations.map((decoration) => (
                <div key={decoration.id} className="rounded-2xl bg-white p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {decoration.textBinding === 'page.number'
                          ? '페이지 번호'
                          : decoration.textBinding === 'section.number'
                            ? '섹션 번호'
                            : decoration.textBinding === 'document.title'
                              ? '문서 제목'
                              : decoration.type === 'text'
                                ? '텍스트 장식'
                                : '도형 장식'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {decoration.id} · {decoration.scope} {decoration.locked ? '· locked' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMasterDecorationLock(selectedMaster.id, decoration.id)}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        {decoration.locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
                      </button>
                      {!decoration.textBinding && decoration.scope !== 'global-fixed' ? (
                        <button
                          type="button"
                          onClick={() => removeMasterDecoration(selectedMaster.id, decoration.id)}
                          disabled={decoration.locked || selectedMaster.locked}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {decoration.type === 'text' && !decoration.textBinding ? (
                    <label className="mb-3 block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">텍스트</span>
                      <input
                        type="text"
                        value={decoration.text || ''}
                        disabled={selectedMaster.locked || decoration.scope === 'global-fixed' || decoration.locked}
                        onChange={(event) =>
                          updateMasterDecoration(selectedMaster.id, decoration.id, { text: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  ) : null}

                  {decoration.type === 'image' ? (
                    <div className="mb-3">
                      {getDecorationImageSrc(decoration, document.assets) ? (
                        <img
                          src={getDecorationImageSrc(decoration, document.assets)}
                          alt=""
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          className="h-20 w-full rounded-xl bg-slate-50 object-contain"
                        />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                          이미지 없음
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">X</span>
                      <input
                        type="number"
                        value={decoration.x}
                        disabled={selectedMaster.locked || decoration.scope === 'global-fixed' || decoration.locked}
                        onChange={(event) =>
                          updateMasterDecoration(selectedMaster.id, decoration.id, { x: Number(event.target.value) || 0 })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">Y</span>
                      <input
                        type="number"
                        value={decoration.y}
                        disabled={selectedMaster.locked || decoration.scope === 'global-fixed' || decoration.locked}
                        onChange={(event) =>
                          updateMasterDecoration(selectedMaster.id, decoration.id, { y: Number(event.target.value) || 0 })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">Width</span>
                      <input
                        type="number"
                        value={decoration.width}
                        disabled={selectedMaster.locked || decoration.scope === 'global-fixed' || decoration.locked}
                        onChange={(event) =>
                          updateMasterDecoration(selectedMaster.id, decoration.id, { width: Number(event.target.value) || 1 })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">Height</span>
                      <input
                        type="number"
                        value={decoration.height}
                        disabled={selectedMaster.locked || decoration.scope === 'global-fixed' || decoration.locked}
                        onChange={(event) =>
                          updateMasterDecoration(selectedMaster.id, decoration.id, { height: Number(event.target.value) || 1 })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">텍스트 영역 잠금</div>
              {editableZones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-800">{zone.name}</p>
                    <p className="text-xs text-slate-500">
                      {zone.id} {zone.flowOrder ? `· Flow ${zone.flowOrder}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleMasterZoneLock(selectedMaster.id, zone.id)}
                    disabled={selectedMaster.locked}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {zone.locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
                    {zone.locked ? '영역 잠금 해제' : '영역 잠금'}
                  </button>
                </div>
              ))}
            </div>
            <label className={`mt-3 flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 ${selectedMaster.locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <PhotoIcon className="h-4 w-4" />
              마스터 이미지 업로드
              <input type="file" accept="image/*" onChange={handleUploadMasterFile} className="hidden" disabled={selectedMaster.locked} />
            </label>
            {uploadingMasterImage ? (
              <p className="mt-3 text-xs text-slate-500">마스터 업로드 중... {Math.round(masterUploadProgress * 100)}%</p>
            ) : null}
          </div>
        ) : null}

        {null}

        <div className="space-y-5 overflow-y-auto pb-10">
          {!isSpeakerThreadPage ? currentPageTextSlots.map(({ key, zone, thread }) => (
            <section key={key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{zone.name}</p>
                  <p className="text-xs text-slate-500">{inferZoneSlotKey(zone) || zone.id}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">
                  {thread ? `${thread.zoneSequence.length} page` : '비어 있음'}
                </span>
              </div>
              <div className="mb-3 flex gap-2">
                <span className="rounded-full bg-white px-3 py-2 text-xs text-slate-500">
                  {thread ? roleLabel[thread.semanticRole] : ''}
                </span>
                {thread ? (
                  <button
                    type="button"
                    onClick={() => toggleThreadToc(thread.id)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      thread.ebook.toc.enabled ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-600'
                    }`}
                  >
                    TOC {thread.ebook.toc.enabled ? 'ON' : 'OFF'}
                  </button>
                ) : null}
              </div>
              <div className="max-h-44 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {thread ? getThreadPlainText(document, thread.id).trim() || '내용 없음' : '아직 내용 없음'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (thread) {
                      openTextModalForEdit(thread.id);
                    } else {
                      setActiveContentZoneId(zone.id);
                      setTextModalThreadId(null);
                      setTextModalZoneId(zone.id);
                      setTextModalValue('');
                      setShowTextModal(true);
                    }
                  }}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  {thread ? '내용 수정' : '내용 입력'}
                </button>
                {thread ? (
                  <button
                    type="button"
                    onClick={() => {
                      deleteThread(thread.id);
                      showToast('글을 삭제했습니다.', 'success');
                    }}
                    className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {thread ? `${thread.zoneSequence.length} page · ${roleLabel[thread.semanticRole]}` : '빈 슬롯'}
              </p>
            </section>
          )) : null}
          {!isSpeakerThreadPage && !currentPageTextSlots.length ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              현재 페이지 텍스트 슬롯 없음
            </div>
          ) : null}
        </div>
      </aside>

      <main className="flex-1 px-8 py-6">
        {!isSpeakerThreadPage ? (
        <div className="fixed left-1/2 top-24 z-30 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={!selectedPage || selectedPage.pageNumber <= 1}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              이전
            </button>
            <select
              value={selectedPage?.id ?? ''}
              onChange={(event) => selectPage(event.target.value)}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {document.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {(() => {
                    const contribution = document.contributions.find((item) => item.pageId === getChainRootPageId(document, page.id));
                    return contribution ? `${page.pageNumber}p · ${contribution.title}` : `${page.pageNumber}p`;
                  })()}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="p"
              value={pageJumpInput}
              onChange={(event) => setPageJumpInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleJumpToPageNumber();
                }
              }}
              className="w-14 rounded-full border border-slate-200 px-3 py-2 text-center text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={handleJumpToPageNumber}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              이동
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!selectedPage || selectedPage.pageNumber >= document.pages.length}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
        ) : null}
        <div className="editor-toolbar mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">A4 Publishing Editor</p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">{document.meta.title.ko}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Revision {history.revision} · Contributions {document.contributions.length} · Pages {document.pages.length} · {autosave.lastError ? autosave.lastError : autosave.isSaving ? '저장 중' : autosave.lastSavedAt ? '저장 완료' : '편집 중'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            PDF 다운로드
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-auto rounded-[32px] border border-slate-200 bg-[#ece6da] px-6 py-8">
            {isSpeakerThreadPage ? (
              <div className="space-y-8">
                {selectedContributionPages.map((page) => (
                  <PublishingPagePreview
                    key={page.id}
                    page={page}
                    pageIndex={page.pageNumber - 1}
                    templateSelection={templateSelection}
                    setTemplateSelection={setTemplateSelection}
                    mode="interactive"
                    globalFixedManagerMode={globalFixedManagerMode}
                    onTextBlockOpen={handleCanvasTextOpen}
                    onZoneActivate={handleZoneActivate}
                    enableTemplateEditing={false}
                    pageRef={(node) => {
                      pageRefs.current[page.id] = node;
                    }}
                  />
                ))}
              </div>
            ) : selectedPage ? (
              <PublishingPagePreview
                key={selectedPage.id}
                page={selectedPage}
                pageIndex={selectedPage.pageNumber - 1}
                templateSelection={templateSelection}
                setTemplateSelection={setTemplateSelection}
                mode="interactive"
                globalFixedManagerMode={globalFixedManagerMode}
                onTextBlockOpen={handleCanvasTextOpen}
                onZoneActivate={handleZoneActivate}
                enableTemplateEditing={false}
                pageRef={(node) => {
                  pageRefs.current[selectedPage.id] = node;
                }}
              />
            ) : null}
          </section>

          <aside className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 [&_input]:bg-white [&_input]:text-slate-900 [&_select]:bg-white [&_select]:text-slate-900 [&_textarea]:bg-white [&_textarea]:text-slate-900">
            {isSpeakerThreadPage ? (
              <SpeakerContributionPanel
                contributions={document.contributions}
                selectedContribution={selectedContribution}
                presentationTracks={document.meta.presentationTracks ?? []}
                showPresentationTracks={currentSpeakerMasterUsesPresentationTracks}
                pageNumberByContribution={pageNumberByContribution}
                roleLabel={roleLabel}
                onCreateContribution={handleCreateSpeakerContribution}
                onCompleteContribution={handleCompleteContribution}
                onChangePresentationTrack={handlePresentationTrackChange}
                editingSlotKey={editingContributionSlot}
                editingValue={editingContributionValue}
                onSelectContribution={selectPage}
                onMoveContribution={moveContribution}
                onDeleteContribution={(contributionId) => {
                  deleteContribution(contributionId);
                  showToast('발표자 원고를 삭제했습니다.', 'success');
                }}
                onStartEditSlot={handleStartContributionSlotEdit}
                onEditingValueChange={setEditingContributionValue}
                onSaveSlot={handleSaveContributionSlotEdit}
                onCancelSlot={() => {
                  setEditingContributionSlot(null);
                  setEditingContributionValue('');
                }}
              />
            ) : null}
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">{isSpeakerThreadPage ? '발표자 정보' : '페이지 정보'}</p>
              {selectedContribution ? (
                <>
                  <p>발표자 항목: #{selectedContribution.order}</p>
                  <p>발표 트랙: {selectedContributionTrackLabel}</p>
                  <p>발표 번호: {selectedContribution.presentationCode ?? '-'}</p>
                  <p>등록 순서: {selectedContribution.order}</p>
                  <p>원고 슬롯: {selectedContribution.slots.length}</p>
                </>
              ) : null}
              <p>{isSpeakerThreadPage ? '표시 페이지 수' : '현재 페이지'}: {isSpeakerThreadPage ? selectedContributionPages.length : selectedPage?.pageNumber ?? '-'}</p>
              <p>현재 마스터: {pageMaster?.name ?? '-'}</p>
              <p>선택 영역: {selection.zoneId ?? '없음'}</p>
              <p>저장 상태: {autosave.lastError || (autosave.isSaving ? '저장 중' : autosave.dirty ? '수정됨' : '저장됨')}</p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/studio/${publicationId}`;
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                마스터 스튜디오에서 템플릿 수정
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">TOC</p>
              {document.toc.items.length ? (
                <div className="space-y-2">
                  {document.toc.items.map((item) => (
                    <div key={item.id} className={`rounded-xl bg-white px-3 py-2 ${item.level === 2 ? 'ml-4' : ''}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Level {item.level}</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{item.label.ko}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>헤딩을 추가하거나 TOC를 켜면 목차가 생성됩니다.</p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">선택 요소</p>
              {selectedBlock ? (
                <>
                  <p>ID: {selectedBlock.id}</p>
                  <p>Type: {selectedBlock.type}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (selection.pageId && selection.zoneId && selection.blockId) {
                        toggleBlockLock(selection.pageId, selection.zoneId, selection.blockId);
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2"
                  >
                    {selectedBlock.locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
                    {selectedBlock.locked ? '잠금 해제' : '잠금'}
                  </button>

                  {selectedBlock.type === 'image' && selection.pageId && selection.zoneId ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Crop X</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={selectedBlock.crop.originX}
                          onChange={(event) =>
                            updateImageBlock(selection.pageId!, selection.zoneId!, selectedBlock.id, {
                              crop: { ...selectedBlock.crop, originX: Number(event.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Crop Y</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={selectedBlock.crop.originY}
                          onChange={(event) =>
                            updateImageBlock(selection.pageId!, selection.zoneId!, selectedBlock.id, {
                              crop: { ...selectedBlock.crop, originY: Number(event.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Crop Width</label>
                        <input
                          type="range"
                          min="0.2"
                          max="1"
                          step="0.01"
                          value={selectedBlock.crop.width}
                          onChange={(event) =>
                            updateImageBlock(selection.pageId!, selection.zoneId!, selectedBlock.id, {
                              crop: { ...selectedBlock.crop, width: Number(event.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Crop Height</label>
                        <input
                          type="range"
                          min="0.2"
                          max="1"
                          step="0.01"
                          value={selectedBlock.crop.height}
                          onChange={(event) =>
                            updateImageBlock(selection.pageId!, selection.zoneId!, selectedBlock.id, {
                              crop: { ...selectedBlock.crop, height: Number(event.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p>캔버스에서 요소를 선택하세요.</p>
              )}
            </div>

            {null}

            {false && /* eslint-disable-line no-constant-binary-expression */ <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">Publication</p>
              <p>ID: {publicationId}</p>
              <p>Preset: {document.layout.pagePreset.key}</p>
              <p>Master Count: {document.masters.items.length}</p>
              <p>Template Selection: {templateSelection.type ? `${templateSelection.type}:${templateSelection.id}` : 'none'}</p>
              <p>A4 Width: {formatMm(document.layout.pagePreset.widthMm)}</p>
              <p>A4 Height: {formatMm(document.layout.pagePreset.heightMm)}</p>
            </div>}

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">정렬 검증</p>
              <p>Top Left: 0 px / 0 mm</p>
              <p>Top Center: {validationMarkers.topCenter.x.toFixed(1)} px / {formatMm(pxToMm(validationMarkers.topCenter.x, document.layout.pagePreset))}</p>
              <p>Top Right: {validationMarkers.topRight.x.toFixed(1)} px / {formatMm(pxToMm(validationMarkers.topRight.x, document.layout.pagePreset))}</p>
              <p>Bottom Center Y: {validationMarkers.bottomCenter.y.toFixed(1)} px / {formatMm(pxToMm(validationMarkers.bottomCenter.y, document.layout.pagePreset))}</p>
              {validationReport ? (
                <div className="mt-3 space-y-2 rounded-xl bg-white px-3 py-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">편집기 vs PDF 오차</p>
                  <p>
                    Page Width Delta: {validationReport.pageSizeDeltaPx.width.toFixed(3)} px /{' '}
                    {formatMm(pxToMm(validationReport.pageSizeDeltaPx.width, document.layout.pagePreset))}
                  </p>
                  <p>
                    Page Height Delta: {validationReport.pageSizeDeltaPx.height.toFixed(3)} px /{' '}
                    {formatMm(pxToMm(validationReport.pageSizeDeltaPx.height, document.layout.pagePreset))}
                  </p>
                  {Object.entries(validationReport.markerDeltaPx).map(([key, delta]) => (
                    <p key={key}>
                      {key}: x {delta.x.toFixed(3)} px / {formatMm(pxToMm(delta.x, document.layout.pagePreset))}, y {delta.y.toFixed(3)} px /{' '}
                      {formatMm(pxToMm(delta.y, document.layout.pagePreset))}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">마스터 스튜디오에서 가이드를 보고 맞춘 뒤 여기서 PDF를 점검하세요.</p>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3 font-semibold text-slate-800">출력 점검</p>
              {preflightIssues.length ? (
                <div className="space-y-2">
                  {preflightIssues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => jumpToIssue(issue)}
                      className={`block w-full rounded-xl px-3 py-2 text-left text-xs ${
                        issue.severity === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      <span className="mr-2 font-semibold uppercase">{issue.severity}</span>
                      {issue.message}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">이상 없음</p>
              )}
            </div>
          </aside>
        </div>
      </main>

      <div ref={measurementRootRef} aria-hidden="true" />
      {showCreateMasterModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Master Builder</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">새 마스터 생성</h2>
                <p className="mt-2 text-sm text-slate-500">이름과 프리셋 선택</p>
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">마스터 이름</span>
              <input
                value={newMasterName}
                onChange={(event) => setNewMasterName(event.target.value)}
                placeholder="예: 발표집 2단 기본형"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
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
      {showTextModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Text Editor</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{textModalThreadId ? '텍스트 수정' : '텍스트 입력'}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedPage ? `${selectedPage.id} · ${textModalZoneId ?? selectedZoneId}` : '영역 선택 필요'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeTextModal}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              폰트와 정렬은 마스터 설정을 따릅니다.
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">내용</span>
              <textarea
                value={textModalValue}
                onChange={(event) => setTextModalValue(event.target.value)}
                placeholder="본문을 붙여넣거나 입력하세요."
                className="min-h-[280px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeTextModal}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitTextModal}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showImageModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Image Editor</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">이미지 입력</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedPage ? `${selectedPage.id} · ${imageModalZoneId ?? primaryImageZoneId}` : '영역 선택 필요'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImageModal(false);
                  setImageModalZoneId(null);
                }}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              이미지 영역 규칙에 맞춰 배치됩니다.
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">URL</span>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAddImage}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
              >
                URL로 추가
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                <PhotoIcon className="h-4 w-4" />
                파일 업로드
                <input type="file" accept="image/*" onChange={handleUploadFile} className="hidden" />
              </label>
            </div>
            {uploadingImage ? <p className="mt-3 text-xs text-slate-500">업로드 중... {Math.round(uploadProgress * 100)}%</p> : null}
          </div>
        </div>
      ) : null}
      {showPreflightModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Preflight</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">PDF 점검</h2>
                <p className="mt-2 text-sm text-slate-500">항목 확인 후 다운로드</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreflightModal(false)}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {preflightIssues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => {
                    jumpToIssue(issue);
                    setShowPreflightModal(false);
                  }}
                  className={`rounded-2xl px-4 py-3 text-left ${
                    issue.severity === 'error' ? 'bg-rose-50 text-rose-900' : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.15em]">
                    {issue.severity} {issue.pageId ? `· ${issue.pageId}` : ''}
                  </p>
                  <p className="mt-1 text-sm">{issue.message}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreflightModal(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleConfirmPdfDownload}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
              >
                그래도 PDF 다운로드
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-[-99999px] top-0 opacity-0">
        {document.pages.map((page, pageIndex) => (
          <PublishingPagePreview
            key={`pdf-${page.id}`}
            page={page}
            pageIndex={pageIndex}
            templateSelection={{ type: null, id: null }}
            setTemplateSelection={() => undefined}
            mode="export"
            globalFixedManagerMode={false}
            onTextBlockOpen={() => undefined}
            pageRef={(node) => {
              pdfPageRefs.current[page.id] = node;
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default PublishingEditorShell;
