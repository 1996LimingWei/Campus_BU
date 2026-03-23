# OCR Template V1

## Goal

Build the first usable OCR pipeline for one fixed weekly timetable template.

This version is intentionally narrow:

- One screenshot layout
- One weekly grid
- English weekday headers
- Left-side hourly time labels
- Blue-gray class blocks on a light gray grid
- Manual confirmation remains the fallback in the app

The target is not full automation. The target is to turn one screenshot into structured candidate items that the current import UI can review and save.

## Template Assumptions

The minimal supported template matches the screenshot shared on 2026-03-08.

Observed structure:

- Top header row with `Mon Tue Wed Thu Fri Sat`
- Left time column with `08:30` through `21:30`
- Six day columns
- Light gray empty cells
- Blue-gray course blocks with darker text
- Each course block contains:
  - first line: course code, sometimes with section in parentheses
  - following line(s): room or room list

Current examples from the screenshot:

- `COMP7530 (00001)` + `SCT503`
- `COMP7780 (00001)` + `SCT503`
- `COMP7115 (00001)` + `WLB204`
- `COMP7870 (00001)` + `FSC901C, FSC901D, OEE1017`
- `COMP7640 (00001)` + `OEE1017`
- `COMP7650 (00001)` + `FSC801C, FSC801D, RRS638, WLB103`

## V1 Output Contract

The backend should return items compatible with the current app flow in [services/ai-ocr.ts](/c:/Users/Tim/Documents/GitHub/CampusCopy/services/ai-ocr.ts).

Each detected block should aim to produce:

```json
{
  "course_code": "COMP7530",
  "course_name": "",
  "room": "SCT503",
  "day_of_week": 6,
  "start_time": "09:30",
  "end_time": "12:30",
  "source_block": "COMP7530 (00001)\nSCT503",
  "confidence": 0.86,
  "needs_review": false
}
```

Notes:

- `course_name` can be empty in V1
- `course_code` is more important than course name
- `source_block` must preserve raw extracted text for manual review
- `needs_review` should be `true` if any of `course_code`, `day_of_week`, or time range is missing

## Recognition Strategy

V1 should use template and rule recognition, not a general document model.

### Step 1: Validate the screenshot matches the template

Basic checks:

- Detect a strong rectangular grid
- Detect exactly six day columns
- Detect weekday labels close to `Mon Tue Wed Thu Fri Sat`
- Detect left time labels close to hourly values from `08:30` to `21:30`

If this fails:

- Return one manual-review item
- Mark the engine as something like `template-v1-unmatched`

### Step 2: Locate the timetable frame

Find the outer table rectangle:

- top border
- left border
- right border
- bottom border

This should be done from image lines, not hardcoded pixel coordinates.

### Step 3: Derive grid geometry

Split the table into:

- 1 left time column
- 6 day columns
- 1 header row
- hourly rows from `08:30` to `21:30`

For V1, row boundaries may be computed proportionally after locating the outer frame and header row.

### Step 4: Find filled class blocks

Detect non-empty colored rectangles inside the day columns.

Practical heuristic:

- Empty cells are light gray
- Class blocks are blue-gray and visually darker
- Ignore the yellow header row

Each connected filled region becomes one candidate class block.

### Step 5: Convert block position to day and time

Use the block bounding box to infer:

- `day_of_week` from column index
- `start_time` from top edge alignment to nearest row boundary
- `end_time` from bottom edge alignment to nearest row boundary

For V1:

- Snap to the nearest timetable row line
- Accept small offsets caused by screenshot scaling

### Step 6: OCR inside each detected block

OCR only the cropped class block, not the entire screenshot.

Expected text structure:

- line 1: course code and optional section
- line 2+: room or comma-separated room list

Parsing rules:

- course code regex: `[A-Z]{4}\d{4}`
- section regex: `\(\d{5}\)`
- room list: keep as plain text in V1

### Step 7: Normalize and return candidates

For each block:

- `course_code`: parsed regex match
- `room`: remaining text after course code line
- `source_block`: raw OCR text
- `confidence`: simple composite score
- `needs_review`: true when critical fields are missing

## Recommended Backend Shape

For App Store release, OCR must run on a remote HTTPS service.

Recommended architecture:

- iOS app calls public OCR API over HTTPS
- OCR API runs as FastAPI in the cloud
- OCR API performs template detection and block OCR
- API returns structured items only
- App continues using existing Supabase import flow

This means:

- local `backend/main.py` is only a development server
- production must be a deployed service
- the app must never depend on a LAN IP or local Python process

## V1 Deployment Recommendation

Use a lightweight Python service:

- FastAPI
- Pillow or OpenCV for image processing
- Tesseract or PaddleOCR for block OCR
- Dockerized deployment

Likely hosting choices:

- Render
- Railway
- Fly.io
- a small VM if you want more control

For App Store readiness, the production endpoint must be:

- public
- HTTPS
- reasonably stable
- able to handle image uploads within timeout limits

## Why Template Recognition First

This screenshot is highly structured. That makes template recognition a better first step than Donut or a general VLM.

Benefits:

- faster to implement
- cheaper to run
- easier to debug
- more predictable for one school format
- compatible with manual review fallback already built in the app

## Known V1 Limitations

V1 will likely not handle:

- cropped screenshots
- rotated screenshots
- different color themes
- semester views with Sunday included
- merged or irregular blocks outside the standard grid
- screenshots with major scaling artifacts
- screenshots where text is too small or blurred

That is acceptable for the first productionable version.

## Next Implementation Slice

The next coding step should be:

1. add a template matcher in `backend/main.py`
2. detect the timetable frame and six day columns
3. find filled class rectangles
4. return block geometry even before OCR text parsing

The first backend PoC can succeed even if text OCR is still rough.

Success criterion for the first PoC:

- given this template screenshot
- return at least the correct count of class blocks
- each block has correct day column
- each block has approximately correct start and end time

Text extraction can be improved in the second pass.
