import {
  createCoverZone,
  createCoverPresetDecorations,
  createMainBodyZone,
  createPosterSummaryZones,
  createPresentationTwoColumnZones,
  createSectionLeadPresetDecorations,
  createSectionLeadZones,
  createTwoColumnZones,
} from '@/lib/publishing/defaultDocument';
import { MasterTemplate } from '@/types/publishing';

export type TemplatePresetKey =
  | 'blank'
  | 'cover'
  | 'section-lead'
  | 'single-column'
  | 'two-column'
  | 'poster-summary'
  | 'presentation-two-column';

export const TEMPLATE_PRESET_LABELS: Record<TemplatePresetKey, string> = {
  blank: '빈 템플릿',
  cover: '표지',
  'section-lead': '섹션',
  'single-column': '1단',
  'two-column': '2단',
  'poster-summary': '포스터',
  'presentation-two-column': '발표 2단',
};

export const TEMPLATE_PRESET_DESCRIPTIONS: Record<TemplatePresetKey, string> = {
  blank: '처음부터 구성',
  cover: '표지',
  'section-lead': '섹션 시작',
  'single-column': '기본 1단',
  'two-column': '기본 2단',
  'poster-summary': '포스터용',
  'presentation-two-column': '발표용 2단',
};

export const applyPresetToMaster = (master: MasterTemplate, preset: TemplatePresetKey) => {
  const globalFixedDecorations = master.decorations.filter((decoration) => decoration.scope === 'global-fixed');

  switch (preset) {
    case 'blank':
      master.contentZones = [];
      master.decorations = globalFixedDecorations;
      break;
    case 'cover':
      master.contentZones = [createCoverZone()];
      master.decorations = [...globalFixedDecorations, ...createCoverPresetDecorations()];
      break;
    case 'section-lead':
      master.contentZones = createSectionLeadZones();
      master.decorations = [...globalFixedDecorations, ...createSectionLeadPresetDecorations()];
      break;
    case 'single-column':
      master.contentZones = [createMainBodyZone()];
      master.decorations = globalFixedDecorations;
      break;
    case 'two-column':
      master.contentZones = createTwoColumnZones();
      master.decorations = globalFixedDecorations;
      break;
    case 'poster-summary':
      master.contentZones = createPosterSummaryZones();
      master.decorations = globalFixedDecorations;
      break;
    case 'presentation-two-column':
      master.contentZones = createPresentationTwoColumnZones();
      master.decorations = globalFixedDecorations;
      break;
  }

  return master;
};
