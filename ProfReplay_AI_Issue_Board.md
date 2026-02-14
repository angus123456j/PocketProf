# ProfReplay AI -- Issue Board

# (Claude Code / Cursor Optimized)

------------------------------------------------------------------------

## How To Use This File (For AI Agents)

-   Each issue has a unique ID.
-   Status must be one of: BACKLOG, IN_PROGRESS, BLOCKED, REVIEW, DONE.
-   Claude/Cursor should:
    -   Update status fields directly.
    -   Append progress notes under the issue.
    -   Never delete historical notes.
    -   Mark completed checklist items with \[x\].
    -   Preserve issue IDs.

------------------------------------------------------------------------

# Global Status Overview

  ID   Title   Status   Priority   Owner
  ---- ------- -------- ---------- -------

------------------------------------------------------------------------

# Issues

------------------------------------------------------------------------

## ISSUE-001: MP3 Upload Pipeline

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Allow user to upload an MP3 lecture file and send it to backend.

### Acceptance Criteria

-   [ ] Frontend file picker implemented
-   [ ] Backend receives file
-   [ ] File stored temporarily in memory
-   [ ] API endpoint returns success response

### Notes

-   Must support files up to 200MB.
-   No database storage required.

------------------------------------------------------------------------

## ISSUE-002: Speech-to-Text Integration (Smallest Pulse)

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Convert uploaded MP3 into transcript using Smallest.ai Pulse.

### Acceptance Criteria

-   [ ] MP3 sent to Pulse API
-   [ ] Transcript returned successfully
-   [ ] Transcript saved in session memory
-   [ ] Error handling implemented

### Notes

-   Use secure backend key storage.
-   Log latency for demo metrics.

------------------------------------------------------------------------

## ISSUE-003: Transcript → Structured LaTeX Knowledge Document

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Convert transcript into structured JSON knowledge document with LaTeX
formatting.

### Acceptance Criteria

-   [ ] Sections extracted
-   [ ] Equations converted to LaTeX
-   [ ] Student questions preserved
-   [ ] Summary generated
-   [ ] Output conforms to strict JSON schema

### Required JSON Structure

{ "sections": \[ { "title": "","concepts": \[\], "equations_latex":
\[\], "student_questions": \[\], "clarifications": \[\] } \], "summary":
"","key_definitions": \[\] }

### Notes

-   Must validate JSON before saving.
-   No hallucinated concepts outside transcript.

------------------------------------------------------------------------

## ISSUE-004: Slide Upload + Processing

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Allow user to upload PDF/PPT and convert slides into images and
searchable text.

### Acceptance Criteria

-   [ ] Slide upload implemented
-   [ ] Slides converted to images
-   [ ] Slide text extracted
-   [ ] Slides indexed by number

### Notes

-   Use PDF.js on frontend if possible.
-   Store slide index in session memory.

------------------------------------------------------------------------

## ISSUE-005: Tutor Agent Initialization

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Initialize AI tutor grounded strictly in lecture context.

### Acceptance Criteria

-   [ ] Tutor receives Tutor Context Document (TCD)
-   [ ] Tutor receives slide text
-   [ ] Tutor aware of current slide index
-   [ ] System prompt restricts external knowledge

### Notes

-   Prevent open-domain hallucination.
-   Maintain short rolling memory window.

------------------------------------------------------------------------

## ISSUE-006: ElevenLabs Voice Clone Integration

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Generate professor-voiced narration using ElevenLabs.

### Acceptance Criteria

-   [ ] Voice ID configured
-   [ ] Tutor text sent to ElevenLabs
-   [ ] Streaming audio returned
-   [ ] Audio playback functional in frontend

### Notes

-   Must support interrupting playback.
-   Measure generation latency.

------------------------------------------------------------------------

## ISSUE-007: Slide Auto-Navigation

Status: BACKLOG\
Priority: MEDIUM\
Owner:

### Objective

Allow tutor to trigger slide changes during narration.

### Acceptance Criteria

-   [ ] Tutor response supports navigate_to_slide field
-   [ ] Frontend updates slide automatically
-   [ ] Manual slide override allowed

### Response Format Example

{ "speech": "...", "navigate_to_slide": 5 }

------------------------------------------------------------------------

## ISSUE-008: User Interruption + Question Handling

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Allow user to interrupt tutor and ask contextual questions.

### Acceptance Criteria

-   [ ] Audio stops on interrupt
-   [ ] User speech transcribed
-   [ ] Question sent with TCD + slide index
-   [ ] Tutor responds contextually
-   [ ] Tutor may navigate slides

------------------------------------------------------------------------

## ISSUE-009: LaTeX Rendering (Frontend)

Status: BACKLOG\
Priority: MEDIUM\
Owner:

### Objective

Render LaTeX equations cleanly in UI.

### Acceptance Criteria

-   [ ] KaTeX integrated
-   [ ] Inline math renders
-   [ ] Block equations render
-   [ ] Invalid LaTeX handled safely

------------------------------------------------------------------------

## ISSUE-010: Demo Stability Hardening

Status: BACKLOG\
Priority: HIGH\
Owner:

### Objective

Ensure system stability for live demo.

### Acceptance Criteria

-   [ ] Error states handled gracefully
-   [ ] Loading states implemented
-   [ ] Timeout fallbacks implemented
-   [ ] No unhandled promise rejections

------------------------------------------------------------------------

# Stretch Issues

------------------------------------------------------------------------

## ISSUE-011: 3Blue1Brown Visual Mode (Manim)

Status: BACKLOG\
Priority: LOW\
Owner:

### Objective

Generate short animation for selected equation.

### Acceptance Criteria

-   [ ] Equation extraction
-   [ ] Script generation
-   [ ] Manim render pipeline
-   [ ] Embed animation in UI

------------------------------------------------------------------------

# Change Log

-   All updates must append entries below.
-   Do not remove historical entries.
