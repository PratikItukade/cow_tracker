# Dairy Herd Management App — Requirements

## Overview

A single-user Progressive Web App (PWA) for managing a small crossbred Holstein Friesian (HF) dairy herd. Covers milk tracking, breeding, health records, and data export. Offline-first with cloud sync.

## Type & Access

- **Platform:** PWA — installable on phone, offline-capable, background sync when online
- **Auth:** Email/password login (enables cloud sync/backup)
- **Users:** Single user, no multi-role access needed

## 1. Cow Profiles

- Individual profile per cow: photo, tag/name, breeding history, health history
- Covers current herd (e.g. named cows) and future assets (heifers not yet in milk)
- Each cow profile is the anchor entity that breeding and health records attach to

## 2. Milk Module

- Daily entry, per session (morning/evening — two entries per day)
- **Herd-level** total milk quantity per session (not per-cow)
- **Herd-level** fat % and SNF % per session
- Trend charts: daily / weekly / monthly views
- User-configurable threshold alerts — flag when fat% or SNF% drops below set value

## 3. Breeding Module

- Heat cycle date tracking, per cow
- AI (artificial insemination) date logging, per cow
- Pregnancy status per cow
- Expected calving date (calculated from AI/breeding date)
- Reminders/alerts: upcoming expected heat, upcoming calving date

## 4. Health Module

- Vaccination schedule with reminders, per cow
- Illness/treatment history log, per cow

## 5. Export

- PDF and/or Excel export of: per-cow history (breeding + health), milk trend data
- Purpose: sharing with vet or prospective buyer

## 6. Infrastructure

- Offline-first: app usable in gotha with no connectivity, syncs when network available
- Cloud backup tied to user account (data survives phone loss)

## Explicitly Out of Scope (for this version)

- Per-cow milk quantity/fat/SNF (herd-level only for now)
- Multi-user access, roles, or permissions
- Real-time analyzer hardware integration (manual entry only)
