import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HKCampus AI OCR Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract/schedule")
async def extract_schedule(file: UploadFile = File(...)):
    """
    Temporary manual-review fallback.
    We accept the uploaded screenshot, but do not call any external vision model.
    The frontend will continue with manual search + manual time/room completion.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        file_bytes = await file.read()
        return {
            "status": "success",
            "raw_response": {
                "mode": "manual_review_fallback",
                "filename": file.filename,
                "content_type": file.content_type,
                "file_size": len(file_bytes),
            },
            "items": [
                {
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
                    "source_block": "当前版本改为人工确认导入。请先搜索课程，再手动补充星期、时间和教室。",
                    "confidence": 0.0,
                    "needs_review": True,
                }
            ],
            "engine": "manual-review-fallback",
        }
    except Exception as e:
        print(f"Extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "healthy", "model": "manual-review-fallback"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
