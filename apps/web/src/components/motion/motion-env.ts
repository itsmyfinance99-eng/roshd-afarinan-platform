/** Motion environment checks shared by the motion islands (reference: prototype/motion.js). */

/** True when the root layout enabled motion (no reduced-motion preference, JS running). */
export function motionEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return document.documentElement.classList.contains('ra-motion');
}

/** Small screens, touch, data saver or ≤ 2 cores get the static variants of heavy effects. */
export function isLowPower(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return (
    window.innerWidth < 768 ||
    window.matchMedia('(pointer: coarse)').matches ||
    Boolean(nav.connection?.saveData) ||
    (nav.hardwareConcurrency || 8) <= 2
  );
}

/**
 * Inline script for <head>: enables motion before first paint so revealed elements start
 * hidden instead of flashing, and covers the home page until the intro takes over (first
 * visit in the session), and hides a demo pill the visitor already dismissed. If the engine has not booted after 5s, both are switched off again
 * so content can never stay invisible.
 */
export const MOTION_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;try{if(sessionStorage.getItem('ra-pill-closed')==='1')d.classList.add('ra-pill-closed')}catch(e){}if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('ra-motion');try{if(location.pathname==='/'&&sessionStorage.getItem('ra-intro-seen')!=='1')d.classList.add('ra-intro')}catch(e){}setTimeout(function(){if(!window.__raFX)d.classList.remove('ra-motion','ra-intro')},5000)}catch(e){}})();`;
