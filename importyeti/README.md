# ImportYeti

## Directory map

- `cli.js`: command-line entry point.
- `crawler/`: robots checks, profile parsing and crawl/queue operations.
- `enrichment/`: optional enrichment from public ImportInfo profiles.
- `database/db.js`: MySQL connection, schema initialization and index checks.
- `database/migrations/`: canonical, versioned table DDL.
- `database/bootstrap/`: database provisioning only; no duplicated table definitions.

The application initializer reads `database/migrations/001_initial_schema.sql`. From the repository root, provision manually with `mysql -u <user> -p < importyeti/database/bootstrap/create_database.sql`, then run `mysql -u <user> -p import_data < importyeti/database/migrations/001_initial_schema.sql` against the selected database.

## Environment configuration

All database configuration lives in the repository-root `config/` directory. `TASK_ENV` must explicitly be `local` or `production`; the selected file does not depend on the current working directory.

| Environment | Selected file | Canonical database prefix |
| --- | --- | --- |
| local | `config/.env.importyeti` | `IMPORTYETI_LOCAL_DB_*` |
| production | `config/.prod.importyeti` | `IMPORTYETI_PRODUCTION_DB_*` |

Maintain the existing files directly. For a new setup, create the files at the paths above and fill in `HOST`, `PORT`, `USER`, `PASSWORD` and `NAME` using the corresponding canonical prefix. Then run the CLI from the repository root:

```bash
npm run importyeti:status
npm run importyeti:production -- status
```

Canonical variables from the process environment override the selected file. Within that file, canonical keys take precedence over legacy `IMPORTYETI_DB_*` or `IMPORTYETI_LOCAL_DB_*` aliases. Legacy aliases are read only from the selected file: production never falls back to the local file or process-level local variables. The old repository-root `.env.importyeti` is no longer loaded. A production file may be omitted when complete canonical `IMPORTYETI_PRODUCTION_DB_*` connection settings are supplied externally. Unknown environments or missing required settings fail explicitly.

Quote passwords containing `#`, for example `IMPORTYETI_LOCAL_DB_PASSWORD="replace#this"`. Connection-pool and crawler options can be kept in the selected file: `IMPORTYETI_DB_CONNECTION_LIMIT`, `IMPORTYETI_DELAY_MS`, `IMPORTYETI_TIMEOUT_MS`, `IMPORTYETI_USER_AGENT` and `IMPORTYETI_STORE_RAW_HTML`. Configuration reads do not copy all file entries into `process.env` or alter ImportGenius settings. See [config/README.md](../config/README.md) for the shared rules and field definitions.

Start the local API with `npm run server:dev`; use `npm run server` for production. Production API startup automatically reads `TASK_CONTROL_TOKEN` from `config/.prod.importgenius`, including for ImportYeti task controls. Set a long random token there and enter the same value in the production confirmation dialog. Local task controls do not require a token. Restart the API after changing the token. An explicitly supplied process variable takes priority, even when empty; run `unset TASK_CONTROL_TOKEN` before restarting if a previous export is masking the file setting.

Only the token is loaded into the service environment: `.prod.importyeti` is not a token source, and file values cannot change `TASK_ENV` or `NODE_ENV` or populate global database variables. `npm run start:all:dev` and `npm run start:all:prod` start the React development server with the corresponding API environment for local integration work. Keep the production API to one instance because it enables the collection schedules at startup. Task output remains in the repository-root `logs/tasks/` archive; historical `logs/scheduler/` records remain readable and cleanable from the app.

## Full collection workflow

`importyeti.full-sync` checks or creates the `iy_*` tables and indexes, prepares the target queue, fetches public company/supplier profiles, stores visible shipments and trade relationships in MySQL, and prints the final data estimates. Pages are saved through the existing per-profile transactions; a later failure does not discard already committed profiles.

```bash
# Local environment
npm run importyeti:sync -- --max-targets 100 --max-depth 2 --delay-ms 3000

# Production environment, also used by the four-day scheduler
npm run importyeti:production -- full-sync --max-targets 100 --max-depth 2 --delay-ms 3000
```

The defaults are 100 profiles per run, maximum depth 2, and a 3000 ms request interval. Existing failed targets are retried by default (`--no-retry-failed` disables this); blocked targets remain blocked unless `--retry-blocked` is explicitly supplied after investigating the restriction. Each profile is attempted at most once per run, so a failed target cannot consume the entire run's quota through repeated immediate retries.

The refresh stage fills the unused queue capacity with completed profiles whose `updated_at` is at least four days old, oldest first, up to the run's profile limit and maximum depth. It resets those profiles' retry counters but preserves their URLs and discovery relationships. Already queued eligible profiles take priority over adding refresh work. The crawler continues discovering related profiles within the selected depth; remaining queue work is retained for future runs. A new empty installation must first add seed URLs with `npm run importyeti:production -- seed <profile-url...>`; the workflow does not invent initial companies or crawl prohibited search pages.

The application scheduler runs this workflow once every four days with its own fixed parameters, separate from the manual form. It records scheduled runs in `logs/tasks/`, reports failures and access restrictions as failed runs, and retains completed data and queue checkpoints. The task page shows the next trigger and offers an independent start/stop control. Scheduling state survives API restarts; keep the deployment's scheduler state file when upgrading or moving the application. The exact interval/first-run policy is documented in the task scheduler section of the root README.

This workflow collects publicly visible ImportYeti data and writes it directly to MySQL. ImportInfo enrichment still requires a specific company profile URL and remains a separate task; CSV export is also separate. The workflow stops when robots rules, HTTP 403/429 or a challenge restrict access, and does not automatically retry blocked targets.

Restart the backend or rerun the CLI after changing database configuration. Existing connection pools do not switch databases while the process is running.
