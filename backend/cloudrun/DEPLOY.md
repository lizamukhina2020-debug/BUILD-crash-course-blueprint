# Deploy to Cloud Run (EU)

This deploys the DeepSeek proxy so the app can stream responses without shipping the DeepSeek key.

## 0) Prereqs

- You have `gcloud` installed and logged in
- You have access to the `seedmind-7d2ae` Google Cloud project

## 1) Set project + enable APIs

```bash
gcloud config set project seedmind-7d2ae

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

## 2) Store the DeepSeek key in Secret Manager

```bash
echo -n "YOUR_DEEPSEEK_KEY" | gcloud secrets create deepseek-api-key --data-file=-
```

If it already exists:

```bash
echo -n "YOUR_DEEPSEEK_KEY" | gcloud secrets versions add deepseek-api-key --data-file=-
```

## 3) Deploy (source deploy)

From this folder:

```bash
cd backend/cloudrun

gcloud run deploy seedmind-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets DEEPSEEK_API_KEY=deepseek-api-key:latest \
  --set-env-vars RATE_PER_MINUTE=25,RATE_PER_DAY=250
```

After deploy, copy the service URL and set it in the app as:

`DEEPSEEK_PROXY_URL = <service_url>/v1/chat/completions`

## 4) Test quickly

```bash
curl "<service_url>/health"
```

