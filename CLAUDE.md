# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is currently in the **design phase** — no application code has been written yet. The only committed content is the design spec at `docs/superpowers/specs/2026-08-07-c-form-digitization-design.md`. Before writing code, check whether an implementation plan exists (via the `writing-plans` skill / `docs/superpowers/plans/`); if not, one should be created from the design spec first.

## What this project is

A local, browser-based tool for a childcare center (親子館) to digitize "C表" — a standardized infant/toddler developmental assessment form. Staff currently fill this out by hand in Word, re-copying the same indicator text for every child. The design spec covers phase 1 only: digitizing the C表 itself (child records, indicator-based observation entries, docx export). A second phase (generating a parent-facing monthly report from this data) is intentionally out of scope for now — see the spec's "非目標" section.

Read the full design spec before implementing anything; the summary below is not a substitute for it.

## Intended architecture (per the design spec)

- **Single static HTML file**, opened directly in a browser — no install, no backend server, no network dependency. Must work in both Windows and Mac browsers without separate builds.
- **Storage**: browser IndexedDB, plus an explicit export/import JSON backup feature (data loss from browser storage being cleared is a real risk the design accounts for).
- **docx export**: generated programmatically with a bundled JS `docx` library (not a screenshot/print of the page), so output format is deterministic and must be verified cell-by-cell against the real C表 sample the first time it's built.
- **Indicator reference data** (127 developmental indicators across 5 age tiers × 5 domains) is static reference data sourced from the official practice guide, to be encoded as embedded JSON — not user-entered.
- **Data model**: a Child has many AssessmentForms; each AssessmentForm pairs an age tier (Ⅰ–Ⅴ) with a record period (year+month) — a child can have multiple forms within the same tier (one per recording period), not just one form per tier. Each form has many ObservationEntries (date, achieved flag, note) keyed to an indicator code, added freely by the user rather than constrained to fixed pre-allocated rows.
- Age tier is auto-suggested from (today − child's birthdate) but must remain manually overridable per form, since staff sometimes backfill records for a tier the child has already grown out of.

## Sensitive sample files

`陳小安C表-2.docx`, `託嬰中心...實務指引 .pdf`, and `林小晴-...(家長版).docx` in the repo root are real reference samples containing an actual child's name, birthdate, and behavioral records. They are gitignored — never remove them from `.gitignore` or commit them. Treat their contents as sensitive when discussing or logging.
