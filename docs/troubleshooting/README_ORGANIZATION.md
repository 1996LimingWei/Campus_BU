# Project Organization Guide

This document describes how project files have been organized and where each file can be found.

## Directory Structure

```
├── data/
│   ├── faculty/              # Faculty-related data files
│   │   ├── HTML files        # Faculty directory pages
│   │  └── CSV files         # Parsed faculty data
│   ├── buildings/            # Building/location data
│   │   ├── buildings_dump.json
│   │   └── building_overrides_rows.csv
│   └── courses/              # Course-related data
│       ├── courses_sem2.json
│       ├── courses_sem2.sql
│       └── courses_sem2.csv
├── scripts/
│   ├── faculty/              # Faculty scraping and parsing scripts
│   ├── data_processing/      # Data consolidation and import scripts
│  └── database/            # Database setup and migration scripts
└── [original project structure remains unchanged]
```