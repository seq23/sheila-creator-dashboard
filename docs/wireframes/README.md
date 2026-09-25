# Wireframes

Low-fidelity layout spec for the dashboard. One file per screen. These are **not app code** — they're Design-canvas files (`.dc.html`) and won't render on their own (they expect a `support.js` runtime). Read them for layout, content, labels and states; build the real UI in the app's own stack (React + Vite, see `../BUILD_PLAN.md` section 13).

| File | Screen | Build phase |
| --- | --- | --- |
| Main.dc.html | Home | 1 |
| Dump.dc.html | Dump (two doors, notes, Dump button) | 1 |
| MobileDump.dc.html | Dump on phone (390 × 844) | 1 |
| Connect.dc.html | Connect accounts (Buffer, stats, Hunter) | 1 (Buffer), 3 (stats) |
| Settings.dc.html | Settings + Health | 1 shell, 7 full |
| Sidebar.dc.html | Shared desktop sidebar | 1 |
| ClientBrain.dc.html | Client Brain | 2 |
| Research.dc.html | Research Brief | 3 |
| Review.dc.html | Review (desktop grid) | 5 |
| MobileReview.dc.html | Review on phone | 5 |
| Calendar.dc.html | Calendar (week view, 10 / 7 / 5) | 6 |
| Deals.dc.html | Brand deals (finder, pitch drafts, tracker) | 10 |
| MediaKit.dc.html | Public media kit page (phone) | 10 |
| Voice.dc.html | Voice narration (hidden until on) | 11 |
| Help.dc.html | Help center home | every phase adds guides; audit in 12 |
| HelpGuide.dc.html | One help guide step (screenshot + callout) | every phase; audit in 12 |

Notes:
- Sample text and numbers in the frames are placeholders, not real data. Bracketed text like `[her email]` marks values to fill from real data.
- Colors: ground #F3F1EC, ink #1E1D1A, muted #5E5A52, line #D6D2C8, primary #2B55A0, success #2E6B3F, warning #A8480F. Fonts: Space Grotesk (headings), IBM Plex Sans (body), IBM Plex Mono (times/codes).
- Touch targets are at least 44 px; the phone views are the priority for Dump and Review.
