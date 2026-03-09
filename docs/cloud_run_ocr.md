# Cloud Run OCR Plan

## Goal

Deploy the OCR backend as a public HTTPS API that:

- runs on Linux, not on a local Windows machine
- can scale to zero when unused
- is billed mainly by request time and resource usage
- is suitable for a very small early-stage user base

## Why Cloud Run

Cloud Run fits this project better than a fixed monthly VM because:

- it runs standard Linux containers
- FastAPI works well inside a container
- no request means the service can scale down to zero
- billing is usage-based rather than a permanently running machine
- HTTPS and public routing are built in

This is a better match for timetable OCR because screenshot uploads are low frequency and can tolerate a small cold start.

## Target Architecture

App flow:

1. app uploads screenshot or reads local image
2. app calls `EXPO_PUBLIC_OCR_API_URL`
3. Cloud Run serves `backend/main.py`
4. backend runs template detection and OCR
5. backend returns structured items
6. existing app import flow stores review items in Supabase

## Files Added For Deployment

- [backend/Dockerfile](/c:/Users/Tim/Documents/GitHub/CampusCopy/backend/Dockerfile)
- [backend/.dockerignore](/c:/Users/Tim/Documents/GitHub/CampusCopy/backend/.dockerignore)
- [backend/runtime_config.py](/c:/Users/Tim/Documents/GitHub/CampusCopy/backend/runtime_config.py)
- [backend/cloudbuild.yaml](/c:/Users/Tim/Documents/GitHub/CampusCopy/backend/cloudbuild.yaml)
- [backend/predeploy_check.py](/c:/Users/Tim/Documents/GitHub/CampusCopy/backend/predeploy_check.py)

## Minimal Runtime Strategy

Cloud Run instance settings for low cost:

- CPU: `1`
- Memory: `1Gi`
- Min instances: `0`
- Max instances: `3`
- Concurrency: `1`
- Timeout: `60s`

Why:

- `min-instances=0` avoids paying for idle time
- `concurrency=1` keeps outbound OCR.Space requests simple and predictable
- `1Gi` gives enough room for image handling without overcommitting

## Suggested Deployment Commands

Assuming:

- project id: `YOUR_GCP_PROJECT`
- region: `asia-east1` or another nearby region
- service name: `hkcampus-ocr`
- secret name: `OCR_SPACE_API_KEY`

Create or update the secret first:

```bash
printf "YOUR_OCR_SPACE_KEY" | gcloud secrets create OCR_SPACE_API_KEY --data-file=-
```

If the secret already exists, add a new version instead:

```bash
printf "YOUR_OCR_SPACE_KEY" | gcloud secrets versions add OCR_SPACE_API_KEY --data-file=-
```

If your Cloud Run service uses the default compute service account, grant it access:

```bash
gcloud secrets add-iam-policy-binding OCR_SPACE_API_KEY \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Build and deploy:

```bash
cd backend
python predeploy_check.py

gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _SERVICE=hkcampus-ocr,_REGION=asia-east1,_OCR_SPACE_API_KEY_SECRET=OCR_SPACE_API_KEY,_OCR_SPACE_API_KEY_VERSION=latest
```

The build config uses Cloud Build's `BUILD_ID` for the versioned image tag, so manual deploys do not need an extra `COMMIT_SHA` substitution.

After deployment, copy the Cloud Run HTTPS URL into:

```env
EXPO_PUBLIC_OCR_API_URL=https://YOUR_CLOUD_RUN_URL
```

## Cost Control Notes

For a tiny launch, the main cost controls are:

- keep `min-instances=0`
- keep `max-instances` low
- avoid GPU
- start with CPU-only OCR
- keep request timeout short

This avoids paying a fixed monthly server fee.

## OCR Engine Plan

Production strategy:

1. keep current template geometry detection in the backend
2. send cropped class blocks to OCR.Space
3. parse returned text into `course_code` and `room`
4. keep the app's manual review fallback for low-confidence cases

Runtime switch:

- `OCR_TEXT_ENGINE=ocr_space`: production target
- `OCR_TEXT_ENGINE=disabled`: geometry-only fallback if needed for debugging

## What Still Needs To Be Done

- build and deploy the container
- point the app `.env` to the Cloud Run URL
- run end-to-end testing with real screenshots

## Practical Recommendation

Do not put the OCR.Space key in the mobile app.
Keep the app calling your Cloud Run backend over HTTPS.
Let the backend own the external OCR provider integration.
