# Changelog

All notable changes to the "PELA" project will be documented in this file.

## [v1.5.0] - 2023-11-20
### Added
- **Simulation Mode:** Added `TEST` target server support for demo and testing purposes.
- **Smart Validation:** Added checks to bypass file selection in Simulation Mode.

## [v1.4.0] - 2023-11-19
### Added
- **Notification System:** Integrated Microsoft Teams Webhooks for real-time alerts.
- **Settings Manager:** Ability to save and load webhook URLs.

## [v1.3.0] - 2023-11-19
### Added
- **Operational Dashboard:** Added Chart.js visualization for server statistics.
- **Profile Manager:** Users can now save and load connection profiles.
- **Dark Mode:** Full UI overhaul with toggleable dark/light themes.
- **UI Polish:** Custom dropdowns and loading animations.

## [v1.2.0] - 2023-11-18
### Added
- **Audit Trail:** Integrated SQLite database to log all analysis activities.
- **Remote Log Discovery:** Added `ls` command integration to list remote log files.
- **Tabbed Interface:** Separated Direct SSH and Jump Host Tunneling into tabs.

## [v1.1.0] - 2023-11-18
### Changed
- **Architecture Refactor:** Separated HTML, CSS, and JS into clean structure.
- **Backend:** Switched from direct paramiko calls to modular helper functions.

## [v1.0.0] - 2023-11-17
### Initial Release
- Basic Flask Application.
- SSH Connection logic.
- pgBadger integration.
- Docker support.