import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; a component that reads prefers-reduced-motion needs
// it. This file also loads in the node test environment, hence the guard.
if (typeof window !== 'undefined') {
  window.matchMedia ??= (media: string) => ({ matches: false, media } as MediaQueryList);
}
