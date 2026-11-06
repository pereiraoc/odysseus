# Digital-activity timelines and lifelog search: UI/UX patterns for summarising high-volume events and searching a personal archive

Scope: patterns that carry over to "Life", a single-user, self-hosted desktop web panel (also used on phone) where one day holds 50–300 low-value digital events (searches, YouTube, Play Store, Maps, Assistant, e-mail, AI sessions, commits) plus fewer high-value ones (places, photos, purchases, calendar). Status checked as of November 2026. Notes on method: three PDFs (LSC'21 comparison, LSC'22–24 review, MyEachtra LSC'23) were read in full text via pdftotext. The other sources were read through web fetches or search snippets, and the claims that rest only on snippets are flagged.

## 1. Rewind.ai / Limitless and Microsoft Recall: timeline scrubber, search-first UX, result presentation, reception, 2026 status

### Takeaway
Both "record everything" products ended up search-first. Reviewers call search "the decisive feature" and describe scrolling the timeline as cumbersome. Recall organises results as "text matches" vs "visual matches" with "Close/Related match" labels and an app filter. In 2025 it added a homepage that summarises the last 24 h as the top 3 apps/websites plus recent snapshots. Status in November 2026: **Rewind is discontinued.** Meta acquired Limitless on 5 Dec 2025, and capture was disabled on 19 Dec 2025. **Recall still ships as an opt-in feature on Copilot+ PCs**, but security criticism continues, and Microsoft has reportedly backed away from bringing it to all Windows 11 PCs.

### Cited Findings
**Rewind / Limitless (DISCONTINUED)**
- Limitless (renamed from Rewind in 2024) announced on 5 Dec 2025 that Meta had acquired it. A Rewind update disables "all screen and audio capture" on 19 Dec 2025. Pendant sales stopped, and existing Pendant customers are supported "for at least another year" on a free Unlimited plan. On 5 Dec 2025 the service ended in Brazil, China, the EU, Israel, South Korea, Turkey and the UK, and users there had to export by 19 Dec before their data was permanently deleted. An export tool and in-app account/data deletion were provided — [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/); [Limitless homepage "Limitless has been acquired by Meta"](https://limitless.ai/)
- One commentary criticised the 14-day wind-down, arguing that an ideal sunset gives 90–180 days before permanent deletion. This rests on a search snippet; the page was not fetched — [Pascal's Chatbot Q&As](https://p4sc4l.beehiiv.com/p/limitless-ai-a-case-study-in-how-small-hardware-enabled-ai-companies-transition-their-products-user)
- Rewind drew attention at its 2022 launch mainly for compression: a claimed >10 GB of recordings shrunk to <3 MB. It offered natural-language search over your history — [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)
- What a hands-on review describes and shows in its screenshots:
  - A scrollable timeline graph where app icons show which app was active at each point, plus a **date selector to jump** instead of scrolling.
  - A search that returns **every recorded moment containing the word or phrase**, filterable **by app**, with bookmarking.
  - For browser moments, "open" reopens the exact page. For Slack it cannot deep-link, but the screenshot gives enough context to find the conversation.
  - The screenshots show the timeline view, a search screen (pixelated by the reviewer) and the recording settings.
  - [Fresh van Root review](https://freshvanroot.com/blog/review-rewindai/)
- The same review's praise and criticism:
  - "Search is the decisive feature."
  - Navigating by scrolling is "cumbersome", and in two weeks the app helped only twice.
  - $20/month felt "a bit much".
  - Storage was about 2.5 GB after about two weeks.
  - Work and personal use mix, so app exclusions only partly protect privacy, and the reviewer wanted scheduled "working hours" for recording.
  - Praised: everything stays local; no crashes or performance impact.
  - [Fresh van Root review](https://freshvanroot.com/blog/review-rewindai/)
- Another hands-on description (from search snippets, attribution not verified) says each block of recording on the timeline is separated by app and can be scrubbed, and that a keyboard shortcut brings up a search bar together with the scrollable timeline — [The Sweet Setup, "A first look at Rewind AI"](https://thesweetsetup.com/a-first-look-at-rewind-ai/); [TheSweetBits review](https://thesweetbits.com/tools/rewind-ai-review/)
- A TechCrunch commentator called Rewind a memory aid, "but definitely one that requires you to be sitting down at your computer". This is a snippet-level quote — [TechCrunch, 2022](https://techcrunch.com/2022/11/01/rewind-wants-to-revamp-how-you-remember-with-millions-from-a16z)
- Successor/alternative: screenpipe (MIT-licensed per its docs, runs on macOS/Windows/Linux) offers a built-in timeline view and natural-language search, but it cannot import historical Rewind data — [screenpipe docs: vs Rewind](https://docs.screenpi.pe/vs-rewind). A 2025 Reddit report describes a blank timeline window on an M4 Mac, and no independent hands-on review of its timeline UI was found — [r/software thread](https://redlib.hbubli.cc/r/software/comments/1fjfwg0/screenpipe_open_source_247_screen_audio_capture)

**Microsoft Recall (ACTIVE, opt-in, Copilot+ PCs only)**
- **Timeline.** You open it from the nav bar. It is "divided into segments, which are time blocks during which snapshots were captured". Hovering shows a preview window, and selecting a point or the preview loads that snapshot. Snapshots are taken every few seconds and whenever the active window's content changes — [Microsoft Support, "Retrace your steps with Recall"](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- **Search.** You can type or speak a query. Results are split into **"text matches" and "visual matches"**, ordered by closeness and labelled **"Close match" / "Related match"**. Results come from all apps by default, and you can **filter to one app** from a list — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- **Snapshot view.**
  - A result opens with "Click to Do" active, so you can copy text or images or open them in an editor.
  - Buttons above the snapshot let you **jump back into the original app or webpage when possible**, copy the snapshot, or delete it.
  - Each result tile has a "…" menu with Copy and Delete, and "Delete all" removes every snapshot from that app or website.
  - [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- **Homepage (added in 2025).**
  - It starts as just a search bar. When the setting "Recall shows a customized experience using your snapshots" is on, it adapts to your recent snapshots and apps — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
  - Insider build 26200.5661 (23 Jun 2025) introduced the personalised homepage and a new navigation bar. The homepage shows a curated view of the **top three apps and websites over the past 24 hours** plus **recent snapshots** — [Windows Insider Blog](https://blogs.windows.com/windows-insider/2025/06/23/announcing-windows-11-insider-preview-build-26200.5661-dev-channel/)
  - Clicking a "Recent Snapshots" card opens the Timeline. Clicking an app or site card opens a page with all of that app's snapshots — [Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-unveils-big-windows-recall-update-now-showcases-your-most-used-apps-and-websites) (article body not retrievable; details from search snippet)
  - The nav bar holds Home, Timeline, Feedback and Settings. The homepage became the default landing view from build 26100.5074 and can be switched off — [ElevenForum tutorial](https://www.elevenforum.com/t/use-recall-with-snapshots-in-windows-11.31003/latest) (snippet-level)
- **Privacy controls.**
  - You can exclude apps and websites (website and private-browsing filtering needs a supported browser).
  - "Sensitive information filtering" (passwords, card numbers) is on by default.
  - Windows Hello is required to open Recall.
  - "Pause until tomorrow" pauses capture; resuming requires Hello.
  - "Reset Recall" deletes everything.
  - Storage: 50 GB of free space is needed to enable it, and saving pauses below 25 GB. Admins can cap disk use and retention.
  - [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- **History and reception.**
  - Recall was announced at Build in May 2024.
  - In June 2024 the "TotalRecall" tool showed that the local data was accessible and unencrypted. The release was then delayed and moved to Insider testing.
  - In Sept 2024 Microsoft announced a "more secure" version with an encrypted database and uninstall support, and it later made Recall opt-in.
  - Signal added default-on "screen security" on Windows 11 in May 2025 to block Recall. Brave and AdGuard added similar blocking in July 2025.
  - [Wikipedia: Windows Recall](https://en.wikipedia.org/wiki/Windows_Recall)
- Recall reached the Release Preview channel in April 2025 (build 26100.3902) — [The Register](https://www.theregister.com/2025/04/11/microsoft_windows_recall/); [Gigazine](https://wbgsv0b.gigazine.net/gsc_news/en/20250414-windows-recall-release-preview)
- Hands-on verdicts on usefulness are mixed (headline/snippet-level only):
  - "Not impressive yet" — [digitpatrox](https://digitpatrox.com/hands-on-with-microsofts-windows-recall-not-impressive-yet/)
  - A laptop reviewer sees it as useful mainly to professionals and forgetful users — [Tom's Guide](https://tomsguide.com/computing/windows-operating-systems/i-review-laptops-for-a-living-heres-my-honest-thoughts-on-windows-recall)
  - Early Insider testers found AI search efficient — [hubsite365 summarising Windows Central](https://www.hubsite365.com/de-ww/crm-pages/hands-on-with-windows-recall-on-windows-11-copilot-pcs-efb5b2f0-9f1a-4d64-aaf8-ccc87824276a.htm)
- **Status in 2026.**
  - GeekWire (April 2026) reports that Microsoft "pulled back on its plans to roll out Recall to all Windows 11 PCs" and that security researchers still see problems. The page returned 403, so this is snippet-level — [GeekWire](https://www.geekwire.com/2026/one-year-after-its-rocky-launch-microsofts-windows-recall-still-raises-security-red-flags/)
  - Windows Central reported a "Copilot and Recall rethink" as Microsoft walks back Windows 11 AI features. The body was not retrievable and the date is unclear — [Windows Central](https://www.windowscentral.com/microsoft/windows-11/microsoft-is-reevaluating-its-ai-efforts-on-windows-11-plans-to-reduce-copilot-integrations-and-evolve-recall)
  - In Oct 2026 Microsoft removed 8 AI actions from File Explorer — [Windows Latest, 21 Oct 2026](https://www.windowslatest.com/2026/10/21/microsoft-is-now-scaling-back-copilot-in-windows-11-amid-microslop-backlash-pulling-8-ai-actions-from-file-explorer-and-calling-it-simplifying/)

### Inferences
- In both products the timeline is the fallback and search is the primary tool. Recall made this explicit by landing on a search bar, then a summary homepage, rather than the raw timeline. For Life, the day view should open on a summary ("what mattered + top sources") and should not drop the user into a 300-row list.
- Recall's homepage pattern (top 3 apps/sites over 24 h, each opening a per-source page) maps directly onto a "Digital · 6 searches, 2 videos" cluster chip that drills down to a per-source list.
- "Jump back to the original" (Recall's open-app/web button, Rewind's "open") is the action reviewers valued most, because the snapshot only gives context and the real object lives elsewhere. Each Life item should link out to its canonical URL (YouTube, Maps, Gmail, commit).
- Recall labels result tiers ("Close match" / "Related match") and splits results by modality (text vs visual). That suggests Life should separate exact keyword hits from semantic or related hits instead of mixing them in one ranked list.
- The main criticism of both products (privacy, recording everything) mostly does not apply to a self-hosted archive built from exports. The controls still transfer, though: "delete all from this source", per-source exclusion, and pause.

### Gaps
- I found no detailed description of Rewind's search-results layout (thumbnail grid vs list, match highlighting, per-day grouping). The LaptopMag hands-on was truncated.
- No Hacker News or Reddit threads on Rewind or Recall usefulness were retrieved directly. The criticisms above come from reviews.
- The 2026 Recall status rests on GeekWire and Windows Central snippets, and the full articles were not accessible.

## 2. ActivityWatch, RescueTime, Apple Screen Time / Android Digital Wellbeing, Google My Activity: bundling, titles, drill-down

### Takeaway
Wellbeing and time-tracking tools aggregate **by app or category and by time unit** (totals, top-N, hour bars), and let you drill down from a category to its apps or URLs. Google My Activity is the closest analogue to Life. It launched (2016) with **"bundles" that group similar activity** next to a flat, newest-first "item view", and today's official help describes **browsing by day** plus **search + date filter + product filter** and bulk deletion. Recent Google surfaces (the Google app's Activity tab, 2025) show a short preview with an "[x] items" link to the full list.

### Cited Findings
**Google My Activity**
- 2016 launch: "Your activity is listed as individual items, starting with the most recent. … These items might be part of bundles, which group similar activity together." Products covered included Search, Chrome, YouTube, Maps, Ads and Shopping, and deletion worked "in a particular date range or by specific topics" — [The Hacker News, 2016](https://thehackernews.com/2016/06/google-my-activity.html)
- Older UI (2019 community thread): "You can view your activity as bundles or individual items. To change your view, at the top right, click More > Item view or Bundle view." To see all items in a bundle: "On the bundle, click More Details." (snippet-level) — [Google Search Help Community thread](https://support.google.com/websearch/thread/24051371/how-do-i-view-all-of-my-recent-search-history-in-one-simple-list-there-used-to-be-a-view-all-option?hl=en)
- A third-party guide says Bundle View "group[s] items by category and show[s] you the latest in each", and clicking a group reveals the other items (snippet-level) — [support.com guide](https://www.techsolutions.support.com/how-to/how-to-check-your-google-account-history-11467)
- What the current official help says (no mention of bundles):
  - "Browse by day", or "Search or use filters".
  - The **Calendar** icon picks a date, preset periods or custom start/end dates.
  - A product filter selects which products to include, and date and product filters can be combined.
  - "Delete" works on one item, on filtered results ("Delete Results"), or on "All time".
  - Auto-delete is available.
  - Location info and IP address in Web & App Activity are removed after 30 days.
  - [Google Account Help, "Delete your activity"](https://support.google.com/accounts/answer/465)
- Google app Activity tab (May 2025):
  - "History" shows the **four most recent searches** and the sites opened from them.
  - Each entry is a card with favicon, query or page name, date, time and domain, and an overflow menu (Save / Share / Delete).
  - An **"[x] items"** label opens the full list.
  - [9to5Google](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/)

**ActivityWatch (open source, self-hosted, ACTIVE)**
- The official docs list the web UI views as Activity overview ("Most used applications by day", a Timeline, "Most time spent on a website", which needs the browser extension) and Bucket overview (last-updated time, "Listing of the latest events"). Advanced configurable visualisation "is not a priority and is unlikely to get implemented" in the core project — [ActivityWatch docs: User Interface](https://docs.activitywatch.net/en/latest/features/user-interface.html)
- v0.11 added category support to the timeline bar chart, weekly and monthly views, category colours, and import/export of categories — [It's FOSS](https://itsfoss.com/news/activitywatch-0-11-release/)
- Categorisation history (forum, snippet-level):
  - Rule-based categorisation arrived in v0.8.1.
  - v0.8.4 added a category filter in the Activity view to find **uncategorized events**.
  - Users complained that categories were stored in the browser and that the manual-categorisation guide was hard to find.
  - [ActivityWatch forum: Categorizing Events](https://forum.activitywatch.net/t/categorizing-events/269)
- Open feature requests include a **category drill-down view**, a **vertical timeline**, and unified category colours across views — [ActivityWatch forum, Features](https://forum.activitywatch.net/c/features/8?page=1)

**RescueTime / Timing**
- RescueTime assigns each app or site a category and a productivity level (Focus Work, Other Work, Neutral, Personal, Distracting). The "Productivity Pulse" (0–100) summarises a day, and uncategorised time counts as neutral — [RescueTime help: Understanding your data](https://help.rescuetime.com/article/461-understanding-your-data); [Your first productivity insights](https://help.rescuetime.com/article/457-your-first-insights)
- The dashboard has three sections: Categories, Productivity and **Highlights**, where users log notable moments. In the Categories report, a day view shows "By Hour", and a week or month view shows "By Day" and "Time of Day" — [RescueTime help: Dashboard](https://help.rescuetime.com/article/30-dashboard); [The Categories Report](https://help.rescuetime.com/article/60-the-categories-report)
- Drill-down: "more details" under a category shows the work by URL or application. Timing (macOS) instead offers a Review tab with an interactive timeline of each day where you **recategorise time after the fact** and drag detected keywords onto projects — [Timing blog: Timing vs RescueTime](https://timingapp.com/blog/timing-vs-rescuetime-comparing-features-capabilities.md)
- A Capterra reviewer prefers RescueTime's Timeline view "to scroll thru the day to associate activities with their work" (snippet-level) — [Capterra reviews](https://www.capterra.com/p/103317/RescueTime/reviews/?page=4)

**Android Digital Wellbeing / Apple Screen Time**
- Digital Wellbeing:
  - The dashboard chart shows **today**, and it has three metrics: "Screen time", "Times opened" and "Notifications received".
  - You tap the chart, then an app, for details.
  - For Chrome: "Show all apps" → Chrome → "Show sites" lists the sites visited and the time per day, and "Remove past visits" hides a site's history.
  - [Android Help: Digital Wellbeing](https://support.google.com/android/answer/9346420)
- Screen Time (iPhone) defaults to a **category** view, and a "Show apps & websites" toggle under "See All App & Website Activity" switches to the per-app list. This comes from a third-party guide; no official Apple page was found — [TheGeekPage](https://thegeekpage.com/screen-time-not-showing-apps-in-app-activity-how-to-fix/). Apple Community advice notes a **Devices** dropdown for per-device data — [Apple Community thread](https://discussions.apple.com/thread/256053750)

### Inferences
- There are two grouping axes, and the products use them differently. **By source** (My Activity bundles, Screen Time categories, Digital Wellbeing apps, Recall's top-3 apps) answers "what did I do". **By time** (Recall segments, RescueTime "By Hour", ActivityWatch timeline) answers "when". Life's plan to nest a source-count cluster ("Digital · 6 searches, 2 videos") inside a place/time block combines both. This is close to My Activity's old bundle view, but anchored to place.
- Google apparently retired the bundle/item toggle. The current help documents only by-day browsing plus filters, which suggests one consistent view with good filters beats a mode toggle. Life could keep a single day view where clusters expand in place, plus a "flat list" option only in search.
- Common features worth copying: a **preview of N + "[x] items" link** (Google app), **category → app → URL drill-down** (RescueTime, Digital Wellbeing), **delete or hide per source or filter** (My Activity "Delete Results", Digital Wellbeing "Remove past visits"), and a **"what's uncategorised" filter** (ActivityWatch) for spotting noisy items the cleaner did not handle.
- RescueTime's "Highlights" (user-logged notable moments) are a light way to let high-value moments stand above the automatic stream.

### Gaps
- I found no official, current Google documentation of whether "bundles" still exist on myactivity.google.com, or what the bundle titles look like (e.g. "N items from YouTube"). The 2016–2019 sources suggest the mechanism existed, but its current status is unconfirmed.
- No official Apple iPhone help page for the category vs app toggle was retrieved.
- No official description of RescueTime's timeline "time blocks" was found.

## 3. Lifelog Search Challenge (LSC, ACM ICMR) systems: event segmentation, combining map + calendar + text, what papers say about interface effectiveness

### Takeaway
LSC systems moved from per-image retrieval to **event-centric** retrieval. They segment by place change, visual change and time gap, and they split events at midnight so date filters work. They show each result **in its temporal context** (before/during/after triplets, an "event view" on a timeline, rows of neighbours around the best hit), next to a map panel and date/time facets. The comparative papers find the top systems were separated less by how many tasks they solved than by **fast retrieval with few wrong submissions**. In 2021, users found plain "query-and-scroll" sufficient for most tasks. Browsing temporal context mattered for the hardest tasks, and OCR or text matching solved roughly half of the tasks.

### Cited Findings
**LSC'21 comparison (17 systems, IEEE Access 2023)**
- MyScéal was "designed to support novice users", with a straightforward interface based on textual queries and a **map visualising GPS data usable as a filter by geographic bounds** — [Tran et al., "Comparing Interactive Retrieval Approaches at LSC 2021", IEEE Access 2023 (PDF)](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- SOMHunter+ users "found that the structure of the tasks at the competition led mostly to pure **query-and-scroll** search strategy, which was sufficient for most of the solved tasks" — [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- lifeXplore "allows to filter data by time-related groups, such as years, months, days, weekdays, day-times, etc., and to combine such filters with content-based search", and "Results can be grouped by **coherent days**, further inspected by a meta-data viewer". CVHunter offered "ranked set scrolling, **day summary browsing**". LifeMon lets users "traverse their temporal context". FIRST "integrates a flexible timeline to shrink or expand the time interval of interest" — [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Memento's UI combined a primary search interface, "a **starring** feature to tag probable images during an ongoing search", and "a data filtering component to support **faceted filtering**" with visualisation of the ranked results — [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Temporal queries:
  - MyScéal supports three ordered queries (before and after are run conditionally on the main one, e.g. a "2 hours later" window).
  - vitrivr supports any number of temporally ordered queries fused late.
  - Memento first locates the target event, then re-ranks by past/future context.
  - [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Map:
  - In MyScéal, "search results are clustered in the map section along with the location names inferred by the query parser. The user can also **draw a rectangle on the map** to narrow the search space."
  - FIRST shows photo clusters by geolocation.
  - vitrivr offered a Leaflet-based map query.
  - [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Deduplication: "MyScéal **joined temporally adjacent images that are visually similar** to reduce visual clusters". FIRST and LifeSeeker clustered similar images for display — [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Effectiveness:
  - The top teams (MyScéal, SomHunter+, LifeSeeker) solved roughly the same tasks, and what differentiated them was "the number of wrong submissions with the fast retrieval time".
  - "OCR … half of the tasks in LSC'21 could have benefited from OCR text."
  - On the hardest task (a telescope missing from the metadata), only MyScéal, LifeSeeker and lifeXplore succeeded, scoring 88, 54 and 53. "An effective interactive retrieval system (which supports **browsing of the temporal context** of search result) can assist the user."
  - [same PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Earlier baseline: the LSC'18 comparison used 27 days of one lifelogger's multimodal data — [Gurrin et al., LSC2018 comparison](https://bora.uib.no/bora-xmlui/handle/1956/23844)

**MyEachtra (LSC'23), successor of Myscéal / E-Myscéal**
- Motivation: "the expert still struggled to determine the relevance of some images, and there was a high risk of missing correct images. This inspires us to adopt an event-based approach … [to] help users understand the **context of the retrieved results** more quickly and accurately" — [Tran et al., MyEachtra, LSC'23 (PDF)](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- Event boundaries: "(i) the change of semantic locations …, (ii) cosine distance between successive images, and (iii) the time gap between two images. To further assist the use of date filters …, we also **split the event if they occur over two days** (e.g. staying at home overnight)". A 0.3 cosine threshold produced 167,570 events — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- Results are displayed as **ranked events, not images**, highlighting "location, time, and highly ranked images within an event". The best-scoring image in each group is highlighted and placed in the middle of the row "to draw the user's attention … and reduce the need for extra scanning", with "up to the next six most relevant images (three on each side)" for context. Adjacent events are merged into one row "to further reduce repetitive information" because segmentation splits activities at one location into separate segments. (The paper's wording says "if there is location changes"; the rationale implies same-location merging.) Figure 2 shows this row layout, with a left QA panel hidden for non-QA tasks. Ad-hoc tasks can submit a whole event with Shift-click — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- Inherited from Myscéal:
  - "Full-text search instead of relying on a faceted filter panel" (a custom parser pulls time, place and concepts out of the query) to minimise interaction steps for novices.
  - Three query boxes ("before", "during", "after") with results shown in **triplets**.
  - A **map panel** at the top right for filtering.
  - A "saved" section to set aside candidates.
  - An "**Event View**" showing where an image sits "on a timeline covering the entire lifelog".
  - [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- E-Myscéal (LSC'22) replaced Myscéal's concept-based engine with CLIP embeddings so that novices need not know the annotation vocabulary — [E-Myscéal, DORAS](https://doras.dcu.ie/27801/1/EMySce%CC%81al.pdf) (snippet-level)

**LSC 2022–24 review (arXiv 2506.06743, IEEE Access 2025)**
- "Effective user interface (UI) and user experience (UX) design becomes crucial. Good interfaces allow users to refine searches and explore their lifelogs intuitively, even without precise recall" — [Tran et al., "State-of-the-Art in Lifelog Retrieval: LSC 2022–24", arXiv](https://arxiv.org/pdf/2506.06743)
- LSC'22: "LifeSeeker 4.0 used **event clustering** to enhance navigation". LSC'23: lifeXplore introduced "dynamic result sequencing and **faceted filtering**", MEMORIA brought "more detailed event segmentation", and LifeGraph 3 let users interact with "hierarchical temporal, spatial, and visual clusters" — [arXiv review](https://arxiv.org/pdf/2506.06743)
- "MyEachtra, Memento 4.0, and MemoriEase 2.0 performed hierarchical or content-based segmentation to construct **event-level representations** … This shift toward event-centric representations reflects a growing interest in modelling lifelog data in ways that align more closely with human memory" — [arXiv review](https://arxiv.org/pdf/2506.06743)
- "Features such as drag-and-drop, **sidebars for filtering**, and visual previews of search results have become standard." LSC'24 teams (LifeLens 2.0, VitaChronicle, Retrospect) focused on "minimalist, task-oriented designs", and MyEachtraX added a **mobile-friendly** design — [arXiv review](https://arxiv.org/pdf/2506.06743)
- LLMs and RAG: "LLM-integrated systems like MemoriEase, Memento 4.0, and Voxento-Pro **excelled in QA tasks**". Memento 4.0 produced "structured answers based on event segmentation". Conversational interfaces allow "query refinement through dialogue rather than manual re-entry" — [arXiv review](https://arxiv.org/pdf/2506.06743)
- Caveats and future work:
  - Novice-user results were excluded because of "high variability".
  - The authors call for controlled novice studies, for "interactive **negative relevance feedback** that allows users to quickly filter out visually similar but contextually irrelevant false positives", and for an "Interaction-Cost-to-Success" metric.
  - "Realistic, memory-like queries — often imprecise or fuzzy — better reflect real-world information needs."
  - [arXiv review](https://arxiv.org/pdf/2506.06743)

### Inferences
- Segmentation rules carry over almost unchanged. Start a new block on a place change, on a time gap, or at midnight, and merge adjacent same-place segments in the display. This matches Life's "cluster digital activity inside the place/time block".
- The "best hit in the middle, neighbours on each side" row (MyEachtra) is a ready-made layout for search hits. Show the matched event with its 1–3 neighbouring events or items, so the user sees context without opening the day.
- Myscéal's "single text box parses time, place and source" plus an optional map rectangle shows how to keep facets light. LSC'24's minimalist designs and "sidebars for filtering" are the two accepted options. On a phone, the parsed-query approach saves space.
- The "starred/saved candidates" tray (Memento, Myscéal) is worth copying for multi-step recall ("which of these three days was it?").
- The evidence is from expert, timed known-item search on photo lifelogs. It supports "query-and-scroll + context browsing" as the core loop, but it says little about everyday novice use or about text-only digital events.

### Gaps
- LSC datasets are wearable-camera images plus biometrics and GPS. No LSC system was found that specifically handles high-volume *digital* events (searches, videos, e-mails), so transfer to digital clusters is by analogy.
- No LSC paper retrieved quantifies the benefit of map or calendar widgets separately from the retrieval model. The papers report system-level scores only.
- E-Myscéal's own segmentation and UI details were not read in full text, only its abstract snippet.

## 4. Search UX for personal archives: grouping results by day, facets, highlighting, jump-to-context

### Takeaway
Across products and research the convergent pattern is: (a) one unified index across sources; (b) a search box that also accepts time and place; (c) facets for **source/app, date range, place**; (d) results that keep their **temporal context** (grouped by coherent day or event, with neighbours); (e) a **jump-to-context / open-original** action; (f) bulk actions on a filtered result set. Time and people are classic personal-retrieval cues.

### Cited Findings
- Stuff I've Seen (Microsoft Research, SIGIR 2003) provides "a unified index of information that a person has seen, whether it was seen as email, web page, document, appointment", and its authors reported that **time and people are important retrieval cues** (abstract/summary level) — [Dumais et al., "Stuff I've Seen", SIGIR 2003 (bib record)](https://bibtex.github.io/SIGIR-2003-DumaisCCJSR.html)
- "Milestones in Time: The Value of Landmarks in Retrieving Information from Personal Stores" (Ringel, Cutrell, Dumais, Horvitz, INTERACT 2003) studies landmark events (personal and public) shown alongside a timeline of results as retrieval cues. The full text was not retrieved — [bibliographic listing via search](https://www.bibsonomy.org/bibtex/2b510c0ed2a30ac50f36b02d530d3e133/lysander07?lang=de)
- Grouping by day or event:
  - lifeXplore groups results "by coherent days", and CVHunter offers "day summary browsing" — [LSC'21 PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
  - MyEachtra shows ranked events with location and time — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
  - Google My Activity browses "by day" with search plus date and product filters, and deletes filtered results in bulk ("Delete Results") — [Google Account Help](https://support.google.com/accounts/answer/465)
- Facets:
  - Recall offers an app filter on results — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
  - Rewind offered an app filter and bookmarks — [Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)
  - lifeXplore filters by year, month, day, weekday and day-time; Memento has a faceted filter component; MyScéal filters by drawing a map rectangle — [LSC'21 PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- Match-quality labelling: Recall splits "text matches" from "visual matches" and labels "Close match" vs "Related match" — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- Highlighting: MyEachtra highlights the single best item per event row and centres it — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf). Recall opens a hit with Click to Do so text and images in the snapshot can be acted on — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- Jump to context:
  - Recall's timeline hover preview loads the snapshot, and the snapshot view has "jump back into the original app or webpage" — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
  - Myscéal's "Event View" places a hit on a whole-lifelog timeline — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
  - Rewind's "open" reopens a browser page at the moment — [Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)
- Source labelling on mixed results: the Windows 11 search redesign (2026) labels each result as app, setting, file, web result or Store suggestion. This is snippet-level and tangential, from a blog — [Windows Digitals](https://windowsdigitals.com/get-old-search-back-windows-11-26h2)
- Fuzzy, conversational refinement: LSC'24 conversational systems let users refine "through dialogue rather than manual re-entry", and the review calls realistic memory queries "imprecise or fuzzy" — [arXiv review](https://arxiv.org/pdf/2506.06743)

### Inferences
- For Life search, results grouped under **day headers** (date + place summary), each hit shown inside its block with 1–2 neighbours and a "show in day" action, match how users think: "it was the day I was at X". This combines lifeXplore's coherent days, MyEachtra's event rows and My Activity's by-day browsing.
- Facets to expose: **source** (Search, YouTube, Maps, Gmail, git…), **date range** (calendar presets like My Activity's), and **place**. Show landmark chips (calendar events, photos, purchases) in the day header to use the "Milestones" landmark effect.
- Separate "exact text" from "related/semantic" hits, as Recall does, so low-value fuzzy matches do not bury the exact hits.
- Allow bulk actions on the current filter (hide or delete all results from source X), following My Activity's "Delete Results".

### Gaps
- Full texts of Stuff I've Seen and Milestones in Time were not obtained, so specific quantitative findings (e.g. how often users sorted by date vs rank, or the landmark speed-up) are not reported here.
- No published usability study was found that directly compares "results grouped by day" with a flat ranked list for personal archives.

## 5. Concrete patterns: progressive disclosure for noisy streams; time-block vs app grouping; deduplication (repeat watches); removed/private items ("video unavailable")

### Takeaway
Evidence supports: **summary first, details on demand** (Recall homepage top-3, Google "[x] items", My Activity bundles, RescueTime "more details"); **time-block primary with source as the secondary breakdown** (Recall timeline segments; MyEachtra events); **merging near-duplicates** (MyScéal's adjacent-similar merge, MyEachtra's same-place row merge); and **per-source delete or hide**. Evidence on handling removed or unavailable items is thin and unofficial. Takeout watch-history records for unavailable videos may carry only a timestamp, so the UI needs a graceful placeholder.

### Cited Findings
- Progressive disclosure:
  - Recall's homepage shows only the top 3 apps/websites from the last 24 h, with each card opening that source's snapshots — [Windows Insider Blog](https://blogs.windows.com/windows-insider/2025/06/23/announcing-windows-11-insider-preview-build-26200.5661-dev-channel/); [Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-unveils-big-windows-recall-update-now-showcases-your-most-used-apps-and-websites)
  - The Google app shows the 4 most recent searches plus an "[x] items" link — [9to5Google](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/)
  - My Activity bundles showed the latest item with "More Details" — [Google Help Community](https://support.google.com/websearch/thread/24051371/how-do-i-view-all-of-my-recent-search-history-in-one-simple-list-there-used-to-be-a-view-all-option?hl=en)
  - In RescueTime, category → "more details" → URL/app — [Timing blog](https://timingapp.com/blog/timing-vs-rescuetime-comparing-features-capabilities.md)
  - In Digital Wellbeing, chart → app → "Show sites" — [Android Help](https://support.google.com/android/answer/9346420)
- Time-block vs app grouping:
  - Recall's timeline uses time-block segments, and its homepage uses an app ranking — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
  - Rewind's timeline showed which app was active at each point — [Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)
  - RescueTime shows a day "By Hour" and longer ranges "By Day" / "Time of Day" — [RescueTime help](https://help.rescuetime.com/article/60-the-categories-report)
  - ActivityWatch users requested a vertical timeline and category drill-down — [ActivityWatch forum](https://forum.activitywatch.net/c/features/8?page=1)
- Merging and deduplication:
  - "MyScéal joined temporally adjacent images that are visually similar" — [LSC'21 PDF](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
  - MyEachtra merges adjacent same-location events into one row "to further reduce repetitive information" and splits events at day boundaries — [MyEachtra PDF](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- YouTube repeats:
  - A data-cleaning guide (low-quality source) says repeated views produce duplicate entries in Takeout and suggests "grouping entries by video ID and timestamp proximity" — [motorsport.unibo.it article](https://cloud.motorsport.unibo.it/article/the-hidden-archive-how-to-find-your-youtube-history-like-a-pro)
  - A Mozilla Support user reported that re-watched videos did not move to the top of YouTube's history, and blamed a YouTube bug. This is a single user report — [Mozilla Support](https://support.mozilla.org/en-US/questions/988821)
- Removed or unavailable items: the author of the `youtubewatched` parser reports that some Takeout records "will only contain a timestamp of when the video was opened, presumably when the video itself is no longer available". The author calls this an inference — [PyPI: youtubewatched](https://pypi.org/project/youtubewatched/). The same project notes that only the last few years of watch history seem to be returned — [PyPI: youtubewatched](https://pypi.org/project/youtubewatched/)
- Hiding and deleting:
  - Digital Wellbeing has "Remove past visits" per site — [Android Help](https://support.google.com/android/answer/9346420)
  - Recall has "Delete all" per app or website, plus app/website exclusion filters — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
  - My Activity offers "Delete Results" on a filtered set, plus auto-delete — [Google Account Help](https://support.google.com/accounts/answer/465)
- Uncategorised-noise triage: ActivityWatch added a filter to find uncategorised events — [ActivityWatch forum](https://forum.activitywatch.net/t/categorizing-events/269)

### Inferences
- **Day layout:** use place/time blocks (segmentation as in MyEachtra: place change, time gap, midnight split). Inside each block, put a single collapsed line with source counts ("Digital · 6 searches · 2 videos · 1 commit"). Expanding it shows a per-source sub-list, each capped at about 3–5 items with "+N more", following the Google "[x] items" and Recall top-3 patterns. High-value items (photos, purchases, calendar) stay always visible as block anchors.
- **Dedup:** collapse the same video, URL or query repeated within a block into one row with "×3" and the list of times. Across blocks, keep separate rows. Do not drop repeats from counts silently; the count should say "2 videos (3 views)". This follows MyScéal/MyEachtra's merge-adjacent rule and the guide's "video ID + timestamp proximity".
- **Title cleaning:** strip boilerplate (" - YouTube", "Searched for", "Visited") and lead with the object (query text, video title, place name), keeping the verb as an icon or source chip, as Google's cards do (favicon + name + domain).
- **Unavailable items:** keep them in the timeline with a neutral placeholder ("Video indisponível" + time + raw ID/link) and count them separately ("+1 unavailable"). Exclude them from search snippets by default. Data from parsers indicates such rows can have only a timestamp.
- **Noise triage:** add a "show uncategorised/raw" toggle (ActivityWatch) and per-source "hide all from this source" (Recall "Delete all", Digital Wellbeing "Remove past visits") so the user can tune noise without deleting source data.

### Gaps
- No official Google or YouTube documentation was found on how removed or private videos appear in My Activity or in Takeout `watch-history.json` (e.g. title replaced by URL, missing channel). This should be verified against the project's own Takeout data.
- No official statement was found on whether YouTube or My Activity deduplicate repeat views. The evidence is a user report and a low-quality guide.
- No user studies were found that measure progressive disclosure (collapsed clusters) against flat lists for activity logs specifically. The recommendations above are inferred from product convergence, not experiments.
