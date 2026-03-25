# Agent Daily Digest

This module fetches a daily AI news page, builds a short summary, injects a system-like message into Agent chat, and triggers push through the existing notifications pipeline.

## Entry

- `runDailyDigestJobForUser(userId, date?)`

## Flow

1. Build source URL by date.
2. Fetch HTML with retry.
3. Parse title + url items.
4. Build summary and compose chat message.
5. Cache per-user digest and send one push per day.
