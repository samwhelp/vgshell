#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"

config_file="${XDG_CONFIG_HOME:-$HOME/.config}/voxtype/config.toml"
vgs_tui_header "Choose Voice model" "Select a speech model. VGS enables its speech engine and downloads it."
# The core opens this script only once voxtype is found; a run from
# elsewhere without it stops here, before anything changes.
if ! command -v voxtype >/dev/null; then
  printf 'vgs-voice: refused: voxtype=missing\n' >&2
  vgs_tui_error "Voice needs voxtype. Press Install all missing on the Setup tab of the Voice page."
  exit 1
fi
if [[ -L $config_file ]]; then
  vgs_tui_warn "Your voxtype config is a symlink. The model screen can replace it."
  status=0
  vgs_tui_confirm "Continue?" || status=$?
  case "$status" in
    0) ;;
    1) exit 0 ;;
    *) exit "$status" ;;
  esac
fi
source "${VGS_TUI_LIB%/*}/voxtype.sh"
models="$(voxtype info models --json)"
engines="$(voxtype info engines --json)"
variants="$(voxtype info variants --json)"
# The upstream inventory judges installed binaries against this computer.
# Read the shipped ONNX build's engines without switching the active build.
if ! onnx="$(python3 -c 'import json,pathlib,sys
inventory=json.load(sys.stdin)
if inventory["install_kind"] == "package":
    for row in inventory["variants"]:
        if row["variant"].startswith("onnx-") and row["installed"] and row["runs_on_this_cpu"] and row["gpu_available"]:
            print(pathlib.Path(inventory["package_lib_dir"]) / row["binary_name"])
            break' <<<"$variants")"; then
  vgs_tui_error "VGS could not read the available speech engines."
  exit 1
fi
available='[]'
[[ -z $onnx ]] || available="$("$onnx" info engines --json)"
choices="$(python3 - "$models" "$engines" "$available" <<'PY'
import json, sys
models, engines, available = map(json.loads, sys.argv[1:])
compiled = {row["name"] for row in engines if row["compiled"]}
runnable = compiled | {row["name"] for row in available if row["compiled"]}
# voxtype v1.1.0 src/setup/model.rs supplies size_mb and language fields;
# src/app/info.rs omits those display fields from its model JSON.
sizes = {
    "whisper": {"tiny":75,"tiny.en":39,"base":142,"base.en":142,"small":466,"small.en":466,"medium":1500,"medium.en":1500,"large-v3":3100,"large-v3-turbo":1600},
    "parakeet": {"parakeet-tdt-0.6b-v2":2400,"parakeet-tdt-0.6b-v2-int8":640,"parakeet-tdt-0.6b-v3":2600,"parakeet-tdt-0.6b-v3-int8":670,"parakeet-unified-en-0.6b":2660},
    "moonshine": {"base":237,"tiny":100,"base-ja":237,"base-zh":237,"tiny-ko":100,"tiny-ar":100},
    "sensevoice": {"small":239,"small-fp32":938},
    "paraformer": {"paraformer-zh":487,"paraformer-en":220},
    "dolphin": {"dolphin-base":198},
    "omnilingual": {"omnilingual-300m":3900},
    "cohere": {"cohere-transcribe-q4f16":1500,"cohere-transcribe-q4":2000,"cohere-transcribe-int8":2900,"cohere-transcribe-fp16":3900},
    "openvino": {
        **{f"{size}{language}-{precision}": mb for size, amounts in
           [("tiny",(25,50,80)),("base",(55,100,145)),("small",(160,300,470)),("medium",(400,780,1500))]
           for language in ("", ".en") for precision, mb in zip(("int4","int8","fp16"),amounts)},
        **{f"{name}-{precision}": mb for name, amounts in
           [("large-v3",(850,1600,3100)),("distil-large-v2",(500,950,1800)),("distil-large-v3",(400,750,1400))]
           for precision, mb in zip(("int4","int8","fp16"),amounts)},
    },
}
brands = dict(whisper="Whisper", parakeet="Parakeet", moonshine="Moonshine", sensevoice="SenseVoice",
              paraformer="Paraformer", dolphin="Dolphin", omnilingual="Omnilingual", cohere="Cohere", openvino="OpenVINO Whisper")
languages = dict(en="English",ja="Japanese",zh="Chinese",ko="Korean",ar="Arabic")
for engine in brands:
    if engine not in runnable:
        continue
    for row in models["engines"].get(engine, {}).get("models", []):
        if not row["downloadable"]:
            continue
        name, arg = row["name"], row["download_arg"]
        mb = sizes[engine][name]
        label = name.removeprefix(engine + "-").replace("tdt-0.6b-", "").replace("unified-en-0.6b", "Streaming").removeprefix("transcribe-")
        label = label.replace(".en", "").replace("distil-", "Compact ").replace("-int8", " Compact").replace("-int4", " Compact").replace("-fp16", " Full").replace("-fp32", " Full")
        language = "Multiple languages"
        if engine == "moonshine":
            language = languages[name.rsplit("-",1)[-1]] if "-" in name else "English"
            label = label.split("-",1)[0]
        elif engine == "parakeet":
            language = "Multiple languages" if "v3" in name else "English"
        elif engine in ("whisper", "openvino"):
            if ".en" in name or name.startswith("distil-large-v2"):
                language = "English"
        elif engine == "paraformer":
            language = "Chinese + English" if name.endswith("-zh") else "English"
            label = "Chinese" if name.endswith("-zh") else "English"
        elif engine == "dolphin":
            language = "Chinese + English"
        elif engine == "sensevoice":
            language = "Chinese, English, Japanese, Korean, Cantonese"
        elif engine == "cohere":
            language = "Arabic, Asian and European languages"
        state = "Downloaded" if row["installed"] else "Not downloaded"
        print(f"{engine}:{arg}:{int(engine in compiled)}\t{brands[engine]} {label.replace('-', ' ').title()} · {mb} MB · {language} · {state}")
PY
)"
if [[ -z $choices ]]; then
  vgs_tui_error "No speech models are available for this computer."
  exit 1
fi
status=0
chosen="$(vgs_tui_choose --label-delimiter=$'\t' --header "Choose a speech model" <<<"$choices")" || status=$?
case "$status" in 0) ;; 1|130) exit 130 ;; *) exit "$status" ;; esac
IFS=: read -r engine model compiled <<<"$chosen"
if [[ $compiled != 1 ]]; then
  vgs_tui_step "Enabling the speech engine"
  # voxtype v1.1.0 config/load.rs applies VOXTYPE_ENGINE before config get
  # (config/schema.rs). The existing step probes the selected engine while
  # the saved model stays in place until the download succeeds.
  VOXTYPE_ENGINE="$engine" "${VGS_TUI_LIB%/*}/../vgshell-system" apply voxtype-engine
  if ! compiled="$(vgs_voxtype_compiled "$engine")"; then
    vgs_tui_error "VGS could not check the enabled speech engine."
    exit 1
  fi
  [[ $compiled == yes ]] || {
    vgs_tui_error "The speech engine was not enabled. Your model choice has not changed."
    exit 1
  }
fi
vgs_tui_step "Downloading the speech model"
voxtype setup --download --model "$model" --no-post-install --activate
vgs_tui_success "The speech model is ready."
