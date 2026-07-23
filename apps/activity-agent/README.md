# Milaserv Activity Companion

A minimal Windows console application that reports device-wide idle time to the
Milaserv CRM360 API, so idle breaks can be recorded from the moment activity
actually stopped (see `docs/architecture/ARCHITECTURE.md`).

## Why this exists

A browser tab can only observe activity inside itself. `GetLastInputInfo` (Win32)
observes mouse/keyboard activity anywhere on the device. This is the only signal
the companion collects — no key contents, screenshots, window titles, or file
contents are ever read or transmitted.

## Build (Windows only, requires the .NET 8 SDK)

```powershell
cd apps/activity-agent
dotnet build
dotnet run
```

This project targets `net8.0-windows` because `GetLastInputInfo` is a Win32 API;
it cannot be built or run on Linux/macOS. It was authored and typechecked by
inspection only in this environment — there is no .NET SDK available here to
compile or execute it. Build/run verification is required before Phase 5 is
considered complete.

## Environment variables

| Variable | Purpose |
|---|---|
| `MILASERV_API_URL` | Base URL of the API, e.g. `https://crm360.milaserv.example` |
| `MILASERV_DEVICE_ID` | Stable identifier for this device; defaults to the machine name |
| `MILASERV_ACCESS_TOKEN` | A short-lived user access token used once, to authorize initial device registration |

## Status

Implemented: idle detection, device registration call, periodic heartbeat loop.

Not yet implemented (tracked in `docs/implementation/IMPLEMENTATION_STATUS.md`):
- Windows service / auto-start packaging (currently a console app)
- Retry/backoff on transient network failures
- Local persistence of the device token across restarts
- Installer
