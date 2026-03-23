# Share URL Configuration Guide

This document explains how to configure the share URL for the post sharing feature.

## Overview

The app uses environment variables to manage the base URL for shared post links. This allows you to easily switch between development and production URLs without modifying any business logic code.

## Current Configuration

**Development URL:** `http://localhost:3000`

Shared posts currently generate links like:
```
http://localhost:3000/post/36e64c20-56e1-48fe-8b91-2228d718dd29
```

## How to Update to Production Domain

When you have your production domain ready, follow these steps:

### Step 1: Update Environment Files

Edit both `.env` and `.env.example` files in the project root:

```bash
# Before (development)
EXPO_PUBLIC_SHARE_BASE_URL=http://localhost:3000

# After (production) - replace with your actual domain
EXPO_PUBLIC_SHARE_BASE_URL=https://hkcampus.app
```

### Step 2: Rebuild the App

Environment variables are bundled at build time. You must rebuild the app for changes to take effect:

```bash
# For Expo development
npx expo start --clear

# For production build
npx expo build:android
npx expo build:ios
# or
eas build --platform all
```

### Step 3: Verify the Change

After rebuilding, shared posts should generate links like:
```
https://hkcampus.app/post/36e64c20-56e1-48fe-8b91-2228d718dd29
```

## Files That Use This Configuration

| File | Purpose |
|------|---------|
| `.env` | Local development environment variables |
| `.env.example` | Template for environment setup |
| `utils/shareUtils.ts` | Utility functions for generating share URLs |
| `components/campus/SharePostModal.tsx` | Share modal UI component |

## Utility Functions

The `utils/shareUtils.ts` file provides:

- `generatePostShareUrl(postId)` - Generates full share URL
- `generatePostShareMessage(postId, customMessage?)` - Creates complete chat message
- `parsePostIdFromUrl(url)` - Parses post ID from share URL (for deep linking)