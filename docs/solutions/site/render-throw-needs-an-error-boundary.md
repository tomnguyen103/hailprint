---
title: A render throw in a page body needs an error boundary
category: site
trigger: a page shows a blank screen after a throw during render, with no error state and no top bar
---

## Problem

A throw during render in any page body left a blank page. The site had no error boundary, so Preact unmounted the whole tree, the top bar included.

## Fix

- `AreaBoundary` in `site/src/shell/area-boundary.tsx` wraps the page body inside `Layout`. A render throw shows `ErrorState` under the top bar. Retry, or a new route path, renders the page again.
- Tests: `site/src/shell/area-boundary.test.tsx` covers the boundary. `site/src/app.test.tsx` proves that `App` mounts the boundary with the path as its `resetKey`. `key={path}` stays rejected because the time slider changes the path on each step, and a key would remount the area.

## Known limits

- The error state shows once with stale content after a route change, before the new path clears it.
- A thrown `undefined` is not caught, because Preact passes no error value to the boundary.
