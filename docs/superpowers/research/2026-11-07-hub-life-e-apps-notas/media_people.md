# Media (photos + videos) and People (personal CRM) apps for the Odysseus Life hub, built on Immich v3.3 + Nextcloud CardDAV

Research date: 2026-11-06. Immich facts come from the v3.3.0 tag of the official OpenAPI spec and server source, plus the release posts. Where `main` (3.4.0-rc.0, last spec commit 2026-11-03) differs, that is noted. Product UX facts come from vendor help pages and tech press. CRM facts are weaker: most comparative reviews are written by competing vendors (Dex), and that is flagged each time. Local context: the Life timeline spec already reads Immich metadata from Postgres into SQLite and proxies thumbnails live through the API with a key scoped to `asset.read` + `asset.view` (`/data/projects/odysseus/docs/superpowers/specs/2026-11-06-life-timeline-design.md`, lines 52, 85, 165-169).

## Q1. Media: what the best photo/video libraries offer (Immich, Google Photos, Apple Photos, PhotoPrism), what users praise and criticize, and what a "lens" needs versus a full replacement

### Takeaway
Every leading library converges on the same core: a chronological grid with fast date navigation, then People, Places/Map, Albums, Memories, and a search box that mixes semantic and filter search. The clearest UX lessons of 2024-2026 are both reversals after backlash. Apple restored tabs after the iOS 18 single-scroll redesign, and Google added a "classic search" toggle after complaints about Gemini "Ask Photos". So a predictable grid and deterministic search must stay primary, with AI and curation as add-ons. For Odysseus the right scope is a read-mostly lens. Immich already owns upload/backup, editing, sharing, face correction and trash, and the lens hands those off with "Open in Immich".

### Cited Findings
**Immich (self-hosted; v3.3.0 released Oct 7, 2026)**
- Release history: v2.0.0 "Stable" on Oct 1, 2025; v3.0.0 on Jul 1, 2026; v3.1.0 on Jul 29; v3.2.0 on Sep 10; v3.3.0 on Oct 7, 2026 — [Immich blog index](https://immich.app/blog)
- Web UI features added in the v2.x line: faster web justified layout (v2.2.0), command palette (v2.4.0), map side panel (v2.6.0), duplicate resolution (v2.7.0), OCR (v2.2.0/v2.3.0) — [Immich blog index](https://immich.app/blog)
- v3.0.0 added a "Recently Added" page in Explore (sorted by import time) and Workflows (preview: triggers/filters/actions). Browsing months with many assets got much smoother and no longer locks the tab. Memories without show/hide dates now appear in the timeline, web memories refresh hourly, and hidden people no longer appear in memories — [v3.0.0 release](https://immich.app/blog/v3.0.0-release)
- v3.2.0 shipped "Search v2", a new server search API that can search within albums and combine filters with AND/OR. The web search modal was simplified, and the full capability "will reach the UI later". It also added "cluster groups" so people are recognized across assets shared between trusted users — [v3.2.0 release](https://immich.app/blog/v3.2.0-release)
- v3.3.0 added people sharing (shared people editable by both users, but only name and birth date), birthday memories that feature previous birthdays, an "asset face v3" rework, and better non-Latin map labels. Selected search type is now remembered on web — [v3.3.0 release](https://immich.app/blog/v3.3.0-release)
- The Explore endpoint is documented as "data for the explore section, such as popular people and places". Places search (`GET /search/places?name=`) and typeahead suggestions by country/state/city/camera/lens (`GET /search/suggestions`) also exist — [Immich OpenAPI spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- People features in the official docs: name and search people, change the feature photo, hide a person, set a birth date "so the person's age can be shown for photos taken at that time", merge two or more people, favorite a person to pin them to the top, and manually assign unassigned faces, then run "Missing" recognition so the model learns — [Immich docs: Facial Recognition](https://docs.immich.app/features/facial-recognition)
- Default ML models: CLIP `ViT-B-32__openai`, face model `buffalo_l` (minScore 0.7, maxDistance 0.5, minFaces 3), OCR `PP-OCRv5_mobile` — [Immich v3.3.0 config.dto.ts defaults](https://github.com/immich-app/immich/blob/v3.3.0/server/src/dtos/config.dto.ts)
- For libraries of about 40K+ assets, Immich's own guide suggests starting "minimum recognized faces" at 10, and at 20 for 100K+. That method deletes previously assigned names — [Immich guide: better facial clusters](https://docs.immich.app/guides/better-facial-clusters). An open feature request notes there is no way to re-cluster only auto-assigned faces without losing manual names — [immich discussion #31310](https://github.com/immich-app/immich/discussions/31310)
- User sentiment on Immich vs Google Photos (anecdotal; Lemmy mirrors and SEO blogs, not a survey). Praise: timeline speed, face recognition, "almost identical experience to Google Photos". Gaps: editing, Android app slowness on huge libraries, missing thumbnails in external libraries — surfaced via search from [lemmy.4d2.org thread](https://lemmy.4d2.org/post/991017/1439540) and [selfhosted.sh comparison](https://selfhosted-sh.pages.dev/immich-self-hosted-google-photos). The [Android Authority comparison](https://www.androidauthority.com/google-photos-vs-immich-3628122/) returned HTTP 403 and was not read.

**Apple Photos (iOS 18 → iOS 26 lesson)**
- iOS 18 merged every way of organizing photos into one scrolling page. iOS 26 (WWDC June 2025) brought back two tabs, Library (the grid) and Collections (pinned albums, memories, people and pets, suggestions). Federighi said on stage: "Many of you missed using tabs in the Photos app" — [TechCrunch, Jun 9 2025](https://techcrunch.com/2025/06/09/after-user-backlash-apple-brings-back-tabs-to-the-photos-app-in-ios-26/)
- iOS 18 complaints: loss of tabs ("Barely usable any more"), auto-generated collections that were confusing and redundant, clutter ("so unintuitive and hard to use"). Customization was praised (remove unwanted sections: "It's ace"). Apple removed the Carousel of daily highlights, restored pinch-to-zoom, and planned to drop borders around video playback — [MacRumors, Nov 21 2024](https://www.macrumors.com/2024/11/21/apples-photos-app-overhaul-controversial/)
- Tom's Guide called iOS 26 the second Photos redesign in 12 months. In a PhoneArena poll, 60% said the iOS 26 changes were "not enough to fix the app for me" — [Tom's Guide](https://www.tomsguide.com/phones/iphones/ios-26-has-brought-yet-another-photos-app-overhaul-for-your-iphone-heres-how-its-different); [PhoneArena](https://www.phonearena.com/news/clutter-be-gone-ios-26-tidies-up-the-photo-mess_id171311)

**Google Photos (2024-2026)**
- Ask Photos (Gemini natural-language search) was announced May 2024 and expanded in the US in Sep 2024. Expansion was paused in June 2025 over performance complaints. By early 2026, users reported that classic search "works much better" — [Android Authority, Jan 2026](https://www.androidauthority.com/google-photos-ask-button-disable-3631979/)
- On Mar 10, 2026 Google added a toggle between classic search and Ask Photos after user complaints. Criticisms: small curated result sets, missed photos, multi-second latency for simple queries like "dog" — [TechCrunch, Mar 10 2026](https://techcrunch.com/2026/03/10/google-gives-in-to-users-complaints-over-ai-powered-ask-photos-search-feature/)
- Google moved Android to a floating bottom navigation bar similar to iOS, without announcing a rationale — [BGR](https://bgr.com/2212458/google-photos-floating-bar-update-change-android/)
- Face groups: labels are private per account. Labeling a group "Me" enables "where you were over time based on where your face appears". Merges happen by giving two groups the same label and "can't be undone". You can "Remove results" from a group, or edit people labels on a single photo via Info → People → Edit. Memories have per-face "Show less" and "Blocked" (blocked faces vanish from memories and from People & pets). Face models "may be considered biometric data in some jurisdictions" and are kept until deleted or two years of inactivity — [Google Photos Help: face groups](https://support.google.com/photos/answer/6128838?hl=en)

**PhotoPrism**
- Faces cluster after a full scan, and clusters refine in the background. A new cluster is auto-named only if at least half its faces already belong to one named person and nothing in it was named by hand. "Hidden" removes a person from Recognized for everyone, and "Private" hides name and face region from viewer/guest accounts; neither is encryption. Navigation exposes Places, Moments, Calendar and Labels as first-class views — [PhotoPrism docs: People](https://docs.photoprism.app/user-guide/organize/people/)

### Inferences
- Essential for a lens inside Life:
  1. A month-bucketed justified grid with a date scrubber, driven by bucket counts.
  2. A lightbox with an info panel. Date links to the Life day page, place to the map/day, people chips to People, album to Albums.
  3. Search: semantic query plus person, place, date, type and favorite filters.
  4. A People grid.
  5. An Albums list.
  6. A map.
  7. "On this day" plus birthday memories.
  8. Favorites as a filter.
  9. Video playback.

  Hand off to Immich (deep link "Open in Immich"): upload/backup, editing, sharing and shared links, face fixing (reassign, merge, unassigned faces), trash/archive/locked, duplicates, admin.
- Follow the iOS 26 lesson on desktop and phone. Use few stable top-level tabs (Timeline · People · Places · Albums · Search), keep curated "Collections/Explore" content off the main grid, and let the user hide sections.
- Follow the Google lesson: make CLIP smart search one mode next to exact filter search, never a black box that hides results. Show result counts and allow sorting by date.
- Lower priority: Workflows, OCR text selection, Recently Added, editing, stacks, duplicates. Immich's web UI already covers them, and they rarely help a "life lens".

### Gaps
- No primary-source UX teardown of Immich's web timeline scrubber or the justified-layout algorithm was fetched. Their existence is supported by the bucket API and release notes, not by design docs.
- No reliable, recent (2026) survey of r/immich / r/selfhosted praise and complaints was found. What exists is anecdotal and partly from mirrors.
- Google Photos' current top-level tab structure (Photos/Collections/Search, 2026) was not confirmed from a primary source.

## Q2. Immich API capabilities for embedding (timeline buckets, search, people, albums, map, memories, video) and API stability in v2/v3

### Takeaway
The OpenAPI spec labels every endpoint with a lifecycle state and history (`x-immich-state`: Stable/Beta/Alpha/Deprecated/Internal). Almost everything a Media/People lens needs is Stable: search, people, faces, albums, map markers, memories, thumbnails and video playback. The two timeline endpoints are the exception. `GET /timeline/buckets` and `GET /timeline/bucket` are the only two `Internal` endpoints in the whole API, so they can change without notice even though Immich's own web UI depends on them. HLS streaming is Alpha. Wrap the timeline calls behind an adapter, or rebuild buckets from the Postgres/SQLite index Odysseus already has.

### Cited Findings
**Lifecycle states and stability policy**
- Endpoint states in the v3.3.0 spec: 190 Stable, 35 Alpha, 24 Deprecated, 22 unlabeled (mostly new Workflows/Plugins/album map-markers), 6 Beta, 2 Internal (`/timeline/buckets`, `/timeline/bucket`; history "v1 Added → v1 Internal") — [Immich OpenAPI spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- PUT update routes gained PATCH in v3.0.0. The spec history says: "PATCH will become the default in v4, and then PUT will be dropped in v5. Please migrate accordingly." In the v3.3.0 tag, `PUT /assets/{id}`, `PUT /people/{id}` and `PUT /memories/{id}` are marked Deprecated with replacements `updateAsset`/`updatePerson`/`updateMemory` — [spec on main (3.4.0-rc.0)](https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json); [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json); [v3.0.0 release ("Deprecated: PUT routes, in favor of PATCH")](https://immich.app/blog/v3.0.0-release)
- States move between releases. `/people/users` (people sharing) is "Stable" in the v3.3.0 tag but "Beta" on main — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json) vs [spec main](https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json)
- The v2.0.0 "stable" release (Oct 1, 2025) came with a new API docs site, api.immich.app. No formal semver/deprecation policy was found in the release post — [Immich stable release](https://immich.app/blog/stable-release); [AlternativeTo](https://alternativeto.net/news/2025/10/immich-launches-first-stable-version-with-new-website-updated-api-doc-and-physical-dvd)
- v3 breaking API changes:
  - Removed endpoints: `GET /assets/random` (use `POST /search/random`), `PUT /assets/:id/original` (use `/clone`), `POST /sync/delta-sync`, `POST /sync/full-sync`, `GET /server/theme`, `POST /assets/exists`, `GET /assets/device/:deviceId`.
  - `AssetResponseDto`: `deviceId`/`deviceAssetId` and `unassignedFaces` removed; `people` no longer embeds `faces` (use `GET /faces`); `duration` is now milliseconds; width/height are integers.
  - `AlbumResponseDto`: `owner`/`ownerId` removed (owner is now a role in `albumUsers`), and `assets` removed (use `POST /search/metadata` with `albumIds`). `GET /albums` `shared` was renamed to `isShared`, plus `isOwned`.
  - Search without `visibility` now covers all levels except `locked`; it previously defaulted to `timeline`.
  - Validation moved to Zod with a new error body, and the correlation ID moved to the `X-Correlation-ID` header.

  — [Immich: Migrating to v3](https://immich.app/blog/v3-migration)
- v3 also removed pgvecto.rs (VectorChord recommended) and requires x86-64-v2 CPUs — [Immich: Migrating to v3](https://immich.app/blog/v3-migration)

**Timeline (Internal)**
- `GET /timeline/buckets` (`getTimeBuckets`) returns `[{timeBucket, count}]`. Filters: `albumId`, `personId`, `tagId`, `userId`, `isFavorite`, `isTrashed`, `visibility`, `withPartners`, `withStacked`, `withCoordinates`, `bbox`, `order`, `orderBy`.
- `GET /timeline/bucket?timeBucket=` (`getTimeBucket`) returns a columnar object of parallel arrays: `id`, `fileCreatedAt`, `localOffsetHours`, `createdAt`, `isFavorite`, `isImage`, `isTrashed`, `visibility`, `ratio`, `thumbhash`, `duration` (ms), `livePhotoVideoId`, `projectionType`, `stack`, `city`, `country`, `latitude`, `longitude`, `ownerId`.

  — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- Older docs show the columnar response shape changed across 1.13x-1.142 (lat/lon arrays added in 1.142, plus `visibility` and `withCoordinates`). The v3.3.0 release added docs for the UTC `timeBucket` format — [archived get-time-bucket v1.135.1](https://v1.135.1.archive.immich.app/docs/api/get-time-bucket); [archived get-time-buckets v1.142.0](https://v1.142.0.archive.immich.app/docs/api/get-time-buckets); [v3.3.0 release](https://immich.app/blog/v3.3.0-release)

**Search (Stable)**
- `POST /search/metadata` (`searchAssets`), `POST /search/smart` (`searchSmart`, CLIP; supports `query` or `queryAssetId` for "find similar", plus `ocr` and `language`), `POST /search/random`, and `POST /search/statistics` (counts) share filters: `personIds`, `albumIds`, `tagIds`, `city`, `state`, `country`, `make`, `model`, `lensModel`, `takenAfter`/`takenBefore`, `type`, `isFavorite`, `isMotion`, `rating`, `visibility`, `withPeople`, `withExif`, `withStacked`, and `size`.
- v3.2.0 added a structured `filter` (`SearchFilter`) with `or` branches and `IdsFilter {all, any}` for personIds/albumIds/tagIds, plus `hasPeople`/`hasAlbums`/`hasTags`. It also added cursor pagination (`cursor` → `nextCursor`; `nextPage` is deprecated) and `facets` (`[{fieldName, counts:[{value,count}]}]`) in responses.

  — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json); [v3.2.0 release](https://immich.app/blog/v3.2.0-release)
- The legacy `personIds` filter means "all of these people" (AND). The server joins on `asset_face` grouped by asset `having count(distinct personGroupId) = personIds.length`. Search v2's filter accepts `personIds: {all: [...]}` or `{any: [...]}` and `or: [...]` branches — [Immich v3.3.0 server/src/utils/database.ts L274-288 and L933/L1016 examples](https://github.com/immich-app/immich/blob/v3.3.0/server/src/utils/database.ts#L274-L288)

**People / faces**
- `GET /people` (filters `name`, `isFavorite`, `isHidden`, `withHidden`, `closestPersonId`, `closestAssetId`, `sharedById`/`sharedWithId`, page/size) returns `{people, total, hidden, hasNextPage}`.
- `PersonResponseDto` fields: `id`, `name`, `birthDate` (date, nullable), `isFavorite`, `isHidden`, `color`, `thumbnailPath`, `updatedAt`, `sharedBy`, `sharedWith`, `otherPeople`. There is no external-ID or contact-link field.
- Other endpoints: `GET /people/{id}/statistics` (`{assets}` count), `GET /people/{id}/thumbnail` (face avatar), `POST /people/merge` (`mergePeople`; `POST /people/{id}/merge` deprecated since v3.2.1), `PUT /people/{id}/reassign`, and `GET /search/person?name=`.
- `GET /faces?id=<assetId>` returns per-face bounding boxes (`boundingBoxX1..Y2`, `imageWidth/Height`), `person` and `sourceType`.

  — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- People sharing (v3.3): names and birth dates are per user unless the user chooses to share them. The edit modal has "Only change for me". Enabling cluster groups (v3.2) "requires resetting facial recognition for all users in the group", and names and birth dates will be lost — [v3.3.0 release](https://immich.app/blog/v3.3.0-release); [v3.2.0 release](https://immich.app/blog/v3.2.0-release)

**Albums, map, memories**
- `GET /albums` (`isOwned`, `isShared`, `assetId`, `name`) returns `albumName`, `albumThumbnailAssetId`, `assetCount`, `startDate`/`endDate`, `description`, `albumUsers`, `contributorCounts`. Album contents now come via `/search/metadata` with `albumIds`. `GET /albums/{id}/map-markers` is new in v3 — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json); [v3.0.0 release](https://immich.app/blog/v3.0.0-release)
- `GET /map/markers` takes `fileCreatedAfter`/`fileCreatedBefore`, `isFavorite`, `isArchived`, `withPartners` and `withSharedAlbums`. It returns `[{id, lat, lon, city, state, country}]` for every geotagged asset. `GET /map/reverse-geocode` is also available — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- `GET /memories` filters: `for` (date), `type` (enum `on_this_day` | `birthday`), `isSaved`, `isUpcoming`, `order` (incl. random), page/size. `MemoryDataDto` carries `year` plus, for birthdays, `personId` and `personName` — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)

**Media files, video, thumbnails**
- `GET /assets/{id}/thumbnail?size=thumbnail|preview|fullsize|original` (perm `asset.view`), `GET /assets/{id}/original` (perm `asset.download`), `GET /assets/{id}/video/playback` (`playAssetVideo`, Stable, `asset.view`). The HLS endpoints `GET /assets/{id}/video/stream/main.m3u8` and the per-session playlist/segment routes are Alpha, added in v3 — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- Default media config in v3.3.0:
  - Transcode policy `required`, target H.264 + AAC, 720p, CRF 23, preset `ultrafast`, accepted containers mov/ogg/webm, hardware accel disabled.
  - Real-time (HLS) transcoding disabled; when enabled: H.264/HEVC at 480/720/1080p.
  - Thumbnail WebP 250 px, preview JPEG 1440 px, fullsize generation disabled.

  — [config.dto.ts v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/server/src/dtos/config.dto.ts)
- v3.0.0 introduced HLS/real-time transcoding (experimental, web only; "requires a server that can transcode in real time", hardware accel recommended; HDR and remux not yet implemented) and a new custom web video player with keyboard seeking — [v3.0.0 release](https://immich.app/blog/v3.0.0-release)
- Hardware transcoding is documented as experimental, and only encoding is accelerated (CPU still decodes and tone-maps) — [Immich docs: hardware transcoding](https://docs.immich.app/features/hardware-transcoding)

**Auth**
- API-key permissions are per endpoint. Examples: `asset.read`, `asset.view`, `asset.download`, `person.read`, `person.statistics`, `face.read`, `album.read`, `map.read`, `memory.read`, `person.update`, `asset.update` — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)

### Inferences
- Add `person.read`, `person.statistics`, `face.read`, `album.read`, `map.read` and `memory.read` to the read-only key Odysseus already uses (`asset.read` + `asset.view`). Keep `asset.download` off unless "download original" is wanted. Put any writes (favorite toggle, birthDate sync) on a separate key with `asset.update`/`person.update`, and send PATCH, since PUT disappears in v5.
- Timeline strategy, because the endpoints are Internal: Odysseus already exports `photos` (asset_id, ts, day, type, duration, city, country, albums, favorite) to SQLite. Build month/day buckets and the scrubber from that index. Use Immich only for thumbnails, video and live search. If the live bucket API is used instead, keep it behind one adapter module with a contract test that runs against the Immich version on upgrade.
- Grid tiles need `ratio` for justified layout and `thumbhash` for instant placeholders. Both come in the bucket response; add them to the SQLite export if the index drives the grid.
- Video: `/video/playback` (pre-transcoded H.264 720p by default) is the stable path. Proxy it with HTTP Range passthrough so seeking works. Don't depend on HLS (Alpha, off by default). Show `duration` (ms in v3) on tiles.
- "Photos together with person X" is a single call: `POST /search/metadata {personIds:[me, X], order:'desc'}` (AND semantics). "Any of these people" needs Search v2 `filter.personIds.any`.
- Prefer `facets` and `POST /search/statistics` for counts ("142 photos together, 9 cities") over paging through results.

### Gaps
- api.immich.app is client-rendered and could not be read. Endpoint facts come from the raw OpenAPI JSON at tag v3.3.0, and the server's runtime behaviour beyond the spec (rate limits, max page `size`) was not verified.
- Search v2 query semantics beyond the schema (e.g. how `or` combines with top-level filters, facet field list) are only in PR #30179, which was not read.
- Whether the Internal timeline endpoints changed shape between v3.0 and v3.3 was not diffed.

## Q3. People: personal CRMs, how a person page is organized, dedup/merge, privacy

### Takeaway
Personal CRMs split into two camps. Manual journals like Monica record relationships, notes, activities, reminders, gifts/debts and birthdays, and are praised for depth and data ownership but criticized for manual entry and weak mobile. Auto-ingesting networkers like Dex and Mesh (ex-Clay) build an interaction timeline from email, calendar and messaging and nudge you to "keep in touch". Odysseus already ingests email, calendar, places and photos, so it can deliver the auto timeline with Monica-style self-hosted privacy. That combination is the main gap in the market. The open problem is dedup: Nextcloud Contacts has no built-in merge.

### Cited Findings
**Monica (open source, self-hostable)**
- The official site lists relationships (families, partners, friendships, coworkers), notes and journal entries, follow-up reminders, an activity history of "meals, calls, trips, events", custom fields, birthdays and important dates, how you met, and "gifts, debts, promises, and ideas". Data is not sold or used for training, export is available at any time, and import takes vCard/CSV "with duplicate review before merging". Self-hosting is free (Docker); the hosted version is paid — [monicahq.com](https://www.monicahq.com/)
- "Monica v3", rebuilt from scratch, is announced "before the end of 2026". It promises custom records, linked items (pets, companies, homes, vehicles, projects), a connected journal (log a moment once, link it to people, dates and reminders), an API plus MCP server ("Anything available through the interface should also be available programmatically"), and mobile web first, native apps later. Registration is currently closed — [monicahq.com](https://www.monicahq.com/); [monicahq.com/en/personal-crm](https://monicahq.com/en/personal-crm/)
- The GitHub default branch is a "beta" with a stable 4.x branch. Features: contacts, relationships, birthday reminders, activities, tasks, addresses and contact methods, diary, documents and photos, multiple vaults and users — [github.com/monicahq/monica](https://github.com/monicahq/monica)
- Profile areas and criticism, from a competitor's review (Dex, updated Apr 6, 2026). Areas: contact details and important dates; relationships; background (work, food preferences, pets, notes); an activity log with date, description and optional emotion; journal tagged to contacts; per-contact reminder intervals (weekly to yearly) with CalDAV push; debts and gifts. Criticism: manual entry for every interaction, no email/calendar/LinkedIn sync, no native mobile app ("multiple reviewers cite this as a blocking issue"), full page reloads and a dated form UI — [Dex: Monica review 2026](https://getdex.com/blog/monica-review/) (competitor-authored)

**Dex (commercial)**
- Dex consolidates people "from email, calendar, LinkedIn, WhatsApp, iMessage", can "merge duplicates", and "keeps a timeline of every interaction so you always know where you left off". It offers keep-in-touch reminders, notes, custom fields, tags and groups, pre-meeting briefs and job-change updates, an MCP server and REST API, and apps for web, iOS, Android, macOS, Windows and Chrome — [getdex.com](https://getdex.com/)

**Mesh (formerly Clay)**
- Clay was acquired by Automattic (June 2025 is the best-supported date) and renamed Mesh (me.sh). It builds and enriches contacts from Gmail/Outlook, Google Calendar, LinkedIn and Twitter, and makes "Reconnect" recommendations. Reviewers report no Android app — [Product Hunt: "Clay is now Mesh"](https://www.producthunt.com/p/clay/clay-is-now-mesh); [Dex: Mesh review](https://getdex.com/blog/mesh-review/) (competitor-authored; sources disagree on the rename date)

**Market churn**
- UpHabit: a competitor page says it shut down on Apr 9, 2026, but a Dex list from Aug 2026 describes it as pivoted to "Relationship Selling". Unresolved — [ContactsPlus](https://www.contactsplus.com/uphabit-alternative/); [Dex personal CRM list](https://getdex.com/blog/personal-crm-list/)
- A Capterra reviewer moved to Dex after the previous tool "was acquired and shut down" — [Capterra: Dex reviews](https://www.capterra.com/p/275020/Dex/reviews/)

**Dedup and merge**
- Google Contacts "Merge & fix" offers duplicate suggestions with Merge / "Merge all" or manual selection. It can't merge across Google accounts, and merged contacts can be separated again — [Google Contacts Help](https://support.google.com/contacts/answer/7078226?hl=en)
- Nextcloud Contacts has no built-in merge. A long-open request (issue #70, "Merge duplicate contacts") is referenced from the forums, and draft PR #2764 proposed auto-merge on same full name, phone or email, with a maintainer suggesting user-chosen fields. Forum users fall back to Thunderbird CardBook, which finds duplicates but merges one at a time — [Nextcloud forum: how to merge contacts](https://help.nextcloud.com/t/how-to-merge-contacts/124679); [nextcloud/contacts PR #2764](https://github.com/nextcloud/contacts/pull/2764); [Nextcloud forum: remove duplicates](https://help.nextcloud.com/t/how-to-remove-duplicate-contacts/150704)

**Privacy**
- GDPR Art. 2(2)(c) household exemption: purely personal processing (e.g. a phone contact list of family and friends) is out of scope. It is lost if the use becomes commercial or the data is shared beyond the household — [Usercentrics: GDPR exemptions](https://usercentrics.com/knowledge-hub/gdpr-exemptions/); [Guernsey ODPA: personal and household activities](https://www.odpa.gg/for-individuals/personal-and-household-activities)
- Google's help says face models "may be considered biometric data in some jurisdictions", and that face groups and labels are private and not shared when photos are shared — [Google Photos Help](https://support.google.com/photos/answer/6128838?hl=en)

### Inferences
Proposed person page for Odysseus People, merging the Monica, Dex and Apple patterns:
1. **Header:** avatar (contact photo, else Immich face thumbnail), name, relationship/tags, birthday plus age and next-birthday countdown, "last interaction N days ago" with its source, keep-in-touch cadence.
2. **At a glance:** photos together (count, first and last), shared events, top places together, emails exchanged (count and last).
3. **Interactions timeline:** a mixed stream of emails, calendar events, days with photos together and places, grouped by day and linking to the Life day page.
4. **Notes/journal** (Odysseus-owned).
5. **Relationships** (vCard `RELATED`, or Odysseus-owned).
6. **Contact details** (read from CardDAV).
7. **Photos together** (justified strip linking to Media filtered by person).
8. **Places mini-map.**

Other design points:
- Auto-derive "last contact" from email, calendar and photos-with-me. This answers Monica's top complaint (manual logging) without third-party cloud enrichment (Dex/Mesh pull from LinkedIn and the like, which a privacy-first, self-hosted app should avoid).
- Keep CRM-only data (notes, cadence, links to Immich people) in Odysseus's own store, not in the vCard. That avoids polluting CardDAV and keeps it under the household exemption: single user, no sharing, no commercial use.
- Dedup must be built (Nextcloud doesn't offer it):
  - Candidate pairs are scored by normalized email, phone (E.164) and name.
  - Show a side-by-side merge with per-field choice, as in Monica's import duplicate review and Google's Merge & fix.
  - Write the merge to CardDAV, keep the losing vCard UID as an alias, and make it undoable.

### Gaps
- Covve, Folk and Garden were not researched with primary sources. Folk is a team/sales CRM, a different category. No reliable data on Garden's 2026 status.
- No first-party Dex documentation of its person-page layout was read (only the homepage).
- No primary legal source (EDPB, CJEU *Lindqvist*/*Ryneš*) was fetched on the household exemption. Vendor blogs and the Guernsey regulator only.
- Monica v3's actual data model and API are announced, not shipped. Treat them as roadmap.

## Q4. Linking people ↔ faces ↔ contacts (Immich, Google Photos, Apple Photos)

### Takeaway
None of the three link face clusters to an address book in a way an outside app can rely on. Apple Photos suggests names from Contacts while you type (community-documented; Apple's own guide is silent). Google's face groups are private labels with no documented Google Contacts link. Immich people have a name and a birthDate but no external ID, and the only CardDAV bridge is a small third-party tool that copies birthdays by name match. Odysseus therefore has to own a mapping table (Immich person id ↔ vCard UID) that survives Immich re-clustering.

### Cited Findings
- **Apple Photos (Mac):** you can name from People & Pets or directly on a photo; the name then "attaches to other photos and videos". Other controls: merge ("Merge [n] People"), "Review More Photos" (Yes/Not per suggestion), "Make Key Photo", favorites, and "feature a person less" instead of removing. With iCloud Photos, People & Pets syncs across devices. The guide does not mention Contacts — [Apple Support: Find and name people and pets on Mac](https://support.apple.com/guide/photos/phtad9d981ab/mac)
- **Apple and Contacts:** as you type a name, "one of the suggested names may be from a contact card". Photos may shorten Contacts-linked names to first names, and the Contacts "Short name format" setting affects this. On Mac you can also use names that aren't in Contacts — [Apple Community: first-name-only issue](https://discussions.apple.com/docs/DOC-13481); [iMore guide](https://www.imore.com/how-use-people-and-places-photos-mac) (community/third-party; behaviour varies by macOS version)
- **Google Photos:** labels are free-text names or nicknames visible only to you. Labeling a second group with an existing name triggers a merge offer, and merges are irreversible. There is a "Help contacts recognize your face" toggle for the "Me" label. The help page does not document Google Contacts as a label source — [Google Photos Help: face groups](https://support.google.com/photos/answer/6128838?hl=en); [Google Photos Help: label your face group](https://support.google.com/photos/answer/7378566)
- **Immich person schema:** `id`, `name`, `birthDate`, `isFavorite`, `isHidden`, `color`, `thumbnailPath`, `updatedAt` plus sharing fields. No contact/external reference. Asset-level key/value metadata endpoints exist (`/assets/{id}/metadata`), but nothing equivalent for people — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- **immich-carddav-sync** (third-party, 8 stars) syncs only birthdates from CardDAV into Immich people. It matches each Immich name against the vCard formatted name, then given+family, then nickname, and takes the first match. Same-named people get the same birthdate, duplicate contact names are unsupported, and there is no dry-run yet. Runs via cron/Docker — [github.com/daniele-athome/immich-carddav-sync](https://github.com/daniele-athome/immich-carddav-sync)
- **Fragile Immich person IDs:** re-clustering by the recommended method deletes all assigned names, and enabling cluster groups resets facial recognition and loses names and birthdates — [better facial clusters guide](https://docs.immich.app/guides/better-facial-clusters); [v3.2.0 release](https://immich.app/blog/v3.2.0-release)
- **Birth date payoff in Immich:** it shows the person's age on photos and, since v3.3, drives birthday memories (`MemoryType.birthday`, `data.personId`) — [Immich docs: Facial Recognition](https://docs.immich.app/features/facial-recognition); [v3.3.0 release](https://immich.app/blog/v3.3.0-release); [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- **PhotoPrism** can import face names from XMP metadata and auto-names clusters by majority — [PhotoPrism docs: People](https://docs.photoprism.app/user-guide/organize/people/)

### Inferences
- Keep the link in Odysseus. Use a table like `person_link(contact_uid, immich_person_id, confirmed_by_user, last_seen_name, face_thumb_hash, linked_at)`.
- Matching flow, Apple style: when naming or linking, suggest contacts by fuzzy name match. Then:
  - Batch-suggest links for named Immich people whose names exactly match a single vCard.
  - Let the user confirm in a "Link faces to contacts" review screen (Yes / Not this person / Skip).
  - Never auto-link ambiguous names; that is the carddav-sync tool's known flaw.
- Resilience: on each sync, verify the `immich_person_id` still exists with the same name. If an ID disappears after a re-cluster, re-match by name and face thumbnail and flag the link for review. The mapping doubles as a backup of names Immich may lose.
- Push `birthDate` (and optionally the display name) from CardDAV into Immich for linked people only, using PATCH and a write-scoped key. That unlocks Immich's age-on-photo display and birthday memories with no Odysseus UI work. Keep CardDAV as the source of truth for birthdays.
- Unknown faces: surface "frequent unnamed people" (no name; from `GET /people` plus `GET /people/{id}/statistics` for counts; the list's default sort order was not verified) as a "Who is this?" queue that creates or links a contact. This mirrors Google's and Apple's "Review" flows.
- Label "Me" in Immich (link it to the user's own vCard). Every "together" feature depends on it.

### Gaps
- No official Apple doc states whether naming a person in Photos writes back to or stays linked with the Contacts card (iOS 26/macOS 27). Only community threads.
- No Immich feature request or roadmap item for native CardDAV/contacts linking was found. Absence is not proof.
- Google Takeout's export of face-group labels (whether names or cluster data survive Takeout) was not checked.

## Q5. Cross-linking (person → photos/events/places together; photo → people/place/day) and concrete build recommendations

### Takeaway
All cross-links can be computed from data Odysseus already holds or can query:
- Immich: personIds AND search, `/faces` per asset, exif city/lat/lon, `/map/markers`, memories.
- CardDAV: emails and phones as join keys.
- Calendar: attendee emails.
- Stalwart: mail from/to.
- Dawarich: visits.

Build two thin views over these sources: a Media lens and a People app. Join everything on day, place and contact, and send every item back to the Life day page and to its origin app.

### Cited Findings
- Photos with several specific people come from `POST /search/metadata` with `personIds` (AND by construction) or Search v2 `filter.personIds.all/any`. Results can carry `withExif` (city/state/country/lat/lon) and `facets` — [database.ts v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/server/src/utils/database.ts#L274-L288); [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json)
- Photo → people uses `GET /faces?id=<assetId>` (boxes + person); `AssetResponseDto.people` no longer embeds faces in v3 — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json); [Migrating to v3](https://immich.app/blog/v3-migration)
- Places: `GET /map/markers` (date-bounded), `GET /albums/{id}/map-markers`, and the timeline `bbox` + `withCoordinates` filters (the web map side panel shipped in v2.6.0; that it uses `bbox` is an assumption) — [spec v3.3.0](https://github.com/immich-app/immich/blob/v3.3.0/open-api/immich-openapi-specs.json); [Immich blog index](https://immich.app/blog)
- Google ties "Me" face recognition to a location history: "where you were over time based on where your face appears" — [Google Photos Help](https://support.google.com/photos/answer/6128838?hl=en)
- Dex's core value is "a timeline of every interaction so you always know where you left off" across email, calendar and messaging — [getdex.com](https://getdex.com/)
- Monica v3's announced "connected journal" logs a moment once and links it to people, dates and reminders — [monicahq.com](https://www.monicahq.com/)
- The Life spec already makes the day page the hub. Every item carries an `open_url` back to its origin (Immich, Dawarich, Nextcloud, webmail), and city comes from Immich's offline `geodata_places` — [Odysseus Life timeline spec (local)](/data/projects/odysseus/docs/superpowers/specs/2026-11-06-life-timeline-design.md)

### Inferences
**Concrete recommendations**

**A. Media app (lens, not replacement)**
1. **Tabs:** Timeline · People · Places · Albums · Memories, with search as a persistent bar. On phone, a bottom bar with 3-4 items and Search on top, following the iOS 26 and Google floating-bar convergence.
2. **Timeline:** months from the SQLite index (day counts → scrubber with year/month ticks). Tiles via `/thumbnail?size=thumbnail` (WebP 250 px). Placeholders from `thumbhash`, width from `ratio`. Lightbox uses `size=preview` (JPEG 1440 px), and video plays from `/video/playback` with Range proxying and a duration badge.
3. **Lightbox info panel:**
   - Date linking to the Life day page.
   - Place linking to the Places map centered there and to the day.
   - People chips (from `/faces`) linking to the People page, with face boxes optional on hover.
   - Album links.
   - "Open in Immich" for edit, share, fix face, delete.
4. **Search:** one box with a mode toggle, Smart (CLIP) vs Exact (filename, OCR, filters). Filter chips for person (multi, all/any), place, date range, type, favorite. "Find similar" from any photo (`queryAssetId`). Show counts via `/search/statistics`; never hide results behind an AI summary.
5. **Places:** cluster markers from `/map/markers` with a date-range filter. Clicking a cluster opens a grid filtered by bbox or city, and links to Dawarich visits on the same day.
6. **Memories:** "On this day" and birthday memories from `/memories?for=today` in the Life home, deep-linking into the lens.
7. **Write actions** (separate key, PATCH): favorite toggle only. Everything else goes to Immich.

**B. People app**
1. **Sources:**
   - CardDAV: identity, emails, phones, birthday, photo, `RELATED`.
   - Immich: faces, photos together.
   - Calendar: shared events by attendee email.
   - Stalwart: last email and frequency.
   - Dawarich + Immich exif: places together.
   - Odysseus store: notes, cadence, tags, the person ↔ Immich link, merge aliases.
2. **List view:** sort by last interaction or by "due to reconnect" (cadence overdue). Show upcoming birthdays (next 30 days). Filters by tag/group. Show a "Who is this?" queue of unnamed frequent faces and a "Possible duplicates" queue.
3. **Person page:** sections as in Q3. Computed rows:
   - "Photos together" = personIds [me, X].
   - "Shared events" = calendar events whose attendees include any of X's emails.
   - "Places together" = cities and visits on days with photos together or shared events.
   - "Last contact" = max(last email, last event, last photo together).
4. **Linking UX:** a review screen with suggested contact ↔ face pairs (exact unique name first). Confirm, reject or skip, store the decision, and never auto-link duplicates. Then push birthDate to Immich.
5. **Dedup:** scored candidates on normalized email/phone/name, side-by-side field picking, write the merged vCard to Nextcloud, keep alias UIDs, allow undo.
6. **Privacy:**
   - Single user, no sharing, no third-party enrichment.
   - Treat face embeddings as biometric-sensitive: they stay in Immich, and Odysseus stores only IDs and thumbnail hashes.
   - Keep `no-store` on proxied images, as the Life spec already does.
   - Offer "hide person" that propagates to memories, as Google's "Blocked" does.

**C. Shared plumbing**
- Use one `entity link` scheme: day `YYYY-MM-DD`, place id, contact UID, Immich person/asset/album id. Every item renders a chip that routes inside Odysseus, with a secondary "open original" action.
- Keep the Immich adapter version-aware. Pin to the v3.3 spec and add a CI contract test against `GET /server/version` plus the endpoints used, especially the Internal timeline ones and anything still on PUT.

### Gaps
- No source describes a shipping product that computes "places visited together" from photos plus location history. This is a novel composition, so validate it in use.
- Calendar attendee ↔ contact matching quality (Nextcloud events often lack attendee emails for personal events) was not measured on the user's data.
- Performance of `/search/metadata` with `personIds` on ~50k assets and many faces (latency, max `size`) was not benchmarked.
