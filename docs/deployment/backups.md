# Backups and restores

LibraCord stores durable state in three Docker named volumes:

- `libracord-data`: SQLite database
- `libracord-uploads`: avatars, banners, attachments, and other uploads
- `redis-data`: Redis persistence used by realtime and media services

Back up all three together. The commands below assume the Compose project name
is `libracord`, producing volume names prefixed with `libracord_`. Confirm the
actual names before continuing:

```sh
docker volume ls --filter label=com.docker.compose.project=libracord
```

## Create a consistent backup

Create a private backup directory, stop writes, and archive each volume:

```sh
mkdir -p backups
chmod 700 backups
docker compose stop app livekit ingress redis

docker run --rm -v libracord_libracord-data:/source:ro -v "$PWD/backups:/backup" alpine sh -c 'cd /source && tar czf /backup/libracord-data.tar.gz .'
docker run --rm -v libracord_libracord-uploads:/source:ro -v "$PWD/backups:/backup" alpine sh -c 'cd /source && tar czf /backup/libracord-uploads.tar.gz .'
docker run --rm -v libracord_redis-data:/source:ro -v "$PWD/backups:/backup" alpine sh -c 'cd /source && tar czf /backup/redis-data.tar.gz .'

docker compose start redis livekit app
sha256sum backups/*.tar.gz > backups/SHA256SUMS
```

If the optional `ingress` service was running, start it again with its profile
flag after the core services are healthy. Copy backups off the Docker host and
protect them as sensitive data.

## Test a backup

At minimum, verify archive integrity:

```sh
tar tzf backups/libracord-data.tar.gz >/dev/null
tar tzf backups/libracord-uploads.tar.gz >/dev/null
tar tzf backups/redis-data.tar.gz >/dev/null
sha256sum --check backups/SHA256SUMS
```

A real restore test on an isolated host is the only reliable proof that the
backup is usable.

## Restore

Restoring replaces current service state. Preserve the current volumes first,
verify the target project and volume names, and perform the restore during a
maintenance window.

```sh
docker compose stop

docker run --rm -v libracord_libracord-data:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/libracord-data.tar.gz -C /target'
docker run --rm -v libracord_libracord-uploads:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/libracord-uploads.tar.gz -C /target'
docker run --rm -v libracord_redis-data:/target -v "$PWD/backups:/backup:ro" alpine sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/redis-data.tar.gz -C /target'

docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3002/health
```

The `find ... rm -rf` commands intentionally erase the contents of the three
named volumes before extraction. Never run them until the exact volume mounts
have been verified and the current instance has its own recoverable backup.
