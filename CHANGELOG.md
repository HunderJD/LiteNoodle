# Changelog - Lite Noodle

All current features:

### Automation
- Smart Discard: Unloads inactive tabs to save memory.
- Protection: Active tab, tabs with audio, and system pages (about:) are never unloaded.
- Pinned Tabs: Toggle to include pinned tabs in the discard process (disabled by default).
- Reliability: Uses Alarms API for background consistency.

### Interface
- Focus List: Only displays tabs currently eligible for unloading.
- Clean Filter: Automatically hides active tabs, audible tabs, and system pages from the list.
- Accurate Stats: Real-time counter of total loaded tabs (ignores system pages for true accuracy).
- Modern UI: Dark/light mode toggle with visual feedback.
- Hover Timer: View exactly when a tab will be unloaded.

### Settings
- Flexible Time: Set delay in seconds, minutes, or hours.
- Also Discard Pinned: Clear option to manage pinned tabs memory.
- Auto Save: All preferences are persisted.
