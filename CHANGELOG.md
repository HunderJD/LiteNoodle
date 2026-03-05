# Changelog - Lite Noodle

All current features:

### Automation
- Smart Discard: Unloads inactive tabs to save memory.
- Protection: Active tab, tabs with audio, and system pages (about:) are never unloaded.
- Pinned Tabs: Toggle to include pinned tabs in the discard process (disabled by default).
- Reliability: Uses Alarms API for background consistency.

### Interface
- Focus List: The popup now only displays tabs that are currently eligible for being unloaded.
- Clean Filter: Automatically hides active tabs, audible tabs, and system pages from the list.
- Modern UI: Dark/light mode toggle with visual feedback.
- Hover Timer: View exactly when a tab will be unloaded.
- Quick Stats: Real-time counter of total loaded tabs.

### Settings
- Flexible Time: Set delay in seconds, minutes, or hours.
- Also Discard Pinned: Clear option to manage pinned tabs memory.
- Auto Save: All preferences are persisted.
