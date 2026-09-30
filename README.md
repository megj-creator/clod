# Uncover

**Go somewhere you wouldn't have found yourself.**
An AI trip planner that works like an obsessive traveler who interviewed a local. It does the digging, and you just say yes or no.

**Works anywhere.** Type any city, town, or island and Gemini builds it on the spot. Charleston, SC stays in as the hand-checked showcase city.

---

## What's in the app

| Screen | What it does |
|---|---|
| **Setup** | Where (search anywhere), when, where you're staying, your own max drive time and max price per person, who's coming (toddler/baby → nap window). |
| **Search any destination** | OpenStreetMap finds where it is. Gemini writes up the neighborhoods people stay in and getting-around tips, then finds ~29 real places across eat, explore, history, family, and music. It works on one category at a time, in parallel, while you finish setup. Each place gets real road times from every neighborhood and a licensed Wikimedia photo when one exists. Switching destination starts a fresh trip, but your taste profile comes along. |
| **Discover** | Tap a mood, or just type what you want (*"tired, want somewhere cute for dinner, toddler in tow"*). Then swipe through Discoveries, nearest first and inside your limits. **→ Save · ↑ More like this · ← Not for me** (then it asks *why*). |
| **Typed requests beyond the list** | If Gemini says nothing on the city's list really fits what you typed (say, "board game cafe for a rainy afternoon"), the app hunts for places matching exactly that and puts them first. |
| **Dig deeper** | Goes past the famous spots: Classic → Local favorite → Deep cut. |
| **Surprise me** | Picks something you probably wouldn't have searched for, based on what you've taught it. |
| **Full story** | Tap a card to see: why I found it, insider tip, reality check (hours, seasonal closures, "last checked" date), rain plan, best way to book, what locals say, hype check, kid fit. |
| **My Trip** | "You saved 8 things. Want me to build these into your trip?" Days are grouped by proximity and planned around meals, sunset, and nap time (long drives become car naps). There's a rain-plan toggle on every day, and "How was it?" feedback afterward. |
| **What I've learned** | The sparkle button. Shows your taste profile, all stored on your phone only, plus the sounds and haptics switch. |
| **Go hunting** | Past the deep cuts, Gemini hunts beyond the curated list for places locals love. Each find gets a "✦ Fresh find" badge, an honest note on where it came from, and a licensed Wikimedia photo when one exists. |
| **Maps** | Every place has a map with directions. Each day in My Trip has a route map. Maps are free vector maps from OpenFreeMap, with no key needed. |
| **Share & calendar** | Share the whole trip as text, or save it as a calendar file with every stop, time, and address. |
| **Ideas for light days** | Empty days suggest nearby places that fit your limits and the weather. One tap adds them to the plan. |

## Editing the showcase city (no coding needed)

Searched cities need no files: Gemini finds everything on the fly. The files below are only for the hand-checked showcase city, Charleston.

Every place is one file in [`data/cities/charleston/places/`](data/cities/charleston/places/).

- **Change something:** open the file, edit the text, save.
- **Add a place:** copy `_template.yaml`, rename it, and fill it in.
- **Remove a place:** delete its file.
- **Mark a fact as verified:** set `lastChecked: "2026-10-01"` (under `realityCheck` or `booking`). The badge flips from "Not yet verified" to "Checked".

You can do all of this right on github.com: open the file, click the ✏️ pencil, then **Commit changes**. The live site updates on its own in about a minute.

City-wide settings (stays, getting-around tips, sunset time) live in `data/cities/charleston/city.yaml`.

## The research tools (run once per city, not per visitor)

These do the slow, careful work up front, so the app is instant and costs nothing per visitor. Run them from this folder after adding or changing places:

| Command | What it does |
|---|---|
| `npm run geocode` | Finds map coordinates from each new place's address (OpenStreetMap). |
| `npm run drives` | Looks up **real road drive times** from every stay to every place, and between places. Saves `drives.json`. |
| `npm run photos` | Finds **freely licensed photos** on Wikimedia Commons for places without any. Always look them over before publishing. |
| `npm run check-facts` | Reads each place's **official website** and has Gemini pull out hours, seasonal closures, and prices, using only what the site says. Saves `checks.json` with the date and a quote as proof. A date you type into a place file yourself always wins. |
| `npm run locals` | Reads real **local Reddit threads** about each place and paraphrases what locals say, with links. Needs Reddit access (below). |

### Real local voices (Reddit)
Reddit requires approval before an app can read its data. To apply:
1. Sign in to Reddit, and go to **https://www.reddit.com/prefs/apps** (or Reddit's developer / Data API page, if it sends you there).
2. Create an app. Choose **"script"**, name it `Uncover`, and use `https://clod-orpin.vercel.app` as the redirect URL. If Reddit asks for a use-case form, say: *"Non-commercial travel prototype that reads public r/Charleston threads to summarize local recommendations, with links back to the threads. Low volume (a few hundred requests per month)."*
3. Once approved, put the two codes Reddit gives you into `.env.local` as `REDDIT_CLIENT_ID=` and `REDDIT_CLIENT_SECRET=`, then run `npm run locals`.

## Running it on your computer

You need [Node.js](https://nodejs.org) (the LTS version). Then, in this folder:

```
npm install
npm run dev
```

Open http://localhost:3000. On a phone on the same Wi-Fi, use your computer's IP address instead of `localhost`.

## Hosting (free)

The code lives on GitHub, and **Vercel** hosts it. Every time something changes on GitHub, Vercel rebuilds the site.

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New Project** → pick the repo → **Deploy**. No settings to change.

## Turning on Gemini (the AI)

Gemini powers searching any destination and finding its places. When you type what you want, it also reads your request and picks the places that fit, each with a one-line reason why. Without a key, only Charleston works, and typed requests fall back to simple keyword matching, so the app never breaks.

1. Get a free key at **https://aistudio.google.com/apikey** (click **Create API key**).
2. **Live site:** in Vercel, open your project → **Settings** → **Environment Variables**. Add the name `GEMINI_API_KEY` and paste your key as the value → **Save**. Then go to **Deployments** → **⋯** → **Redeploy**.
3. **On your computer:** copy `.env.example` to a new file named `.env.local` and paste the key after `GEMINI_API_KEY=`.

The key stays on the server and never reaches visitors' phones. There's a small rate limit so a shared link can't burn through your free quota.

## What's real vs. sample (honest status)

| Thing | Status |
|---|---|
| Photos | ✅ Real, licensed (Wikimedia Commons, with credits). 6 places still use painted placeholders. |
| Drive times | ✅ **Real road routes** (OpenStreetMap) from every stay, without traffic, plus 2 minutes to park. Live finds get real times too. |
| Hours, prices, booking | ✅ Checked against official websites where the site lists them, with a date and a quote. The rest say **Not yet verified** or "call ahead." The trip builder uses the verified days: it never schedules a place on a day it's closed, and warns you if it can't avoid it. |
| "What locals are saying" | ⚠️ Summaries for now, plus a "What locals say" button that opens the real r/Charleston threads. Real paraphrased local voices turn on once Reddit approves access. |
| Places | Charleston: 54 curated places. Anywhere else: found by Gemini on the spot and marked as unverified, with the same "confirm before you go" note as live finds. Plus unlimited live finds from Go hunting. |
| Searched cities: pins | ✅ Mostly checked. Each pin is looked up on OpenStreetMap by name, and a match near the city replaces Gemini's guess (about 85–90% of places in testing). The rest keep Gemini's pin. |
| Searched cities: hours | ✅ Where OpenStreetMap lists them (about half the places in a well-mapped city like Lisbon, fewer in smaller towns), with a "Hours from OpenStreetMap" badge. The trip builder won't schedule a place on a day it's closed. Places that OpenStreetMap mappers have marked closed are dropped. Free, one request per city. |
| Searched cities: photos | ⚠️ About half the places in a big city get a real photo (fewer in smaller towns): the lead photo of the place's own Wikipedia article when its location matches, otherwise a Commons photo whose file name is about that place. The rest use the painted placeholder plus a "See real photos" link. |
| Searched cities: speed & cost | ✅ Results are kept in Vercel's shared data cache for a day, so the next person to search the same city gets it instantly and uses no Gemini quota. After changing how places are built, bump `CACHE_VERSION` in `src/lib/gemini.ts` so old results aren't served. Prices are in US dollars. |
| Forecast | ✅ Live from Open-Meteo (free, no key) for the next ~2 weeks. Dates further out show typical weather, labeled as such. |
| Live web search for "Go hunting" | ⚠️ Your Gemini key's free plan doesn't include Google Search, so hunting currently uses Gemini's own knowledge and says so on each card. Enable billing on the key and it switches to live search automatically. |
| "Type what you want" | ✅ Gemini, once the key is set (see above). Falls back to keyword matching otherwise. |
| Your saves and taste | Stored on your phone only (browser storage). Supabase comes when we add accounts. |

## Where things live

```
data/cities/charleston/   ← the content (you edit this)
src/lib/                  ← the logic: drive times, ranking, taste learning, trip builder
src/components/           ← the screens
src/app/globals.css       ← the whole visual design
```
