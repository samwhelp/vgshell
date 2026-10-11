# Cloud Sync developer reference

## A sync

`bin/cloud-sync` is the runner, one Node file. It owns the folder pair list, the systemd user units, one lock per pair, the credential reads, the rclone calls, each pair's inventory, the conflict records and the status record. Its header states every verb, its output, its exit codes and its refusals.

Set up hourly sync runs `install`. It copies the runner to `~/.local/share/vgshell/cloud-sync/engine/<hash>/`, because the shell runs plugins from a snapshot that a restart removes. It writes `vgs-cloud-sync.service` and `vgs-cloud-sync.timer` under `~/.config/systemd/user/` and enables the timer: hourly while the user is logged in, and once at the next login after a missed hour. The units hold no secret.

Each run is the service. Sync now in the window and `start` on the command line ask systemd for that same service, so a sync never runs twice at once. A run takes each pair's lock under `$XDG_RUNTIME_DIR/vgshell/cloud-sync/`; a pair whose lock another run holds reads `busy` and copies nothing.

A download pair runs `rclone copy` from Drive into the folder with `--backup-dir` under the pair's records, so a local file the copy would replace moves there first. A displaced file that matches the last download is the runner's own copy and is removed. Any other displaced file is a local edit, kept and listed as `local-edit`. A file that leaves Drive stays and is listed as `removed-on-drive`; a rename that Drive's object id shows is listed as `renamed`. An upload pair runs `rclone copy` from the folder to Drive.

rclone reads the remote and the credential from its environment alone, with `--config /dev/null`: the client id, the client secret and the token come from the keyring through `secret-tool`, never from argv, a file or a log. Downloads use the `drive.readonly` scope and the upload pair `drive.file`.

`authorize pull|upload` stores the token as the account's one keyring item, with the Google account's address in its `user` attribute; it reads the address from Drive's `about` resource through `curl`, the access token on curl's stdin. `probe` reports that address as a token row's `user`.

`sign-out pull|upload` clears that direction's token and marks its pairs as needing a sign-in; the client keys and every file stay.

`attention-seen <key>` records in `control.json` that the service notified of that attention key, and the status record's `attention.notified` reads it, so a shell start does not notify again.

## Files

- `~/.config/vgshell/cloud-sync/pairs.json`: the folder pairs, `{ pairs: [{ id, label, direction, remote, local }] }`. Add a folder pair and Remove a folder pair change it through `pair-add` and `pair-remove`, which judge every pair.
- `~/.local/state/vgshell/cloud-sync/status.json`: the status record the plugin's service watches and publishes.
- `~/.local/state/vgshell/cloud-sync/control.json`: the pause record and the attention key last notified, so both survive a restart.
- `~/.local/state/vgshell/cloud-sync/pairs/<id>/`: each pair's state, inventory and conflict copies.
- `~/.local/state/vgshell/cloud-sync/setup.log`: what the setup windows logged.

## The plugin

The service runs the runner's `status --quiet` at start and after each setup window closes, watches `status.json`, and runs `probe` for the presence of each key. It publishes `sync`, the headline with one line per pair; `schedule`, the hourly units with their set-up step; `pairs`, the folder pairs with their add and remove steps; `downloadKeys` and `download`, the Download keys and their sign-in state with the sign-in and sign-out steps, and `uploadKeys` and `upload`, the same for Upload; `lastSync`; and `cloud`, the data that the widget and the window draw. `CloudSyncLogic.js` holds every decision about what they show. The service notifies of the record's `attention` while its `notified` is false, then runs `attention-seen` with its key.

The plugin's IPC: `vgshell ipc call vgs.cloud-sync invoke <name> ""` with `status`, `sync`, `pause`, `resume`, `refresh` or `open`. The service's header states each answer.

## The cloud-sync command

```text
shell/plugins/vgs.cloud-sync/bin/cloud-sync status
shell/plugins/vgs.cloud-sync/bin/cloud-sync pair-add --definition '{"id": "docs", "label": "Documents", "direction": "pull", "remote": "Documents", "local": "/home/me/Documents/drive"}'
shell/plugins/vgs.cloud-sync/bin/cloud-sync start
shell/plugins/vgs.cloud-sync/bin/cloud-sync pause
```

## Tests

`scripts/test-cloud-sync-runner.js` runs the runner against rclone's `local` backend with stand-ins for `secret-tool`, `systemctl` and `curl`. `scripts/test-cloud-sync-logic.js` holds what the plugin shows. `scripts/test-cloud-sync-tui.sh` runs the setup windows' scripts against a stand-in runner. `scripts/smoke/rows/cloudsync.sh` runs the plugin in the nested sandbox.
