# Traffic log

Records this repo's page views, unique visitors, clones and release downloads
once a day and keeps them forever, instead of the 14 days GitHub gives you.

## Files

```
.github/workflows/track-stats.yml   the collector — runs itself daily
traffic-data/index.html             the dashboard
traffic-data/views.csv              date, count, uniques      ← written by the collector
traffic-data/clones.csv             date, count, uniques
traffic-data/downloads.csv          date, tag, asset, download_count
traffic-data/badge.json             for the README badge
```

Put `track-stats.yml` in `.github/workflows/` and `index.html` (plus this file)
in `traffic-data/`.

## Setup

**1. Make a token.** The automatic `GITHUB_TOKEN` can't read the traffic API —
those endpoints need the Administration permission, which Actions tokens can't
be granted. So the collector needs one of yours.

Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token. Scope it to this one repository, and grant:

| Permission     | Access         | Why                          |
| -------------- | -------------- | ---------------------------- |
| Administration | Read-only      | reads views and clones       |
| Contents       | Read and write | commits the CSVs             |

**2. Save it as a secret.** Repo → Settings → Secrets and variables → Actions →
New repository secret, named `TRAFFIC_TOKEN`.

**3. Push, then run it once.** Actions tab → Track stats → Run workflow. The
first run backfills the 14 days currently visible in Insights. If it goes green
and you see a `stats:` commit, you're done — it now runs at 23:50 UTC every day
without you.

A 403 on the first step means the token is missing the Administration
permission. A 403 on the commit step means it's missing Contents: write.

## Seeing the data

Settings → Pages → deploy from your default branch, root. The dashboard is then
at `https://<you>.github.io/<repo>/traffic-data/`. Make it private by putting
the whole thing in a private repo pointed at the public one — set `repository:`
on the API calls.

Opening `index.html` straight off your disk won't work; browsers block local
file reads. `python3 -m http.server` inside `traffic-data/` does.

## Badge

Real counted views, not image hits:

```markdown
![Views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/main/traffic-data/badge.json)
```

Swap in your owner, repo and default branch name. Shields caches for a few
minutes, so it won't update the instant the workflow runs.

## Things that will quietly stop it

- **Fine-grained tokens expire**, a year out at most. The runs go red rather
  than silently failing, but only if you look. Set a reminder.
- **Scheduled workflows are disabled after 60 days of no repository activity**
  on public repos. GitHub emails you first; re-enable from the Actions tab.
- **The workflow must be on your default branch** or the schedule never
  registers at all.

## Notes on the data

Download counts are cumulative running totals, which is all GitHub exposes, so
the dashboard subtracts consecutive snapshots to get a per-day figure. That
means no downloads figure until the second day, and a count that can go
backwards if you delete a release or replace an asset.

Views are page hits; unique visitors are deduplicated by GitHub per day, so
summing them across days double-counts anyone who came back. The daily numbers
are the honest ones.

Nothing here can recover data from before you set it up. That's gone.

## Not committing to your main branch

The collector commits to your default branch daily. To keep that history
separate, make an orphan branch and add `ref: stats` to the checkout step:

```bash
git checkout --orphan stats
git rm -rf .
mkdir traffic-data && touch traffic-data/.gitkeep
git add -A && git commit -m "init stats branch" && git push -u origin stats
```

Pages can serve from that branch instead.
