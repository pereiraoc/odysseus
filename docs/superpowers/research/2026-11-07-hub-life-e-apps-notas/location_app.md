# Location app (Life hub): app-level views beyond the day — trips, places, metrics, map exploration, digests

Scope note: research done 2026-11-06. The DAY view (Arc/Google day, Dawarich timeline, unnamed-place labelling, untracked gaps) was covered in a previous round and is not repeated here. "Current" means as of Nov 2026; older or discontinued items are labelled. Dawarich is moving fast: many features cited below landed in releases 1.15–1.21 (Sep–Nov 2026), so the user's own server version decides which APIs exist.

## 1. Trips: how they are listed and detailed

### Takeaway
Two models coexist: **auto-detected trips** (Google Timeline "Trips", Swarm "Trips", Polarsteps auto-tracked steps) and **manually bounded trips** (Dawarich: name + start/end date, then everything inside the interval is derived). The detail page converges on the same recipe everywhere: a hero route map, headline stats (distance, days, countries with flags), a per-day or per-stop itinerary, photos and notes, and a share/export action (poster, video, book, link). Polarsteps is the strongest reference for the "story" side (steps with photos/notes, profile stats, Travel Book, Trip Reels); Dawarich already has most of the "data" side (countries with distance each, route map, Immich photos, notes, per-interval map link).

### Cited Findings
**Google Maps Timeline (Trips tab; Android/iOS app only, on-device since Dec 2024)**
- Trips tab announced Nov 2020 next to Day, Places, Cities, World. Described as a "summary of your past vacations" with "the total kilometers traveled, and the modes of transportation you used"; the most recent trip is labelled "Latest" with a large cover image and earlier trips listed in a feed below; trip detail has carousels for "Places", "Destinations" (cities) and "Your itinerary". The article gives no detection rule (e.g. "away from home") — [9to5Google, 2020-11-10](https://9to5google.com/2020/11/10/google-maps-timeline-trips/)
- In June 2024 Timeline data was described as "grouped into Trips, Places, Cities, and World (countries)", plus generated Insights such as distance by transport mode; Timeline on the web was announced as "going away" — [9to5Google, 2024-06-05](https://9to5google.com/2024/06/05/google-maps-timeline-web)
- Timeline is now built on the device; "Timeline is not available for Maps on your computer"; it is off by default and opt-in — [Google Maps Help](https://support.google.com/maps/answer/6258979). Multiple devices can no longer contribute to one Timeline — [9to5Google, 2024-12-11](https://9to5google.com/2024/12/11/google-maps-on-device-timeline/)
- User sentiment on the migration: a 9to5Google writer lost his trips/routes history ("The data is gone") and argued that "The feature isn't technically gone, but it feels like starting over. That's worse than losing it altogether." — [9to5Google, 2025-09-07](https://9to5google.com/2025/09/07/google-maps-maimed-timelines-worse-than-abandonment/)

**Polarsteps (travel-journaling app; strongest trip reference; active, 25M+ tracked trips claimed)**
- Each location is a "step" with photos, videos and notes; "the entire trip route will be marked on a vibrant and detailed map". Per-trip stats: "the number and flags of countries you visited, trip duration, total distance covered, and more". Profile stats: percentage of the world visited, days since your last trip, furthest point from home. Web viewer is free and good to "relive the memories of your past trips on a bigger display" though it "might not have all the features of the mobile app". Tracking works offline (~4% extra battery claimed); Android has Ultra Light / Balanced / High Accuracy modes — [Overlandsite review](https://www.overlandsite.com/tools/polarsteps-review/)
- Help center: trip summary statistics and countries "are generated with information that we retrieve from your trip", so you correct them by editing steps; the Travel Book's furthest point from home is computed "as the crow flies" (seen as search snippet; the page returned HTTP 403 to direct fetch) — [Polarsteps Help](https://support.polarsteps.com/hc/en-us/articles/37507773374354-Can-I-edit-the-map-and-trip-statistics-in-my-Travel-Book)
- Polarsteps Plus (optional subscription) adds advanced step statistics: elevation gain/descent, transport modes, elevation profiles; core plan/track/share stays free (search snippet) — [Polarsteps news](https://www.polarsteps.com/news/polarsteps-launches-polarsteps-plus-a-new-subscription-for-its-most-dedicated-travelers)
- Summer 2026 release (2026-06-09): redesigned trip timeline that "gives more space to photos and stories"; full trip planning on the web/desktop; flights added to itineraries; privacy option to share a route "only up to your last recorded step" and hide live location; Trip Reels now include map flyovers over real terrain — [Polarsteps news, 2026-06-09](https://www.polarsteps.com/news/polarsteps-launches-summer-2026-release-new-tools-for-planning-privacy-and-sharing)
- Travel Book: paid hardcover with stories, route, stats and photos — [Overlandsite review](https://www.overlandsite.com/tools/polarsteps-review/); one reviewer found layout editing "extremely limited" (search snippet) — [PilotPlans review](https://www.pilotplans.com/blog/polarsteps-review)

**Dawarich Trips (self-hosted; the user's data source)**
- Trips are created manually: **New trip** → name, start/end date, optional notes; Dawarich pulls the points in that range. Trips planned in TREK can be imported and kept in sync, with the TREK plan shown above the recorded days — [Dawarich docs: Trips](https://dawarich.app/docs/features/trips/)
- List: search across name, description, countries visited and notes; sort "Newest first", "Oldest first", "Name (A–Z)", "Longest distance"; filter by Year → Month and by Country; filters live in the URL (bookmarkable) — [Dawarich docs: Trips](https://dawarich.app/docs/features/trips/); shipped in 1.16.0 — [Dawarich releases](https://github.com/Freika/dawarich/releases)
- Detail: date range, **countries visited with the distance covered in each**, interactive route map, formatted notes, Immich/PhotoPrism photo thumbnails with link to the full set; buttons to Poster Studio, Video Studio and "open the full map for the trip's exact dates". The docs do not describe a day-by-day split or a cities list — [Dawarich docs: Trips](https://dawarich.app/docs/features/trips/)
- Sharing: one active link per trip, "Anyone with the link" (optionally protected by a magic phrase) or "Family members only"; privacy zones still apply — [Dawarich docs: Trips](https://dawarich.app/docs/features/trips/)
- Release notes: trip maps split day routes by the user's saved time gap instead of a fixed 60 minutes (1.15.2); "Trips with long recordings open quickly", routes drawn from map tiles, "A 300-day trip no longer downloads every recorded point" (1.17.0); trip-stats line on posters (1.20.0); date-line crossing drawn continuous (1.21.0) — [Dawarich releases](https://github.com/Freika/dawarich/releases)

**GeoPulse (self-hosted, BSL 1.1)**
- "Trip Plans": plan stops with travel modes and routed legs, then compare the plan with what you actually visited; "Timeline & route replay" with stays, trips, data gaps, travel modes and weather; "Map Matching" via Valhalla snaps noisy paths to roads while raw GPS stays authoritative; "Guest Access" share links (optional password, instant revocation) — [GeoPulse README](https://github.com/tess1o/geopulse)

**Swarm (Foursquare; check-in based)**
- Trips (v7.0.41, Sep 2 — year not shown on the listing): "Swarm now automatically groups your out-of-town stops into shareable memories"; trips appear on your Profile when you return. Lists such as "Tokyo Trip" are user-made — [App Store: Swarm](https://apps.apple.com/app/id870161082)

**Arc Timeline (iOS)**
- No dedicated trip book; it records "Trips & Places", has daily/weekly/monthly/yearly summaries and exports trips/days/weeks/months/years to GPX — [App Store: Arc Timeline](https://apps.apple.com/app/id1063151918)

**Reitti (self-hosted, AGPL-3.0)**
- v2.0.0 "Memories": editable, shareable travel logs built from location data with text, map and image blocks; can pull photos from Immich; beta (community announcement, search snippet) — [Reitti v2.0.0 announcement](https://scribe.disroot.org/comment/7680268); GitHub lists Immich photos on the timeline and "nights away from home, and where" stats — [Reitti GitHub](https://github.com/dedicatedcode/reitti)

### Inferences
- With 98 Dawarich trips already curated by hand, the Location app should treat Dawarich trips as the source of truth and add what Dawarich's trip page lacks: a **day-by-day itinerary** (per day: route thumbnail, distance by mode, named visits/cities, photos count) and a **cities list** next to the per-country distance list. These can be derived live from the Dawarich APIs for the trip interval.
- A **trips index** worth copying: card grid (route thumbnail + title + dates + nights + km + country flags), with Dawarich-style filters (year, country, sort by length/distance) in the URL. Polarsteps-style profile ribbon on top: total trips, countries, furthest point from home, longest trip.
- **Trip suggestions** (Google/Swarm style "out-of-town" grouping) are a cheap win: propose candidate trips where the user was > N km from home for ≥ 1 night and no Dawarich trip covers the interval; the user accepts → create trip in Dawarich. This closes the gap that Dawarich trips are manual.
- Story/journaling (Polarsteps steps, Reitti Memories) is a later, optional layer; for a single-user archive the higher-value pieces are photos (Immich already linked via Dawarich) and a short note per trip/day.
- Privacy pattern from Polarsteps 2026 (share route only up to last step) and Dawarich privacy zones: any trip share/export from Odysseus should respect Dawarich privacy zones and never include home.

### Gaps
- No primary documentation found for how Google detects a "trip" (distance threshold from home, nights); only press descriptions. Current (2026) on-device Trips UI not documented in official help.
- Polarsteps help center pages blocked direct fetch (403); some Polarsteps details rely on search snippets and third-party reviews. No screenshot descriptions available in text form.
- Year of Swarm's "Trips" release (v7.0.41, "Sep 2") not shown on the App Store page (likely 2026 given 7.0.25 = Oct 2025, but unconfirmed).

## 2. Places: directories, per-place visit history, naming/categorising, home/work

### Takeaway
Every mature product has a **Places directory** with sort by "most visited / most recent", per-place visit history, and a way to name, merge and tag places; categories come either from a POI database (Google, Swarm) or from user tags (Dawarich, GeoPulse). Dawarich 1.18–1.21 (Oct–Nov 2026) turned Areas into Places with a visit radius, tags, archive, bulk merge, and sort by last visit / visit count — so the backend for a places directory exists; what is missing is a good per-place page. "Home/work" is rarely an explicit feature; it shows up as "time at home vs elsewhere / nights away" (Reitti) or "regular bases" clusters (Dawarich).

### Cited Findings
- **Google Timeline Places/Cities/World (2019+, now app-only):** Places "groups all the locations you've visited by category" (restaurants, stores, hotels, airports, sports, cultural); sort by most recent or most visited; from a place you can see your last visit, save it to a list, or remove all visits; Cities groups places by city and World by country; lists can be browsed on the map with zoom — [Android Police, 2019-08-14](https://www.androidpolice.com/2019/08/14/visually-enhanced-google-maps-timeline-groups-visited-places-by-category-city-and-country-apk-download/)
- **Arc Timeline:** collates "place statistics, average visit durations, average calories burned, heart rate", and compares individual visits to your averages; v3.12.1 (Aug 2023) moved Place Details to a separate Place view with place merging; v3.17.2 (Apr 17, year not shown, after Jan 2025) announced Arc Timeline 4 as a rebuild "with a new Places tab and dark mode"; subscription required (Monthly $4.99 … Lifetime $219.99); paywall is the top complaint in reviews — [App Store: Arc Timeline](https://apps.apple.com/app/id1063151918). A user notes frequent places like work are confirmed automatically while new places must be added by hand — [AppTail reviews](https://apptail.io/app/arc-timeline-trips-places-NCrb/peru)
- **Dawarich Places (1.18–1.21, Oct–Nov 2026):** "Areas are now Places with a Visit Radius (up to 50 km) and keep their notes and visits"; per-place geofence "Notify on enter and leave" (1.18.0); "Archive and unarchive places"; "Search and filter Places by name, tags and confirmation status, and sort them by name, last visit or active visit count"; bulk tag change/delete/"merge them into a chosen place" (1.19.0); "Visits without a place now show on the map … using the location of their points" (1.19.0); editing a visit whose name matches its Place stops storing a separate name, so the visit "follows later renames" (1.21.0) — [Dawarich releases](https://github.com/Freika/dawarich/releases)
- Dawarich "Place Search: Search for places on the map and view your visit history there" — [Dawarich docs: features](https://dawarich.app/docs/category/features/); described in the 2025 review as checking whether you visited a place before, plus tags with per-tag privacy zones — [Dawarich blog, 2026-01-07](https://dawarich.app/blog/2025-for-dawarich/)
- Dawarich Insights "Top Visited Locations": top five places for the selected year ranked by visit count and total time (needs Visits + Places + reverse geocoding); "Location Clusters: geographic areas where you spend the most time, which helps identify your regular bases" — [Dawarich docs: Insights](https://dawarich.app/docs/features/insights/)
- **GeoPulse:** "Favorite Point" (radius = stay-detection radius) and "Favorite Area" (drawn rectangle, for campuses/parks/malls), created by right-click on the timeline map; naming priority for stays: Favorites → cached reverse geocoding → primary provider → failover → "Unknown location"; editable reverse-geocoding cache (display name, city, country), edits create a user-specific copy; creating/deleting a favorite regenerates the timeline in background — [GeoPulse docs: Managing Places](https://geopulse.cc/docs/user-guide/core-features/managing-places). "City details" shows a visit overview, top places and every visit in a city; "Location Analytics" explores visits by map, city and country — [GeoPulse README](https://github.com/tess1o/geopulse)
- **Swarm:** history search by "events, categories, and attractions" (7.0.39), search on "You Map" includes saved places (7.0.37), milestones "track your most-visited spots" — [App Store: Swarm](https://apps.apple.com/app/id870161082)
- **Reitti:** "Frequently visited places can be recognized and named"; statistics cover "time and distance spent at home, at other places, and in transit" and "nights away from home, and where"; place names and days link back to the timeline — [Reitti GitHub](https://github.com/dedicatedcode/reitti)
- A small app, Places History, is built around exactly one job: "see all the dates on which you have visited a place" (search snippet) — [Places History](https://gdcl.co.uk/places/)

### Inferences
- With 6.7k mostly unnamed visits, the directory should be **cluster-first**: group unnamed visits by proximity (or by Dawarich's suggested place), rank by total time and visit count, and put "name this" actions on the top clusters — the 20–50 biggest clusters likely cover most of the user's time. This is the single highest-leverage labelling surface.
- Per-place page (the "Your visits" pattern): mini-map with radius, first/last visit, total visits, total time, average duration, a **visits-per-month sparkline or calendar strip**, typical weekday/hour, list of visits (each linking to the day view). Arc's "compare this visit to your average" is a nice touch for later.
- Categories: prefer user tags (Dawarich tags already exist and can carry privacy zones) over POI categories; offer a small default tag set (home, work, family, food, shopping, transport, travel lodging).
- Home/work: detect as top clusters by night-time (e.g. 00:00–06:00) and weekday-daytime dwell; confirm with the user once; then derive "time at home", "nights away" (Reitti) and use home for "furthest from home" (Polarsteps) and trip suggestions. Keep home inside a Dawarich privacy zone for any share/export.
- Cities/countries directory (Google Cities/World, GeoPulse City details) can reuse Dawarich's countries/cities APIs: list with flag, days, visits, first/last date; click → map filtered to that city.

### Gaps
- No primary source found on how Google Timeline auto-assigns Home/Work labels in the on-device era, or on any product's explicit home/work detection algorithm.
- Arc Timeline 4's new Places tab: only the one-line release note found; no review or screenshot description.
- Dawarich docs page for "Visits and Places" not fetched; per-place page contents in Dawarich unverified beyond release notes.

## 3. Metrics and insights: what is offered and what users value

### Takeaway
The common metric kit is: **total distance, distance/time by transport mode, countries, cities, active days, top places, time-of-day/weekday patterns, comparisons with the previous period, streaks/badges**. Dawarich's /insights page (1.16.0, Oct 2026) now covers almost all of it, including a country-coloured year calendar, "Where you spent the year", distance race vs last year, mode breakdown and Days-per-Country with a 183-day warning. Evidence on what users value is thin but consistent: people use history to **recall where they were** (trips, timesheets, specific days) and enjoy the **year-over-year comparison that reveals life events** (e.g. COVID in 2020); gamified badges and "wellness" ratios are less often cited, and even maintainers admit stats "depend on data quality".

### Cited Findings
**What products offer**
- Google Timeline Insights (2021): monthly summary with how far/long you travelled by car, bicycle or on foot, time spent at categories of places (shops, airports, restaurants) with drill-down to individual places, "monthly trends about how you're navigating the world" — [9to5Google, 2021-07-21](https://9to5google.com/2021/07/21/google-maps-timeline-insights/)
- Dawarich /insights (Stats and Insights merged in 1.16.0): overview cards "Total Distance", "Countries Visited", "Cities Visited", "Days Traveling"; All Time → one card per year with route map (six most recent years), distance and a twelve-month strip; single year → "Distance by month"; "Year Calendar" (views "Countries + distance", "Countries", "Distance"); "Where You Spent the Year" (country stretches with day counts); "Distance Race" (cumulative distance vs same days last year); "Activity Streak" (current/longest); "Year Comparison" (% change in distance, countries, cities, active days); "Activity Breakdown" share of tracked time per mode (Driving, Walking, Cycling, Running, Train, Bus, Flying, Boat, Stationary); "Monthly Digest" (weekly pattern, top locations, "First Visits" with badges, month-over-month); "Travel Patterns" (time of day, day of week, seasonality); "Movement & Wellness" (active time, sedentary vs active ratio); "Location Clusters"; "Top Visited Locations". Countries use UTC days while distances use local time, so they can differ near midnight — [Dawarich docs: Insights](https://dawarich.app/docs/features/insights/)
- Dawarich counting rules: cities only count if you stayed "for at least an hour" (late-2025 rework) — [Dawarich blog](https://dawarich.app/blog/2025-for-dawarich/); flown-over countries no longer count toward trips, digests or Insights day counts (1.17.0); AirTrail flights count toward distance (1.18.0); countries count when geocoding finds a country but no city (1.19.0); "Days per Country" counts days per country with stay periods and a 183-day (tax residency) warning — [Dawarich releases](https://github.com/Freika/dawarich/releases), [Dawarich docs: features](https://dawarich.app/docs/category/features/)
- Dawarich Achievements: collectible cards for countries/regions, shareable/embeddable; 1.20.0 added city-exploration achievement cards whose catalog "covers Berlin, Hamburg, Dresden, Harz, Saxon Switzerland and Eifel" and "is not a worldwide catalog" — [Dawarich releases](https://github.com/Freika/dawarich/releases), [Dawarich docs: features](https://dawarich.app/docs/category/features/)
- GeoPulse "Journey Insights": "Countries Explored" (flags), "Cities Visited" (with visit counts), "Total Distance Traveled", "Distance by Car" and "Distance Walking" (value + % of total), "Most Active Month Ever", "Current Month Performance", "Busiest Day of Week", "Most Active Time of Day", and badge milestones (country, city, total distance, single-trip distance, consecutive days, time of day, speed) — [GeoPulse docs: Journey Insights](https://geopulse.cc/docs/user-guide/core-features/journey-insights)
- Reitti statistics: monthly/yearly/all-time reports of time and distance at home vs other places vs in transit, mode breakdown, "usual trips & routines", "nights away from home, and where", comparisons with earlier periods — [Reitti GitHub](https://github.com/dedicatedcode/reitti); maintainer: statistics are functional "but could do much more" and depend on data quality (search snippet) — [Reitti v2.0.0 thread](https://scribe.disroot.org/comment/7680268)
- Country-counter apps ("Been" family): VINCI "been" shows visited countries as a list with a ratio per continent and as a world map, plus US states — [App Store: been](https://apps.apple.com/us/app/680148327); "been — travel map & tracker" counts UN members, total countries, regions, continents and offers a shareable passport — [Google Play](https://play.google.com/store/apps/details?id=pro.brouwer.been); BeenEverywhere adds northernmost/southernmost latitude and Travelers' Century Club territories — [App Store: BeenEverywhere](https://apps.apple.com/app/id6749190331)
- Fog of World: levels, per-continent visit percentages, "Passport" with divisions (states/provinces) and rankings, "Territory Rankings" with exploration ratios, many badges; $30 one-off, no account, data on device — [App Store: Fog of World](https://apps.apple.com/app/fog-of-world/id505367096)
- Swarm: lifetime check-ins, unique categories, streaks, badges for "new cities, and new places"; Monthly Recap redesigned (7.0.25, Oct 24 2025) — [App Store: Swarm](https://apps.apple.com/app/id870161082)
- Life Cycle (Northcube / now listed under Sleep Cycle AB): "presents your life sorted into slices" as donuts, day/week/month/year; weekly journal with insights; premium trend comparisons (sleep, work, walking) — [App Store: Life Cycle](https://apps.apple.com/app/id1064955217). Status unclear: App Store shows v3.2.7 dated 01/27/2025 while an app tracker lists a last update of May 19, 2026 — [AppFollow](https://apps.appfollow.io/ios/life-cycle-track-your-time/1064955217?country=ca); one aggregator labels it discontinued without evidence — [SaaSHub](https://www.saashub.com/life-cycle-app-alternatives). Treat as legacy/stagnant, not as a design reference for maintenance.

**What users value or ignore**
- A long-time Google Timeline user: "I love to be able to scroll back in time and see where I was months or years ago"; used it to recount trips and fill an office timesheet; the yearly 2019 vs 2020 comparison graphic "clearly shows when things started getting serious in March 2020" — [exde601e blog, 2021-04](https://exde601e.blogspot.com/2021/04/travel-insights-from-google-maps.html)
- A Reddit user: Timeline used to check which days/hours they worked and to recall trips; "Timeline is one of the few Google features I use" — [r/GoogleMaps megathread (mirror)](https://reddit.sudovanilla.org/r/GoogleMaps/comments/1diivt3/megathread_google_maps_timeline_moving_to)
- Life Cycle review: the "execution makes the app more difficult to use than it's insights are worth" (2017) — [App Store: Life Cycle](https://apps.apple.com/app/id1064955217)
- Fog of World reviewers ask for regional stats (km² and % per US state), city lists, an eraser and a "re-fog" for areas not visited recently — [App Store: Fog of World](https://apps.apple.com/app/fog-of-world/id505367096)
- Self-hosted switchers cite setup ease, intuitive UI, live sharing and paywall concerns — not statistics — when choosing GeoPulse over Dawarich (promotional thread, small sample) — [r/selfhosted snapshot](https://reddit.sentinel-team.org/posts/1r805jh/snapshots/2026-02-18T19%3A13%3A40.119241Z)

### Inferences
- Prioritise metrics that answer **recall questions** ("when was I last in X?", "how many days in Portugal in 2023?", "which weekends was I away?") over abstract ratios. Concretely, for v1: per-year cards (distance, countries, cities, days away, nights away) with a 12-month strip; distance & time **by mode per month** (stacked bars; Dawarich tracks already carry mode); **countries/cities with days and first/last visit**; **Days per Country** timeline; **home vs away** (days/nights).
- Records worth showing (cheap, memorable): longest trip, furthest point from home, most countries in a year, longest walking day, busiest travel month, first visit dates ("First Visits" in Dawarich).
- De-prioritise: wellness ratios ("sedentary vs active"), time-of-day distributions, gamified badges/levels. They exist everywhere but are not what users cite; keep them out of the first screen.
- Reuse Dawarich numbers instead of recomputing where possible (consistency with digests), but be aware of its rules (UTC days for countries, ≥1 h for cities, flights counted in distance). Show "flights excluded/included" explicitly in mode charts — flights can dominate km totals.
- With 2017–2026 data, the **year-over-year comparison** is the insight with real narrative value (moves, pandemic, new job); make it a first-class view.

### Gaps
- Could not find the phrase "not terribly useful" in any reachable source; no systematic survey of which location insights users ignore. Evidence on value is anecdotal (blogs, reviews, Reddit).
- No primary description of Google's current (2025–2026) on-device Insights screen.

## 4. Map exploration: all-time maps, "where have I been" explorers, filters, performance

### Takeaway
All-time exploration comes in four visual idioms: **lines** (routes/tracks), **density** (heatmap), **coverage** (fog-of-war / visited cells, Fog of World), and **areas** (scratch map of countries, city lists). Dawarich now offers all four on a single MapLibre (WebGL) map — points, routes, heatmap (time-weighted since 1.17.0), fog of war (H3 res-9 exploration cells since 1.20.0), scratch map, places, photos, replay, globe — with a date picker from one day to full history. What none of the references document well is **filtering by transport mode** and **legibility at low zoom**; those are the openings for the Odysseus view. (Rendering techniques and the photo layer are detailed in section 6.)

### Cited Findings
- Dawarich map: "Dawarich has one map, built on MapLibre GL JS" rendering with WebGL; the Leaflet Map V1 was removed and /map/v1 redirects; date picker covers one day to full history; buttons with shortcuts Timeline (T), Layers (L), Search (/), Family (F), Tools (C), Replay (R), Settings (S); layers Points, Polylines/Routes (configurable time/distance gaps), Heatmap, Fog of War, Scratch Map (visited countries), Places (with boundaries and tag filter), Photos (Immich/Photoprism), Family; route hover shows distance, duration, average speed and transport mode; speed-coloured routes (green→red); Globe Projection toggle; performance tips: "disable layers you aren't using" and "start with shorter time ranges"; the page does **not** describe filtering by transport mode — [Dawarich docs: Map](https://dawarich.app/docs/features/map/)
- Dawarich release notes on the map: "The heatmap is weighted by time spent at a place instead of how often points were recorded there" and map tiles for other months not re-downloaded while new points arrive (1.17.0); "Fog of War now follows the shared exploration cells", cities and fog share "one all-history resolution-9 H3 ledger" (1.20.0); map runs on MapLibre GL JS 6.16.0 (1.18.1); privacy zones hide data on your own map, trip pages, replay and posters (1.18.0) — [Dawarich releases](https://github.com/Freika/dawarich/releases)
- Dawarich performance history: in Jan 2026 the maintainer reported 680k points over 14 years taking "a few minutes" to load — [Dawarich blog](https://dawarich.app/blog/2025-for-dawarich/); after moving rendering to map tiles (1.14), a 957,350-point test set reportedly loads in under a second — [tproger (RU)](https://tproger.ru/news/dawarich-1-14-risuet-million-gps-tochek-za-sekundu-vmesto-padeniya); 1.17.0 cut idle memory from 480 MiB to 230 MiB on a million-point account — [Dawarich releases](https://github.com/Freika/dawarich/releases)
- Dawarich "Map period statistics", "Photo cluster gallery" and "Thematic country collections" pages exist for 1.20.0 — [Dawarich docs: features](https://dawarich.app/docs/category/features/)
- Fog of World: "remove the fog on the map by exploring the world"; records tracks in background and "shows everywhere you've been on one map"; Track Editor (3.7/3.8) to erase drift, fill tunnel gaps, straighten paths; multiple databases with snapshots shown as layers; GPX/KML import; iCloud/Dropbox/OneDrive sync; reviewers complain of battery drain and difficulty removing unwanted tracks — [App Store: Fog of World](https://apps.apple.com/app/fog-of-world/id505367096)
- GeoPulse: "Location Analytics" (visits by map, city, country), Rewind heatmaps, optional Panoramax street-level imagery, Immich photos and Memos notes on the timeline — [GeoPulse README](https://github.com/tess1o/geopulse)
- Google Timeline Places/Cities/World lists can be browsed "on the map and zoom in and out" — [Android Police, 2019](https://www.androidpolice.com/2019/08/14/visually-enhanced-google-maps-timeline-groups-visited-places-by-category-city-and-country-apk-download/)
- Swarm "You Map": revisit check-ins and saved spots, searchable (Explore Map V2, 7.0.35; 7.0.37) — [App Store: Swarm](https://apps.apple.com/app/id870161082)

### Inferences
- Offer one all-time map with a **layer switcher of 3–4 idioms** (density, coverage cells, routes, countries) rather than separate pages; default to density/coverage at low zoom and routes at high zoom (zoom-dependent switch).
- Filters that the references lack and that this dataset supports: **transport mode** (11.4k tracks have mode: walk/bike/car/train/flight toggles), **year / date range** with a histogram scrubber, and **trip** (pick a trip → map zooms to it). Put filters in the URL (Dawarich trips pattern).
- Clicking a dense cell/area should answer "when was I here?": a side panel with visit dates/time spent and links to the day view — this connects the map to the Places directory and to the day view already built.
- Never ask Dawarich for raw points of the whole history in the browser; use its tile/aggregate endpoints or a server-side aggregate (see section 6).

### Gaps
- Dawarich map-readability issues and low-zoom legibility techniques are covered in section 6.
- Google Timeline (on-device) has no documented all-time map in 2025–2026 sources found.

## 5. Year in review and digests

### Takeaway
Year-in-review is a well-established, liked format (Google's yearly Timeline emails since ~2016 → "Spotify Wrapped for your travels" in 2024; Polarsteps "Unpacked" since Dec 2025; Swarm Monthly Recap; GeoPulse Rewind; Dawarich yearly digest since 0.37.0 and monthly digests from April 2026). The canonical content is: countries/cities/places counts, distance by walking/driving (by mode), a monthly chart, top places, first-time visits, comparison with the previous year, and a share link.

### Cited Findings
- Google: the 2019 Timeline email broke visits down by country, city and place and compared them to the prior year, with "Your activity" for walking/vehicle distance and time; the 2020 edition added a trends section and city/place highlights (search snippets) — [9to5Google 2019 Timeline](https://9to5google.com/2020/01/09/google-maps-2019-timeline/), [9to5Google 2020 recap](https://9to5google.com/2021/01/09/google-maps-2020-recap/). The 2024 update, shared via Gmail, recounted countries, cities and individual places visited and charted distance walking and driving (search snippet) — [TechRadar](https://www.techradar.com/phones/googles-2024-timeline-update-is-like-spotify-wrapped-for-your-travels). Auto-delete settings reduce what the recap can show (search snippet, same source).
- Monthly Google "Timeline update" emails existed and became sparser in 2020 — [exde601e blog](https://exde601e.blogspot.com/2021/04/travel-insights-from-google-maps.html)
- Polarsteps Unpacked 2025: in-app, "personalized, story-driven look back", "Designed to be fun to explore and even more fun to share", available from 15 Dec 2025 to users with "at least one trip (with content) in the past year" — [Polarsteps news](https://www.polarsteps.com/news/polarsteps-unpacked-and-2025-travel-report-the-year-in-travel); coverage says it shows countries visited, furthest point reached, the travel companions you clocked most miles with and the themes of your year (search snippet) — [IKON London Magazine](https://www.ikonlondonmagazine.com/polarsteps-unpacked-year-in-travel/)
- Dawarich digests: year-end digest email added in 0.37.0 — [newreleases 0.37.0](https://newreleases.io/project/github/Freika/dawarich/release/0.37.0); 0.37.2 fixed month ordering (Jan–Dec) of the digest chart and country/city time calculations — [newreleases 0.37.2](https://newreleases.io/project/github/Freika/dawarich/release/0.37.2); digests can be generated manually and emailed with SMTP — [Dawarich blog](https://dawarich.app/blog/2025-for-dawarich/); monthly "short ASCII-styled digest" emails from April 2026 (community post, May 2026) — [r/selfhosted snapshot](https://reddit.sentinel-team.org/posts/1t4emiu/snapshots/2026-05-05T21%3A45%3A31.49188Z); Digests API GET/POST/DELETE /api/v1/digests, generated asynchronously (202 Accepted) (search snippet) — [newreleases 1.2.0](https://newreleases.io/project/github/Freika/dawarich/release/1.2.0); "The year digest counts time by country and travel patterns in your timezone" (1.17.0); public digest share links (1.16.0) — [Dawarich releases](https://github.com/Freika/dawarich/releases); yearly digests fire Jan 2 06:00 UTC and distances use the user's unit (search snippet) — [Cloudron forum](https://forum.cloudron.io/topic/14566/dawarich-package-updates/25)
- GeoPulse Rewind: Monthly/Yearly toggle with year and month selectors; sections "Metrics at a Glance" (total distance, active days, % change vs previous period), "Highlights", "Top Places", "Milestones", "Activity Trends"; screenshot caption mentions a location heatmap — [GeoPulse docs: Rewind](https://geopulse.cc/docs/user-guide/core-features/rewind). The quick-start guide instead describes Rewind as map replay with play/speed controls (conflicting descriptions) — [GeoPulse quick start](https://tess1o.github.io/geopulse/docs/getting-started/quick-start)
- Swarm Monthly Recap redesigned "with smoother navigation and better insights" (7.0.25, Oct 24 2025) — [App Store: Swarm](https://apps.apple.com/app/id870161082)
- Dawarich Insights "Monthly Digest" block: distance, active days, countries, cities, weekly pattern, top locations, first visits, month-over-month — [Dawarich docs: Insights](https://dawarich.app/docs/features/insights/)

### Inferences
- Don't rebuild digests from scratch: render Dawarich's digest (via /api/v1/digests where available) inside the app, and add what it lacks for this user: a **year map** (density for that year), **trips of the year** strip with thumbnails, **first-time places/cities/countries**, **home vs away nights**, and **comparison with previous year**.
- A "scrollable story" layout (Wrapped/Unpacked) works on phone; on desktop prefer a single dense report page per year with anchor sections. Offer an "on this day / this month in past years" card in the Life hub — it uses the same data and is the recall pattern users mention most.
- Keep sharing off by default (privacy-first); if added, export a static image without home location.

### Gaps
- Exact content/sections of Dawarich's yearly digest email not found in primary docs (only release notes and forum snippets).
- No verified source for a Google 2025 Timeline recap; a "2026 Wrapped" claim seen in search came from a low-quality site and is excluded.

## 6. (Added requirement) The all-time "where I have been" map: legible when zoomed out, with an optional photo layer

### Takeaway
The user's top-priority view is an all-time density map that stays readable at low zoom, with photos as an optional toggle. Low-zoom unreadability is a known failure: raw points and pixel-thin lines shrink to nothing, and point-count heatmaps saturate ("everything red", the subject of a Dawarich bug fixed in 1.17.0). Three techniques fix it: **(a) aggregate per zoom** (H3 or screen-grid cells whose size stays roughly constant in pixels), **(b) weight by time spent (dwell)** instead of point count, and **(c) style by zoom** (heatmap radius and intensity interpolated by zoom, a minimum line width, and a hand-off from heatmap to cells or points as you zoom in). For photos, Google Photos (heatmap plus a bottom sheet of the photos in the current viewport) and Immich (MapLibre clusters, then a click opens the cluster's photos) are the patterns to copy. Server-side H3 aggregation cuts payload and precision, but **it is not anonymisation** for a single user, because the top cells are home and work.

### Cited Findings
**Photo maps**
- **Google Photos map (mobile only).** Under Search → Places, as "Your map" on Android or "Explore map" on iOS. It is a heatmap of photo density built from camera GPS, Location History and detected landmarks — [Guiding Tech](https://www.guidingtech.com/how-to-use-map-view-in-google-photos/), [Android Central](https://androidcentral.com/how-use-map-browse-photos-places-google-photos)
  - Layout at the 2020 launch: "A map — with hotspots — appears on the top half of the screen, while a bottom sheet shows images in the current map view". Empty areas show "No photos in this area" / "Zoom out to see photos" — [9to5Google, 2020-06-11](https://9to5google.com/2020/06/11/google-photos-explore-map/)
  - Zooming far in shows the "pathways" travelled between photos. Only the headline could be read, so the detail comes from a search snippet — [Android Central](https://www.androidcentral.com/google-photos-takes-map-view-step-further-showing-your-pathways)
  - The web version has no map. The 2020 web redesign left it out — [9to5Google, 2020-07-07](https://9to5google.com/2020/07/07/google-photos-web-redesign/); a 2019 request for a web map went unanswered — [Google Photos community](https://support.google.com/photos/thread/5343478/google-photos-web-world-map-view?hl=en)
  - An APK teardown (v7.89, Aug 2026) found an unreleased bubble map for Ask Photos results, which the article calls unpolished next to "the existing heatmap in Collections" — [9to5Google, 2026-08-19](https://9to5google.com/2026/08/19/google-photos-ask-photos-map/)
- **Apple Photos.** Albums → Places, with a toggle between Map and Grid; the grid lists every photo for the location — [Apple iPhone User Guide (iOS 16 page)](https://support.apple.com/en-lk/guide/iphone/iph390138909/16.0/ios). In iOS 18 the map moved into the "Utilities" collection — [MacRumors iOS 18 Photos guide](https://www.macrumors.com/guide/ios-18-photos/). An iOS 18.0.1 bug showed "No Photos or Videos" for some places — [Apple Discussions](https://discussions.apple.com/thread/255768044)
- **Immich web map** (`Map.svelte`, last changed 2026-11-05) — [Immich source](https://github.com/immich-app/immich/blob/main/web/src/lib/components/shared-components/map/Map.svelte)
  - It uses a MapLibre GeoJSON source with `cluster={{ radius: 35, maxZoom: 18 }}`.
  - Clusters are 40 px count circles with no thumbnail; single photos are 60 px round thumbnails that grow 1.5× on hover.
  - Clicking a cluster runs `getClusterLeaves(clusterId, 10_000)` and passes the asset ids and bounding box to a selection handler.
  - Filters: `relativeDate`, `dateAfter`/`dateBefore`, favourites only, archived, partners, shared albums.
  - The mobile app uses a heatmap instead — [Immich PR #6553](https://github.com/immich-app/immich/pull/6553)
- **Immich user requests and complaints**
  - Map plus timeline on the web: "I would like to use a map to filter the timeline" (104 upvotes) — [Immich discussion #4519](https://github.com/immich-app/immich/discussions/4519)
  - Clicking a "161" cluster opens one photo instead of a grid — [#17785](https://github.com/immich-app/immich/discussions/17785)
  - The mobile heatmap "goes full red even if only one photo", so there is no relative density (2025) — [#22834](https://github.com/immich-app/immich/discussions/22834)
  - The mobile heatmap is slow: about 10 s to load with 40k assets, and iOS freezes with 180k — [#11977](https://github.com/immich-app/immich/discussions/11977)
  - A new web map heatmap and controls PR has been open since 2026-06 and is postponed until after v3 — [PR #28892](https://github.com/immich-app/immich/pull/28892)
  - Cluster counts include partner photos that the click then doesn't show — [#28851](https://github.com/immich-app/immich/issues/28851)

**Dawarich: heatmap, fog, legibility issues**
- **Heatmap weighted by time spent (1.17.0, 2026-10-23).** "The heatmap is weighted by time spent at a place instead of how often points were recorded there" — [Dawarich releases](https://github.com/Freika/dawarich/releases)
  - How it works: point vector tiles now carry a per-cell `dwell` value. For each point it counts the seconds until the next point, capped at 300 s, and sums them over the cell. Heatmap weight is linear in `dwell`, and old tiles without it fall back to point count — [Dawarich PR #3865](https://github.com/Freika/dawarich/pull/3865)
  - It fixed issue #3597, "Heatmap color scale is unusable": everything rendered red because 1 Hz GPX tracks dominated — [Dawarich #3597](https://github.com/Freika/dawarich/issues/3597)
  - An earlier issue made the same point: device-dependent point density makes the heatmap useless and the frontend slow — [#946](https://github.com/Freika/dawarich/issues/946)
- **Fog of War on H3 cells (1.20.0, 2026-10-30).** City cards and the map fog now share "one all-history resolution-9 H3 ledger" — [Dawarich releases](https://github.com/Freika/dawarich/releases)
  - "Fog of War now follows the shared exploration cells. The per-point mode and the fog radius and threshold settings were removed."
  - Date ranges highlight first discoveries.
  - New or deleted points appear within an hour, and privacy-zone changes apply immediately.
- **Photo-cluster gallery (1.20.0).** Clicking a photo cluster opens a gallery with 24 thumbnails per page. It works on phones, has keyboard navigation, and copes with identical coordinates — [Dawarich releases](https://github.com/Freika/dawarich/releases), [#3652](https://github.com/Freika/dawarich/issues/3652)
- **Zoom-related bugs**
  - Map v2 heatmap visible country-wide but gone at city zoom (closed 2026-05) — [#2087](https://github.com/Freika/dawarich/issues/2087)
  - Heatmap and fog don't scale during pinch-zoom — [#1798](https://github.com/Freika/dawarich/issues/1798)
  - "Bad map performance after recent update", still open; the reporter said on 2026-11-04 it is "a bit better" — [#3844](https://github.com/Freika/dawarich/issues/3844)
  - Immich photos on the map weren't filtered by date — [#1755](https://github.com/Freika/dawarich/issues/1755)
- **Plans.** Hexagon layers are a Pro layer and are not applied on the Lite cloud plan (1.21.0) — [Dawarich releases](https://github.com/Freika/dawarich/releases)
- No Dawarich issue was found specifically about points or lines becoming tiny when zoomed out (searched "zoom", "points too small", "line width", "heatmap radius").

**Rendering techniques**
- **MapLibre heatmap layer properties** — [MapLibre style spec: layers](https://maplibre.org/maplibre-style-spec/layers/)
  - `heatmap-radius`: pixels, default 30; zoom and data expressions allowed.
  - `heatmap-weight`: data-driven, default 1; a weight of 10 equals ten points.
  - `heatmap-intensity`: zoom-only, default 1, "typically adjusted by zoom level".
  - `heatmap-color`: built on `["heatmap-density"]`.
  - `heatmap-opacity`: zoom-interpolable.
  - `line-width`: pixels, default 1, zoom-interpolable, with no built-in minimum.
- **Official "Create a heatmap layer" example** — [MapLibre example](https://maplibre.org/maplibre-gl-js/docs/examples/create-a-heatmap-layer/)
  - Layer `maxzoom` 9.
  - Weight interpolated from data, 0 to 1.
  - Intensity 1 at z0 rising to 3 at z9.
  - Radius 2 px at z0 rising to 20 px at z9.
  - Opacity fades from 1 at z7 to 0 at z9, while a circle layer fades in from z7 to z8, so points take over from the heatmap.
- **Leaflet.heat** — [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat)
  - Defaults: `radius` 25, `blur` 15, `minOpacity` 0.05, `max` 1; `maxZoom` defaults to the map's maxZoom.
  - Below `maxZoom`, each point's intensity is halved per zoom level, and points merge into grid cells of `(radius+blur)/2` px.
  - Consequence: sparse places fade out when zoomed out unless you lower `maxZoom` or `max`.
- **deck.gl aggregation layers**
  - ScreenGridLayer bins in screen space, so cell size stays fixed in pixels at every zoom (`cellSizePixels` default 100). Weights aggregate by SUM/MEAN/MIN/MAX/COUNT, on the GPU by default — [deck.gl ScreenGridLayer](https://deck.gl/docs/api-reference/aggregation-layers/screen-grid-layer)
  - HexagonLayer sets `radius` in metres (default 1000), so hexagons shrink as you zoom out. Colours can use percentile cut-offs and a `quantile` scale — [deck.gl HexagonLayer](https://deck.gl/docs/api-reference/aggregation-layers/hexagon-layer)
  - H3HexagonLayer takes H3 ids and expects one resolution per layer; it needs high precision for resolutions 0–5 — [deck.gl H3HexagonLayer](https://deck.gl/docs/api-reference/geo-layers/h3-hexagon-layer)
- **H3 average cell sizes** — [H3 resolution table](https://h3geo.org/docs/core-library/restable/)

  | Res | Avg edge | Avg area |
  |---|---|---|
  | 4 | 26.1 km | 1,770 km² |
  | 5 | 9.85 km | 253 km² |
  | 6 | 3.72 km | 36 km² |
  | 7 | 1.41 km | 5.16 km² |
  | 8 | 531 m | 0.737 km² |
  | 9 | 201 m | 0.105 km² |
  | 10 | 76 m | 15,048 m² |
- **Supercluster** — [mapbox/supercluster](https://github.com/mapbox/supercluster)
  - Defaults: `radius` 40 px, `maxZoom` 16, `minPoints` 2.
  - `map`/`reduce` hooks can aggregate per cluster, for example summing dwell time or choosing a cover photo id.
  - Methods: `getLeaves(id, limit, offset)`, `getClusterExpansionZoom`.
  - The README has a 6M-point demo but no benchmark numbers.
- **Large data in MapLibre** — [MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)
  - Prefer vector tiles for large data, served from the database by Martin.
  - For a GeoJSON source: maxzoom about 12 (not 22), about 6 decimals of coordinates, strip unused properties, split data into chunks.
  - The clustering example uses `clusterRadius` 50 and `clusterMaxZoom` 14.
- **tippecanoe** — [felt/tippecanoe](https://github.com/felt/tippecanoe)
  - `--drop-densest-as-needed` and `--cluster-densest-as-needed` keep tiles under 500 KB.
  - `--accumulate-attribute` carries sums from dropped points onto the points that remain, which suits dwell time.
  - Default drop rate is 2.5 per zoom below basezoom.
- Dawarich itself already serves point MVT tiles from Postgres — [Dawarich PR #3865](https://github.com/Freika/dawarich/pull/3865)

**Privacy: aggregating to cells on the server**
- **Uber's H3 blog** presents hexagon bucketing for analytics, because hexagons have "only one distance between a hexagon centerpoint and its neighbors". It does not discuss privacy — [Uber blog: H3](https://www.uber.com/blog/h3/)
- **H3 as an anonymisation tool**
  - Hexanonymity (2023) is k-anonymity built on H3, generalising locations to progressively larger cells — [Hexanonymity paper](https://inesortega.github.io/publication/2023-hexanonymity-paper)
  - A k-anonymous origin–destination study generalises locations to H3 res-10 centres — [arXiv 2509.12950](https://arxiv.org/pdf/2509.12950v1)
- **Google's mobility research (2019)** aggregates to S2 cells and coarse time buckets, adds k-anonymity thresholds ("sufficiently large number of accounts"), then differential-privacy noise — [Google Research blog](https://research.google/blog/new-insights-into-human-mobility-with-privacy-preserving-aggregation/)
- **Strava's global heatmap** shows heat only where "multiple people have completed an activity", excludes private activities and crops privacy zones. Researchers still inferred homes with about 37.5% accuracy, noting "a more active user produces more heat" — [BleepingComputer, 2023](https://www.bleepingcomputer.com/news/security/strava-heatmap-feature-can-be-abused-to-find-home-addresses/)
- No other self-hosted location app was found that publicly documents cell-only delivery to the browser. Dawarich's res-9 ledger is the closest example, but it is unconfirmed whether its fog layer sends cell ids or rendered geometry to the client.

### Inferences
**Recommended design for the all-time map** (this is the user's priority view)
1. **Base layer: time-weighted H3 cells.**
   - Aggregate on the server, on the NAS/Odysseus backend or from Dawarich data at request time.
   - Each cell carries total dwell seconds, distinct days, first/last seen, and a dominant transport mode.
   - Pick the resolution by zoom so cells stay about 10–20 px wide. This is the subagent's own estimate; no official table was found:

     | Zoom | H3 res |
     |---|---|
     | z3 | 2 |
     | z5 | 4 |
     | z7 | 5 |
     | z9 | 6–7 |
     | z11 | 8 |
     | z13 | 9 |
     | z15+ | 10 |

   - Colour on a log or quantile scale of dwell (deck.gl's percentile/quantile options, or precomputed class breaks) so a single visit stays visible next to home.
   - This fixes the "tiny dots when zoomed out" problem by construction, because a visited cell never drops below roughly 10 px.
2. **Optional smooth heatmap look.** Use a MapLibre heatmap fed by cell centroids with `heatmap-weight` = log(dwell). Interpolate `heatmap-radius` and `heatmap-intensity` by zoom (official example: radius 2→20 px and intensity 1→3 over z0–z9), then cross-fade to cells or routes from about z9. Avoid Leaflet.heat, whose per-zoom halving makes sparse places vanish when zoomed out.
3. **Routes layer** (toggle; default on from about z8). Set `line-width` interpolated by zoom with a floor of about 1.5–2 px. Colour by transport mode and filter by mode.
   - At low zoom draw simplified tracks only, or nothing. Flights as great-circle arcs are an exception: they read well zoomed out.
4. **Coverage/fog mode** (toggle). Show the same cells as "visited / not visited", like Fog of World and Dawarich fog, plus a countries "scratch" fill at z0–4 using the Dawarich countries data.
5. **Interaction.**
   - Clicking a cell opens a side panel (a bottom sheet on phone): time spent, number of days, first/last visit, top named places in the cell, and a list of days linking to the day view.
   - A date-range or year scrubber and mode toggles in the URL.
   - The viewport-driven list is the Google Photos bottom-sheet pattern, applied to places instead of photos.
6. **Photo layer (optional toggle).**
   - Fetch photo locations from Immich, ideally aggregated server-side too, and cluster with Supercluster or MapLibre clustering. Use `reduce` to carry a cover thumbnail id and a count.
   - Clusters render as thumbnail plus count, which goes beyond Immich's bare count circles.
   - Clicking a cluster opens a paged grid of its photos (Dawarich 1.20 uses 24 per page). Do not open a single photo; that is Immich complaint #17785.
   - Respect the active date filter (Dawarich bug #1755).
   - On phone, use the Google Photos layout: map on top, grid of photos in the viewport as a bottom sheet.
7. **Performance at about 170k points.**
   - Never ship raw points for all-time views.
   - Per-resolution cell tables are small: a few thousand cells at res 5–7, tens of thousands at res 9 for a decade of one person's data. That is a payload estimate, not measured.
   - Return cells as JSON keyed by H3 id, render with deck.gl H3HexagonLayer or as MapLibre polygons built client-side with h3-js, and cache per (res, date range, mode).
   - Alternative: use Dawarich's own MVT tiles, which already carry dwell.
8. **Privacy.**
   - Serving only H3 ids plus aggregates keeps raw coordinates and timestamps off the client and reduces precision. That fits "coordinates fetched live, not stored on the PC".
   - It is not anonymisation: the top res-9/10 cells are home and work.
   - Mitigations:
     - Keep the endpoint authenticated.
     - Coarsen or suppress cells inside Dawarich privacy zones (already applied server-side since 1.18.0).
     - Cap resolution, for example res ≤ 8, for any shared or exported image.
     - Don't cache cell payloads to disk in the browser.

### Gaps
- No primary Google help page for the Google Photos map, no evidence of a date filter on it, and no primary-source user sentiment. Apple Photos clustering behaviour is described only by third-party walkthroughs.
- The claim that Strava normalises heat per tile ("The Global Heatmap, Now 6x Hotter") could not be verified: Medium returned 403 and the mirror returned 404. It is left out of the findings.
- There is no official zoom-to-H3-resolution table; the mapping above is a derived estimate. The cell-count and payload estimates for this user's data are unmeasured; a quick count over Dawarich points at res 5/7/9 would settle them.
- pg_tileserv and Martin docs were not fetched. It is unverified whether Dawarich exposes an API for H3 ledger cells, which would let Odysseus reuse it instead of computing its own.
- No Dawarich issue was found that literally reports "points or lines tiny when zoomed out". The user's complaint is consistent with `line-width` and circle radius defaults being in pixels with no floor, but that is an inference.
