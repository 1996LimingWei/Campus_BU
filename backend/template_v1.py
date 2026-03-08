from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from io import BytesIO
import os
import re
from collections.abc import Mapping
from typing import Iterable

from PIL import Image, ImageFilter, ImageOps

try:
    import pytesseract
except ImportError:  # pragma: no cover - optional runtime dependency
    pytesseract = None

try:
    import numpy as np
except ImportError:  # pragma: no cover - optional runtime dependency
    np = None


TIME_LABELS = [
    "08:30",
    "09:30",
    "10:30",
    "11:30",
    "12:30",
    "13:30",
    "14:30",
    "15:30",
    "16:30",
    "17:30",
    "18:30",
    "19:30",
    "20:30",
    "21:30",
]

DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


@dataclass
class DetectedBlock:
    day_of_week: int
    day_label: str
    start_time: str
    end_time: str
    bbox: tuple[int, int, int, int]
    confidence: float
    source_text: str
    course_code: str
    room: str
    needs_review: bool


def _cluster_positions(positions: Iterable[int], max_gap: int = 2) -> list[tuple[int, int]]:
    sorted_positions = sorted(set(positions))
    if not sorted_positions:
        return []

    groups: list[tuple[int, int]] = []
    start = prev = sorted_positions[0]
    for pos in sorted_positions[1:]:
        if pos - prev <= max_gap:
            prev = pos
            continue
        groups.append((start, prev))
        start = prev = pos
    groups.append((start, prev))
    return groups


def _group_centers(groups: list[tuple[int, int]]) -> list[int]:
    return [int((start + end) / 2) for start, end in groups]


def _find_vertical_boundaries(image: Image.Image) -> list[int]:
    width, height = image.size
    pixels = image.load()
    dark_columns: list[int] = []

    for x in range(width):
        dark_count = 0
        for y in range(height):
            r, g, b = pixels[x, y]
            if (r + g + b) / 3 < 150:
                dark_count += 1
        if dark_count >= height * 0.55:
            dark_columns.append(x)

    return _group_centers(_cluster_positions(dark_columns))


def _find_horizontal_boundaries(image: Image.Image) -> list[int]:
    width, height = image.size
    pixels = image.load()
    dark_rows: list[int] = []

    for y in range(height):
        dark_count = 0
        for x in range(width):
            r, g, b = pixels[x, y]
            if (r + g + b) / 3 < 155:
                dark_count += 1
        if dark_count >= width * 0.45:
            dark_rows.append(y)

    return _group_centers(_cluster_positions(dark_rows))


def _build_block_mask(image: Image.Image) -> list[list[bool]]:
    width, height = image.size
    pixels = image.load()
    mask = [[False for _ in range(width)] for _ in range(height)]

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            brightness = (r + g + b) / 3
            if 110 <= brightness <= 215 and b >= r + 12 and b >= g + 6:
                mask[y][x] = True

    return mask


def _connected_components(mask: list[list[bool]]) -> list[tuple[int, int, int, int, int]]:
    height = len(mask)
    width = len(mask[0]) if height else 0
    visited = [[False for _ in range(width)] for _ in range(height)]
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            if not mask[y][x] or visited[y][x]:
                continue

            stack = [(x, y)]
            visited[y][x] = True
            min_x = max_x = x
            min_y = max_y = y
            area = 0

            while stack:
                current_x, current_y = stack.pop()
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for next_x, next_y in (
                    (current_x + 1, current_y),
                    (current_x - 1, current_y),
                    (current_x, current_y + 1),
                    (current_x, current_y - 1),
                ):
                    if next_x < 0 or next_x >= width or next_y < 0 or next_y >= height:
                        continue
                    if visited[next_y][next_x] or not mask[next_y][next_x]:
                        continue
                    visited[next_y][next_x] = True
                    stack.append((next_x, next_y))

            components.append((min_x, min_y, max_x, max_y, area))

    return components


def _snap_to_boundary(value: float, boundaries: list[int]) -> int:
    return min(range(len(boundaries)), key=lambda index: abs(boundaries[index] - value))


def _time_at_index(index: int) -> str:
    base = datetime.strptime(TIME_LABELS[0], "%H:%M")
    return (base + timedelta(hours=index)).strftime("%H:%M")


def _infer_grid(image: Image.Image) -> tuple[list[int], list[int]]:
    vertical_boundaries = _find_vertical_boundaries(image)
    horizontal_boundaries = _find_horizontal_boundaries(image)

    if len(vertical_boundaries) < 8:
        raise ValueError(f"Expected at least 8 vertical boundaries, got {len(vertical_boundaries)}")
    if len(horizontal_boundaries) < 15:
        raise ValueError(f"Expected at least 15 horizontal boundaries, got {len(horizontal_boundaries)}")

    return vertical_boundaries[:8], horizontal_boundaries[:15]


def _normalize_confidence(block_width: int, block_height: int, column_width: int, row_height: int) -> float:
    width_score = min(1.0, block_width / max(column_width * 0.78, 1))
    height_score = min(1.0, block_height / max(row_height * 0.9, 1))
    confidence = 0.45 + width_score * 0.25 + height_score * 0.30
    return round(min(confidence, 0.99), 4)


def _prepare_block_for_ocr(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    min_x, min_y, max_x, max_y = bbox
    crop = image.crop((min_x, min_y, max_x + 1, max_y + 1))
    grayscale = ImageOps.grayscale(crop)
    enlarged = grayscale.resize((grayscale.width * 3, grayscale.height * 3))
    sharpened = enlarged.filter(ImageFilter.SHARPEN)
    binary = sharpened.point(lambda value: 255 if value > 175 else 0)
    return binary


def _prepare_block_for_paddle_ocr(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    min_x, min_y, max_x, max_y = bbox
    crop = image.crop((min_x, min_y, max_x + 1, max_y + 1)).convert("RGB")
    enlarged = crop.resize((crop.width * 3, crop.height * 3))
    contrasted = ImageOps.autocontrast(enlarged, cutoff=2)
    sharpened = contrasted.filter(ImageFilter.SHARPEN)
    return sharpened


def _normalize_ocr_lines(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def _getenv_int(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_paddle_ocr_config() -> dict[str, object]:
    # Timetable block OCR is a small English-only crop, so default to the
    # lighter mobile models instead of PaddleOCR 3.x's heavier server det model.
    return {
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "text_detection_model_name": os.environ.get("OCR_PADDLE_DET_MODEL", "PP-OCRv4_mobile_det"),
        "text_recognition_model_name": os.environ.get("OCR_PADDLE_REC_MODEL", "en_PP-OCRv4_mobile_rec"),
        "text_det_limit_side_len": _getenv_int("OCR_PADDLE_DET_LIMIT_SIDE_LEN", 512),
        "text_recognition_batch_size": _getenv_int("OCR_PADDLE_REC_BATCH_SIZE", 1),
        "lang": os.environ.get("OCR_PADDLE_LANG", "en"),
        "device": os.environ.get("OCR_PADDLE_DEVICE", "cpu"),
    }


def _ocr_block_text_tesseract(image: Image.Image, bbox: tuple[int, int, int, int]) -> str:
    if pytesseract is None:
        return ""

    prepared = _prepare_block_for_ocr(image, bbox)
    config = "--psm 6"
    text = pytesseract.image_to_string(prepared, config=config)
    return _normalize_ocr_lines(text)


@lru_cache(maxsize=1)
def _get_paddle_ocr():
    from paddleocr import PaddleOCR

    return PaddleOCR(**_get_paddle_ocr_config())


def _ocr_block_text_paddle(image: Image.Image, bbox: tuple[int, int, int, int]) -> str:
    if np is None:
        return ""

    prepared = _prepare_block_for_paddle_ocr(image, bbox)
    try:
        ocr = _get_paddle_ocr()
        result = ocr.predict(np.array(prepared))
    except Exception as exc:
        print(f"Paddle OCR failed for bbox={bbox}: {exc}")
        return ""

    texts: list[str] = []
    for page in result or []:
        rec_texts = getattr(page, "rec_texts", None)
        if rec_texts:
            texts.extend(str(item).strip() for item in rec_texts if str(item).strip())
            continue

        if isinstance(page, Mapping):
            values = page.get("rec_texts") or []
            texts.extend(str(item).strip() for item in values if str(item).strip())
            continue

        try:
            values = page["rec_texts"] or []
            texts.extend(str(item).strip() for item in values if str(item).strip())
        except Exception:
            continue

    return _normalize_ocr_lines("\n".join(texts))


def _ocr_block_text(image: Image.Image, bbox: tuple[int, int, int, int]) -> str:
    engine = os.environ.get("OCR_TEXT_ENGINE", "disabled").strip().lower()
    if engine == "tesseract":
        return _ocr_block_text_tesseract(image, bbox)
    if engine == "paddle":
        return _ocr_block_text_paddle(image, bbox)
    return ""


def _parse_course_code(source_text: str) -> str:
    if not source_text:
        return ""
    match = re.search(r"\b([A-Z]{4}\d{4})\b", source_text.upper())
    return match.group(1) if match else ""


def _parse_room(source_text: str) -> str:
    if not source_text:
        return ""
    lines = [line.strip() for line in source_text.splitlines() if line.strip()]
    if not lines:
        return ""

    first_line = lines[0]
    if len(lines) == 1:
        room_candidate = re.sub(r"\b[A-Z]{4}\d{4}\b", "", first_line.upper())
        room_candidate = re.sub(r"\(\d{5}\)", "", room_candidate)
        room_candidate = re.sub(r"\s+", " ", room_candidate).strip(" ,")
        return room_candidate

    joined = ", ".join(lines[1:]).strip(" ,")
    joined = re.sub(r"\s*,\s*", ", ", joined)
    joined = re.sub(r"(,\s*){2,}", ", ", joined)
    return joined.strip(" ,")


def _needs_review(course_code: str, room: str, source_text: str) -> bool:
    return not course_code or not room or not source_text


def detect_schedule_blocks(image_bytes: bytes) -> list[DetectedBlock]:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    vertical_boundaries, horizontal_boundaries = _infer_grid(image)

    time_column_right = vertical_boundaries[1]
    day_boundaries = vertical_boundaries[1:]
    header_bottom = horizontal_boundaries[1]
    time_boundaries = horizontal_boundaries[1:]
    row_height = max(1, int(sum(time_boundaries[i + 1] - time_boundaries[i] for i in range(len(time_boundaries) - 1)) / (len(time_boundaries) - 1)))

    mask = _build_block_mask(image)
    components = _connected_components(mask)

    detected: list[DetectedBlock] = []
    for min_x, min_y, max_x, max_y, area in components:
        if area < 1500:
            continue
        if min_x <= time_column_right or min_y <= header_bottom:
            continue

        width = max_x - min_x + 1
        height = max_y - min_y + 1
        if width < 40 or height < 40:
            continue

        center_x = (min_x + max_x) / 2
        day_index = None
        for idx in range(len(day_boundaries) - 1):
            if day_boundaries[idx] <= center_x <= day_boundaries[idx + 1]:
                day_index = idx
                break

        if day_index is None or day_index >= len(DAY_LABELS):
            continue

        top_index = _snap_to_boundary(min_y, time_boundaries)
        bottom_index = _snap_to_boundary(max_y, time_boundaries)
        if bottom_index <= top_index:
            bottom_index = min(top_index + 1, len(time_boundaries) - 1)

        start_time = _time_at_index(top_index)
        end_time = _time_at_index(bottom_index)
        column_width = day_boundaries[day_index + 1] - day_boundaries[day_index]
        confidence = _normalize_confidence(width, height, column_width, row_height)
        source_text = _ocr_block_text(image, (min_x, min_y, max_x, max_y))
        course_code = _parse_course_code(source_text)
        room = _parse_room(source_text)

        detected.append(
            DetectedBlock(
                day_of_week=day_index + 1,
                day_label=DAY_LABELS[day_index],
                start_time=start_time,
                end_time=end_time,
                bbox=(min_x, min_y, max_x, max_y),
                confidence=confidence,
                source_text=source_text,
                course_code=course_code,
                room=room,
                needs_review=_needs_review(course_code, room, source_text),
            )
        )

    detected.sort(key=lambda item: (item.day_of_week, item.start_time, item.bbox[1]))
    return detected
