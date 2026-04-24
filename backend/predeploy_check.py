from __future__ import annotations

import json
import os
from pathlib import Path


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    checks = {
        "dockerfile_exists": (backend_dir / "Dockerfile").exists(),
        "cloudbuild_exists": (backend_dir / "cloudbuild.yaml").exists(),
        "requirements_exists": (backend_dir / "requirements.txt").exists(),
        "main_exists": (backend_dir / "main.py").exists(),
        "ocr_text_engine": os.environ.get("OCR_TEXT_ENGINE", "ocr_space"),
        "ocr_runtime_home": os.environ.get("OCR_RUNTIME_HOME", "/tmp/hkcampus-ocr"),
        "ocr_space_api_url": os.environ.get("OCR_SPACE_API_URL", "https://api.ocr.space/parse/image"),
        "ocr_space_language": os.environ.get("OCR_SPACE_LANGUAGE", "eng"),
        "ocr_space_engine": os.environ.get("OCR_SPACE_ENGINE", "2"),
        "ocr_space_timeout": os.environ.get("OCR_SPACE_TIMEOUT", "30"),
        "ocr_space_api_key_present": bool(os.environ.get("OCR_SPACE_API_KEY")),
        "deepseek_base_url": os.environ.get("DEEPSEEK_BASE_URL", os.environ.get("EXPO_PUBLIC_DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")),
        "deepseek_model": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "deepseek_api_key_present": bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("EXPO_PUBLIC_DEEPSEEK_API_KEY")),
    }
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
