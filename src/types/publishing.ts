export type LocaleText = {
  ko: string;
  en?: string;
};

export type PublicationStatus = 'draft' | 'published' | 'archived';
export type PublicationKind = 'proceeding' | 'journal' | 'catalog' | 'report';
export type SourcePublicationType = 'abstract' | 'poster' | 'presentation';
export type PageRole = 'cover' | 'body' | 'toc' | 'section' | 'appendix';
export type ZoneKind = 'text-flow' | 'media-freeform' | 'mixed';
export type DecorationKind = 'text' | 'image' | 'shape';
export type BlockKind = 'text' | 'image';
export type TextRole = 'title' | 'subtitle' | 'heading' | 'subheading' | 'paragraph' | 'caption' | 'quote';
export type ElementScope = 'global-fixed' | 'template-fixed' | 'page-editable';
export type MasterMode = 'speaker-thread' | 'page-freeform';
export type ContributionLanguage = 'ko' | 'en' | 'mixed';
export type ContributionSlotKey =
  | 'track'
  | 'title'
  | 'title_ko'
  | 'title_en'
  | 'authors'
  | 'authors_ko'
  | 'authors_en'
  | 'affiliation'
  | 'affiliation_ko'
  | 'affiliation_en'
  | 'body'
  | 'body_ko'
  | 'body_en'
  | 'captions'
  | 'keywords'
  | 'references'
  | (string & {});

export interface PageFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TypographyStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
}

export interface ZoneConstraints {
  padding: EdgeInsets;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  widowLines?: number;
  orphanLines?: number;
}

export interface PagePreset {
  key: 'A4_VERTICAL';
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  bleedMm: number;
  safeMarginPx: EdgeInsets;
}

export interface PageNumberingConfig {
  enabled: boolean;
  startAt: number;
  showOnCover: boolean;
  alignmentPreset: 'left' | 'center' | 'right';
  mirrorOnEvenPages: boolean;
}

export interface PrintGuideConfig {
  showSafeArea: boolean;
  showCenterLine: boolean;
  showContentBounds: boolean;
  showValidationMarks: boolean;
  alignmentWarningThresholdPx: number;
}

export interface DecorationElement {
  id: string;
  type: DecorationKind;
  locked: boolean;
  scope: ElementScope;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: 'rect' | 'line' | 'ellipse';
  fill?: string;
  assetId?: string;
  src?: string;
  storagePath?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  textBinding?: 'page.number' | 'document.title' | 'section.number' | 'presentation.code';
  text?: string;
  style?: Partial<TypographyStyle>;
}

export interface ContentZoneTemplate {
  id: string;
  name: string;
  slotKey?: string;
  kind: ZoneKind;
  locked: boolean;
  scope: ElementScope;
  allowOverflowSource: boolean;
  flowGroupId?: string;
  flowOrder?: number;
  allowThreadContinuation?: boolean;
  frame: PageFrame;
  style: TypographyStyle;
  constraints: ZoneConstraints;
}

export interface MasterTemplate {
  id: string;
  name: string;
  scope: 'global' | 'page';
  mode?: MasterMode;
  usesPresentationTracks?: boolean;
  locked: boolean;
  background: {
    fill: string;
    image?: string | null;
  };
  decorations: DecorationElement[];
  contentZones: ContentZoneTemplate[];
  slotSchema?: ContributionSlotDefinition[];
}

export interface ContributionSlotDefinition {
  slotKey: ContributionSlotKey;
  label: string;
  role: TextRole;
  language?: ContributionLanguage;
  required?: boolean;
  allowOverflow?: boolean;
}

export interface TextMarkSet {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface TextRun {
  text: string;
  marks?: TextMarkSet;
}

export interface TocLink {
  enabled: boolean;
  tocId?: string;
  level?: number;
  label?: LocaleText;
}

export interface EbookBlockConfig {
  include: boolean;
  toc: TocLink;
  readingWidth?: 'body' | 'full';
}

export interface TextFlowLink {
  sourceThreadId: string;
  segmentIndex: number;
  isContinuation: boolean;
  isTerminal: boolean;
}

export interface TextBlockNode {
  id: string;
  type: 'text';
  semanticRole: TextRole;
  locked: boolean;
  scope: ElementScope;
  visible: boolean;
  flow: TextFlowLink;
  content: {
    runs: TextRun[];
  };
  styleOverride?: Partial<TypographyStyle>;
  ebook: EbookBlockConfig;
}

export interface MediaPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
}

export interface MediaCrop {
  mode: 'rect';
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface ImageBlockNode {
  id: string;
  type: 'image';
  semanticRole: 'figure' | 'cover-image' | 'inline-image';
  locked: boolean;
  scope: ElementScope;
  visible: boolean;
  placement: MediaPlacement;
  crop: MediaCrop;
  assetRef: {
    assetId: string;
    src: string;
    naturalWidth: number;
    naturalHeight: number;
  };
  caption?: LocaleText;
  alt?: LocaleText;
  ebook: EbookBlockConfig;
}

export type PageBlock = TextBlockNode | ImageBlockNode;

export interface PageZoneInstance {
  zoneId: string;
  blocks: PageBlock[];
}

export interface PageOverrideSet {
  background?: {
    fill: string;
    image?: string | null;
  } | null;
  decorations?: DecorationElement[];
  contentZones?: ContentZoneTemplate[];
}

export interface PublicationPage {
  id: string;
  pageNumber: number;
  masterId: string;
  pageRole: PageRole;
  derivedFrom?: {
    previousPageId: string;
    reason: 'auto-pagination' | 'manual-duplicate';
  };
  overrides?: PageOverrideSet;
  zones: PageZoneInstance[];
}

export interface TextThread {
  id: string;
  type: 'text-flow';
  canonicalText: TextRun[];
  semanticRole: TextRole;
  styleOverride?: Partial<TypographyStyle>;
  ebook: EbookBlockConfig;
  originBlockId: string;
  sourceZoneId: string;
  sourcePageId: string;
  zoneSequence: Array<{
    pageId: string;
    zoneId: string;
  }>;
}

export interface ContributionSlotContent {
  slotKey: ContributionSlotKey;
  label: string;
  text: string;
  role: TextRole;
  language?: ContributionLanguage;
}

export type PresentationTrackKind = 'oral' | 'poster';

export interface PresentationTrackOption {
  id: string;
  kind: PresentationTrackKind;
  prefix: string;
  label: string;
  glmHints?: string[];
}

export interface ContributionItem {
  id: string;
  order: number;
  masterId: string;
  pageId: string;
  status?: 'draft' | 'completed';
  title: string;
  track?: string;
  presentationTrackId?: string;
  presentationCode?: string;
  sourceFileName?: string;
  createdAt: string;
  updatedAt: string;
  slots: ContributionSlotContent[];
}

export interface TocItemNode {
  id: string;
  label: LocaleText;
  level: number;
  source: {
    pageId: string;
    blockId: string;
    threadId?: string;
  };
  ebookAnchor: string;
}

export interface AssetItem {
  id: string;
  type: 'image';
  src: string;
  storagePath?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface HistoryEntry {
  revision: number;
  label: string;
  timestamp: string;
  document: PublishingDocument;
}

export interface AutosaveState {
  dirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  lastError: string | null;
  pendingRevision: number | null;
}

export interface PaginationState {
  invalidatedThreadIds: string[];
  isPaginating: boolean;
  lastPaginatedAt: string | null;
}

export interface PublishingDocument {
  id: string;
  version: number;
  meta: {
    title: LocaleText;
    publicationType: PublicationKind;
    sourcePublicationType?: SourcePublicationType;
    status: PublicationStatus;
    locale: string;
    createdAt: string;
    updatedAt: string;
    presentationTracks?: PresentationTrackOption[];
  };
  layout: {
    pagePreset: PagePreset;
    pageNumbering: PageNumberingConfig;
    printGuides: PrintGuideConfig;
  };
  masters: {
    defaultMasterId: string;
    items: MasterTemplate[];
  };
  pages: PublicationPage[];
  threads: TextThread[];
  contributions: ContributionItem[];
  toc: {
    items: TocItemNode[];
  };
  assets: AssetItem[];
}

export interface PublishingEditorState {
  document: PublishingDocument;
  selection: {
    pageId: string | null;
    zoneId: string | null;
    blockId: string | null;
  };
  history: {
    revision: number;
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
  };
  autosave: AutosaveState;
  pagination: PaginationState;
}
