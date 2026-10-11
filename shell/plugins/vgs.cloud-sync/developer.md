# Cloud Sync developer reference

## A sync

`bin/cloud-sync` is the runner, one Node file. It owns the folder pair list, the systemd user units, one lock per pair, the credential reads, the rclone calls, each pair's inventory, the review records and the status record. Its header states every verb, its output, its exit codes and its refusals.

Set up hourly sync runs `install`. It copies the runner to `~/.local/share/vgshell/cloud-sync/engine/<hash>/`, because the shell runs plugins from a snapshot that a restart removes. It writes `vgs-cloud-sync.service` and `vgs-cloud-sync.timer` under `~/.config/systemd/user/` and enables the timer: hourly while the user is logged in, and once at the next login after a missed hour. The units hold no secret.

Each run is the service. Sync now in the window and `start` on the command line ask systemd for that same service, so a sync never runs twice at once. A run takes each pair's lock under `$XDG_RUNTIME_DIR/vgshell/cloud-sync/`; a pair whose lock another run holds reads `busy` and copies nothing.

Each folder pair runs two rclone copies with `--update`: Drive to this computer, then this computer to Drive. The runner never asks rclone to delete, move, sync or bisync. The download leg uses `--backup-dir` under the pair's records, so a local file the copy replaces moves there first. A displaced file that matches the baseline is the runner's own copy and is removed. Any other displaced file is kept and listed as `both-changed`. The runner prunes conflict storage and review records after 30 days.

A file removed on this computer is listed as `removed-locally` and returns from Drive. A file removed on Drive is listed as `removed-on-drive` and returns to Drive. A rename that Drive's object id shows is listed as `renamed`.

Google-native documents list from rclone's Drive backend with size -1. The runner treats those entries as exports and writes an exclude file for the upload leg. A local file at an export's name is never uploaded.

The upload leg passes no backup folder. Google Drive creates a new revision when rclone updates an existing file. Drive keeps purgeable non-head blob revisions for 30 days or 100 revisions, whichever comes first, while `--drive-keep-revision-forever` stays false.

rclone reads the remote and the credential from its environment alone, with `--config /dev/null`: the client id, the client secret and the token come from the keyring through `secret-tool`, never from argv, a file or a log. Downloads use the `drive.readonly` scope. Uploads use `drive.file`, which writes files Cloud Sync made and adds new files.

`authorize pull|upload` stores the token as the account's one keyring item, with the Google account's address in its `user` attribute; it reads the address from Drive's `about` resource through `curl`, the access token on curl's stdin. `probe` reports that address as the token row's `user`.

`sign-out pull|upload` clears that direction's token; the client keys and every file stay. Clearing the pull token marks pairs as needing a sign-in.

The first run of this version rewrites old pair directions away and converts old review state to `records`. Credentials stay in the existing Download and Upload accounts.

`attention-seen <key>` records in `control.json` that the service notified of that attention key, and the status record's `attention.notified` reads it, so a shell start does not notify again.

## Files

- `~/.config/vgshell/cloud-sync/pairs.json`: the folder pairs, `{ pairs: [{ id, label, remote, local }] }`. Add a folder pair and Remove a folder pair change it through `pair-add` and `pair-remove`, which judge every pair. Start the folder pair list again runs `pairs-reset`, which keeps a damaged list beside a new empty list.
- `~/.local/state/vgshell/cloud-sync/status.json`: the status record the plugin's service watches and publishes.
- `~/.local/state/vgshell/cloud-sync/control.json`: the pause record and the attention key last notified, so both survive a restart.
- `~/.local/state/vgshell/cloud-sync/pairs/<id>/`: each pair's state, inventory and conflict copies.
- `~/.local/state/vgshell/cloud-sync/setup.log`: what the setup windows logged.

## The plugin

The service runs the runner's `status --quiet` at start and after each setup window closes, watches `status.json`, and runs `probe` for the presence of each key. It publishes `sync`, the headline with one line per pair; `schedule`, the hourly units with their set-up step; `pairs`, the folder pairs with their add and remove steps; `downloadKeys`, `download`, `uploadKeys` and `upload`, the Google Drive keys and sign-in states with Sign in and Sign out; `lastSync`; and `cloud`, the data that the widget and the window draw. `CloudSyncLogic.js` holds every decision about what they show. The service notifies of the record's `attention` while its `notified` is false, then runs `attention-seen` with its key.

The plugin's IPC: `vgshell ipc call vgs.cloud-sync invoke <name> ""` with `status`, `sync`, `pause`, `resume`, `refresh` or `open`. The service's header states each answer.

## The cloud-sync command

```text
shell/plugins/vgs.cloud-sync/bin/cloud-sync status
shell/plugins/vgs.cloud-sync/bin/cloud-sync pair-add --definition '{"id": "docs", "label": "Documents", "remote": "Documents", "local": "/home/me/Documents/drive"}'
shell/plugins/vgs.cloud-sync/bin/cloud-sync start
shell/plugins/vgs.cloud-sync/bin/cloud-sync pause
```

## Tests

`scripts/test-cloud-sync-runner.js` runs the runner against stand-ins for `rclone`, `secret-tool`, `systemctl` and `curl`. `scripts/test-cloud-sync-logic.js` holds what the plugin shows. `scripts/test-cloud-sync-tui.sh` runs the setup windows' scripts against a stand-in runner. `scripts/smoke/rows/cloudsync.sh` runs the plugin in the nested sandbox.
