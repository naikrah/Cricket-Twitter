# 🏏 CricTweet — Live Cricket Social Automation

Real-time AI cricket commentary → instant tweets for X/Twitter.

## How It Works

1. Paste a Cricbuzz or ESPNcricinfo live match URL
2. Hit **Start** — the app polls commentary every 30 seconds
3. AI detects big moments (wickets, sixes, fours, milestones)
4. Generates an original, human-like tweet for each event
5. One click to **Post on X** or **Copy** and paste manually

## Tech Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Claude API** (claude-sonnet-4) — tweet generation
- **Cheerio** + regex scraping — commentary extraction
- **Vercel** — serverless deployment

## Local Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd cricket-tweeter
npm install

# 2. Add your API key
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
# Get one at: https://console.anthropic.com

# 3. Run locally
npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel

### Option A: Vercel CLI (fastest)
```bash
npm i -g vercel
vercel deploy

# In Vercel dashboard, add environment variable:
# ANTHROPIC_API_KEY = your_key_here
```

### Option B: GitHub + Vercel (recommended for ongoing use)
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. In **Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Click **Deploy** — done!

## Supported Sources

| Source | URL Format |
|--------|-----------|
| Cricbuzz | `https://www.cricbuzz.com/live-cricket-scores/{match-id}/...` |
| ESPNcricinfo | `https://www.espncricinfo.com/series/{series-id}/match/{match-id}` |

## Features

- ✅ Polls every 30 seconds automatically
- ✅ Deduplicates events — no repeat tweets
- ✅ Skips boring moments (dot balls, singles)
- ✅ Generates original AI commentary (not a copy-paste)
- ✅ One-click to open X compose with pre-filled tweet
- ✅ Copy to clipboard with one click
- ✅ Live countdown to next poll
- ✅ Character count warning (280 limit)
- ✅ Works all match long — just leave the tab open

## Important Notes

- **Cricbuzz/ESPNcricinfo scraping**: Works on their public pages. If they update their HTML structure, the scraper regex patterns in `app/api/fetch-commentary/route.ts` may need updating.
- **API Costs**: Each big moment calls Claude API once. A typical 50-over match generates ~20-50 tweet calls. Very affordable.
- **CORS**: All scraping happens server-side via Next.js API routes, so no CORS issues.

## Customizing the AI Prompt

Edit the `SYSTEM_PROMPT` in `app/api/generate-tweet/route.ts` to change the style, tone, or what counts as important.

## Troubleshooting

**"Failed to fetch commentary"**
- The match URL might not be a live commentary page
- Some pages require JavaScript rendering (not supported in server-side fetch)
- Try the direct Cricbuzz commentary URL format

**Tweets not generating**
- Check your `ANTHROPIC_API_KEY` is set correctly
- Check Vercel function logs for errors
