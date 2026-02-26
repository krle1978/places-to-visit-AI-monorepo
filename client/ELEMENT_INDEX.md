# UI Element Locator (App.jsx)

This file is a quick index for finding UI elements in `client/src/App.jsx` and their related logic/styles.

## Fast Search Commands

```powershell
# Markup by ID/class
rg -n 'id="ELEMENT_ID"|className="ELEMENT_CLASS"' client/src/App.jsx

# DOM hooks in logic
rg -n 'getElementById\("ELEMENT_ID"\)|querySelector\(".ELEMENT_CLASS"\)' client/src/App.jsx

# CSS selectors
rg -n '#ELEMENT_ID|\.ELEMENT_CLASS' client/src/App.css
```

## High-Value Element Map

| Element | Markup | Logic hooks | Styles | Notes |
|---|---|---|---|---|
| `#heroGpsBtn` / `.hero-visual-gps` | `App.jsx:2916-2917` | `App.jsx:409`, `App.jsx:1475-1492` | `App.css:491-571` | Fallback logic also checks legacy `#gpsBtn`. |
| `#city-search-input` | `App.jsx:3038` | `App.jsx:411`, `App.jsx:1495-1793`, `App.jsx:1808-1809` | `App.css:917-933` | Enter key triggers city search flow. |
| `#city-search-suggestions` / `.city-search-suggestion*` | `App.jsx:3045-3046`, `App.jsx:3101-3110` | `App.jsx:413`, `App.jsx:1508-1541`, `App.jsx:1619-1630`, `App.jsx:1810-1821` | `App.css:938-964` | Rendered dynamically from search input. |
| `#city-search-btn` | `App.jsx:3077` | `App.jsx:412`, `App.jsx:1495-1506`, `App.jsx:1807` | `App.css:1068-1073` | Uses `img.stateful-btn-image` lock state. |
| `#route-planner-panel` / `.route-planner-panel` | `App.jsx:3189` | `App.jsx:415`, `App.jsx:1959-1967`, `App.jsx:2896` | `App.css:1319-1323` | Panel open/collapse behavior. |
| `#toggle-planner-btn` | (not rendered in current `App.jsx`) | `App.jsx:416-425` | `App.css:1268-1315` | Expected from external include/template. |
| `#route-country`, `#route-city`, `#route-submit` | `App.jsx:3194`, `App.jsx:3199`, `App.jsx:3204` | `App.jsx:428-430`, `App.jsx:1945-1994` | `App.css:1143-1160` | Core route form controls. |
| `#route-error`, `.route-result-wrapper`, `.route-result-title`, `#route-result` | `App.jsx:3221`, `App.jsx:3237-3239` | `App.jsx:431-435` | `App.css:1200-1268` | Error + route output area. |
| `#geo-unknown`, `#geo-unknown-text`, `#geo-make-btn`, `#geo-nearest-btn` | `App.jsx:3222-3230` | `App.jsx:437-440`, `App.jsx:1825-1943` | Search in `App.css` for IDs | Unknown-location recovery actions. |
| `#save-pdf-btn` | `App.jsx:3240` | `App.jsx:436` | `App.css:1315` | PDF export trigger. |
| `#scrollToTopBtn` / `.scroll-top-btn` | `App.jsx:3262` | `App.jsx:2129-2161` | `App.css:1597-1634` | Visibility controlled by scroll listener. |
| `#category-selector`, `#show-map-btn`, `.category` | `App.jsx:3160-3176` | (no direct hook found in `App.jsx`) | `App.css:1079-1098` | UI present; behavior likely handled elsewhere or pending integration. |
| `img.stateful-btn-image` | Multiple buttons | `App.jsx:347-399` | `App.css:213`, `App.css:770`, `App.css:818+` | Shared hover/active/locked image state system. |

## Route Planner API Surface

Look in `App.jsx:1969-2089` for public helpers attached to `window.routePlannerEasy`:

- `selectLocation(country, city, autoSubmit, forceReload)`
- `openPanel()`
- `findNearestFromCityName(cityQuery, preferredCountry)`
- `getGeoCandidates(cityQuery, preferredCountry, limit)`
- `findNearestFromGeoCandidate(candidate, preferredCountry)`
- `findNearestFromUser()`

## Maintenance Rule

When adding a new UI element with an `id` or external DOM hook:

1. Add/confirm markup location in this file.
2. Add logic hook line(s) where `getElementById`/`querySelector` is used.
3. Add CSS selector location.
4. Note if element comes from external include instead of JSX markup.
