import { create } from 'zustand';
import { ConferenceBranding } from '@/types/content';

interface BrandingState {
  branding: ConferenceBranding | null;
  setBranding: (branding: ConferenceBranding) => void;
  clearBranding: () => void;
  applyCSSVariables: (branding: ConferenceBranding) => void;
  removeCSSVariables: () => void;
}

const DEFAULT_BRANDING: ConferenceBranding = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
};

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: null,

  setBranding: (branding) => {
    set({ branding });
    
    // 브랜딩 설정이 없으면 기본값 사용
    const brandingToApply = {
      ...DEFAULT_BRANDING,
      ...branding,
    };
    
    // CSS 변수 동적 적용
    useBrandingStore.getState().applyCSSVariables(brandingToApply);
  },

  clearBranding: () => {
    set({ branding: null });
    useBrandingStore.getState().removeCSSVariables();
  },

  applyCSSVariables: (branding) => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    
    if (branding.primaryColor) {
      root.style.setProperty('--brand-primary', branding.primaryColor);
      root.style.setProperty('--brand-primary-light', `${branding.primaryColor}15`);
      root.style.setProperty('--brand-primary-hover', `${branding.primaryColor}dd`);
    }
    
    if (branding.secondaryColor) {
      root.style.setProperty('--brand-secondary', branding.secondaryColor);
      root.style.setProperty('--brand-secondary-light', `${branding.secondaryColor}15`);
    }
  },

  removeCSSVariables: () => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-primary-light');
    root.style.removeProperty('--brand-primary-hover');
    root.style.removeProperty('--brand-secondary');
    root.style.removeProperty('--brand-secondary-light');
  },
}));