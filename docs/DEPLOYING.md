# Deploying to Vercel

The primary supported deployment uses Vercel Hobby, a Neon Free database, and an optional GitHub Actions schedule. The checked-in `vercel.json` deliberately contains no Vercel Cron Jobs, so the application deploys on Hobby without paid Vercel features. GitHub Actions can call the secured collector endpoint hourly to build observation history.

## Choose a deployment mode

| Mode | Configuration | Scheduled collection |
| --- | --- | --- |
| Free live map | Vercel Hobby with `vercel.json`; no database required | None. The application reads current AirNow data but does not persist history. |
| Free history | Vercel Hobby + Neon Free + `.github/workflows/collect.yml` | GitHub Actions calls the ingest endpoint hourly. |
| Optional Pro collector | Promote `vercel.pro.json` to `vercel.json` | Vercel Cron imports at `:40` hourly and reconciles daily at `04:10` UTC. |

Vercel Hobby permits native Cron Jobs only once per day and with hourly timing precision. An hourly expression in `vercel.json` causes a Hobby deployment to fail, which is why the free path schedules the HTTPS request through GitHub instead. See [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Standard GitHub-hosted runners are free for public repositories. Private repositories consume the account's included Actions minutes; GitHub Free currently includes a monthly allowance, shared with CI and every other workflow. Check [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage) because provider quotas can change.

## 1. Import the repository

Import the Git repository from **Vercel Dashboard → Add New → Project**. Vercel detects Next.js and the committed `pnpm-lock.yaml`; keep the default install and build commands.

The project pins Node.js 24. If a pre-existing Vercel project has another runtime selected, choose Node.js 24 under **Settings → Build and Deployment**.

Git pushes to non-production branches create Preview deployments. A merge to the production branch, normally `main`, creates the Production deployment. Native Vercel Cron Jobs invoke Production only, never Preview.

## 2. Provision PostgreSQL

The basic interface can run without a database, but persistent hourly history and reconciliation require one.

1. Open the Vercel project's **Storage** tab.
2. Install a Neon Postgres database from the Marketplace and select its Free plan.
3. Choose a US East database region close to the Vercel Function region `iad1`.
4. Connect the database to the project for Production and, if desired, Preview.

The integration normally supplies a pooled `DATABASE_URL` for application traffic and an unpooled `DATABASE_URL_UNPOOLED` for migrations. This project uses ordinary PostgreSQL latitude and longitude columns; PostGIS is not required.

Apply the initial schema using the Neon SQL Editor, or from a machine with `psql`:

```sh
psql "$DATABASE_URL_UNPOOLED" --set ON_ERROR_STOP=on --file db/schema.sql
```

If the integration exposes a differently named direct connection string, use that in place of `DATABASE_URL_UNPOOLED`. Prefer a direct connection for schema migrations and the pooled `DATABASE_URL` at runtime.

The schema is safe to apply more than once for initial setup. Later structural changes should use ordered migrations rather than editing a live database ad hoc.

The reconciliation job prunes compressed source payloads after 3 days and observations after 7 days by default. This matches the API's maximum history window and is intentionally conservative for Neon Free's current 0.5 GB per-project storage allowance. Monitor the **Storage** page after enabling collection because source coverage and provider quotas can change.

## 3. Configure environment variables

Configure variables under **Project Settings → Environment Variables**. Values must be set for each environment that needs them.

| Variable | Environment | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production; optionally Preview and Development | Pooled runtime PostgreSQL connection supplied by Neon. |
| `CRON_SECRET` | Production | Secret used to authenticate both scheduled endpoints. Mark it Sensitive. |
| `AIRNOW_BASE_URL` | Optional | Overrides the documented AirNow bulk-file host. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional | Browser-visible MapLibre style URL. This is public by design. |

Generate `CRON_SECRET` with at least 32 random bytes. For example:

```sh
openssl rand -hex 32
```

Add it through the dashboard or Vercel CLI:

```sh
vercel env add CRON_SECRET production --sensitive
```

Do not prefix database credentials or `CRON_SECRET` with `NEXT_PUBLIC_`; Next.js embeds variables with that prefix in browser JavaScript. Environment-variable changes apply only to new deployments, so redeploy after changing them.

For local development, link the project and pull Development values:

```sh
vercel link
vercel env pull
```

## 4. Deploy the free Hobby application

The default file contains only the Function region:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"]
}
```

Push to the production branch or deploy from the CLI:

```sh
vercel deploy --prod
```

This configuration cannot accidentally register an unsupported hourly Vercel schedule on Hobby. At this point the live map works; complete the next section only if you want persistent history.

## 5. Enable free hourly collection with GitHub Actions

The optional `.github/workflows/collect.yml` workflow makes one authenticated request at minute `43` of each hour. It is committed in a dormant state and does not allocate a runner until the repository variable `AQI_COLLECTION_ENABLED` is exactly `true`.

First, configure `CRON_SECRET` in the Vercel Production environment and redeploy. The deployed endpoint and GitHub workflow must receive the exact same value.

Then open the GitHub repository's **Settings → Secrets and variables → Actions** and add:

### Repository secrets

| Name | Value |
| --- | --- |
| `COLLECTOR_URL` | The full, canonical production URL, for example `https://your-project.vercel.app/api/internal/cron/ingest`. It must use HTTPS and respond directly without a redirect. |
| `CRON_SECRET` | The same random value configured as Vercel's Production `CRON_SECRET`. |

### Repository variable

| Name | Value |
| --- | --- |
| `AQI_COLLECTION_ENABLED` | `true` |

The URL is stored as a secret so the workflow never prints its configured value alongside the credential. The workflow also avoids checkout, disables `GITHUB_TOKEN` permissions, does not enable shell/curl tracing, does not follow redirects, discards the response body, and prints only the HTTP status.

Commit the workflow to the repository's default branch. Scheduled workflows run only from that branch. Open **Actions → Collect AQI data → Run workflow** to test it immediately, then confirm that the job reports `HTTP 200`.

To pause collection without changing code, set `AQI_COLLECTION_ENABLED` to `false` or delete it. Rotate both copies of `CRON_SECRET` if it is ever exposed.

### GitHub scheduling limitations

GitHub schedules are not an exact-timing service-level agreement:

- runs use UTC and may start later than minute `43` during load;
- a queued run can occasionally be dropped;
- only the workflow on the latest default-branch commit is scheduled;
- in a public repository, GitHub disables scheduled workflows after 60 days without repository activity; and
- private repositories consume included Actions minutes, shared with CI.

The collector is idempotent and re-reads recent source hours, so a delayed, retried, or missed trigger does not create duplicate observation rows. Keep the application's freshness indicator visible and periodically check the Actions run history. See [GitHub's `schedule` event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [secrets guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Anyone with repository write access can modify workflows that consume repository secrets. Grant write access carefully and protect the default branch.

## 6. Optional: use native Vercel Cron on Pro

Vercel recognizes only a file named `vercel.json` during Git deployments. `vercel.pro.json` is a version-controlled example and is intentionally inactive. On a Pro project, replace the default configuration with it and commit the resulting `vercel.json`:

```sh
cp vercel.pro.json vercel.json
```

The active schedules will be:

```text
40 * * * *  GET /api/internal/cron/ingest
10 4 * * *  GET /api/internal/cron/reconcile
```

Both schedules use UTC. The first requests the newest expected AirNow file shortly after its normal publication time. The daily job reconciles the provider's correction window.

Disable the GitHub scheduler by setting `AQI_COLLECTION_ENABLED` to `false` before enabling the native hourly cron. Running both schedulers is safe only if the collector is idempotent, but it wastes compute and produces unnecessary duplicate attempts.

After the next Production deployment, verify both jobs under **Project Settings → Cron Jobs**. Vercel sends the configured `CRON_SECRET` automatically as:

```text
Authorization: Bearer <CRON_SECRET>
```

Both endpoints must reject requests when the secret is absent or does not match. A manual production smoke test can use the same header:

```sh
curl --fail-with-body \
  --header "Authorization: Bearer $CRON_SECRET" \
  "https://your-project.example/api/internal/cron/ingest"
```

Do not put the secret in a URL or query string.

## Reliability expectations

Both GitHub and Vercel schedules are best effort. A trigger can be delayed, missed, retried, duplicated, or overlap another invocation. The collector therefore must:

- upsert observations by station and observed hour;
- safely reprocess recent hours;
- use the schema's expiring database-backed import lease to avoid overlapping imports;
- return a non-2xx status on failure so logs and monitoring show the error; and
- preserve the true observation time instead of substituting the fetch time.

See [Managing Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Runtime limits relevant to this project

With Fluid compute, Vercel Functions have a 300-second default duration. Pro can raise the maximum when necessary, but the collector should remain bounded and split large reconciliation work. Function request and response bodies are limited to 4.5 MB, so the readings API must keep its bounding-box query, slim properties, and result cap.

See [Vercel Function limits](https://vercel.com/docs/functions/limitations) and [maximum-duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).

## Troubleshooting

- **The collection workflow is skipped:** set the repository variable `AQI_COLLECTION_ENABLED` to the lowercase value `true` and make sure the workflow is on the default branch.
- **The collection workflow fails before curl:** add both `COLLECTOR_URL` and `CRON_SECRET` under GitHub Actions repository secrets.
- **The collection workflow returns 401:** ensure the GitHub and Vercel `CRON_SECRET` values match, then redeploy after changing the Vercel value.
- **The collection workflow returns 3xx:** set `COLLECTOR_URL` to the canonical HTTPS endpoint that does not redirect. The workflow intentionally refuses to follow redirects with an Authorization header.
- **A public repository stopped collecting:** scheduled workflows are disabled after 60 days without repository activity; re-enable the workflow in GitHub Actions.
- **A Hobby deployment says the cron runs too often:** the Pro example was promoted to `vercel.json`. Restore the Hobby-safe file or move the project to Pro.
- **Cron Jobs do not appear:** deploy the Pro configuration to Production; Preview deployments do not register them.
- **Cron returns 401:** set `CRON_SECRET` for Production, redeploy, and confirm the endpoint compares the `Authorization` header to the same value.
- **Database relation does not exist:** apply `db/schema.sql` to the same database referenced by the deployment's `DATABASE_URL`.
- **Database works locally but not on Vercel:** confirm the variable is scoped to the target environment and redeploy after changing it.
- **Database connections spike:** use the pooled Neon `DATABASE_URL` for runtime queries and keep the database in a region close to `iad1`.

Official references: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage), and [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage).
