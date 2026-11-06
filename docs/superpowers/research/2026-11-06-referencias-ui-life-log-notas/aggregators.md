# Multi-source personal data aggregators / lifelog dashboards — UI/UX study (as of 2026-11-06)

Scope: how the best aggregators merge different kinds of sources into views people use, and what users praise or criticize. The goal is to ground the redesign of Odysseus "Life": day page with places as the spine, month calendar, year heatmap, unified search, and "on this day".
Status labels: **[ACTIVE]**, **[ACTIVE, PIVOTED]**, **[DISCONTINUED]**, **[HISTORICAL]** (finished series), **[UNCLEAR]**.

---

## 1. Timelinize (timelinize.com, github.com/timelinize/timelinize, Matt Holt) — data model, views, day display, volume, community reaction

### Takeaway
Timelinize **[ACTIVE, pre-1.0 / "unstable"]** is the closest analogue to Odysseus "Life". Its model is generic: *items* each carry one of 11 *classifications*, *entities* have time-bounded *attributes*, and labelled *relationships* connect them. Its day timeline is a single chronological feed built client-side by a heuristic grouper. The grouper keeps consecutive items of the same category together, splits messages by participant set, splits groups on time gaps (rolling mean ± 1.75 SD), caps group size per category and places a map block before the items that happened there. Each group gets a category icon and colour. Hacker News reception was strong (630 points); the main complaints were import and refresh friction, not the views.

### Cited Findings

**Positioning and status**
- Described as an "open source personal archival suite, designed for modern family history" that "organizes all your data onto a single, unified timeline on your own computer." Each timeline is "simply a folder on disk containing a SQLite database alongside your data files"; "All items are stored verbatim" and thumbnails are generated separately. — [timelinize.com](https://timelinize.com/)
- The README calls the project "still unstable", warns that the schema changes between versions, and tells users to keep their original data and expect to recreate timelines. — [GitHub README](https://github.com/timelinize/timelinize). The docs carry the same warning: "Timelinize is unfinished software… expect that you will have to reset with new timelines when you upgrade." — [timelinize.com/docs](https://timelinize.com/docs)
- Repository state on 2026-11-06 (GitHub API): about 3,697 stars, 56 open issues, last push 2026-05-22 (dependency upgrade plus a Telegram fix), latest release **v0.0.28 on 2025-10-17**, with v0.0.26 and v0.0.27 a few days earlier. Development has visibly slowed since the October 2025 launch burst. — [GitHub releases](https://github.com/timelinize/timelinize/releases), [commits](https://github.com/timelinize/timelinize/commits/main)
- License AGPL-3.0. The author's motive: "now is the time to liberate my data from corporations who don't own it." — [GitHub README](https://github.com/timelinize/timelinize)
- The site lists these sources as available: Facebook, Instagram, X, Google Photos, Apple Photos/iCloud, iMessage, SMS/MMS, Strava, GitHub, GPS, Telegram, files and folders, Google Takeout, iPhone, Firefox. **Chrome and Home Assistant are listed as planned.** Health, music played, weather and news are also "planned" data types. — [timelinize.com](https://timelinize.com/). The docs add pages for WhatsApp, Google Voice, Calendars, Emails, GPX, KML, NMEA, GeoJSON, vCard and Google Location History. — [timelinize.com/docs](https://timelinize.com/docs)

**Data model (verified in the source code)**
- Tables: `items` (with `data_source_id`, `classification_id`, owner `attribute_id`, `original_id`, `timestamp`, `data_file`/`data_text`, `data_hash`, `hidden`, `deleted`), `entities`, `attributes` (name/value with optional coordinates), and `entity_attributes`, a link that can be bounded by `start`/`end`. There are also `relationships` (from/to item or attribute, with `relation_id`, `value`, `start`/`end`), `relations` (label, directed, subordinating), `classifications`, `data_sources`, `jobs`, `tags`/`tagged`, `notes`, `logs`, `embeddings`, and **`stories`/`story_elements`, user-authored documents that can embed items, entities, queries or external data**. — [timeline/schema.sql](https://github.com/timelinize/timelinize/blob/main/timeline/schema.sql)
- Time is modelled in detail: `timestamp` (when the content was created), `timespan` (end of a duration), `timeframe` (end of an *uncertain* interval), `time_offset` (time zone; null means local or wall time) and `time_uncertainty` in ms. A `hidden` flag removes an item from search and display without deleting it. — [timeline/schema.sql](https://github.com/timelinize/timelinize/blob/main/timeline/schema.sql)
- The 11 standard classifications, with their display labels: `message` ("Message, SMS, iMessage, DM…"), `email`, `social` ("Post on social media"), `location` ("Location of an entity"), `media` (photo/video/audio), `collection` (album/playlist), `note`, `document`, `bookmark`, `page_view` ("A visit to a web page") and `event` ("An event or item on a calendar"). A "screen" (screenshot) class is commented out. — [timeline/graph.go](https://github.com/timelinize/timelinize/blob/main/timeline/graph.go)
- Relation types: `attachment` (subordinating), `sent`, `cc`, `reply`, `quotes`, `reacted` (entity → item with a value such as an emoji), `in_collection` (with a position), `edit`, `includes` ("has, depicts, portrays, contains"), and **`visit`** ("<from_item/entity> is a visit to/with <to_item/entity>"). — [timeline/graph.go](https://github.com/timelinize/timelinize/blob/main/timeline/graph.go)
- Conversations are not stored. They "become emergent from the database by querying relationships between items and entities." — [GitHub README](https://github.com/timelinize/timelinize). The site says an "implicit conversation is discovered when a data source links items and entities with a 'sent to' relation." — [timelinize.com](https://timelinize.com/)
- Mholt on modelling entities over time: an entity can have many attributes, one attribute can link to many entities, and "the link between Entities and Attributes can be bounded by start and end times… indicating when the attribute applied" (for example someone's address or employer). He also says "the UI has a lot of catching up to do!" — [issue #139](https://github.com/timelinize/timelinize/issues/139)

**Views**
- The navigation offers Timeline, Map, Conversations, Gallery, Entities/Entity, Items (a raw list), Item (detail), Dashboard ("WIP… bubble chart"), Import and Jobs. — [frontend/pages](https://github.com/timelinize/timelinize/tree/main/frontend/pages), [GitHub README](https://github.com/timelinize/timelinize), [docs/tutorial](https://timelinize.com/docs/tutorial)
- The timeline is "grouped by types and time segments" so a user can reconstruct a day or a custom period. — [GitHub README](https://github.com/timelinize/timelinize). The site's wording: "Easily see what occurred on a specific day in the order it happened." — [timelinize.com](https://timelinize.com/)
- The map draws the path coloured by time ("a path colored to show the passage of time"). It also offers 3D satellite terrain and a heatmap. **Items without coordinates (texts, social posts) are placed on the map using nearby geolocated points for the same entity** and drawn as grey dots or pins. — [timelinize.com](https://timelinize.com/), [GitHub README](https://github.com/timelinize/timelinize)
- Screenshots on timelinize.com, with personal details obfuscated:
  - (1) a day timeline mixing an MMS, a GPS-track mini-map, a text, Twitter messages and a photo/video strip
  - (2) a world map with a time-coloured path
  - (3) a text message shown at the beach where it was received, although the message has no coordinates
  - (4) one conversation merging SMS and Facebook messages
  - (5) a gallery grid drawn from several sources
  - (6) an import page with live charts and tables
  - (7) a manual entity-merge UI
  - (8) a social post placed on the map using neighbouring points
  - (9) a 3D satellite map of a hike
  - (10) a heatmap of data density
  - (11) advanced import settings that define what counts as a duplicate
  - (12) a conversation list grouped by participants

  — [timelinize.com](https://timelinize.com/)
- The timeline page has filters for **Data sources** and **Person** ("Name or contact info"). — [frontend/pages/timeline.html](https://github.com/timelinize/timelinize/blob/main/frontend/pages/timeline.html). In the Items list each row shows a data-source logo badge with the tooltip "Imported from {source}". — [frontend/resources/js/items.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/items.js)

**How the day timeline is built (client-side heuristic, from `timelineGroups()`)** — [common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)
- `message`, `email` and `social` all become one display category, "conversation". Other classes keep their own category, and unclassified items fall back to "unknown".
- A new group starts whenever the category changes from the previous item, so runs of the same kind stay together.
- **Location points go into the most recent location group, which is spliced in *before* the current group. The code comment says "it makes more sense to see a map before the items at those locations."**
- Conversation groups are re-split by **participant set** (sender plus `sent`/`cc` recipients) and sorted by first timestamp.
- Each group is then split by **temporal locality**: a rolling window of three inter-item gaps, and a new group when the gap differs from the window mean by more than 1.75 × SD. Groups also have a **maximum size per category**: conversation 50, media 25, location 100.
- The `itemMiniDisplay()` renderers are one per category:
  - location: an embedded map fitted to the points, **cyan**, "live-view" pin icon
  - media: a thumbnail container sized by count (1 → XL, ≤3 → L, 4–6 → M, more → default), **pink**, camera icon
  - page_view: a folded or truncated page list, **purple**, history icon
  - bookmark, note and document: **lime**
  - event: **red**, calendar icon
  - messages: **indigo**
  - unknown: **grey**

  — [common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)
- Message rendering collapses reactions into emoji chips with counts, and the tooltip lists who reacted. — [common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)

**Handling volume**
- Location data is "deduplicated, denoised, clustered, and simplified". Imports can add "millions of data points… in a matter of minutes". Thumbnails, transcodes and embeddings run as background jobs. — [timelinize.com](https://timelinize.com/)
- The timeline view loads up to **2,000 items in a single query, with no pagination yet** (`// TODO: figure out how to paginate the timeline`). Older code that loaded "in batches so as not to exceed too many groups" is commented out with the note "It did not work well." Live-photo "motion" relations are excluded so they don't produce thumbnails. — [frontend/resources/js/timeline.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/timeline.js)
- Mholt says the conversation-view queries are "a bit gnarly currently" and is weighing collections or tags to separate group chats that share the same participants. — [issue #81](https://github.com/timelinize/timelinize/issues/81)
- Full-text search via SQLite FTS5 is still an open proposal. — [issue #42](https://github.com/timelinize/timelinize/issues/42)

**"On this day" and dashboard**
- Open issue "Improve dashboard" (since 2024-08-12): the dashboard "should not only show useful high-level statistics, but should also surface data from the pile," for example by showing "a timeline view of a particular day; either random or 'this day in history'-style". It also proposes letting users exclude certain entities, date ranges or locations from surfacing. A commenter asked for Timehop-style "This day in history". — [issue #8](https://github.com/timelinize/timelinize/issues/8)

**Community reaction**
- "Show HN: Timelinize – Privately organize your own data from everywhere, locally", posted 2025-10-07: **630 points, 163 comments**. — [HN Algolia](https://hn.algolia.com/api/v1/search?query=timelinize&tags=story), [HN thread](https://news.ycombinator.com/item?id=45504973)
- Main themes (paraphrased from the summarized thread, by username):
  - **Refresh friction.** whistle650 asked whether every update needs a new Takeout. mholt said it can't be automated because of 2FA and that he runs a Takeout "once or twice a year". robinwassen suggested scheduled Takeouts to Drive plus rclone.
  - **Google Photos API.** akersten says the API "strips photos of crucial metadata including location".
  - **Data model.** slightwinder argued "Not all personal data or tasks are time-related"; mholt answered that contacts are entities with time-bounded attributes. infogulch proposed bitemporal modelling (XTDB); mholt said he had explored additive schemas and they got "messy and slow".
  - **Comparisons.** Perkeep (mholt: "big fan", but it lacks features he needs) and HPI (novoreorx). mhamann cited Google's Maps Timeline cuts as the reason local copies matter.
  - **Integrations.** Immich: "Probably not hard", since sources implement a small two-method API. Feature requests included weather enrichment, finances, a local LLM, and audio synced to the timeline (already supported).
  - **Demo.** coffeecoders asked for a live demo; mholt said realistic fake data was hard to generate, so the screenshots use obfuscated real data.

  — [HN thread](https://news.ycombinator.com/item?id=45504973) (read via [Algolia items API](https://hn.algolia.com/api/v1/items/45504973))

### Inferences
- The Timelinize classification set maps almost one-to-one onto Odysseus sources:
  - **location**: Dawarich visits and trips, HA presence
  - **media**: Immich
  - **page_view**: Takeout searches, YouTube, Play
  - **event**: calendar
  - **email**: e-mail headers
  - **note**: note edits

  Odysseus would need classes it lacks: *transaction* (bank), *commit*, *ai_session*, *workout/fitness* (Fit) and possibly *search* as distinct from page_view.
- The "map before the items at those locations" rule is a crude form of what Odysseus plans ("places as spine"). Timelinize interleaves map blocks into the feed; it does not hang items under a visit. That leaves room to do better: assign each item to the visit whose time range contains it, and fall back to a "between places / in transit" bucket.
- The 1.75σ gap rule with per-category caps is a cheap, proven way to break high-volume runs (page views, searches, YouTube) into readable chunks. Combined with folded rendering of page views, it is directly transferable for Odysseus's "digital activity grouped" rows.
- The `visit` relation and the time-bounded entity attributes support cross-links such as "person X at place Y" and "project Z active from…". Odysseus could adopt the same relation vocabulary.
- The 2,000-item cap with no pagination is a known weakness. Odysseus should aggregate on the server (counts per source per hour) rather than ship raw items for dense days.

### Gaps
- I found no official written design rationale (blog post or talk) from Matt Holt on the timeline layout. The design rationale above comes from code comments.
- I could not view the screenshot images themselves. Descriptions come from the site's captions and alt text.
- I found no substantial Reddit (r/selfhosted, r/datahoarder) threads about Timelinize. The search returned only unrelated mirrors.
- No user-reported performance numbers for very large timelines, such as days with more than 10k items.

---

## 2. Gyroscope (gyrosco.pe, Anand Sharma) — day/"story" pages, dashboards, annual reports, design fame, current status

### Takeaway
Gyroscope's design fame comes from the 2014–2019 lifelog era. Anand Sharma's public "April Zero" site (2014) treated location as "the backbone for all the other data". Its day pages layered heart rate, transport mode and photos on a timeline, its month views used pulsing tiles per place, and it printed personalised 64-page annual report books with a dark, "glowing line" HUD look. As of Nov 2026 Gyroscope is **[ACTIVE, PIVOTED]**: an AI health coach ("operating system for the human body") built around a Health Score. The lifelog surfaces (places, music, computer) have mostly disappeared from marketing, and the old guide pages now redirect to the homepage.

### Cited Findings

**Origins and the April Zero design**
- April Zero (2014) published everything Sharma tracked: steps, runs (speed, distance, map), heart rate, weight, body fat, blood levels, GitHub commits, Instagram photos and tweets. Location is called "**the backbone for all the other data**" (all places visited plus the travel between them, with mode, duration, distance and route). The site showed his current status, such as his current city and recent activity. — [TechCrunch, 2014-08-07](https://techcrunch.com/2014/08/07/this-guy-tracks-everything-about-himself-and-puts-it-up-online-for-everyone-to-see)
- Sharma quotes: "I'm so used to seeing things on digital interfaces that it has become the way I most easily think and process information"; seeing the data "change in response to things I do creates a great feedback loop." — [TechCrunch, 2014](https://techcrunch.com/2014/08/07/this-guy-tracks-everything-about-himself-and-puts-it-up-online-for-everyone-to-see)
- In his QS 2015 talk he described a life timeline combining Moves data, photos and location, where visitors can open any day and drill down to the minute. He compared it to Dumbledore's Pensieve and said it helps him relive moments such as a diving trip. The site expected about 50 visitors and got about 100,000 overnight. — [Personal Science Wiki: "From April Zero to Gyroscope"](https://wiki.openhumans.org/wiki/From_April_Zero_to_Gyroscope) ([video](https://vimeo.com/149086539))
- The early Gyroscope sample presentation had sections for fitness, adventures and a journal:
  - The **daily view** is "a timeline of heart rate, mode of transportation, and photos uploaded that day."
  - The **monthly view** shows "colored, gently pulsing tiles for each place visited" (coffee shops, airports, bakeries).
  - The layout uses "small circles around a border that highlight stats like recent workouts and destinations, with a larger central circle showing details like a map of the latest bike ride."

  — [MIT Technology Review, 2014-12-04](https://www.technologyreview.com/2014/12/04/111021/your-online-journal-built-from-heartbeats-sleep-patterns-and-hikes/amp/)

**Annual reports**
- The printed 2016 report was a 9×12-inch hardcover, 64 pages, personalised from each user's data.
- Its sections:
  - **Travel**: maps of places with clusters of frequent spots and travel lines; favourite places such as coffee shops and Disneyland got their own pages.
  - **Running/cycling**: trends, favourite rides, race recaps.
  - **Music**: each month's most-played songs, chosen because they "tend to trigger memories".
  - **Productivity**: RescueTime app usage by time of day.
  - **"Mind Map"**: per-month dot charts of work, music and offline time, with weekends highlighted and a colour legend.
  - **Timeline**: custom life events, plus quirky stats such as favourite foods or visit counts.
- Pages were planned as **two-page spreads**, with photos or a map on one side and detailed stats on the other.
- **When a user lacked data, pages were swapped** (cycling pages replaced running pages) so every book still reached 64 pages.
- The team's goal was readers saying "Wow, how do you know that?"
- Every page was built in HTML/CSS/JS and printed to PDF. For print, "bright glowing lines became brighter white lines" and contrast was raised.

  — [Gyroscope: Printing annual report books, 2017-10-16](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/)
- Print run conflict: this post says a limited edition of **80** books for 2016, while the 2017 recap says "**40** unique editions… 64 pages each". — [printing post](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/) vs [2017 in review](https://gyrosco.pe/timeline/2018-01-14/2017-in-review/)
- The online 2017 reports "introduced some new views to go deeper into the data," with "more breakdowns of month to month progress." The post opens with yearly totals (for example, 2,848,509,770 synced heart rates). In 2017 the focus moved toward health: a mood tracker built on "profile of mood states", sleep AI, symptoms, ketogenic levels, blood sugar and blood pressure. Last.fm and a new location system were planned for 2018. — [Gyroscope 2017 in review](https://gyrosco.pe/timeline/2018-01-14/2017-in-review/)

**Daily reports and Places (2019–2022)**
- 2019 Places update: "At the bottom of each daily report, you'll see the Places timeline for that day." Settings hold maps of walking and driving routes, custom maps for any past period, a **"passport" of visited cities and countries**, and an analysis of the types of places visited. Older days are reached via monthly reports by tapping a date, which the post calls easier than scrolling back. — [Gyroscope Places update, 2019-10-02](https://gyrosco.pe/timeline/2019-10-02/gyroscope-places-update/)
- v5 (2022) uses tabs Life, Track, Food and Score. Track shows today's metrics "updating every minute". A daily report exists for any past day, and scrolling shows highlights: trends, sleep scores, food photos, places and leaderboards. The day's narrative is a single "actionable insight". V2 had introduced Places for "detailed maps and timelines of how you spend your time" (it replaced Moves after Moves shut down). — [Introducing Gyroscope v5, 2022-08-08](https://gyrosco.pe/timeline/2022-08-08/introducing-gyroscope-v5/), [Product Hunt: Gyroscope 2.0](https://www.producthunt.com/p/gyroscope/gyroscope-2-0)
- The Product Hunt tagline was "See the complete story of your life". Awards: 2016 Golden Kitty and several 2015–2019 daily and weekly badges. The reviews page shows "No reviews yet". — [Product Hunt reviews](https://www.producthunt.com/posts/gyroscope/reviews)

**Current status (Nov 2026)**
- The homepage says "A new operating system for the human body". It lists six core metrics (Sleep, Heart, Steps, Food, Workouts, Bodyfat), a weekly Health Score ("The most important number in your life"), Food XRAY photo analysis, Labs habit experiments, and an AI coach ("Every answer is written from your sleep, food, workouts, blood and where you are today"). Insight categories still include "Digital" and "Mind". Footer: © 2026 Gyroscope Innovations, Inc. Tiers are named One and Max, with no prices shown. — [gyrosco.pe](https://gyrosco.pe/)
- Legacy guide and changelog URLs (`about.gyrosco.pe/guides/daily-report`, `/changelog/v3-series/v323-update`) now return a 302 redirect to the homepage (observed 2026-11-06). Archived posts carry the banner "You're viewing the archived history of building Gyroscope." — [archived v1.8 post](https://gyrosco.pe/timeline/2016-10-28/new-improved-gyroscope-app/)

### Inferences
- April Zero's "location is the backbone" principle is the same thesis as Odysseus's "places as spine". There is solid precedent that this framing is what made the original design memorable.
- The swap-in pages for missing data in the annual report are a positive model for sparse sources: compose the page from the sources that exist, with no empty boxes. The music-per-month-as-memory-trigger section and the "how do you know that?" quirky stats are strong ideas for the year view and "on this day".
- The two-page spread (visual on one side, stats on the other) maps onto a desktop two-column day or month page: map and photos on the left, KPIs and lists on the right.
- Gyroscope's pivot to health shows that a commercial lifelog story product was hard to sustain. The remaining personal-archive value now lives in self-hosted tools.

### Gaps
- I could not view any Gyroscope screenshots, and the Wayback Machine was not reachable. The visual descriptions above (glowing lines, pulsing tiles, circles) come from text sources only.
- I found no independent, dated design review with user criticism of the lifelog era. A search summary mentioned complaints that Places was "terribly inaccurate" (cycling marked as car rides), but I could not verify the original source.
- I could not confirm whether the 2026 app still renders a Places timeline or music and computer data in daily reports.

---

## 3. Exist.io — day/week/month views, correlations, presenting many attributes without overwhelming

### Takeaway
Exist **[ACTIVE]** handles a large number of attributes with three devices:
- a fixed **priority and group order** for every attribute, with low-priority attributes hidden by default
- a few **pinned** attributes plus **insight sentences** on the home screen
- **period views** (Day, Week, Month), where each attribute shows total versus average and a calendar tints days by one chosen attribute

Users value insights most and consider the analysis too shallow. Most use Exist on their phones.

### Cited Findings
- Exist pitches itself as "Track everything in one place". It combines synced services (Apple Health, Health Connect, Garmin, Oura, Withings, Strava, RescueTime, Todoist, Toggl, GitHub, calendars, Last.fm, Spotify…) with manual entries: a quantity, time period, 1–9 scale, percentage, time of day, or a tag on a day. The homepage preview shows entries as **short plain-language chips** ("2 workouts", "6/9 energy level", "750 words written", "$52 spent"). A correlation screenshot is captioned "Your weight is higher when you wake more during sleep." Price: $6.99/month or $62.90/year. — [exist.io](https://exist.io/)
- Dashboard (2019):
  - **Day / Week / Month** toggles. Day is the default and shows "today's insights, cards for all of your attributes for today, and a 30-day graph." A cog picks which attributes appear on that graph. Past days show the cards and graph but **no insights**.
  - **Week**: bars per attribute comparing each day and the whole week **to your average**, a tag graph showing which days each tag was used, daily mood ratings and notes, and a long-term graph of weekly averages.
  - **Month**: total versus average bars, a **calendar** into which you load any attribute's data via an arrow, with mood shown as "a coloured circle matching your mood rating" on each day. Tags have arrows that highlight the days they were used. Week numbers and days are clickable.
  - URLs are readable: `/dashboard/2019-7-14/`, `/dashboard/2019-w28/`, `/dashboard/2019-6/`.

  — [Exist blog: Historical browsing, 2019-09-25](https://exist.io/blog/historical-browsing/)
- Insights are split into "information about today's data on the left, and information about longer periods, like the past week or month, on the right." — [Exist blog, 2019](https://exist.io/blog/historical-browsing/)
- Attribute model: each attribute has a `group` (name, label, `priority`; for example Activity has priority 1) and its own `priority` (Steps 1, Active minutes 2). "**Attributes with a priority of 10 or higher are treated as low priority**" and are excluded unless requested. Inactive attributes are usually hidden. Each attribute also records which `service` supplies it and which `available_services` could. — [Exist developer docs: attributes](https://developer.exist.io/reference/attributes/)
- Exist distinguishes services (sources) from attributes (metrics), a separation it explains in its help centre. — [Exist KB: service vs attribute](https://kb.exist.io/article/19-whats-the-difference-between-a-service-and-an-attribute)
- Correlations: if no same-day correlation is found, Exist "will check for correlations between attributes across two consecutive days." — [Exist KB](https://kb.exist.io/article/55-will-exist-find-correlations-across-multiple-days)
- 2025 redesign (2025-08-20):
  - mobile apps rewritten because "people overwhelmingly interact with Exist via their phones"
  - richer Home insights with extra graphs and graphical content such as album art
  - **pin four attributes** to Home
  - user-defined **subgroups** for attributes and tags
  - tapping an attribute opens its full raw history "organised by month"

  — [Exist blog: Our 2025 redesign](https://exist.io/blog/exist-2025-redesign/)
- 2025 user survey (published 2026-02-05; Exist's own, no sample size given):
  - Reasons for use: "Seeking insights to understand or change my behaviour" 48%; "Keeping all my data in one place" 31%.
  - Biggest problem: wanting **more data analysis** (35%), then more integrations (23%) and manual-entry burden (17%).
  - **33% didn't know subgroups existed**, although 47% had invested time in them.
  - Liked in the redesign: per-attribute history on mobile (40%), new Home graphics (35%), pinning (28%).
  - 46% are glad Exist has no generative-AI features.

  — [Exist user survey 2025](https://exist.io/blog/exist-survey-2025/)
- On the QS forum, a user complained that Exist and Gyroscope don't allow CSV import from some trackers. — [QS forum: Personal dashboards thread, 2020](https://forum.quantifiedself.com/t/personal-dashboards-for-self-tracking-data/8202)

### Inferences
- For Odysseus's many sources, a per-source and per-metric **priority with a "low-priority hidden unless expanded"** threshold is a proven way to keep the day page calm. Users would still have a per-day "show all" escape.
- Exist's "**vs your average**" bars and "**colour the month calendar by one chosen metric**" fit the month calendar directly. Examples: tint days by km travelled, photos taken, money spent or commits, with a selector rather than all metrics at once.
- Plain-language chips ("$52 spent", "750 words written") are a good template for the KPI row at the top of a day page.
- The 33% who never found subgroups is a warning: customisation buried in settings goes unused, so defaults matter more than configurability.

### Gaps
- I could not see Exist's 2025 web dashboard screenshots, and I found no current documentation of how the redesigned web day, week and month views look, so the 2019 description may be partly outdated.
- I found no official statement on how Exist visually marks missing data (unsynced days). The developer docs only say inactive attributes are hidden.
- I could not retrieve the full list of attribute group names and priorities from the developer docs.

---

## 4. Other aggregators and reports that add patterns (HPI/Promnesia/orger, Perkeep, Nomie, Heyday, Memex, Feltron, Spotify Wrapped, Apple Health, Google)

### Takeaway
The karlicoss stack (HPI **[ACTIVE, hobby]**) contributes a *data-access-layer* architecture and **context-in-place** UX (Promnesia's sidebar showing where and when you met a URL, with a locator back to the source). Feltron's reports **[HISTORICAL, 2005–2014]** contribute a quarterly structure with a **Sources page**. Spotify Wrapped contributes one-stat narrative cards and superlatives. Apple Health contributes Summary = Favorites + a few Highlights + Browse. Google's My Activity is a newest-first list by day with search and filters. Google Maps Timeline's 2024 move to on-device storage, and the data loss that followed in 2025, show why a local copy matters. Nomie is **[DISCONTINUED, 2023; open-sourced]**. Heyday's status is **[UNCLEAR]**, and Memex (WorldBrain) is **[UNCLEAR]**: one directory lists it as discontinued.

### Cited Findings

**HPI / Promnesia / orger (karlicoss)**
- HPI's Python package `my` "hides the gory details of locating data, parsing, error handling and caching" so you can "simply 'import' your data". Modules are organized by domain (`my.lastfm`, `my.coding.commits`, `my.location.google`, `my.time.tz.via_location`…). **`.all` modules merge several sources** (`my.github.all`, `my.twitter.all`, `my.rss.all`). The modules "contain **no data, only code**" and only read the filesystem, so the project is local-first. Outputs include a **calmap year heatmap of Last.fm listening**, monthly bar charts of message counts, a terminal bar chart of commits per month, a JSON query CLI (`hpi query`), and a private health, sleep and exercise dashboard. orger renders data into org-mode for search, task creation and spaced repetition. About 1.6k stars. — [HPI README](https://github.com/karlicoss/HPI)
- Promnesia's data model is the **Visit**: `url` (the only required field), timestamp, **`locator`** ("usually a permalink back to the original source of the visit"), **`context`** (the surrounding message or paragraph) and `duration`. An indexer merges browser history, Reddit, Twitter, Telegram, Hypothesis, Instapaper, Google Takeout, and org, Markdown, Logseq and Obsidian notes into `promnesia.sqlite`. In the UI, a **green eye icon** marks a link visited before that has contexts, and clicking it opens a **sidebar** with each visit. Clicking a Telegram locator "will open Telegram and jump straight to the message." The extension can mark already-visited links on any page and shows highlights "marked with yellow right within the page." Indexing is periodic. About 1.9k stars. — [Promnesia README](https://github.com/karlicoss/promnesia)
- In the Timelinize HN thread, HPI was cited as a similar project, and mholt said HPI-style sources would be easy to add. — [HN thread](https://news.ycombinator.com/item?id=45504973)

**Perkeep [STATUS UNCLEAR, long-lived]**
- Everything, metadata included, is a content-addressable blob, so nothing can be overwritten. Mutable state is "immutable, timestamped, GPG-signed blobs representing a mutation request", so any past state can be viewed. The web UI "lets you click around and view your content, and do searches"; search results can also be exposed as directories (for example "recent" photos). The overview page dates from 2013. — [Perkeep overview](https://perkeep.org/doc/overview)
- In the Timelinize thread, mholt called himself a "big fan" of Perkeep but said it lacks features he needs. — [HN thread](https://news.ycombinator.com/item?id=45504973)

**Nomie [DISCONTINUED as a hosted service]**
- "Nomie 4, 5 and 6 will be shut down Feb 1st 2023". The Nomie 6 code was released as MIT open source ("since closing down nomie, I wanted to provide it as an open source project") and runs on any static web server. The user base reached about 100,000. A community-hosted copy exists, and one forum user said a hosted instance "forgot all of my data". — [nomie6-oss on GitHub](https://github.com/IanSteg/nomie6-oss), [open-nomie/nomie5](https://github.com/open-nomie/nomie5), [Beeminder forum](https://forum.beeminder.com/t/looking-for-an-application-on-pc-to-easily-track-things/11417), [funkypenguin cookbook](https://geek-cookbook.funkypenguin.co.nz/blog/2023/03/02/new-recipe-nomie-swarm/)

**Heyday / Memex [UNCLEAR]**
- A directory lists WorldBrain's Memex as discontinued, and a 2020 community-forum thread describes a "downright deprecation". An iPad app (Memex Go) still shows version 1.28.0 and a memex.garden support address. — [SaaSHub](https://www.saashub.com/worldbrains-memex), [WorldBrain community](https://community.worldbrain.io/t/the-most-unfortunate-thing-happened-to-memex/858), [App Store: Memex Go](https://apps.apple.com/jo/app/memex-go/id1471860331)
- Heyday is described as a browser extension that highlights keywords you have read about before and shows related past reading on hover. Its current status was not found. — [mentoday.ru, 2023](https://www.mentoday.ru/technics/news/05-02-2023/kak-luchshe-zapominat-informaciyu-mujchina-nashel-reshenie-v-rasshirenii-dlya-brauzera/)

**Feltron Annual Reports [HISTORICAL, 2005–2014]**
- The final 2014 report is split into **quarters (Q1–Q4)**, each covering car, computer, location, environment, media, sleep, activity and physiology. It adds an **"NYC" overview** (a city map with circular image markers and statistics lists) and a **"Sources" page giving the percentage, icon and total records for each category**. The cover shows columns for July–December filled with grey and dark-blue circles of varying size, and the Q3 page centres a globe with red numerals for sleep, heart rate and activity. The data came from "commercially available applications and devices" rather than custom tools. Example figures: average weight 158.8 lb, 459 miles driven, 685 photographs. — [It's Nice That](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report)
- The 2012 report used the custom "Reporter" iPhone app, which prompted surveys at random times. Fast Company called it "a meticulously documented year in review of everything he's done" and cited facts such as the time of day he usually has coffee and the relative time spent with different people. — [Cool Infographics](https://coolinfographics.com/blog/2013/8/2/the-2012-feltron-annual-report.html)
- The reports are held in MoMA's collection. — [MoMA](https://www.moma.org/collection/works/145531)

**Spotify Wrapped (year-in-review pattern) [ACTIVE, annual]**
- The format "borrows from Instagram Stories, with vertical cards that you tap through", and the share button is so prominent that posting feels like the intended last step. Commentary describes bold gradients, dynamic typography and motion. Note that these sources are SEO and marketing blogs. — [Webtonic](https://www.webtonic.io/blog/spotify-wrapped-marketing-strategy-7-lessons-from-a-viral-campaign), [Storysoft](https://storysoft.io/data-storytelling-spotify-wrapped/)
- Stats are framed as awards or superlatives ("You're in the top 1% of … fans!") and as behavioural labels ("You read the news most often at 7:00 AM, early bird"), and summaries become share images. — [DEV.to analysis](https://dev.to/bhumica08/what-i-learned-from-spotify-wrappeds-ux-magic-and-how-id-build-it-40nk)
- Active Theory's 2018 case study says story and share-card colours were driven by images tied to each user's listening. — [Active Theory on Medium](https://medium.com/active-theory/spotify-wrapped-2018-technical-case-study-5b7cfb7e9d3a)

**Apple Health Summary [ACTIVE]**
- Since iOS 13 the app has two tabs, Summary and Browse.
  - Summary starts with **Favorites**, each showing its latest entry. **Highlights** come next: "graphs and charts that display relevant comparisons of recent health data" (for example stairs this week versus last week, or walking distance by time of day). Only a few highlights show at once, behind "Show All Highlights".
  - Browse has search plus categories, for data you don't favourite.
  - The reviewer calls Summary "a fantastic overview that eliminates much of the need to explore other parts of the app." He criticises that Favorites can't be reordered and that they show the latest value "whether it's a month old, a week old, or was just added."

  — [MacStories: Health in iOS 13](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/), [MacRumors guide](https://www.macrumors.com/guide/health)

**Google My Activity and Maps Timeline [ACTIVE / CHANGED]**
- My Activity: "Your Google activity data is listed as individual items, starting with the most recent," "organized by day and time," with "the search bar and filters" at the top. Each item has a **Details** view (date, time, why it was saved, and possibly location, device and app). — [Google Account Help](https://support.google.com/accounts/answer/7028918?hl=en)
- Google dropped Timeline on the web. Users had until **Dec 1, 2024** to move to on-device storage, otherwise their data would be auto-deleted. In **March 2025** Google confirmed a technical issue had deleted Timeline data for some users; only those with encrypted backups could restore it. — [Android Central](https://www.androidcentral.com/apps-software/google-maps-gets-rid-of-another-feature-on-web), [9to5Google](https://9to5google.com/2025/03/07/google-maps-timeline-missing/), [Android Authority](https://www.androidauthority.com/google-accidentally-delete-maps-timeline-data-3537615)

**Day One "On This Day" (pattern reference) [ACTIVE]**
- "Read the entries you've written on a day over the years". It is reached from the calendar (long-press a date) or a menu, appears at the bottom of Today, can be disabled per journal, and offers an optional daily notification. — [Day One guide](https://dayoneapp.com/guides/tips-and-tutorials/on-this-day/)

**Community DIY dashboards (QS forum, 2020)**
- On the QS forum:
  - logos built a real-time view to "at a glance, see how my day has been going".
  - alexey: "It's unexpectedly difficult to present the data in a clear yet informative fashion."
  - kastan: "focus is paramount in QS dashboards."
  - srbd finds correlations "a lot of noise".
  - Agaricus: data flows are "more idiosyncratic and less stable than is obvious" and needs are "more divergent… than is obvious."
  - logos: manual refresh creates "an annoying user experience".

  — [QS forum: Personal Dashboards for Self-Tracking Data](https://forum.quantifiedself.com/t/personal-dashboards-for-self-tracking-data/8202)

### Inferences
- Promnesia's Visit (url + time + locator + context) is the right minimal shape for Odysseus's high-volume digital items (searches, YouTube, page views, AI sessions, commits). A locator that deep-links back to the source app, such as a Takeout file, Immich asset, git commit or Obsidian note, is the cross-link users value.
- HPI's `.all` merge modules match Odysseus merging HA presence with Dawarich into one "location" stream. Keep per-source provenance on each merged record.
- Feltron's quarterly structure and Sources page suggest a year view with a provenance footer: for each source, record count and active date range. This doubles as the "sparse or missing source" signal.
- Apple's approach (Favorites with timestamps plus a few highlights behind "Show All") and the reviewer's complaint about stale values imply that every KPI should show its data date or freshness.
- Google Timeline's removal from the web and its data loss make good copy for an "Archive health" panel: when each source last synced, and gaps found.

### Gaps
- I found no first-party design write-ups for Spotify Wrapped. The available sources are marketing blogs.
- I did not find Apple Health "Trends" (iOS 15+) design details or current (iOS 26) Summary changes.
- I found no confirmed 2026 status for Perkeep, Heyday or Memex.
- I found no source for Google My Activity's "bundle" (grouped) view or its product-icon treatment. The help page only describes the item list, search and filters.
- I did not research Nomie's UI (tracker boards, timeline and map); only its status is sourced.

---

## 5. Concrete cross-cutting patterns (visual grammar, aggregation of high-volume events, filters, summary sentences/KPIs, sparse/missing sources, cross-links)

### Takeaway
The products converge on six patterns:
1. **One icon and colour per *kind* of item, plus a small source logo for provenance** (Timelinize, Feltron's Sources page).
2. **Runs of the same kind collapsed into one card**, split by time gaps and capped in size (Timelinize). Dense digital activity is folded.
3. **Location as backbone**, with other items placed by time and the entity's position, even when they have no coordinates (April Zero, Timelinize map augmentation).
4. **Plain-language KPI chips and few highlights**, compared with your own average (Exist, Apple Health, Wrapped).
5. **Composing the page from available sources rather than leaving empty slots** (Gyroscope book page swapping).
6. **Emergent cross-links** through entities, relations and locators (Timelinize conversations, Promnesia).

### Cited Findings
- **Visual grammar (category icon and colour).** Timelinize uses Tabler icons with a coloured background chip per display category: location cyan, media pink (camera), page views purple (history), bookmark/note/document lime, calendar event red, messages indigo, unknown grey. — [common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)
- **Source provenance badge.** Timelinize item rows show the data-source logo with "Imported from {source}". — [items.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/items.js). Feltron's 2014 Sources page lists the percentage, icon and record total per category. — [It's Nice That](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report)
- **Aggregating high-volume, low-value events.** Timelinize groups consecutive same-category items, splits on gaps larger than 1.75σ of the recent rolling average, caps groups (conversation 50, media 25, location 100), renders page views folded and truncated (`maxLength: 1024`), and sizes media cards by count. — [common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js). Location data is "deduplicated, denoised, clustered, and simplified". — [timelinize.com](https://timelinize.com/)
- **Filters.** The Timelinize timeline filters by data sources and person. — [timeline.html](https://github.com/timelinize/timelinize/blob/main/frontend/pages/timeline.html). The Gallery filters across all sources, including message attachments. — [GitHub README](https://github.com/timelinize/timelinize). Google My Activity puts search and filters at the top of a newest-first list. — [Google Help](https://support.google.com/accounts/answer/7028918?hl=en). Apple Browse offers search plus categories. — [MacStories](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/)
- **Summary sentences and KPI rows.**
  - Exist chips ("2 workouts", "$52 spent") and insights split into today on the left and longer periods on the right. — [exist.io](https://exist.io/), [Exist blog](https://exist.io/blog/historical-browsing/)
  - Exist correlation sentences ("Your weight is higher when you wake more during sleep"). — [exist.io](https://exist.io/)
  - Apple Highlights comparisons, a few at a time. — [MacStories](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/)
  - Gyroscope's single daily "actionable insight". — [Gyroscope v5](https://gyrosco.pe/timeline/2022-08-08/introducing-gyroscope-v5/)
  - Wrapped superlatives and behavioural labels. — [DEV.to](https://dev.to/bhumica08/what-i-learned-from-spotify-wrappeds-ux-magic-and-how-id-build-it-40nk)
- **Comparison with your own baseline.** Exist week and month bars compare each period "to your average". — [Exist blog](https://exist.io/blog/historical-browsing/)
- **Calendar tinted by one metric.** The Exist month calendar loads one selected attribute, and mood appears as coloured circles. — [Exist blog](https://exist.io/blog/historical-browsing/). HPI's example uses a calmap year heatmap. — [HPI README](https://github.com/karlicoss/HPI)
- **Sparse or missing sources.**
  - The Gyroscope book swapped pages when data was missing (cycling instead of running). — [Gyroscope printing post](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/)
  - Exist hides inactive and low-priority attributes, and past days don't show insights. — [Exist dev docs](https://developer.exist.io/reference/attributes/), [Exist blog](https://exist.io/blog/historical-browsing/)
  - Apple Favorites show the last value regardless of age, which the reviewer flagged. — [MacStories](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/)
  - Timelinize models uncertainty explicitly (`time_uncertainty`, `timeframe`). — [schema.sql](https://github.com/timelinize/timelinize/blob/main/timeline/schema.sql)
- **Cross-links (person, place, project).**
  - Timelinize: conversations emerge from `sent`/`cc` relations across platforms; entity merging; a `visit` relation; entity attributes bounded in time; and user `stories` that embed items, entities and queries. — [graph.go](https://github.com/timelinize/timelinize/blob/main/timeline/graph.go), [schema.sql](https://github.com/timelinize/timelinize/blob/main/timeline/schema.sql), [issue #139](https://github.com/timelinize/timelinize/issues/139)
  - Promnesia: a locator jumps to the exact source message. — [Promnesia README](https://github.com/karlicoss/promnesia)
- **Items without coordinates placed by context.** Timelinize puts a text "received while at the beach" on the map, using nearby points for the same person. — [timelinize.com](https://timelinize.com/)
- **Year and annual synthesis.** Gyroscope books had sections by domain, monthly top songs as memory triggers, per-month dot charts with weekends highlighted, custom life events and "Wow, how do you know that?" stats. — [Gyroscope printing post](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/). The Feltron 2014 report uses quarters plus a city overview and a Sources page. — [It's Nice That](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report)
- **"On this day".** Timelinize's open proposal is to surface "a timeline view of a particular day; either random or 'this day in history'-style", with exclusions for entities, dates and places. — [issue #8](https://github.com/timelinize/timelinize/issues/8). Day One puts it at the bottom of Today and on a calendar long-press, with per-journal opt-out. — [Day One guide](https://dayoneapp.com/guides/tips-and-tutorials/on-this-day/)

### Inferences (proposals for the Odysseus "Life" panel)
- **Day page.** Use a two-column desktop layout echoing Gyroscope's spreads: map and photos on one side, the spine and its lists on the other.
  - The spine is a list of Dawarich visits and trips.
  - Items are hung under the visit whose time range contains them.
  - Items with no matching visit go to "in transit / unknown place".
  - Digital activity is folded into category chips with counts ("YouTube 14 · Search 23 · Commits 6"), using Timelinize's gap-and-cap grouping inside each visit.
- **Visual grammar.** Use one fixed icon and colour per *kind* (place, photo, purchase, event, mail, web/search, video, AI, code, note, presence, fitness), plus a small source logo or label for provenance. Don't colour by source: Takeout alone spans five kinds.
- **KPI row.** Show 4–6 plain-language chips at the top of the day (km travelled, places, photos, money spent, meetings, commits), each with a delta against your 30-day average (Exist) and a freshness marker (fixing the Apple Health complaint).
- **Month and year views.** Tint the month calendar by a selectable metric (Exist) and use a calmap-style year heatmap (HPI). End the year with a "Sources" footer that gives the record count and date coverage per source (Feltron), which also shows gaps.
- **Sparse sources.** Hide empty sections rather than rendering blanks (Gyroscope page swap). Keep a compact coverage strip per source so absence is visible on purpose: a source with no data that day shows as a grey tick, not as a missing section.
- **Cross-links.** Make every person, place and project chip clickable to an entity page that shows that entity's timeline (Timelinize entities, the `visit` relation). Every item keeps a locator back to its source app (Promnesia).
- **"On this day".** Keep it light: a strip of same-date items from past years on the day page and the dashboard, with exclusions (Timelinize #8) and a link to open the full past day.

### Gaps
- None of the sources quantify which grouping thresholds users prefer. The 1.75σ and size caps are Timelinize's heuristics, not research-backed values.
- No sourced evidence was found on how lifelog users react to colour-by-kind versus colour-by-source encodings.
- No sourced user study was found on "places as spine" versus a flat chronological feed. The support comes from April Zero's framing and Timelinize's map-first ordering, not from user testing.
