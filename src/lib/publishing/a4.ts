import { PagePreset } from '@/types/publishing';

export const getPxPerMm = (preset: PagePreset) => preset.widthPx / preset.widthMm;

export const pxToMm = (px: number, preset: PagePreset) => px / getPxPerMm(preset);

export const mmToPx = (mm: number, preset: PagePreset) => mm * getPxPerMm(preset);

export const formatMm = (value: number) => `${value.toFixed(1)} mm`;
