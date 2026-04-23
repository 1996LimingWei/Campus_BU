# Courses Master List - Maintenance Guide

## File Location

`Campus_BU/data/courses_master_list.md`

## Purpose

This file is the **single source of truth** for all courses currently in the Supabase database. It is maintained manually and must be consulted before any course-related operations (inserting reviews, matching courses, creating new courses, etc.).

## Format

Markdown table with two columns:

```
| code     | name                          |
| -------- | ----------------------------- |
| COMM7940 | Interactive Media Studies ...  |
```

- **code**: Course code (e.g., `COMM7940`, `COMP7650`, `A.F.7410`)
- **name**: Full course name as it appears in the database

## Rules for AI Agent (Capy)

### Before any course-related task:

1. **ALWAYS read `Campus_BU/data/courses_master_list.md` first** to check what courses exist
2. Match courses by code (case-insensitive)
3. Do NOT rely on other seed files (JSON, SQL) as they may be outdated

### When new courses are added to the database:

1. After generating INSERT SQL for new courses, also append those courses to `courses_master_list.md`
2. Maintain alphabetical order by code
3. Keep the markdown table format consistent

### When generating review SQL:

1. Check the master list to determine which courses already exist
2. For existing courses: only INSERT reviews (use `FROM public.courses c WHERE c.code = 'XXX'` to get the real UUID)
3. For new courses: INSERT the course first, then INSERT reviews
4. Always use `ON CONFLICT (code) DO NOTHING` for course inserts
5. Always use `NOT EXISTS` for review dedup
6. **Never hardcode course IDs** -- the database uses auto-generated UUIDs

## Maintenance Log

- 2026-04-23: Initial version created from Supabase export (1265 courses)
