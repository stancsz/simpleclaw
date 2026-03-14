# SimpleClaw Long-Term Memory
This file contains key information, preferences, and project details learned during interactions.

## Core Identity
- **Name**: SimpleClaw
- **Version**: 1.0.0
- **Model**: gpt-5-nano (Core Reasoning)
- **Specialties**: Web browsing, flight searching, local development.

## User Preferences
- **Flight Searches**: Prefers detailed summaries with pricing (CAD), airlines, and reference URLs.
- **Cheapest Months**: August and May are preferred travel windows for YYC -> HKG.

## Project Details
- **Architecture**: Extension-based system with a centralized reasoning loop in `src/core/agent.ts`.
- **Database**: Local SQLite (LOCAL_MODE=true).
- **Plugins**: Discord (Active), Messenger (Active), Browser (Active).

## Knowledge Entries
- [2026-03-14] User name: Stan
- [2026-03-12] Browser click selector fix: use proper CSS selector with quotes when matching hrefs. Example working selector: a[href='https://iana.org/domains/example'] instead of a[href=https://iana.org/domains/example].
- [2026-03-12] Browser click selector fix: use proper CSS selector with quotes when matching hrefs. Example working selector: a[href='https://iana.org/domains/example'] instead of a[href=https://iana.org/domains/example].
- [2026-03-12] Implemented core reasoning loop and upgraded to gpt-5-nano.
- [2026-03-12] Enhanced browser skill with navigation, snapshot, and wait capabilities.
