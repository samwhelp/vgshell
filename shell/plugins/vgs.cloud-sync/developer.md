# Cloud Sync developer reference

## A sync

`bin/cloud-sync` is the runner, one Node file. It owns the folder pair list, the systemd user units, one lock per pair, the credential reads, the rclone calls, each pair's inventory, the conflict records and the status record. Its header states every verb, its output, its exit codes and its refusals.

Set up Cloud Sync runs `install`. It copies the runner to `~/.local/share/vgshell/cloud-sync/engine/<hash>/`, because the shell runs plugins from a snapshot that a restart removes. It writes `vgs-cloud-sync.service` and `vgs-cloud-sync.timer` under `~/.config/systemd/user/` and enables the timer: hourly, and once after a boot that missed a run. The units hold no secret.

Each run is the service. Sync now in the window and `start` on the command line ask systemd for that same service, so a sync never runs twice at once. A run takes each pair's lock under `$XDG_RUNTIME_DIR/vgshell/cloud-sync/`; a pair whose lock another run holds reads `busy` and copies nothing.

A download pair runs `rclone copy` from Drive into the folder with `--backup-dir` under the pair's records, so a local file the copy would replace moves there first. A displaced file that matches the last download is the runner's own copy and is removed. Any other displaced file is a local edit, kept and listed as `local-edit`. A file that leaves Drive stays and is listed as `removed-on-drive`; a rename that Drive's object id shows is listed as `renamed`. An upload pair runs `rclone copy` from the folder to Drive.

rclone reads the remote and the credential from its environment alone, with `--config /dev/null`: the client id, the client secret and the token come from the keyring through `secret-tool`, never from argv, a file or a log. Downloads use the `drive.readonly` scope and the upload pair `drive.file`.

## Files

- `~/.config/vgshell/cloud-sync/pairs.json`: the folder pairs, `{ pairs: [{ id, label, direction, remote, local }] }`. Add a folder pair and Remove a folder pair change it through `pair-add` and `pair-remove`, which judge every pair.
- `~/.local/state/vgshell/cloud-sync/status.json`: the status record the plugin's service watches and publishes.
- `~/.local/state/vgshell/cloud-sync/control.json`: the pause record, so pause survives a restart.
- `~/.local/state/vgshell/cloud-sync/pairs/<id>/`: each pair's state, inventory and conflict copies.
- `~/.local/state/vgshell/cloud-sync/setup.log`: what the setup windows logged.

## The plugin

The service runs the runner's `status --quiet` at start and after each setup window closes, watches `status.json`, and runs `probe` for the presence of each key. It publishes `sync`, the Setup section's status and its step; `keys`, the presence of each key; `lastSync`; and `cloud`, the data that the widget and the window draw. `CloudSyncLogic.js` holds every decision about what they show. The service sends one notification for each change of the record's `attention`.

The plugin's IPC: `vgshell ipc call vgs.cloud-sync invoke <name> ""` with `status`, `sync`, `pause`, `resume`, `refresh` or `open`. The service's header states each answer.

## The cloud-sync command

```text
shell/plugins/vgs.cloud-sync/bin/cloud-sync status
shell/plugins/vgs.cloud-sync/bin/cloud-sync pair-add --definition '{"id": "docs", "label": "Documents", "direction": "pull", "remote": "Documents", "local": "/home/me/Documents/drive"}'
shell/plugins/vgs.cloud-sync/bin/cloud-sync start
shell/plugins/vgs.cloud-sync/bin/cloud-sync pause
```

## Tests

`scripts/test-cloud-sync-runner.js` runs the runner against rclone's `local` backend with stand-ins for `secret-tool` and `systemctl`. `scripts/test-cloud-sync-logic.js` holds what the plugin shows. `scripts/test-cloud-sync-tui.sh` runs the setup windows' scripts against a stand-in runner. `scripts/smoke/rows/cloudsync.sh` runs the plugin in the nested sandbox.
