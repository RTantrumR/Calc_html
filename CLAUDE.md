# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Ukrainian-language web application providing HR and accounting calculators, primarily focused on work time calculations according to Ukrainian labor law (КЗпП). The application is built with vanilla JavaScript (ES6 modules) and includes:

1. **Work Time Norm Calculator** (`calculator.html`) - Calculates working hours, holidays, and shortened days
2. **Salary Calculator** (`calc_zp.html`) - Calculates employer costs from net salary
3. **Business Reference Section** (`docs.html`) - Documents, inflation data, and legal references
4. **News Aggregator** (`buhgalterski-novyny.html`) - Aggregates accounting/HR news from Ukrainian sources

## Core Architecture

### Module Structure

The application uses ES6 modules with the following key files:

- **`main.js`** - Main entry point handling:
  - Theme switching system with localStorage persistence
  - Modal windows for document displays (inflation tables, legal data)
  - PDF generation with theming support (uses jsPDF + html2canvas)
  - Flyout navigation menu
  - Firebase analytics integration
  - Complex chart rendering for inflation data (SVG-based)

- **`work_time.js`** - Core business logic for work time calculations:
  - Holiday management with adjustment logic (moves holidays to working days)
  - Pre-holiday shortened day calculations
  - Supports custom weekly schedules
  - Exports: `loadHolidays()`, `calculateSummary(year, selected, dailyHours, ignoreHolidays)`

- **`script.js`** - News aggregator logic:
  - Fetches from backend API at `https://95.67.113.226:5001/api/news/`
  - Pagination with load-more functionality
  - Multi-site filtering, date range filtering, type filtering
  - Custom date parser supporting multiple formats (DD.MM.YYYY, DD-MM-YYYY, DDMMYYYY, etc.)

### Data Files

- **`data/holidays.json`** - Ukrainian public holidays by year, includes "turned_off" section for wartime suspended holidays
- **`data/firebase-config.js`** - Firebase configuration for anonymous analytics
- **`data/font-data.js`** - Base64-encoded font for PDF generation (Cyrillic support)
- **`iif_data.json`** - Inflation index data (monthly consumer price indices)
- **`VS.json`** - Martial law period data (dates and legal foundations)
- **`documents.json`** - Document categories and references

## Key Features & Implementation Details

### Work Time Calculator (`calculator.html`)

**Validation Logic** (main.js:30-74):
- Validates hours are 0-24 per day
- Total weekly hours must be ≥5
- Pre-holiday hour reductions only apply if total ≥40 hrs/week OR ≥2 days with 8+ hours
- Shows tooltip when pre-holiday rules don't apply

**Holiday Adjustment** (work_time.js:35-59):
- If a holiday falls on a non-working day (per custom schedule), it moves to the next available working day
- Adjusted holidays are used for calculations but original dates are displayed

**PDF Generation** (main.js:254-503):
- Custom landscape format: 297mm × 160mm
- Supports theme colors or default white background (checkbox toggle)
- Embeds Ukrainian Cyrillic font from base64
- Includes company logo if available
- Shows weekly schedule in subtitle

### Theme System (main.js:624-707)

Six built-in themes + one secret theme unlocked by clicking flyout nav 25+ times:
- Light variants: `light`, `pastel-pink`, `light-green`
- Dark variants: `dark`, `dark-purple`, `dark-bordeaux`
- Secret: `psychedelic-rainbow` (shows Nyan Cat animation)

Theme state stored in `localStorage` with dynamic button width adjustment based on theme name length.

### Inflation Data Visualization (main.js:1090-1300)

Two chart types:
1. **Monthly Index Chart** - Fixed Y-axis range (95-110) showing month-to-month inflation
2. **Cumulative Chart** - Dynamic Y-axis showing accumulated price changes from base 100

Both use SVG rendering with interactive tooltips. Click year cells in the table to toggle charts.

### News Aggregator Backend Integration (script.js:125-168)

API endpoint: `https://95.67.113.226:5001/api/news/{dataSource}`

Query parameters:
- `search` - Full-text search
- `sites` - Comma-separated site names
- `start_date`, `end_date` - YYYY-MM-DD format
- `types` - Article types (С=Стаття, Н=Новина)
- `sort_by`, `sort_order` - Sorting options
- `limit`, `offset` - Pagination (150 items per page)

Site logos mapped in `script.js:38-51` with fallback to placeholder.

## Common Development Commands

There are no build steps. This is a static site served directly. For local development:

1. Serve the files with any static server (e.g., `python -m http.server` or VS Code Live Server)
2. Edit HTML/JS/CSS files directly
3. Test in browser
4. Commit changes to git

## Important Notes

### Holiday Data Updates
When Ukrainian legislation changes holidays (happens frequently during wartime), update `data/holidays.json`. The "turned_off" array contains holidays suspended during martial law.

### Firebase Analytics
The app tracks two events via Firebase Realtime Database:
- `calculations` - When "Розрахувати" button is clicked (increments only on parameter change)
- `downloads` - When PDF is downloaded

Counter logic in `main.js:114-120` and `main.js:255-256`.

### PDF Theme Colors
PDF theme colors are read from CSS custom properties (main.js:212-229):
- `--page-bg`, `--pdf-text-color`, `--header-bg`, `--header-text`
- `--grid-color`, `--pdf-cell-bg`, `--pdf-link-color`

### Row Highlighting Feature
In the results table, click the arrow (◄) before any row label to highlight that row for easier reading (main.js:1013-1020).

### Date Input Flexibility
The news aggregator accepts dates in multiple formats and auto-converts them. Calendar picker is triggered via icon click, not by clicking the input field (script.js:263-290).

## Legal Compliance References

The salary calculator includes tooltips with links to Ukrainian Tax Code articles:
- ПДФО: [Article 167.1 of Tax Code](https://zakon.rada.gov.ua/laws/show/2755-17#n3851)
- Military Tax: [Section 16-1 of Tax Code](https://zakon.rada.gov.ua/laws/show/2755-17#n11110)
- ЄСВ: [Law on Unified Social Contribution](https://zakon.rada.gov.ua/laws/show/2464-17)

Work time calculations follow КЗпП (Labor Code of Ukraine) standards with last update noted in calculator.html:99.
