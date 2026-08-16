# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game table usable without overlapping controls or player information on phone portrait and compact landscape viewports.

**Architecture:** Keep the existing desktop layout and add one final authoritative responsive layer at the end of `src/styles/game.css`. Treat each mobile region as a reserved spatial band and protect it with Playwright bounding-box assertions.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node test runner, Playwright with the locally bundled Edge browser.

## Global Constraints

- Do not add runtime dependencies or remote scripts.
- Preserve the existing desktop layout.
- Support safe areas and a minimum 44px touch target.
- Verify 844×390, 667×375, and 390×844 viewports.

---

### Task 1: Add responsive collision regression coverage

**Files:**
- Modify: `output/playwright/browser-smoke.js`

- [x] Add bounding-box checks for seats, remaining-card fans, bottom cards, card counter, play zones, actions and hand.
- [x] Run the browser test and confirm it fails on the existing overlapping layout.

### Task 2: Add the authoritative mobile spatial layout

**Files:**
- Modify: `src/styles/game.css`

- [x] Add compact landscape zones for seats, card counter, play areas, actions and hand.
- [x] Add a two-row portrait HUD and vertically reserved table bands.
- [x] Make the card counter horizontally scrollable and the autoplay notice compact.
- [x] Run the browser test until all collision checks pass.

### Task 3: Verify the complete game

**Files:**
- Verify: `tests/*.test.js`
- Verify: `output/playwright/browser-smoke.js`
- Regenerate: static site output via `scripts/build-sites.js`

- [x] Run all Node tests.
- [x] Run the full browser smoke test and inspect all three responsive screenshots.
- [x] Build the distributable site and confirm no console errors or external requests.
