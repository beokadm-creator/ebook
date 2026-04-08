import { TemplatePresetKey } from '@/lib/publishing/templatePresets';
import { PublishingDocument, SourcePublicationType } from '@/types/publishing';

export const getRecommendedPreset = (
  sourceType?: SourcePublicationType,
  publicationKind?: PublishingDocument['meta']['publicationType'],
): TemplatePresetKey => {
  if (sourceType === 'poster') {
    return 'poster-summary';
  }

  if (sourceType === 'presentation') {
    return 'two-column';
  }

  if (publicationKind === 'journal') {
    return 'two-column';
  }

  return 'single-column';
};
