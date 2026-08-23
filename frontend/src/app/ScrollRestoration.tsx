import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// SPA scroll-restoration: a real distinct-URL page always starts scrolled to
// its top on Back/Forward (and on any other navigation to it) — an SPA has
// to reproduce that itself, since swapping components in place doesn't reset
// scroll position the way a real page load does (frontend/web skill).
// Skipped when the new location carries a hash: that's an anchor link (see
// Home.tsx's create/join forms), which scrolls to a specific element
// instead — not a "go to the top of a new page" navigation.
export function ScrollRestoration() {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (location.hash) return;
    if (location.pathname === previousPathnameRef.current) return;
    previousPathnameRef.current = location.pathname;
    window.scrollTo(0, 0);
    document.querySelector("ix-content")?.scrollTo(0, 0);
  }, [location]);

  return null;
}
