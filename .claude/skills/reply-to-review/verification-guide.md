# Empirical Verification Guide

How to test common runtime behaviour claims before accepting or rejecting a
reviewer comment.

## Postgres

Run queries against the live Docker container:
```bash
docker compose exec -T postgres psql -U campfire -d campfire -c "<query>"
```

### Array behaviour
```sql
-- Test index assignment on NULL, empty, and short arrays
CREATE TEMP TABLE t (id int, arr text[]);
INSERT INTO t VALUES (1, NULL), (2, ARRAY[]::text[]), (3, ARRAY['a']);
UPDATE t SET arr[3] = 'x' WHERE id = 1;  -- NULL column
UPDATE t SET arr[3] = 'x' WHERE id = 2;  -- empty array
UPDATE t SET arr[3] = 'x' WHERE id = 3;  -- short array
SELECT * FROM t;
```
Expected on Postgres 16: all succeed, NULLs fill gaps.

### NULL in unique columns
```sql
-- Multiple NULLs are allowed in a unique index
CREATE TEMP TABLE u (username text UNIQUE);
INSERT INTO u VALUES (NULL), (NULL);  -- should succeed
```

## Next.js App Router

Check the Next.js docs or source for specific config behaviour:
- WebSearch: `site:nextjs.org <feature name>`
- For route segment config: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config

## MinIO client

Check the minio npm package version in use:
```bash
node -e "console.log(require('./node_modules/minio/package.json').version)"
```
Then check the changelog or source for the specific version.

## BullMQ

```bash
node -e "console.log(require('./node_modules/bullmq/package.json').version)"
```
WebSearch: `site:docs.bullmq.io <topic>` or check the BullMQ GitHub source.
