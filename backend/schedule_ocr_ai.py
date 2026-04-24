from __future__ import annotations

import base64
from io import BytesIO
import json
import os
import re
from collections.abc import Mapping
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from PIL import Image

from runtime_config import load_project_env

load_project_env()


def _getenv_int(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _normalize_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _normalize_time(value: Any) -> str:
    text = _normalize_text(value).replace(".", ":").replace(" ", "")
    match = re.match(r"^(\d{1,2}):(\d{2})$", text)
    if not match:
        return ""
    return f"{match.group(1).zfill(2)}:{match.group(2)}"


def _normalize_day_of_week(value: Any) -> int | None:
    if isinstance(value, int) and 1 <= value <= 7:
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        mapping = {
            "mon": 1,
            "monday": 1,
            "周一": 1,
            "星期一": 1,
            "tue": 2,
            "tuesday": 2,
            "周二": 2,
            "星期二": 2,
            "wed": 3,
            "wednesday": 3,
            "周三": 3,
            "星期三": 3,
            "thu": 4,
            "thursday": 4,
            "周四": 4,
            "星期四": 4,
            "fri": 5,
            "friday": 5,
            "周五": 5,
            "星期五": 5,
            "sat": 6,
            "saturday": 6,
            "周六": 6,
            "星期六": 6,
            "sun": 7,
            "sunday": 7,
            "周日": 7,
            "星期日": 7,
            "星期天": 7,
        }
        return mapping.get(normalized)
    return None


def _image_to_data_url(image_bytes: bytes) -> str:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _get_ocr_space_config() -> dict[str, object]:
    return {
        "url": os.environ.get("OCR_SPACE_API_URL", "https://api.ocr.space/parse/image").strip(),
        "api_key": os.environ.get("OCR_SPACE_API_KEY", "").strip(),
        "language": os.environ.get("OCR_SPACE_LANGUAGE", "eng").strip() or "eng",
        "engine": _getenv_int("OCR_SPACE_ENGINE", 2),
        "timeout": _getenv_int("OCR_SPACE_TIMEOUT", 30),
    }


def _get_deepseek_config() -> dict[str, object]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip() or os.environ.get("EXPO_PUBLIC_DEEPSEEK_API_KEY", "").strip()
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip() or os.environ.get("EXPO_PUBLIC_DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").strip()
    return {
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash",
        "timeout": _getenv_int("DEEPSEEK_TIMEOUT", 45),
    }


def _extract_ocr_space_text(payload: object) -> str:
    if isinstance(payload, Mapping):
        is_error = payload.get("IsErroredOnProcessing")
        if is_error:
            return ""

        parsed_results = payload.get("ParsedResults")
        if isinstance(parsed_results, list):
            parts: list[str] = []
            for result in parsed_results:
                if not isinstance(result, Mapping):
                    continue
                text = result.get("ParsedText")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
            return "\n".join(parts).strip()

    return ""


def _extract_ocr_space_lines(payload: object) -> list[dict[str, Any]]:
    extracted: list[dict[str, Any]] = []
    if not isinstance(payload, Mapping):
        return extracted

    parsed_results = payload.get("ParsedResults")
    if not isinstance(parsed_results, list):
        return extracted

    for result in parsed_results:
        if not isinstance(result, Mapping):
            continue
        overlay = result.get("TextOverlay")
        if not isinstance(overlay, Mapping):
            continue
        lines = overlay.get("Lines")
        if not isinstance(lines, list):
            continue
        for line in lines:
            if not isinstance(line, Mapping):
                continue
            line_text = _normalize_text(line.get("LineText"))
            if not line_text:
                continue
            extracted.append(
                {
                    "text": line_text,
                    "min_top": int(line.get("MinTop", 0) or 0),
                    "max_height": int(line.get("MaxHeight", 0) or 0),
                    "words": [
                        {
                            "text": _normalize_text(word.get("WordText")),
                            "left": int(word.get("Left", 0) or 0),
                            "top": int(word.get("Top", 0) or 0),
                            "height": int(word.get("Height", 0) or 0),
                            "width": int(word.get("Width", 0) or 0),
                        }
                        for word in line.get("Words", [])
                        if isinstance(word, Mapping) and _normalize_text(word.get("WordText"))
                    ],
                }
            )
    return extracted


def _ocr_image_ocr_space(image_bytes: bytes) -> dict[str, Any]:
    config = _get_ocr_space_config()
    url = str(config["url"])
    api_key = str(config["api_key"])
    if not url or not api_key:
        raise RuntimeError("OCR.Space API is not configured")

    request_body = urllib_parse.urlencode(
        {
            "base64Image": _image_to_data_url(image_bytes),
            "language": str(config["language"]),
            "OCREngine": str(config["engine"]),
            "isOverlayRequired": "true",
            "scale": "true",
            "isTable": "false",
        }
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "apikey": api_key,
    }
    request = urllib_request.Request(url, data=request_body, headers=headers, method="POST")

    with urllib_request.urlopen(request, timeout=int(config["timeout"])) as response:
        response_body = response.read().decode("utf-8")

    payload = json.loads(response_body)
    parsed_text = _extract_ocr_space_text(payload)
    parsed_lines = _extract_ocr_space_lines(payload)
    return {
        "text": parsed_text,
        "lines": parsed_lines,
        "payload": payload,
    }


def _build_deepseek_messages(ocr_text: str, ocr_lines: list[dict[str, Any]]) -> list[dict[str, str]]:
    line_summaries = [
        f"{index + 1}. top={line['min_top']} text={line['text']}"
        for index, line in enumerate(ocr_lines[:120])
    ]
    system_prompt = (
        "You extract university timetable entries from OCR text. "
        "Return strict JSON only. "
        "Schema: {\"items\":[{\"course_name\":\"\",\"course_code\":\"\",\"teacher\":\"\",\"room\":\"\","
        "\"day_of_week\":1,\"start_time\":\"09:30\",\"end_time\":\"12:30\",\"week_text\":\"\","
        "\"source_block\":\"\",\"confidence\":0.0,\"needs_review\":true}]}. "
        "Rules: day_of_week must be 1-7 or null. "
        "Use 24-hour HH:MM for times. "
        "If a field is unknown, use empty string or null. "
        "Only include actual timetable items. "
        "If OCR is insufficient, return {\"items\":[]}."
    )
    user_prompt = (
        "Extract timetable entries from this OCR result.\n\n"
        "Full OCR text:\n"
        f"{ocr_text[:12000]}\n\n"
        "OCR lines with approximate vertical positions:\n"
        f"{chr(10).join(line_summaries)[:12000]}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _extract_json_payload(text: str) -> dict[str, Any]:
    normalized = text.strip()
    if not normalized:
        raise ValueError("DeepSeek returned empty content")

    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", normalized, re.DOTALL)
    if fenced_match:
        normalized = fenced_match.group(1).strip()

    start = normalized.find("{")
    end = normalized.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("DeepSeek response did not contain JSON")

    return json.loads(normalized[start:end + 1])


def _call_deepseek(messages: list[dict[str, str]]) -> dict[str, Any]:
    config = _get_deepseek_config()
    api_key = str(config["api_key"])
    base_url = str(config["base_url"])
    if not api_key:
        raise RuntimeError("DeepSeek API is not configured")

    request_body = json.dumps(
        {
            "model": str(config["model"]),
            "messages": messages,
            "temperature": 0.1,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    request = urllib_request.Request(
        f"{base_url}/chat/completions",
        data=request_body,
        headers=headers,
        method="POST",
    )

    with urllib_request.urlopen(request, timeout=int(config["timeout"])) as response:
        response_body = response.read().decode("utf-8")

    payload = json.loads(response_body)
    content = payload["choices"][0]["message"]["content"]
    return {
        "content": content,
        "parsed": _extract_json_payload(content),
        "payload": payload,
    }


def _manual_review_item(source_block: str, reason: str) -> dict[str, Any]:
    return {
        "course_name": "",
        "course_code": "",
        "teacher": "",
        "room": "",
        "day_of_week": None,
        "start_time": "",
        "end_time": "",
        "start_period": None,
        "end_period": None,
        "week_text": "",
        "source_block": source_block or reason,
        "confidence": 0.0,
        "needs_review": True,
        "parse_note": reason,
    }


def _normalize_ai_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    normalized_items: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, Mapping):
            continue

        course_name = _normalize_text(item.get("course_name") or item.get("courseName"))
        course_code = _normalize_text(item.get("course_code") or item.get("courseCode"))
        teacher = _normalize_text(item.get("teacher"))
        room = _normalize_text(item.get("room"))
        day_of_week = _normalize_day_of_week(item.get("day_of_week") or item.get("dayOfWeek") or item.get("day"))
        start_time = _normalize_time(item.get("start_time") or item.get("startTime"))
        end_time = _normalize_time(item.get("end_time") or item.get("endTime"))
        week_text = _normalize_text(item.get("week_text") or item.get("weekText"))
        source_block = _normalize_text(item.get("source_block") or item.get("sourceBlock"))
        confidence_raw = item.get("confidence")
        confidence = 0.0
        if isinstance(confidence_raw, (int, float)):
            confidence = max(0.0, min(float(confidence_raw), 1.0))

        if not any([course_name, course_code, teacher, room, week_text, source_block, day_of_week, start_time, end_time]):
            continue

        needs_review = bool(
            item.get("needs_review")
            if isinstance(item.get("needs_review"), bool)
            else not (day_of_week and start_time and end_time and (course_name or course_code or source_block))
        )

        normalized_items.append(
            {
                "course_name": course_name,
                "course_code": course_code,
                "teacher": teacher,
                "room": room,
                "day_of_week": day_of_week,
                "start_time": start_time,
                "end_time": end_time,
                "start_period": None,
                "end_period": None,
                "week_text": week_text,
                "source_block": source_block,
                "confidence": confidence,
                "needs_review": needs_review,
            }
        )

    return normalized_items


def extract_schedule_from_image(image_bytes: bytes) -> dict[str, Any]:
    try:
        ocr_result = _ocr_image_ocr_space(image_bytes)
    except (urllib_error.URLError, urllib_error.HTTPError, json.JSONDecodeError, RuntimeError) as exc:
        return {
            "status": "success",
            "raw_response": {"mode": "ocr-space-error", "error": str(exc)},
            "items": [_manual_review_item("", f"OCR failed: {exc}")],
            "engine": "ocr-space-deepseek-fallback",
        }

    ocr_text = _normalize_text(ocr_result["text"])
    if not ocr_text:
        return {
            "status": "success",
            "raw_response": {"mode": "ocr-space-empty", "ocr_payload": ocr_result["payload"]},
            "items": [_manual_review_item("", "OCR returned no usable text")],
            "engine": "ocr-space-deepseek-empty",
        }

    try:
        deepseek_result = _call_deepseek(_build_deepseek_messages(ocr_text, ocr_result["lines"]))
        items = _normalize_ai_items(deepseek_result["parsed"].get("items"))
    except (urllib_error.URLError, urllib_error.HTTPError, json.JSONDecodeError, KeyError, RuntimeError, ValueError) as exc:
        return {
            "status": "success",
            "raw_response": {
                "mode": "deepseek-error",
                "ocr_text": ocr_text,
                "ocr_lines": ocr_result["lines"],
                "error": str(exc),
            },
            "items": [_manual_review_item(ocr_text[:4000], f"DeepSeek parsing failed: {exc}")],
            "engine": "ocr-space-deepseek-fallback",
        }

    if not items:
        return {
            "status": "success",
            "raw_response": {
                "mode": "deepseek-empty",
                "ocr_text": ocr_text,
                "ocr_lines": ocr_result["lines"],
                "deepseek_payload": deepseek_result["payload"],
            },
            "items": [_manual_review_item(ocr_text[:4000], "AI could not extract timetable items")],
            "engine": "ocr-space-deepseek-empty",
        }

    return {
        "status": "success",
        "raw_response": {
            "mode": "ocr-space-deepseek",
            "ocr_text": ocr_text,
            "ocr_lines": ocr_result["lines"],
            "ocr_payload": ocr_result["payload"],
            "deepseek_payload": deepseek_result["payload"],
        },
        "items": items,
        "engine": "ocr-space-deepseek",
    }
