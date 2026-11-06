# Location-centric personal timeline apps: UI/UX of the day, trips and longer periods (state as of 2026-11-06)

Scope note: research run on 2026-11-06. Reddit could not be fetched (the domain blocks the crawler) and web.archive.org could not be fetched either, so user sentiment comes from Hacker News, the Big Paua forum, GitHub issues, App Store pages and press. Unless a finding says it was read in full, a "search snippet" source was seen only as a search-result excerpt; those carry lower confidence. Dates of sources are given because several products changed a lot in 2024-2026.

## 1. Google Maps Timeline: old web Timeline vs. the 2024+ on-device Timeline

### Takeaway
Google's Timeline has always been "day = map + chronological list of visits and routes", with zoom-outs organised as tabs (Day, Trips, Insights, Places, Cities, World) rather than as a calendar or heatmap. The 2024-2025 move to on-device storage removed the desktop/web Timeline entirely. The loudest loss users name is the big-screen, mouse-driven browsing and searching of their past, plus the feeling that the phone became a single point of failure. The structure of the mobile UI itself barely changed.

### Cited Findings
**History and status**
- July 2015 launch: "Your Timeline" let users "view the places you've been on a given day, month or year". It shipped on desktop and Android and required Location History opt-in — [Google Maps blog, 2015-07-21 (search snippet)](https://maps.googleblog.com/2015/07/your-timeline-revisiting-world-that.html); corroborated by [The Next Web 2015-07-22](https://thenextweb.com/news/google-maps-your-timeline-shows-where-youve-been-at-any-given-time) (search snippet).
- 2015 photos: "if you use Google Photos, we'll show the photos you took when viewing a specific day". Press described the photos as sitting "next to the entries for the places you took them" — [Google Maps blog (search snippet)](https://maps.googleblog.com/2015/07/your-timeline-revisiting-world-that.html); [TNW (search snippet)](https://thenextweb.com/news/google-maps-your-timeline-shows-where-youve-been-at-any-given-time).
- 2015 editing: "You can edit any place that appears in Your Timeline, including removing a specific location or giving a frequented spot a private name" (example: "Mom's House") — [Google Maps blog (search snippet)](https://maps.googleblog.com/2015/07/your-timeline-revisiting-world-that.html).
- July 2021: Google added **Insights** and **Trips** tabs. Insights showed "monthly trends about how you're navigating the world". Trips replaced the deprecated Google Trips experience — [9to5Google 2021-07-21 (search snippet)](https://9to5google.com/2021/07/21/google-maps-timeline-insights/).
- What the web Timeline offered: data grouped into Trips, Places, Cities and World (countries); Insights such as distance per transport mode; visited locations, including specific places — [9to5Google 2024-06-05](https://9to5google.com/2024/06/05/google-maps-timeline-web/) (read in full).
- 9to5Google noted that the web Timeline "hadn't been visually updated in a long time". Some people were "quite upset" to lose google.com/maps/timeline because they used the web UI heavily — [9to5Google 2024-06-05](https://9to5google.com/2024/06/05/google-maps-timeline-web/).
- Current official position: "Timeline is not available for Maps on your computer" because the data "comes directly from your device". The page tells you to use the mobile app — [Google Maps Help, Manage your Timeline](https://support.google.com/maps/answer/6258979) (read in full).
- Migration deadline: users had until 9 June 2025. Only 90 days of data would migrate after the deadline — [TechRadar (search snippet)](https://www.techradar.com/phones/youve-got-more-time-the-great-google-maps-timeline-switch-gets-a-new-deadline-date); [PhoneArena (search snippet)](https://www.phonearena.com/news/google-gives-ios-android-users-an-ultimatum-to-update-timeline-settings_id168306).
- March 2025: Google admitted a "technical issue" deleted some users' Timeline data. Only users with encrypted backups could restore. Affected users saw "No visits for this day" on every date — [The Register 2025-03-24 (search snippet)](https://www.theregister.com/2025/03/24/google_maps_timeline_data_loss/); [Android Police (search snippet)](https://www.androidpolice.com/google-maps-timeline-bug/).

**Current (on-device) day view and editing (Android help, read in full)**
- Navigation: tap your profile, then "Your Timeline". At the top, tap "Today", swipe the calendar left or right and tap a day. On iPhone, a "Show calendar" control finds "another day or month" — [Google Maps Help (Android)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid); [Help search snippet (iOS)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DiOS).
- Editing is a **day-level edit mode** rather than inline editing:
  1. Tap the edit icon, then "Edit day", and scroll to the wrong entry.
  2. Pick from a "Select place" dropdown, or use "Search for a place".
  3. Tap the entry time to correct it, then "Save".
  4. Use More → "Remove" on an incorrect time period, then "Done".
  Other day and history actions:
  - "Delete day" is under More.
  - "Delete range of Timeline data" and "Auto-delete Timeline" (3, 18 or 36 months) are under "Location & privacy settings".
  — [Google Maps Help (Android)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid)
- **Place-centric reverse lookup:** search for a place or tap it on the map, scroll down and tap "Your visits and Maps history". This works only for places already in your Timeline on that device — [Google Maps Help (Android)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid).
- Timeline shows "where and how you traveled, like walking, biking, driving, or on public transport" — [Google Maps Help (search snippet)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid).
- Six views/tabs: **Day, Trips, Insights, Places, Cities, World** — [Pocket-lint 2024-08-31](https://www.pocket-lint.com/how-to-see-location-history-in-google-maps/) (read in full); same list in a [Local Guides Connect post, 2026-01-15](https://www.localguidesconnect.com/t/the-new-google-maps-timeline-better-insights-for-local-guides/502847) (read in full). Repliers there said the layout "seems more organized than before".
- The Timeline opens to the most recent trip with a **mini-map**, and "Today" opens a day picker — [Android Police, 2026-07-01](https://www.androidpolice.com/i-gave-google-maps-timeline-another-chance-and-it-totally-won-me-over/) (read in full).
- **Insights** = time spent walking or driving per month. The same author found Insights "generally interesting, but not terribly useful" — [Android Police 2026-07-01](https://www.androidpolice.com/i-gave-google-maps-timeline-another-chance-and-it-totally-won-me-over/).
- **Cities** tab groups locations by city and shows when you last visited each one; the author called it "kinda quirky" — [Android Police 2026-07-01](https://www.androidpolice.com/i-gave-google-maps-timeline-another-chance-and-it-totally-won-me-over/).
- **Places** tab = galleries by category (Shopping, Hotels, Attractions, Dining…). Example: choosing "Hotels" showed the nine hotels visited in the last year — [Local Guides Connect 2026-01-15](https://www.localguidesconnect.com/t/the-new-google-maps-timeline-better-insights-for-local-guides/502847); [MakeUseOf 2023-06-22](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/) (read in full).
- **Trips** tab: shows the number of trips, how long they were, and their month and year — [MakeUseOf 2023-06-22](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/).
- Day map: visited places appear as **dots of different colours**, each colour hinting at the type of activity. The day's history is listed at the bottom; it shows how you got there, commute time and estimated time in an area — [MakeUseOf 2023-06-22](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/).
- Restricted location access makes Timeline "start missing trips or showing gaps" — [Android Police (search snippet)](https://www.androidpolice.com/didnt-expect-much-from-google-maps-timeline/).

**What users say they used the web Timeline for, and lost** ([HN thread "Google Maps is killing Timeline for Web"](https://news.ycombinator.com/item?id=40583946), read in full)
- Trip and place recall: "what was that restaurant we went to in <random city> in <random year>" (mh-); remembering places from trips "on my PC" (BowBun).
- Reliving special days and holidays; one commenter traced a Europe tour day by day (k8svet).
- Cross-referencing purchases ("check where I was when I made a purchase") and logging work car trips for tax (martyvis); year-end mileage done "day-by-day" (SkyPuncher).
- Big screen: "a giant map of the world and a mouse to poke around" (driscoll42); "I don't want to have to do that searching on a small screen" (martyvis).
- Data safety: phone-only "makes my phone a spof for this data I truly like to keep" (codemac). Raw Takeout export was already degraded (pgalvin).
- What replacements lack: "the problem with most solutions is they don't do the snapping to semantic locations that Timeline does for you" (brainwad). Recommended alternatives in the thread: OwnTracks, Traccar, uLogger, GPSLogger, and Swarm for manual check-ins.

**Google Photos tie-in (older)**
- In Dec 2020 the Google Photos map view (Search → Places → "Your map"/"Explore map") showed a **heatmap of photo locations**. A **Timeline toggle** drew the route of a given day from Location History, opened from a map icon next to the date while viewing photos — [MobileSyrup 2020-12-21](https://mobilesyrup.com/2020/12/21/google-photos-map-screen-views-travel-timeline/) (read in full); [Android Central (search snippet)](https://www.androidcentral.com/how-use-map-browse-photos-places-google-photos).

### Inferences
- Google's model is: **day list + map with colour-coded dots**, **edit as a mode** (pick from a dropdown of nearby candidates, or search), and **zoom-outs as entity tabs** (Trips, Places by category, Cities, World) rather than a calendar heatmap. For Odysseus, the "place → all my visits" reverse lookup is the most transferable idea, and it fits the existing search.
- The HN use-cases map directly onto the Life panel's goals: recall a restaurant in a city/year, cross-check a purchase against where you were, relive a trip day by day, and use a big desktop map. Purchase-on-visit is something Odysseus already plans to hang on visits, and users did it by hand in Google.
- "Semantic snapping" (turning points into named stays) is the thing users miss most when leaving Google. With mostly-unnamed Dawarich places, label quality is the core UX problem, not map rendering.
- Insights and Cities were judged "interesting, not terribly useful" by a sympathetic reviewer. Aggregate stats tabs are low value compared with the day narrative and search.

### Gaps
- No primary source (the help article or a screenshot write-up) describing the exact old **desktop** layout was reachable. The year/month/day selectors, left panel, per-day bar chart and inline photo thumbnails could not be confirmed because web.archive.org was blocked.
- Not confirmed whether the 2024+ on-device Timeline still shows Google Photos inline in the day view.
- Not confirmed whether the old monthly "Timeline update" e-mails still exist.
- How the current Trips tab renders a multi-day trip card (title, cities, date range, map) was not documented in any reachable source.
- Reddit complaints could not be read (domain blocked).

## 2. Arc Timeline / Arc Timeline 4 (Big Paua, iOS)

### Takeaway
Arc is the "power-user" reference. Its key ideas:
- The day is a list of **visits and trips** under a map of the day's routes, with photos attached to the visit or trip they belong to.
- Every item opens to a details view (health data, altitude and speed charts, place history).
- Corrections are first-class: change place, change activity type, edit raw segments, mark data as "Bogus", merge places. The engine learns from them.
- Uncertainty is shown explicitly: "Unknown Place", "uncertain/unconfirmed" items, "Data Gap", "Thinking…".

Users love the accuracy, privacy and correctability. Their complaints are about processing glitches, merges, lost manual corrections on migration, and dense UI.

### Cited Findings
**Arc Timeline 4 (current, launched April 2026; v1.8.0 as of early Nov 2026)**
- Official page: the screenshot captioned "A day, visit by visit" shows a hike on the map, "with the day's visits, trips and photos listed below". Its description: visits are the places you stop, trips are the journeys between them — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/) (read in full).
- Photos "appear on the timeline, placed with the visit or trip they belong to". On the unfolded "iPhone Duo" layout, the map sits beside a timeline column that shows a visit's photos, which is effectively a desktop-like two-pane layout — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/).
- Trip details: duration, distance, steps, floors, energy and heart rate (from Apple Health), plus an altitude chart. 20+ activity types (walking, running, cycling, driving, train, bus, airplane…) — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/).
- Zoom-outs:
  - **Places tab**: "a year's countries, cities and places", organised by country and city, with occupancy charts.
  - **Activity tab**: "time and distance per activity type for a year".
  — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/); [Arc Timeline 4 announcement](https://support.bigpaua.com/t/introducing-arc-timeline-4-the-next-generation-of-arc/1141) (read in full).
- Search covers "any place, trip, or day", plus an opt-in natural-language assistant. Shortcuts include "When Was I Last At…". "Share a day" exports a day as an image. Calendar sync writes visits into the user's calendar — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/); [App Store, Arc Timeline 4](https://apps.apple.com/us/app/arc-timeline-4/id6740688708) (read in full).
- **Unnamed places:** v1.6.0 (2026-07-30) added "automatic street addresses for unassigned visits". Release notes say visits without an assigned place now show their **street address instead of "Unknown Place"** — [App Store, Arc Timeline 4 version history](https://apps.apple.com/us/app/arc-timeline-4/id6740688708).
- Other 2026 changes:
  - v1.6.1: merge duplicate places.
  - v1.7.0: merge-place visit counts.
  - v1.7.1: category place icons.
  - v1.7.6: "weekly/monthly/yearly search improvements".
  - v1.8.0: new **Segments screen**.
  — [App Store version history](https://apps.apple.com/us/app/arc-timeline-4/id6740688708)
- Editing per the store listing: "correct visits and trips, change places, merge duplicate places, edit segments, and clean up the timeline". The official page says that when you correct a place or travel mode, "Arc learns from the correction" — [App Store](https://apps.apple.com/us/app/arc-timeline-4/id6740688708); [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/).
- Reviews (4.0/5 from 28 ratings):
  - "What Google Timeline should have been": praises notes on locations and easy corrections.
  - "Private and flexible": a 10-year user values annotation and recognition of "privately named places".
  - "What a disappointment": migration kept raw data but **lost manual corrections**.
  — [App Store, Arc Timeline 4](https://apps.apple.com/us/app/arc-timeline-4/id6740688708)

**Arc Timeline 3 (legacy; no new features, still maintained) and forum evidence**
- Listing: items are visits, trips or segments, each with a details view (weather, workouts, sleep, charts). Items are flagged **"uncertain" and "unconfirmed"**, with a **"Confirm All"** button. Tools include "bogus" marking, cleanup and extracting brief visits. There are daily, weekly, monthly and yearly activity summaries, comparisons of a visit with your averages, and a **calendar view**. 4.2/5 from 425 ratings — [App Store, Arc Timeline](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918) (read in full).
- Review, 2019: the UI is "crisper than Moves' softer design", but "there is so much information here". Another reviewer framed Arc as the successor to Moves — [App Store, Arc Timeline](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918).
- **"Unknown Place" behaviour:**
  - A user reported that Home "stays as Unknown Place", yet in Edit "Home is the first suggestion and the only one without a distance". The edit picker lists candidate places with distances.
  - Developer (matt): Unknown Place "indicates that the place classifier hasn't even had a chance to do its job".
  — [Big Paua forum, 2024-10-28/29](https://support.bigpaua.com/t/many-problems-since-the-last-update/841) (read in full)
- **"Thinking…"** segments are shown for very short items awaiting cleanup. They can block confirming. Every edit or confirm "fires off a task to the processing engine". Minimum "keeper" thresholds are 60 s and 20 m; shorter items merge back. Overlapping visits are supposed to auto-merge but sometimes don't — [Big Paua forum](https://support.bigpaua.com/t/many-problems-since-the-last-update/841).
- **Individual Segments / Bogus:**
  - To fix GPS junk: open the visit's "Individual Segments" and mark the bad ones "Bogus". Bogus data is kept but excluded from totals.
  - An "orange circle" on the map shows the Place's centre and radius, "based on all confirmed visits to that Place".
  - A user asked for "Undo".
  — [Big Paua forum, 2021-09](https://support.bigpaua.com/t/issues-in-timeline/163) (read in full)
- **Data Gap** items: a terminated app usually leaves a Data Gap item. If the visits on both sides are the same place, the engine may merge them and hide the gap — [Big Paua forum (search snippet)](https://support.bigpaua.com/t/missing-data-on-arc4/1266).
- Ongoing complaints in 2025-2026: recording gaps and missing days on Arc 4 — [Big Paua forum: Arc4 stops recording](https://support.bigpaua.com/t/arc-timeline-4-stops-recording-location-and-misses-complete-trips/1352) (search snippet). A comparison blog by a competing vendor said Arc "kind of stalled" and is a one-person project — [getdriftlog.com](https://getdriftlog.com/google-maps-timeline-alternatives-iphone/) (vendor blog, biased).

### Inferences
- Arc's label fallback, **user place → learned place → street address → (formerly) "Unknown Place"**, is exactly the problem Odysseus has with mostly-unnamed Dawarich places. In 2026 Arc concluded that an address beats "Unknown Place". For Odysseus the equivalent is to show street, neighbourhood or city plus a "name this place" affordance rather than a generic label.
- The edit picker sorts candidate places by distance and puts an overlapping known place first with no distance. This is a cheap, high-value pattern for an "assign place" popover.
- Arc's density ("so much information") is both praised and criticised. A desktop panel can afford Arc's details (charts, photos, health) as expandable rows without making the default view noisy.
- Keep raw data and corrections separate, and make corrections survive re-processing. Losing manual corrections is the single most damaging complaint, for Arc 4 migration and also for Dawarich (see section 3).

### Gaps
- The developer's own design blog posts about the timeline (e.g. the LocoKit or Arc Editor write-ups) were not reached.
- No confirmed description was found of how Arc 4 renders a month or calendar view or a multi-day trip. The listing mentions weekly/monthly/yearly search but not a month grid.
- No screenshot-level description was found of how Arc 4 visually distinguishes unconfirmed items (colour, opacity, icon).

## 3. Dawarich (dawarich.app, GitHub Freika/dawarich): map, Timeline panel, visits, trips, insights, and known UX gaps

### Takeaway
By November 2026 (v1.21.0, 2026-11-04) Dawarich has a real **Timeline panel inside its MapLibre "Map v2"**. It works as follows:
- A day calendar, and a one-line day header with per-mode distance chips.
- Visits interleaved with journeys. Journeys expand to a mode "ribbon" of legs, with the raw segment list behind "All segments".
- Explicit **"untracked"** gaps, confidence-graded visits (low-confidence ones collapse into a per-day disclosure), "Unknown Location" or street-address fallbacks, and hover/click linking to the map.

Around it sit Places (archive, merge, tags), Trips (search and filter), and an Insights page (year heatmap, streaks, year calendar coloured by country, digests). Most user complaints are about day segmentation correctness: fragmented home stays, a day that "starts nowhere", one long track instead of trips between visits, generic "Suggested place" names, and timezone.

### Cited Findings
**Timeline panel evolution (GitHub releases, read via API)**
- 0.36.2 (2025-12-06): Map v2 (MapLibre GL) introduced. New map features go only to v2 — [release 0.36.2](https://github.com/Freika/dawarich/releases/tag/0.36.2).
- 1.1.0 (2026-02-08), "The Timeline Release": a 24-hour **Timeline tool** to scrub through a day and replay it with a play button. In 1.3.0 this was renamed **"Replay"** — [release 1.1.0](https://github.com/Freika/dawarich/releases/tag/1.1.0).
- 1.3.0 (2026-02-25), first **Timeline feed sidebar** in Map v2 "for browsing daily location history":
  - Hovering a journey entry highlights the matching track on the map with an animated border.
  - Clicking zooms the map to fit the track and keeps it selected.
  - Expanding a day temporarily shows that day's visit markers, even if the Visits layer is off.
  - Selecting a track dims all others.
  — [release 1.3.0](https://github.com/Freika/dawarich/releases/tag/1.3.0)
- 1.7.11 (2026-05-31): the Timeline calendar "lights up days that have raw points" even before visits or tracks are computed, matching the Insights Activity Overview calendar — [release 1.7.11](https://github.com/Freika/dawarich/releases/tag/1.7.11).
- 1.8.0 (2026-06-08):
  - Every visit gets a **search icon to find the real place by name**: a type-as-you-go Photon lookup biased to the visit's location, with each result showing category, distance and nearby saved Areas. Choosing a far-away place asks before relocating.
  - "Decline" became **Delete**.
  - The Places layer stopped showing a marker per suggested visit, which had produced "often thousands".
  - A per-day "suggested visits" **dot on the calendar**.
  — [release 1.8.0](https://github.com/Freika/dawarich/releases/tag/1.8.0)
- **1.12.0 (2026-08-11), the big UX reset** ([release 1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0); [PR #3302](https://github.com/Freika/dawarich/pull/3302), read in full):
  - Visit detection is rebuilt around "stays, movement and honest gaps":
    - A silence that starts and ends at the same place counts as one visit.
    - A silence that ends elsewhere becomes an explicit **"untracked"** stretch, shown for interior gaps of 45 min or more.
    - Visit times snap to when movement actually stopped.
  - "Visits are only named after a business or POI when the evidence supports it — anything weaker gets a street address instead of a made-up venue name."
  - Every visit carries a **confidence score**: medium-confidence visits render subdued, low-confidence visits **collapse into a per-day disclosure**, and confirmed visits always render at full strength.
  - "The timeline got quieter":
    - A one-line day header with per-mode distance chips (≥0.5 km) plus moving time.
    - Tracks expand to a time-proportional **mode ribbon**. Stops render as thin separators, runs of micro-segments collapse into one "transfer" chip, and low-confidence stretches show as unclaimed "moving".
    - In-place mode editing: click a leg's mode name.
    - The full segment list, with confidence %, lives behind **"All segments · edit"**.
    - Collapsed journey rows show moving time when dwell dominates the span.
  - "Visits no longer have a review flow": the suggestions banner, "Needs review" cards, filters and bulk Confirm were removed. Every visit row has one **Edit** button (rename, nearby-place search, delete), and editing a suggested visit confirms it. The PR says: "Showing a visit is asserting it."
  - Deletes are tombstones, so detection never re-suggests a deleted visit. Anything the user confirmed, renamed, re-placed, deleted or noted survives re-detection.
- 1.14.3 (2026-09-05): hovering a transportation segment in the map timeline animates only that segment — [release 1.14.3](https://github.com/Freika/dawarich/releases/tag/1.14.3).
- 1.16.0 (2026-10-17):
  - Stats and Insights merged into one **/insights** page.
  - Year cards show route maps.
  - Self-hosted instances get a **year calendar coloured by country**, a country timeline, and a "race" against the previous year's distance.
  - **Trips are searchable** by name, description, places and notes, and can be filtered by year, month and country.
  — [release 1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0)
- 1.17.0 (2026-10-23):
  - Overnight stays where the phone goes quiet are now one visit across the silence.
  - The heatmap is weighted by **time spent** instead of point count.
  - **Foursquare Swarm import**: each check-in at a venue becomes a visit at a place named after the venue, lasting until the next check-in (max 2 h).
  — [release 1.17.0](https://github.com/Freika/dawarich/releases/tag/1.17.0)
- 1.18.1 (2026-10-26): "A visit that runs past midnight now shows up in the Timeline and its calendar on **every day it covers**… On the later days its row shows the time from midnight and only that day's part of the stay" (fixes #3624) — [release 1.18.1](https://github.com/Freika/dawarich/releases/tag/1.18.1).
- 1.19.0 (2026-10-27):
  - Visits with no location details and no matching place display as **"Unknown Location"**.
  - Visits without a place now show on the map and in the timeline editor at the location of their points.
  - Day arrows and the left/right arrow keys switch days in the Timeline.
  - Place details and editing moved into the **left map panel**, with Back returning to the previous tab.
  - Places can be archived, merged (with a "Possible duplicates" review), tagged, and moved or resized on the map by dragging the pin and radius handle.
  — [release 1.19.0](https://github.com/Freika/dawarich/releases/tag/1.19.0)
- 1.20.0 (2026-10-30): achievement cards and "fog of war" (H3 cells) that highlights **first discoveries** in a date range — [release 1.20.0](https://github.com/Freika/dawarich/releases/tag/1.20.0).
- 1.21.0 (2026-11-04): "Create Visit" on the map fills location and times from selected points or nearby history. The visit form offers a nearby previously-visited Place by default. A visit whose name equals its Place's name follows later Place renames — [release 1.21.0](https://github.com/Freika/dawarich/releases/tag/1.21.0).

**Insights (year/month level)**
- 1.0.2 (2026-01-31) introduced Insights:
  - a "GitHub-style contribution graph" activity heatmap
  - current and longest streak
  - top visited locations
  - year-over-year comparison
  - activity breakdown by transport mode
  - monthly digest
  - time-of-day and day-of-week patterns
  — [release 1.0.2](https://github.com/Freika/dawarich/releases/tag/1.0.2)
- Yearly digest e-mail since 0.37.0 (2025-12-30) — [release 0.37.0](https://github.com/Freika/dawarich/releases/tag/0.37.0).

**Docs (may lag the releases)**
- The visits docs describe the map styling: suggested visits are orange circles with a dashed border, confirmed visits are blue circles with a solid border. Clicking a circle opens a popup to rename, pick a nearby place or "Create a place", edit start and end times, or delete.
- Drawer cards centre the map on click and show the address under the visit name.
- Naming order: place name, else address.
- Place matching order: an existing place whose radius contains the visit (smallest radius wins), then a reverse-geocoded POI, then address only.
- "Select data on map" (rectangle or polygon) lists all visits in an area regardless of dates.
- Sources: [Dawarich docs: Visits and Places](https://dawarich.app/docs/features/visits-and-places/) (read in full).
- **Conflict:** the docs still describe confirm/decline from the drawer, but release 1.12.0 removed the review flow. Trust the releases for current behaviour — [release 1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0).
- Trips: create a trip between two points in time to see the route, distance and time spent, with notes (README). Photos from Immich/Photoprism show on the trip page (0.19.4) — [README](https://github.com/Freika/dawarich/blob/master/README.md) (search snippet); [docs changelog](https://dawarich.app/docs/changelog/) (read in full; it stops at 0.25.0, so it is stale).

**Known UX gaps from issues (GitHub API, read in full)**
- [#583](https://github.com/Freika/dawarich/issues/583) (+12) and [#1281](https://github.com/Freika/dawarich/issues/1281) (+9): every suggestion was titled **"Suggested place"** even though the geocoder knew real names. One user had about 4,000 visits and no one-click way to accept a real name. These are the most-upvoted timeline issues.
- [#457](https://github.com/Freika/dawarich/issues/457) (2024): request for a Google-Timeline-like "list of locations you visited today" with direct editing (e.g. "McDonalds" instead of "Poolworx").
- [#2966](https://github.com/Freika/dawarich/issues/2966): a whole day at home showed "a dozen or so" 45-75 min visits separated by about an hour of nothing (sparse 15-min pings). Expected one continuous visit.
- [#2967](https://github.com/Freika/dawarich/issues/2967): a "continued from" track appeared at the bottom of the day, carried a walk from two days earlier, and showed the user "moving for 16 hours". The user expected carry-over to sit at the top of the day.
- [#3624](https://github.com/Freika/dawarich/issues/3624): "Most of my days have the strange appearance that I started 'no where'". The visit that began the previous evening was missing. Fixed in 1.18.1.
- [#3454](https://github.com/Freika/dawarich/issues/3454) (open): with GPSLogger data, all visits are listed at the top and the day is one long track, instead of separate tracks between visits.
- [#3886](https://github.com/Freika/dawarich/issues/3886) (open): times are shown in the account timezone, not the local time where the visit happened (a Kansas evening visit shown as 2:30 am CET).

### Inferences
- Dawarich's 1.12.0 rethink is the closest available precedent for Odysseus's data:
  - **no review queue**, confidence expressed through visual weight
  - **honest gaps** as explicit "untracked" rows
  - **evidence-gated POI naming** with an address fallback
  - a quiet day header
  - raw segments behind a disclosure

  Because Odysseus consumes Dawarich, it inherits this naming. Labels like "Home" or a city may come from Dawarich Places/Areas, and plain addresses or "Unknown Location" from its fallback. Designing Life to show `place name → street/neighbourhood → city` with a clear "rename" affordance aligns with upstream.
- Overnight carry-over is a recurring pain: #3624, #2967, and the 1.17.0/1.18.1 fixes. The first row of a day should be the place where the day started ("since 19:40 yesterday"), rendered as a continuation. The last row should show it continues past midnight. Never let a day "start nowhere".
- Low-frequency trackers produce fragmented stays (#2966) and one-long-track days (#3454). The Life UI should merge adjacent same-place stays across small gaps visually, even if the data is fragmented, and label real gaps.
- The Insights year heatmap (GitHub-style) and the year calendar coloured by country are direct precedents for Odysseus's year heatmap. Colouring year days by country or city is a cheap trip-detection visual.
- Timezone: show visit times in the local time of the place (or both) when travelling. This is still an open complaint upstream.

### Gaps
- The docs site has no dedicated Timeline page (the guessed URL returned 404), so no official screenshot description was found. The panel layout above comes from release notes and the PR text.
- No GitHub Discussions content specifically on timeline design was read.
- How Dawarich's Trips page visually summarises a multi-day trip (per-day breakdown or single card) is not documented in what was read.

## 4. Other products worth a look (Moves, Life Cycle, Swarm, Google Photos map, OwnTracks, Apple Maps Visited Places, GeoPulse; Strava/Fitbit)

### Takeaway
Each adds one or two patterns:
- **Swarm**: history-first profile with the map "at the heart" and stat cards. It shows that sparse, manually-named check-ins can be imported as visits.
- **Apple Maps Visited Places** (iOS 26): a flat list of visits with per-entry actions such as "Wrong Location" and notes, plus category, city and date filters.
- **Life Cycle**: time-by-category donuts and day/week/month/year zoom. Users want chronology, not just categories.
- **OwnTracks frontend**: the "raw map" baseline (points, line, heatmap, date range) with no semantic day.
- **GeoPulse**: an explicit naming-priority chain ending in "Unknown location", and "Data Gap" events.
- **Moves** (discontinued 2018): the original "storyline" day app that Arc explicitly succeeds.

### Cited Findings
- **Moves (ProtoGeo; acquired by Facebook in 2014; shut down 31 July 2018).** Facebook deprecated the app and API on 31 July 2018, citing low usage — [9to5Google 2018-07-02 (search snippet)](https://9to5google.com/2018/07/02/facebook-shutting-down-moves-tbh-hello/); [about.fb.com (search snippet)](https://about.fb.com/news/2018/07/hello-tbh-moving-on/amp/). A user review of a Moves-import app called Moves's history a "day by day time log" with "no search, tags, charts" — [Quantified Map, App Store (search snippet)](https://apps.apple.com/us/app/quantified-map/id1224409581). Arc reviewers framed Arc as the Moves successor, noting Moves' "softer design" — [App Store, Arc Timeline](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918).
- **Life Cycle (Northcube / Sleep Cycle AB, iOS):**
  - Views "day by day, week by week, month by month or even year by year". Donut charts plus "detailed graphs" — [App Store listing via appfollow (search snippet)](https://apps.appfollow.io/ios/life-cycle-track-your-time/1064955217?country=ca).
  - A places view shows the number of unique places, and for each place how often you go and the total time spent. Tracking uses cell and Wi-Fi rather than background GPS, for <1% battery per day — [Podfeet blog, Aug 2024 (search snippet)](https://www.podfeet.com/blog/2024/08/tracking-life-in-life-cycle/).
  - A reviewer asked to "view my day in chronological order as well as by category", which implies the day view is category-grouped by default. Accuracy is poor in dense UK streets — [App Store review via appfollow (search snippet)](https://apps.appfollow.io/ios/life-cycle-track-your-time/1064955217?country=ca).
- **Foursquare Swarm (5.0 redesign, 2017):**
  - The product was "refocused around lifelogging". The check-in map is "at the very heart of the app", with history ahead of the social feed.
  - The headline insights are Check-ins, Places, Categories, Streaks and Mayorships, as cards.
  - History can be viewed for the last 60 days or all time.
  - Search was improved because users searched their history often.
  — [Foursquare design blog "How we designed Foursquare Swarm 5.0" (search snippet; page returned 403)](https://medium.com/foursquare-direct/d774b3164f3f); [Engadget 2017-08-08](https://www.engadget.com/2017-08-08-swarm-5.html) (read in full: the map is the heart, the profile shows streaks and unique places, and you can search friends, categories and history).
  - Dawarich imports Swarm check-ins as named visits — [Dawarich 1.17.0](https://github.com/Freika/dawarich/releases/tag/1.17.0).
- **Google Photos map:** "Your map"/"Explore map" heatmap of photo locations. Tapping a hotspot lists the photos from that area. A Location History toggle draws the day's route — [MobileSyrup 2020-12-21](https://mobilesyrup.com/2020/12/21/google-photos-map-screen-views-travel-timeline/); [Android Central (search snippet)](https://www.androidcentral.com/how-use-map-browse-photos-places-google-photos).
- **OwnTracks frontend (web):**
  - last-known locations with an accuracy circle
  - location history as points, a line or both
  - a location heatmap
  - fit-all-to-view
  - a date and time range
  - filter by user or device
  - distance travelled

  It has no visits, places or day narrative — [owntracks/frontend README](https://github.com/owntracks/frontend) (read in full). HN commenters note OwnTracks lacks Google's "snapping to semantic locations" — [HN](https://news.ycombinator.com/item?id=40583946).
- **Apple Maps "Visited Places" (iOS 26, opt-in, on-device):**
  - Visits are listed in a column. Tapping the "All Visits" header shows them on a map.
  - Visits are grouped by category with counts, and can be filtered by date, category or city.
  - Per-entry actions: Add to Places, Add a Note, Share, **"Wrong Location"**, Remove.
  - Retention via "Keep Visits": 3 months, 1 year or forever.
  - Early testers found recording "spotty".
  — [Tom's Guide (search snippet)](https://www.tomsguide.com/phones/iphones/ive-tried-out-the-biggest-addition-to-ios-26-maps-heres-what-i-like-and-what-i-dont); [iGeeksBlog (search snippet)](https://www.igeeksblog.com/apple-maps-visited-places/); [heise (search snippet)](https://www.heise.de/en/news/Visited-Places-Tracking-in-Apple-Maps-Where-it-works-and-how-11077230.html)
- **GeoPulse (self-hosted timeline):**
  - Stay naming priority: Favorites (point or drawn area) → cached geocode → primary geocoder → failover geocoder → **"Unknown location"**.
  - Favorites are created by right-clicking the timeline map ("Add point to favorites"/"Add area to favorites"). Creating or deleting a favorite regenerates the timeline, so past stays get renamed.
  - A geocoding-management page lets you hand-edit cached place names.
  — [GeoPulse docs: managing places](https://geopulse.cc/docs/user-guide/core-features/managing-places) (read in full)
  - The timeline has stays, trips and **"Data Gap"** events. Trip movement-type overrides are tagged `MANUAL` and can be reset to `AUTO` — [GeoPulse docs: timeline](https://geopulse.cc/docs/user-guide/core-features/timeline) (read in full).

### Inferences
- Swarm and Apple show that a **visit list with a map toggle** plus **per-visit "wrong location / note / rename"** actions is the minimal useful unit. A "Wrong Location" one-tap flag is lighter than a full editor.
- GeoPulse's "draw an area → all past stays are renamed" is the strongest answer to "most places are unnamed": naming once fixes history retroactively. Dawarich 1.12.0 does the same ("reshaping an area relabels its historical visits"), so Odysseus can lean on Dawarich Places/Areas rather than its own naming store.
- Life Cycle's criticism supports keeping the day view **chronological**, with category aggregation as a secondary view.
- OwnTracks shows the baseline that users find insufficient: a map of points with no day story. That is what Life must exceed.

### Gaps
- **Strava/Fitbit day views were not researched** because of tool-call budget. No findings on how they summarise movement per day.
- Moves' actual storyline visual design (colour-coded activity bubbles, place rows) could not be confirmed from a primary source; Wikipedia's Moves page returned 404.
- No current (2025-2026) description of the Swarm history UI or the Google Photos map was found. The cited material is 2017 and 2020.
- Life Cycle's day-view layout (rings vs. timeline) was not confirmed from a primary source.

## 5. Cross-cutting concrete patterns: unnamed/low-confidence places, moving segments, map↔list correspondence, empty/sparse days, multi-day trips

### Takeaway
The products have converged on these patterns:
1. **Label fallback chains** that end in a real address or area rather than a generic "Unknown/Suggested place", with confidence shown through visual weight rather than review queues.
2. **Moves summarised as one compact row** (mode, distance, duration) that expands into legs or segments on demand.
3. **Tight hover/click linkage** between list rows and the map (highlight, zoom-to-fit, dim others).
4. **Explicit gap rows** ("untracked", "Data Gap") rather than silent holes.
5. **Overnight continuity**: a stay crossing midnight appears on both days.

Multi-day trips are handled as separate named entities (Trips tab or Trips page) with date ranges, search and filters. Within the day view they are mostly not shown.

### Cited Findings
**Unnamed and low-confidence places**
- Arc 4: unassigned visits show their street address instead of "Unknown Place" (2026-07-30) — [App Store](https://apps.apple.com/us/app/arc-timeline-4/id6740688708). Arc 3 marked items "uncertain"/"unconfirmed", with "Confirm All" — [App Store](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918).
- Dawarich:
  - POI names are used only "when the evidence supports it", else a street address. If there is no geocoder or place, the label is "Unknown Location" — [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0); [1.19.0](https://github.com/Freika/dawarich/releases/tag/1.19.0).
  - Medium confidence renders subdued, and low confidence collapses into a per-day disclosure — [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0).
  - Generic "Suggested place" labels were the most-upvoted complaint — [#583](https://github.com/Freika/dawarich/issues/583), [#1281](https://github.com/Freika/dawarich/issues/1281).
- GeoPulse: Favorites → geocode → failover → "Unknown location" — [GeoPulse docs](https://geopulse.cc/docs/user-guide/core-features/managing-places).
- Google: the edit flow uses a "Select place" dropdown of candidates, or "Search for a place" — [Google Help](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid). Private names such as "Mom's House" date from 2015 — [Google blog (search snippet)](https://maps.googleblog.com/2015/07/your-timeline-revisiting-world-that.html).
- Candidate pickers:
  - Arc lists candidates with distances, and an overlapping known place has no distance — [Big Paua forum](https://support.bigpaua.com/t/many-problems-since-the-last-update/841).
  - Dawarich's per-visit search is biased to the visit location and shows category, distance and nearby saved areas — [1.8.0](https://github.com/Freika/dawarich/releases/tag/1.8.0).

**Moving segments**
- Dawarich:
  - The day header is one line with per-mode distance chips and moving time.
  - A journey row expands to a time-proportional mode ribbon. Micro-segments collapse into a "transfer" chip, and low-confidence stretches show as "moving".
  - Raw segments sit behind "All segments · edit", and you click a leg's mode name to change it.
  — [PR #3302](https://github.com/Freika/dawarich/pull/3302); [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0)
- Arc: each trip has activity type, duration, distance, health data and an altitude chart. "Individual Segments" is the raw level, where junk can be marked "Bogus" — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/); [Big Paua forum](https://support.bigpaua.com/t/issues-in-timeline/163).
- Google: the day shows how you got to a place and commute time, with mode icons and map dots colour-coded by activity — [MakeUseOf](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/); [Google Help (search snippet)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid).
- GeoPulse labels manual mode overrides `MANUAL` vs `AUTO` — [GeoPulse docs](https://geopulse.cc/docs/user-guide/core-features/timeline).

**Map ↔ list correspondence**
- Dawarich:
  - Hovering a journey highlights its track (animated border). Click zooms to fit and selects it, and other tracks dim.
  - Expanding a day shows its visit markers even if that layer is off.
  - Hovering a segment animates only that segment.
  — [1.3.0](https://github.com/Freika/dawarich/releases/tag/1.3.0); [1.14.3](https://github.com/Freika/dawarich/releases/tag/1.14.3)
  - Drawer cards re-centre the map, and suggested and confirmed visits use different circle styles — [Dawarich docs](https://dawarich.app/docs/features/visits-and-places/).
  - Opening the Timeline no longer force-enables layers the user turned off — [1.18.1 release notes (#3847)](https://github.com/Freika/dawarich/releases/tag/1.18.1).
- Arc: the map of the day's routes sits above (or beside, on wide screens) the visit/trip/photo list — [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/).
- Apple Maps: tapping the "All Visits" list header shows them on a map — [Tom's Guide (search snippet)](https://www.tomsguide.com/phones/iphones/ive-tried-out-the-biggest-addition-to-ios-26-maps-heres-what-i-like-and-what-i-dont).

**Empty and sparse days, gaps**
- Dawarich:
  - Interior gaps of 45 min or more are shown as "untracked". A silence that ends at the same place is merged into one visit — [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0).
  - The calendar lights days that have any raw points — [1.7.11](https://github.com/Freika/dawarich/releases/tag/1.7.11).
  - Fragmented stays from sparse pings are a known complaint — [#2966](https://github.com/Freika/dawarich/issues/2966).
- Arc and GeoPulse: explicit "Data Gap" items, which Arc's engine sometimes hides by merging same-place visits — [Big Paua forum (search snippet)](https://support.bigpaua.com/t/missing-data-on-arc4/1266); [GeoPulse docs](https://geopulse.cc/docs/user-guide/core-features/timeline).
- Google: an empty day shows "No visits for this day" (seen at scale during the 2025 data-loss bug) — [Android Police (search snippet)](https://www.androidpolice.com/google-maps-timeline-bug/).

**Days crossing midnight and trips spanning days**
- Dawarich shows a past-midnight visit on every day it covers, with "time from midnight". Before that fix, days "started nowhere" — [1.18.1](https://github.com/Freika/dawarich/releases/tag/1.18.1); [#3624](https://github.com/Freika/dawarich/issues/3624). A misplaced "continued from" track confused users — [#2967](https://github.com/Freika/dawarich/issues/2967).
- Trips as entities:
  - Google's Trips tab shows the number of trips, their length and the month/year — [MakeUseOf](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/).
  - Dawarich Trips are user-created between two timestamps, with route, distance, time, notes and photos. They are searchable and filterable by year, month and country — [README (search snippet)](https://github.com/Freika/dawarich/blob/master/README.md); [1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0).
  - Dawarich year view: a calendar coloured by country, plus a country timeline — [1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0).

### Inferences
Inferences for the Odysseus "Life" day page; these are recommendations, not sourced facts.
- **Label chain:** user-named place / Dawarich Place → evidence-backed POI → street + neighbourhood → city → "Unknown location". Never show a generic "Suggested place"-style label. Always show a secondary line (address, or neighbourhood + city) under "Home"/city labels so unnamed stays are still distinguishable.
- **Confidence:** use visual weight instead of a review queue. Render low-confidence stays subdued, or fold them into a "N brief stops" disclosure per day (Dawarich 1.12.0 pattern).
- **Move rows:** one compact row between visits (mode icon(s), distance, duration, optional mode ribbon), expandable to legs. Put per-mode distance chips in the day header.
- **Map↔list:** hover a row to highlight its track or pin and dim the rest; click to fit bounds. Number or letter the pins to match row order (common practice; not confirmed in any source above). Attach photos and purchases to the visit row and show them as badges on the matching pin.
- **Day boundaries:** the first row says "at Home since 19:40 (yesterday)" and the last row says "until 08:10 (next day)". Interior gaps of 45 min or more become a visible "untracked" row. An empty day still shows non-location content (calendar, e-mails, digital activity) with a "no location recorded" note rather than a blank map.
- **Trips:** a day inside a trip shows a trip banner (trip name, day X of N, prev/next day). The month and year views colour days by city or country (Dawarich year calendar) so trips stand out without a separate tab.
- **Desktop advantage:** the strongest user-voiced loss after Google's change was big-screen, mouse-driven browsing and searching (HN). A two-pane map + list desktop layout (Arc's unfolded "Duo" layout is the mobile analogue) is a differentiator, not a compromise.

### Gaps
- No source quantifies which label fallback users prefer (address vs. city vs. "Unknown"). The evidence is directional: product decisions by Arc and Dawarich in 2026, plus Dawarich issue upvotes.
- No source found describing numbered or lettered pin↔row matching in these products.
- Not researched: how Strava or Fitbit show movement per day, or how Google Timeline's current Trips tab lays out a multi-day trip.
