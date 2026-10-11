#!/usr/bin/env bash
# Runs the shipped setup against stand-ins. No sudo, auth or unit starts.
set -euo pipefail
source "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/vgshell-rows.sh"
suite=test-vgshell-dictation
tree="$tmp/tree"; commands="$tmp/commands"
mkdir -p "$tree/bin/lib" "$tree/config" "$commands" "$tmp/home"
cp -- "$repo/bin/vgshell" "$repo/bin/vgshell-dictation" "$tree/bin/"
cp -R -- "$repo/bin/lib/." "$tree/bin/lib/"
cp -R -- "$repo/config/voxtype" "$tree/config/"
cat >"$commands/voxtype" <<EOF2
#!/bin/sh
printf '%s\n' "\$*" >>"$tmp/voxtype.calls"
case "\$*" in
  'config get engine --json') echo '{"value":"parakeet"}' ;;
  'config get parakeet.model --json') echo '{"value":"parakeet-tdt-0.6b-v3"}' ;;
  'info engines --json') cat "$tmp/engines.json" ;;
  'setup --download --model parakeet-tdt-0.6b-v3 --no-post-install') exit 0 ;;
  *) exit 64 ;;
esac
EOF2
cat >"$tree/bin/vgshell-system" <<EOF2
#!/bin/sh
printf '%s\n' "\$*" >>"$tmp/system.calls"
exit 0
EOF2
for name in sudo systemctl; do
  printf '#!/bin/sh\nprintf "%%s\\n" forbidden >>%q\nexit 64\n' "$tmp/forbidden" >"$commands/$name"
done
chmod +x "$commands"/* "$tree/bin/vgshell-system"
setup_run() {
  local code=0
  "${base_env[@]}" PATH="$commands:$base_path" VGS_TUI_UNATTENDED=1 XDG_CONFIG_HOME="$tmp/home/config & # \"quoted\"" "$tree/bin/vgshell" dictation setup >"$tmp/setup.out" 2>&1 || code=$?
  test "$code" == 0
}
config_dir="$tmp/home/config & # \"quoted\"/voxtype"
printf '[{"name":"parakeet","compiled":true}]\n' >"$tmp/engines.json"
check "setup succeeds against the compiled stand-in" setup_run
check "setup copies the core defaults and expands the sound path" python3 -c 'import pathlib,sys,tomllib; p=pathlib.Path(sys.argv[1]); d=tomllib.loads((p/"config.toml").read_text()); assert d["audio"]["feedback"]["theme"]==str(p/"sounds/bloop"); assert all((p/"sounds/bloop"/n).is_file() for n in ["start.wav","stop.wav","error.wav","LICENSE"])' "$config_dir"
check "setup downloads the configured model without a user unit" grep -qxF -- 'setup --download --model parakeet-tdt-0.6b-v3 --no-post-install' "$tmp/voxtype.calls"
check "a compiled engine calls no system step" test ! -e "$tmp/system.calls"
printf 'custom config\n' >"$config_dir/config.toml"
check "existing config permits setup" setup_run
check "setup preserves existing config bytes" test "$(cat -- "$config_dir/config.toml")" == 'custom config'
printf '[{"name":"parakeet","compiled":false}]\n' >"$tmp/engines.json"
check "an uncompiled engine runs the system step" setup_run
check "the system step owns engine elevation" grep -qxF -- 'apply voxtype-engine' "$tmp/system.calls"
check "no setup run starts sudo or systemctl" test ! -e "$tmp/forbidden"
# A changed model argument must fail the stand-in's download contract.
python3 - "$tree/bin/vgshell-dictation" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text(); a='--model "$model"'; assert s.count(a)==1; p.write_text(s.replace(a,'--model wrong-model'))
PY
check "control: the download contract rejects a wrong model" test "$(setup_run; echo $?)" == 1
rows_done "$suite"
