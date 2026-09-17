import { useEffect, useState } from 'react';

/**
 * The small viewport height (100svh): the visible height with mobile browser
 * chrome expanded, which is the state at scroll position zero — exactly when
 * above-the-fold placement matters. Using it instead of `window.innerHeight`
 * keeps the value stable while scrolling collapses the URL bar.
 *
 * Copied from apps/web `features/game-frame/use-available-game-height.ts`.
 */
function measureSmallViewportHeight(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;height:100svh;width:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const height = probe.offsetHeight;
  probe.remove();
  return height > 0 ? height : window.innerHeight;
}

/**
 * Fixed overlays pinned to the screen bottom (the mobile footer nav) cover the
 * lower edge of the viewport, so the visible bottom for game content is their
 * top edge, not 100svh. Hidden overlays (e.g. `sm:hidden` at desktop widths)
 * measure zero.
 */
function measureBottomOverlayHeight(): number {
  let height = 0;
  for (const overlay of document.querySelectorAll('[data-viewport-bottom-overlay]')) {
    height = Math.max(height, overlay.getBoundingClientRect().height);
  }
  return height;
}

/**
 * Pixels between the element's top edge (in document coordinates) and the
 * bottom of the visible viewport not covered by fixed bottom overlays, at
 * scroll position zero — how much of the game is on screen before the user
 * scrolls. Pushed to games as `ui.viewport.availableHeight` so they can place
 * their primary action at the screen edge.
 *
 * Wide game frames are capped at a 3:2 aspect of their width, so the hint is
 * clamped to that cap too — otherwise games would size themselves into the
 * viewport space below the frame (occupied by the description panel) and
 * scroll internally. The gate and the cap mirror the frame's CSS container
 * query exactly: active from `@min-[1024px]` of the frame's own width (so
 * opening the sidebar, which narrows the frame without a window resize, stays
 * consistent), with the cap at 2/3 of the frame's outer width minus its
 * border, floored so subpixel rounding can never leave the game a fraction
 * taller than the iframe.
 */
const capMinFrameWidth = 1024;

function measureFrameAspectCap(element: HTMLElement): number {
  const frame = element.parentElement;
  if (!frame) return Infinity;
  const frameWidth = frame.getBoundingClientRect().width;
  if (frameWidth < capMinFrameWidth) return Infinity;
  // Not offsetHeight - clientHeight: those round to integers independently,
  // so at fractional browser zoom their difference flips between adjacent
  // values as the frame's subpixel position changes.
  const style = getComputedStyle(frame);
  const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  return Math.floor((frameWidth * 2) / 3 - borderHeight);
}

export function useAvailableGameHeight(element: HTMLElement | null): number | undefined {
  const [availableHeight, setAvailableHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!element) return;

    let animationFrame = 0;
    const update = () => {
      // In fullscreen the game owns the whole screen, so the aspect cap and
      // the top-offset math don't apply — the hint is simply the screen height.
      if (document.fullscreenElement === element) {
        const next = measureSmallViewportHeight();
        setAvailableHeight(current => (current === next ? current : next));
        return;
      }
      // The page scrolls inside <main>, not the window, so add every ancestor's
      // scroll offset to get the top edge at scroll position zero.
      let topInDocument = element.getBoundingClientRect().top + window.scrollY;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        topInDocument += parent.scrollTop;
      }
      const next = Math.max(
        0,
        Math.round(
          Math.min(
            measureSmallViewportHeight() - measureBottomOverlayHeight() - topInDocument,
            measureFrameAspectCap(element),
          ),
        ),
      );
      // The hint resizes the game shell, which resizes the frame this hook
      // observes; at fractional zoom the rounded measurement can flip by a
      // pixel on each pass, so sub-2px changes are ignored to keep the loop
      // from oscillating.
      setAvailableHeight(current =>
        current !== undefined && Math.abs(next - current) <= 2 ? current : next,
      );
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(update);
    };

    update();
    // The frame narrows when the sidebar opens without any window resize, so
    // observe the iframe itself to re-derive the cap from the new width.
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    window.addEventListener('resize', scheduleUpdate);
    document.addEventListener('fullscreenchange', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('fullscreenchange', scheduleUpdate);
    };
  }, [element]);

  return availableHeight;
}
