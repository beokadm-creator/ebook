# Store/state-management analysis - results

- Publishing store (src/stores/publishingStore.ts): central hub; heavy usage; race conditions minimal; potential improvements: add reset on logout; ensure deep immutability of document; ensure error handling around async save; and validate input types.
- Branding store (src/stores/brandingStore.ts): CSS variable application via DOM; ensure guard for SSR; ensure remove on logout; consider moving CSS var application to effect when branding changes.
- Viewer store (src/stores/viewerStore.ts): localStorage sync; classic pattern; consider error handling around storage in privacy modes.
- i18n store (src/stores/i18nStore.ts): potential bug in onRehydrateStorage signature; consider simplifying to onRehydrateStorage: (state) => { if(state) { state.t = translations[state.language] } }; translation object updated on language change via subscribe; verify compatibility with zustand version.
- Personalization store (src/stores/personalizationStore.ts): persistence via localStorage; consider data retention/per-user keying; missing per-user cleanup on logout.
- Auth context (src/contexts/AuthContext.tsx): lacks error handling in signIn and signOut; consider try/catch and user feedback; auto-admin creation on first login security risk.
- useReadingProgress (src/hooks/useReadingProgress.ts): reads/writes to local storage; potential limitation in privacy modes; consider quota guarding.
- useTheme (src/hooks/useTheme.ts): simple; good; ensure consistent naming across theme toggles.
- usePWA (src/hooks/usePWA.ts): standard; nothing critical; ensure service worker updates.

- General observations: several modules rely on localStorage without guards; consider wrapper to safely access localStorage in SSR or privacy mode; consider centralizing error handling/logging for store actions.
