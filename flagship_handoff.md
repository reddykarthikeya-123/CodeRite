# Bug Report: Scrollbar Issues - Home Page & Results Page

**Date:** March 24, 2026
**Application:** Inspectra AI Document Review
**Severity:** Medium (UI/UX Polish)
**Component:** Frontend Layout & Scrolling

---

## 1. Bug Summary

### Issue #1: Home Page Has Unwanted Scrollbars

**Current Behavior:**
- Home page (upload view) displays BOTH vertical AND horizontal scrollbars
- Content should fit within viewport without requiring any scrolling
- Scrollbars appear when they should not be present at all

**Expected Behavior:**
- Home page should have NO scrollbars (neither vertical nor horizontal)
- All content should be contained within the viewport
- No scrolling should be required on the home/upload view

---

### Issue #2: Results Page - Horizontal Scrollbar Present

**Current Behavior:**
- Results page displays a horizontal scrollbar in addition to the vertical scrollbar
- Horizontal overflow is not controlled/hidden
- Some content may be causing the page width to exceed viewport

**Expected Behavior:**
- Results page should display ONLY a vertical scrollbar
- Vertical scrollbar should be positioned on the far right edge of the viewport
- NO horizontal scrollbar should appear
- Horizontal overflow should be hidden/controlled entirely

---

### Issue #3: Results Page - Vertical Scrollbar Mispositioned (Original Issue)

**Current Behavior:**
- Vertical scrollbar appears in the middle of the page between the header and main content area
- Scrollbar is aligned with the `<main>` element's right edge instead of the viewport edge
- Appears to be attached to the `<main>` container rather than the browser window

**Expected Behavior:**
- Vertical scrollbar should be positioned on the far right edge of the browser viewport
- Should be a page-level (window) scrollbar, not a container-level scrollbar
- Consistent with standard web application scrolling behavior

---

### Trigger Conditions

**Issue #1 (Home Page Scrollbars):**
- Navigate to the application home page
- View the upload interface before selecting a file
- Scrollbars appear when content should fit within viewport

**Issue #2 (Horizontal Scrollbar):**
- Upload a document for analysis
- Wait for analysis to complete
- Results page displays horizontal scrollbar

**Issue #3 (Vertical Scrollbar Position):**
- Upload a document for audit analysis
- Wait for analysis completes
- Results content exceeds viewport height
- Scrollbar appears mispositioned in middle of layout

---

### Error Messages
None (visual/layout issues, no console errors)

---

## 2. Technical Context

### Application Structure
- **Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS v4
- **Layout Pattern:** Flexbox with sticky header

### Files to Investigate

1. **`frontend/src/App.tsx`** - Main layout, conditional classes for home page vs results
   - Line 196-202: Root div with conditional `home-page-no-scroll` class
   - Line 226-237: Main element with overflow handling
   - Check for sources of horizontal overflow (wide content, margins, padding)

2. **`frontend/src/index.css`** - Global overflow and scrollbar styles
   - Global `html, body` overflow settings
   - `.home-page-no-scroll` class definition
   - Custom scrollbar styling

3. **Potential Horizontal Overflow Sources:**
   - Wide content elements exceeding container width
   - Negative margins or excessive padding
   - Fixed-width elements that don't respond to viewport constraints
   - Modal or dropdown elements extending beyond viewport

### File: `frontend/src/App.tsx` (Relevant Sections)

**Lines 1-50 (Imports and State):**
```tsx
import { useState, useEffect, useRef } from 'react';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { ReviewResult } from './components/ReviewResult';
import { CodeResult, type CodeAnalysisResponse } from './components/CodeResult';
import { Modal } from './components/Modal';
import { ChecklistFilterModal } from './components/ChecklistFilterModal';
import { analyzeDocument, analyzeCode, fetchChecklistCategories, fetchChecklistItems, type ReviewResponse } from './api';
import { Loader2, Settings, ArrowLeft, ListChecks, Upload, FileText, UploadCloud, FileCode2, Code2, Trash2, X, AlertTriangle, FileUp, HelpCircle, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [docReviewResult, setDocReviewResult] = useState<ReviewResponse | null>(null);
  const [codeReviewResult, setCodeReviewResult] = useState<CodeAnalysisResponse | null>(null);
  const [currentFile, setCurrentFile] = useState<{ content: string, filename: string } | null>(null);
  const [rawCodeFiles, setRawCodeFiles] = useState<{ filename: string, content: string }[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [appMode, setAppMode] = useState<'document' | 'code'>('document');
  // ... additional state
```

**Lines 196-202 (Root Div with Conditional Class):**
```tsx
  return (
    <div className={`flex flex-col h-screen bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9] text-slate-900 font-sans selection:bg-[#1E40AF]/10 selection:text-[#1E40AF] ${
      !currentFile && !uploading && !docReviewResult && !codeReviewResult ? 'home-page-no-scroll' : ''
    }`}>
```

**Lines 204-224 (Header - Correct, No Changes Needed):**
```tsx
      {/* Header with consistent padding and height */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 transition-all h-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ritelogo.png" alt="RITE Logo" className="w-12 h-12 object-contain" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Inspectra AI
            </h1>
          </div>
          {/* ... settings button */}
        </div>
      </header>
```

**Lines 226-237 (Main Element - PROBLEMATIC):**
```tsx
      <main className={`max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12 flex-1 flex flex-col ${
        !currentFile && !uploading && !docReviewResult && !codeReviewResult ? 'justify-center' : 'justify-start overflow-y-auto'
      }`}>
```

**Lines 426-450 (Results Display Section):**
```tsx
          {docReviewResult && (
            <motion.div
              key="doc-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Audit Report</h2>
                  <p className="text-slate-500 mt-1">Evaluating <span className="font-semibold text-slate-700">{currentFile?.filename}</span></p>
                </div>
                <button onClick={resetState} /* ... */>
                  <ArrowLeft className="w-4 h-4" />
                  Review Another Document
                </button>
              </div>
              <ReviewResult result={docReviewResult} />
            </motion.div>
          )}
```

### File: `frontend/src/index.css` (Global Styles)

```css
@import "tailwindcss";

/* Brand Color CSS Variables */
:root {
  /* Primary Brand Colors */
  --brand-primary-royal: #1E40AF;
  --brand-primary-deep: #1E3A8A;
  --brand-primary-bright: #3B82F6;
  /* ... additional variables */
}

html, body {
  overflow-y: auto;
  height: 100vh;
  width: 100vw;
}

body {
  background-color: var(--neutral-50);
}

/* Hide scrollbar on home page upload view */
.home-page-no-scroll {
  overflow: hidden !important;
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
/* ... additional scrollbar styles */
```

### File: `frontend/src/components/ReviewResult.tsx` (Results Component)

*This component renders the audit results and is the content that overflows. No changes needed here, but included for context.*

The component contains:
- Score card with animated compliance score
- Filterable checklist items grouped by section
- Suggestions section
- Rewritten content expander

All content is properly structured but can exceed viewport height, triggering the scrollbar issue.

---

## 3. Observations

### Layout Structure
- `<div>` wrapper has `h-screen` (full viewport height)
- `<header>` has fixed height (`h-20`) with `sticky` positioning
- `<main>` has `flex-1` to fill remaining space
- When `<main>` has `overflow-y-auto`, it becomes an independent scroll container within the flex layout

### Container Constraints
- `max-w-7xl` on `<main>` constrains width but not height
- `py-12` adds vertical padding
- Content inside `<main>` (ReviewResult component) can exceed available height
- `overflow-y-auto` triggers internal scrolling instead of viewport scrolling

### Home Page Scrollbar Issue
- `home-page-no-scroll` class applies `overflow: hidden !important`
- Class is conditionally applied when: `!currentFile && !uploading && !docReviewResult && !codeReviewResult`
- Despite this class, both vertical and horizontal scrollbars still appear
- Possible causes:
  - Class not being applied correctly
  - Overflow coming from child elements overriding parent styles
  - Content exceeding viewport dimensions

### Horizontal Overflow Sources (To Investigate)
- Wide content elements (tables, code blocks, long text)
- Negative margins pushing content beyond viewport
- Fixed-width elements not responding to container constraints
- Modal, dropdown, or tooltip elements extending beyond bounds
- Padding/margin calculations causing total width > 100%

### Current Scrolling Behavior
```
Viewport (scrollable)
└── #root (100% height)
    └── App div (h-screen)
        ├── header (fixed, sticky)
        └── main (overflow-y-auto) ← Scrollbar appears here
            └── ReviewResult content (overflows)
```

### Desired Scrolling Behavior
```
Viewport (scrollable) ← Scrollbar should be here
└── #root (100% height)
    └── App div (h-screen)
        ├── header (fixed, sticky)
        └── main (no overflow constraint)
            └── ReviewResult content (overflows to viewport)
```

### Home Page - Desired Behavior
```
Viewport (NOT scrollable)
└── #root (100% height)
    └── App div (h-screen, home-page-no-scroll)
        ├── header (fixed)
        └── main (content fits within viewport)
            └── Upload view (no overflow)
```

---

## 4. Testing Steps

### Prerequisites
- Backend server running
- Frontend dev server running
- At least one checklist category configured

### Test Case 1: Home Page - No Scrollbars

1. Navigate to the application home page (before uploading any file)
2. **Verify:** NO vertical scrollbar appears
3. **Verify:** NO horizontal scrollbar appears
4. **Verify:** All content fits within viewport
5. **Verify:** `home-page-no-scroll` class is applied to root div

### Test Case 2: Document Audit Results (Short Content)

1. Navigate to the application home page
2. Select a compliance framework from the dropdown
3. Upload a short document (1-2 pages)
4. Wait for analysis to complete
5. **Verify:** Scrollbar appears on far right edge of browser window (not on `<main>` element)
6. **Verify:** NO horizontal scrollbar appears
7. **Verify:** Content fits within viewport, no scrolling needed OR scrollbar appears only if content exceeds height

### Test Case 3: Document Audit Results (Long Content)

1. Upload a long document (10+ pages with many checklist items)
2. Wait for analysis to complete
3. **Verify:** Scrollbar is on far right edge of viewport
4. **Verify:** Scrolling moves the entire page content (header stays sticky at top)
5. **Verify:** No double scrollbars (one on `<main>`, one on viewport)
6. **Verify:** Header remains visible and sticky during scroll
7. **Verify:** NO horizontal scrollbar appears

### Test Case 4: Code Review Results

1. Switch to "Code Review" mode
2. Upload multiple code files
3. Wait for analysis to complete
4. **Verify:** Same scrollbar behavior as document results
5. **Verify:** Long code analysis results scroll correctly
6. **Verify:** NO horizontal scrollbar appears

### Test Case 5: Home Page (No Regression)

1. Click "Review Another Document" to return to home page
2. **Verify:** No scrollbar appears on home page (when content fits viewport)
3. **Verify:** `home-page-no-scroll` class still functions correctly
4. **Verify:** Upload view layout is unchanged

### Test Case 6: Various Viewport Sizes

1. Resize browser window to different widths (mobile, tablet, desktop)
2. **Verify:** Scrollbar remains on far right edge at all sizes (results page)
3. **Verify:** No scrollbars on home page at any viewport size
4. **Verify:** Responsive layout functions correctly
5. **Verify:** No horizontal scrolling introduced at any viewport size

### Test Case 7: Home Page - No Scrollbars (Detailed)

1. Open browser DevTools
2. Navigate to home page
3. Inspect root div element
4. **Verify:** `home-page-no-scroll` class is present
5. **Verify:** Computed styles show `overflow: hidden`
6. **Verify:** No child elements have overflow causing scrollbars
7. **Verify:** Document body has no scrollbars

### Test Case 8: Results Page - No Horizontal Scrollbar

1. Navigate to results page (after analysis)
2. Open browser DevTools
3. Check document body width vs viewport width
4. **Verify:** No element exceeds 100vw width
5. **Verify:** `overflow-x: hidden` is effectively applied
6. **Verify:** No horizontal scrollbar visible
7. **Verify:** Content is properly constrained within viewport

### Test Case 9: Filter and Expand Interactions

1. On results page, use the Pass/Fail/Warning filter pills
2. Expand/collapse the "AI Rewritten Version" section
3. **Verify:** Scrollbar adjusts smoothly as content height changes
4. **Verify:** No layout shift or scrollbar flickering
5. **Verify:** Scroll position is maintained during filter changes
6. **Verify:** No horizontal overflow introduced during interactions

---

## 5. Acceptance Criteria

### Home Page (Upload View)
- [ ] Home page has NO vertical scrollbar
- [ ] Home page has NO horizontal scrollbar
- [ ] All content fits within viewport without scrolling
- [ ] `home-page-no-scroll` class is correctly applied
- [ ] `home-page-no-scroll` class effectively prevents all scrolling

### Results Page (After Analysis)
- [ ] Results page has ONLY vertical scrollbar (when content exceeds viewport)
- [ ] Vertical scrollbar is positioned on far right edge of viewport
- [ ] Results page has NO horizontal scrollbar
- [ ] Horizontal overflow is hidden/controlled on results page
- [ ] Header remains sticky at top during scrolling
- [ ] All content is accessible via vertical scrolling
- [ ] No double scrollbars (nested scrolling)

### General Requirements
- [ ] Works correctly on mobile, tablet, and desktop viewports
- [ ] Filter and expand interactions work smoothly
- [ ] No console errors or warnings introduced
- [ ] No horizontal overflow on any page state
- [ ] Responsive layout maintained at all viewport sizes

---

## 6. Additional Context

### Browser Compatibility
- Chrome/Edge: Uses `::-webkit-scrollbar` pseudo-elements (custom styling applies)
- Firefox: Uses standard scrollbar (may need `scrollbar-width` and `scrollbar-color` properties)
- Safari: Same as Chrome (webkit-based)

### Related Files
- `frontend/src/App.tsx` - Main layout (investigate line 196-202, 226-237)
- `frontend/src/index.css` - Global styles (scrollbar styling, overflow settings)
- `frontend/src/components/ReviewResult.tsx` - Results content (no changes expected)
- `frontend/src/components/CodeResult.tsx` - Code results content (no changes expected)

### Notes
- The global styles in `index.css` already set up viewport-level scrolling: `html, body { overflow-y: auto; }`
- The issue appears to be a conflicting overflow setting on the `<main>` element
- Consider the impact on the `home-page-no-scroll` class functionality
- **NEW:** Investigate sources of horizontal overflow (wide content, margins, padding)
- **NEW:** Home page should have `overflow: hidden` but still shows scrollbars
- **NEW:** Results page should only have vertical scrollbar, not horizontal

### Horizontal Overflow Investigation Checklist
- [ ] Check for elements with fixed widths exceeding viewport
- [ ] Check for negative margins pushing content out of bounds
- [ ] Check for padding/margin calculations causing width > 100%
- [ ] Check for long unbreakable text (URLs, code, etc.)
- [ ] Check for modal/dropdown/tooltip positioning
- [ ] Check for images or media without max-width constraints
- [ ] Check for flexbox items not shrinking properly

---

**Prepared By:** Bug Documentation Specialist
**Review Status:** Ready for Analysis
**Estimated Analysis Time:** 20-40 minutes
