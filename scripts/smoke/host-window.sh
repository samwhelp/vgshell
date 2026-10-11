# Sourced by scripts/sandbox-shots.sh and scripts/smoke/harness.sh; reads
# where the host compositor shows the nested compositor's window.
#
# The nested Hyprland is one xdg toplevel of the host, class aquamarine,
# owned by the nested compositor's process. The host sends that window frame
# callbacks only while it draws it, unless a host rule gives it
# render_unfocused. A shot
# records this state so its evidence says whether the nested window was
# hidden when it was taken.
#
# The reads are the host's `hyprctl -j clients` and `hyprctl -j monitors`,
# read-only requests on the host instance the caller's
# HYPRLAND_INSTANCE_SIGNATURE names. Nothing here dispatches, sets a
# property or changes focus on the host.

# host_window_state PID: one word for the host window PID owns.
#   shown       visible on a workspace a host monitor shows, special or not
#   hidden      on a workspace no host monitor shows, or not visible there,
#               as a background group tab is (`visible: false`)
#   absent      the host lists no window of PID
#   unreadable  no host instance in the environment, a read failed or a
#               reply is not the JSON the reads expect; returns 1
host_window_state() {
  local clients monitors
  if [[ -z ${HYPRLAND_INSTANCE_SIGNATURE:-} ]]; then echo unreadable; return 1; fi
  clients="$(timeout 2 hyprctl -j clients 2>/dev/null)" || { echo unreadable; return 1; }
  monitors="$(timeout 2 hyprctl -j monitors 2>/dev/null)" || { echo unreadable; return 1; }
  python3 -c '
import json, sys
pid, clients, monitors = int(sys.argv[1]), sys.argv[2], sys.argv[3]
try:
    clients, monitors = json.loads(clients), json.loads(monitors)
    owned = [c for c in clients if c["pid"] == pid]
    shown = {m["activeWorkspace"]["id"] for m in monitors} | {m["specialWorkspace"]["id"] for m in monitors}
    drawn = any(c["visible"] and c["workspace"]["id"] in shown for c in owned)
except (ValueError, KeyError, TypeError):
    print("unreadable"); sys.exit(1)
print("shown" if drawn else "hidden" if owned else "absent")
' "$1" "$clients" "$monitors"
}

# host_nested_windows: one machine-read line for each host window of a
# nested sandbox. Aquamarine's nested Wayland backend gives those toplevels
# class aquamarine. The pids are host pids, so a caller inside the fence's
# pid namespace tells its own window by a stableId it did not list before
# its launch.
host_nested_windows() {
  local clients
  if [[ -z ${HYPRLAND_INSTANCE_SIGNATURE:-} ]]; then echo unreadable; return 1; fi
  clients="$(timeout 2 hyprctl -j clients 2>/dev/null)" || { echo unreadable; return 1; }
  python3 -c '
import json, sys
try:
    rows = []
    for c in json.loads(sys.argv[1]):
        if c["class"] != "aquamarine":
            continue
        size = c["size"]
        rows.append("%s pid=%s size=%sx%s workspace=%s mapped=%s" % (
            c["stableId"], c["pid"], size[0], size[1],
            c["workspace"]["name"], str(c["mapped"]).lower()))
except (ValueError, KeyError, TypeError, IndexError):
    print("unreadable"); sys.exit(1)
for row in rows:
    print(row)
' "$clients"
}
