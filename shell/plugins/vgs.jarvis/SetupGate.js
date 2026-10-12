.pragma library

// Which setup step Jarvis offers while a command its setup needs is missing,
// pure so scripts/test-jarvis-setup-gate.js runs it under node. MISSING is
// the requirements capability's list: the plugin's declared commands the
// core's last scan did not find. A missing command is offered as Install on
// its own status row, which raises the core's requirement notice, and the
// setup step that needs it is withheld until a scan finds it.

// The value a setup reader publishes: its probe's VALUE while every command
// of REQUIRES is found, else a warning naming the missing commands that
// offers no action: false for an entry's one action, and none for a named
// one, which the manifest judge takes only as a name. Set up dictation stays
// offered: voxtype is the program the core's dictation setup gets ready.
function setupValue(value, requires, missing) {
    var lacking = requires.filter(function (command) { return missing.indexOf(command) !== -1; });
    if (lacking.length === 0) return value;
    var withheld = { tone: "warning", text: "Needs " + lacking.join(" and ") };
    if (value.action === "dictation") withheld.action = "dictation";
    else if (typeof value.action !== "string") withheld.action = false;
    return withheld;
}

// The commands a named step action needs: the core's dictation setup
// gets voxtype ready, which it cannot run without.
var ACTION_REQUIRES = { dictation: ["voxtype"] };
function actionRequires(value) {
    return typeof value.action === "string" && Object.prototype.hasOwnProperty.call(ACTION_REQUIRES, value.action)
        ? ACTION_REQUIRES[value.action] : [];
}

// The local voice takes its final words from the core's dictation
// recording (D064), over the capability's lent STATE, null before the
// first read. PROVIDER is the voice the daemon runs (voiceProvider). The
// cause the daemon holds the local voice with while that recording cannot
// start, which the hello carries (ChainedEngine select), "" while it can
// or for another voice. voxtype records the device its config names, and
// the local voice's captions hear the default source (Audio.js selected).
function dictationCause(provider, state) {
    if (provider !== "local" || state === null) return "";
    if (["absent", "starting", "failed", "elsewhere"].indexOf(state.daemon) !== -1) return "speech=dictation-" + state.daemon;
    return otherDevice(state) ? "speech=dictation-device" : "";
}
function otherDevice(state) {
    return state.daemon === "ready" && state.device !== "default";
}

// The service's answer to the daemon's dictation start before the core's,
// for a hello the device changed after: a keyed refusal, else "".
function dictationRefusal(state) {
    return otherDevice(state) ? "refused: dictation=device" : "";
}

// The value of COMMAND's own status row, whose action is its install: offered
// while the last scan did not find it.
function requirementValue(command, missing) {
    if (missing.indexOf(command) === -1) return { tone: "ok", text: "Installed", action: false };
    return { tone: "warning", text: "Not installed", action: true };
}

// The voxtype row's value: its install for the local voice, whose words
// voxtype records (dictationCause), and no row for another voice.
function voxtypeValue(provider, missing) {
    return provider === "local" ? requirementValue("voxtype", missing) : { hidden: true };
}

// The value of the status row of COMMAND, one the manifest gives a floor,
// whose entry declares the named actions `install` and `update`: it names
// the one that applies, and carries none once the last scan found the
// command at its floor. OUTDATED is the requirements capability's list of
// the plugin's commands the core's last scan read below their floor; either
// action raises the core's requirement notice, which installs or updates.
function flooredValue(command, missing, outdated) {
    if (missing.indexOf(command) !== -1) return { tone: "warning", text: "Not installed", action: "install" };
    if (outdated.indexOf(command) !== -1) return { tone: "warning", text: "Needs an update", action: "update" };
    return { tone: "ok", text: "Installed" };
}

// The Setup section of the Jarvis page (the manifest's `Setup` group): its
// summary and one entry per setup step. The required steps come only from
// the causes the daemon publishes, ChainedEngine's one readiness judge, by
// the step each cause names; the optional ones from their own readers.
var REQUIRED = { home: "setupHome", guidance: "setupHome", speech: "setupVoice", brain: "setupModel" };
// The hint a required step still to do shows in place of its declared one,
// by its cause: what the step's own action does not already say. A cause
// named nowhere here takes its step's hint below; a step with none there,
// such as local voice not set up, keeps the declared hint, which says what
// the step gives, since its action already says to set it up.
var TODO = {
    "brain=unselected": "Choose an AI model in Settings > AI model.",
    "brain=account-unavailable": "The chosen AI model cannot be used. Add a key or sign in, then choose it in Settings > AI model.",
    "brain=model-required": "The chosen AI model cannot be used. Choose another AI model in Settings > AI model.",
    "brain=signed-out": "The chosen AI model is not signed in. Sign in, then choose it in Settings > AI model.",
    "brain=pi-update": "Jarvis needs Pi 1.1.0 or later. Update Pi, or choose another AI model in Settings > AI model.",
    "brain=accounts-unreadable": "Jarvis could not read your accounts. Open Accounts to check them.",
    "speech=live-account-unselected": "Add a key for the cloud voice under Setup at the top of this page: an OpenAI key for Realtime, a Gemini key for Gemini Live.",
    "speech=live-account-unreadable": "Jarvis could not read your voice key. Use Accounts in Setup to check it.",
    "speech=live-key-required": "Choose a key for the cloud voice under Voice key, or add one under Setup at the top of this page: an OpenAI key for Realtime, a Gemini key for Gemini Live.",
    "speech=local-not-ready": "Local voice did not start. Set it up again.",
    "speech=local-ready-timeout": "Local voice did not get ready in time. Turn Jarvis off and on again, or set it up again in Settings > Jarvis.",
    "speech=always-local-voice": "Always talk mode listens for Hey Jarvis on this computer. Choose Local in Settings > Voice, or Hold or Toggle in Settings > Listening."
};
// Local voice that did not get ready in time is set up: its step states
// that result in place of To do, and the bar shows the step's hint for it
// (WidgetView.unconfiguredText).
var TIMED_OUT = "Timed out";
// The shell's own causes (LocalRuntime.qml setupCause), by their hint. The
// daemon never reads one, and Session's gate follows the daemon alone
// (jarvisd.js configured), so Jarvis still takes a request: the summary
// stays ready with the cause as a caution, and no step turns to do.
var CAUTION = {
    "setup=probe-timeout": "Jarvis setup check timed out. Turn Jarvis off and on again in Settings > Jarvis."
};
// The dictation causes (dictationCause), by the Voice step's value. The
// core's dictation setup copies voxtype's defaults and downloads its model;
// the user stops another voxtype, or chooses voxtype's microphone, in Voice.
var DICTATION = {
    "speech=dictation-absent": { tone: "warning", text: "To do", hint: "The local voice hears your words through dictation. Set up dictation gets it ready.", action: "dictation" },
    "speech=dictation-failed": { tone: "warning", text: "To do", hint: "Dictation did not start. Set up dictation gets it ready.", action: "dictation" },
    "speech=dictation-elsewhere": { tone: "warning", text: "Another voxtype runs", hint: "Stop the other voxtype under Setup in Settings > Voice." },
    "speech=dictation-device": { tone: "warning", text: "Dictation uses another microphone", hint: "The local voice hears the system default microphone. Choose it with Configure in Settings > Voice." }
};
// Causes whose step the voice setup action cannot complete: the user
// changes a setting or adds a key instead.
function setupActs(cause) {
    return cause.indexOf("speech=live-") !== 0 && cause !== "speech=always-local-voice";
}
var STEP_TODO = { brain: "The chosen AI model cannot be used. Add a key or sign in, then choose it in Settings > AI model." };
// The home folder step shows only while the daemon refuses the folder the
// user chose, with what to change, by its cause; any other cause of the
// folder or its text takes HOME_STEP_TODO. Its entry declares no action:
// the user changes the folder or the setting. A changed setting reaches
// the daemon at once; a change inside the folder does at the next request
// (jarvisd.js judgeSetup), which HOME_AGAIN says.
var HOME_AGAIN = " Jarvis checks the folder again when you press Talk.";
var HOME_TODO = {
    "home=link": "The home folder has a link where Jarvis keeps a file or a folder. Remove the link, or choose another folder in Settings > Home." + HOME_AGAIN,
    "home=path": "Jarvis cannot use this folder. Choose a folder inside your own home directory in Settings > Home.",
    "guidance=home-too-large": "AGENTS.md in the home folder is too long. Make it shorter than 8 KB." + HOME_AGAIN,
    "guidance=home-skills-too-large": "The home folder has more skills than Jarvis can list. Remove the skills you do not use." + HOME_AGAIN,
    "guidance=home-memory-too-large": "memory/MEMORY.md in the home folder is too long. Make it shorter than 4 KB." + HOME_AGAIN
};
var HOME_STEP_TODO = "Jarvis cannot use the home folder. Check that you can open and change it, or choose another folder in Settings > Home." + HOME_AGAIN;
var HOME_READY = { hidden: true };
var DONE = { tone: "ok", text: "Done", action: false };
// Voice setup uses Session's check result, which only the local wake detector
// supplies. A step that names its own action, such as Set up dictation, keeps it.
function voiceCheck(value, check) {
    if (value.tone !== "ok" || check === null || check.kind === "unavailable") return value.action === true
        ? Object.assign({}, value, { action: "setup" }) : typeof value.action === "string" ? value : noAction(value);
    if (check.kind === "waiting" || check.kind === "recording")
        return { tone: "info", text: "Say Hey Jarvis", hint: "The microphone is open for three seconds." };
    if (check.kind === "finishing") return { tone: "info", text: "Checking" };
    if (check.kind === "failed") return { tone: "danger", text: "Check failed",
        hint: "Jarvis could not check the microphone: press Check microphone to try again.", action: "check" };
    if (check.kind === "done") {
        if (check.result === "ready") return { tone: "ok", text: "Ready", action: "check" };
        // Only the local voice checks, and it hears the system default.
        if (check.result === "silent") return { tone: "warning", text: "Muted or silent", hint: "The default microphone is muted or sends silence. Check it in System > Sound.", action: "check" };
        return { tone: "warning", text: "Not heard", hint: "Jarvis did not hear Hey Jarvis: try again closer or in a quieter room.", action: "check" };
    }
    return { tone: "info", text: "Not checked", hint: "Press Check microphone, then say Hey Jarvis.", action: "check" };
}
var CHECKING = { tone: "info", text: "Checking", action: false };
var LOADING = { tone: "info", text: "Loading", action: false };
// The summary declares no action, so its value carries none: the manifest
// judge refuses an action key on an entry without one.
var CHECKING_SUMMARY = { tone: "info", text: "Checking" };
var LOADING_SUMMARY = { tone: "info", text: "Loading" };
var STATUS_TEXT_MAX = 200;
var START_RESTART = "Turn Jarvis off and on again in Settings > Jarvis.";
var START_CAUSES = [
    [/^jarvis: hello=timeout$/, { kind: "hello-timeout", title: "Jarvis did not answer in time", action: START_RESTART }],
    [/^jarvis: node=[^ ]+ need=22$/, { kind: "node-too-old", title: "Jarvis needs Node 22 or later", action: "Update Node to version 22 or later, then turn Jarvis off and on again in Settings > Jarvis." }],
    [/^jarvis: daemon=exit code=78 status=/, { kind: "node-too-old", title: "Jarvis needs Node 22 or later", action: "Update Node to version 22 or later, then turn Jarvis off and on again in Settings > Jarvis." }],
    [/^jarvis: daemon=(exit|ended)/, { kind: "daemon-exit", title: "Jarvis daemon stopped", action: START_RESTART }],
    [/^jarvis: protocol=/, { kind: "wire-defect", title: "Jarvis message error", action: START_RESTART }],
    [/^(jarvis: )?setup=probe-timeout$/, { kind: "probe-timeout", title: "Jarvis setup check timed out", action: START_RESTART, line: "jarvis: setup=probe-timeout" }]
];
var DAEMON_EXIT = { kind: "daemon-exit", title: "Jarvis daemon stopped", action: START_RESTART };
var RETRYING_START = "Jarvis is trying again by itself.";

function statusCauseLine(cause) {
    return String(cause).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").slice(0, STATUS_TEXT_MAX);
}

function startCause(cause) {
    var line = statusCauseLine(cause);
    for (var i = 0; i < START_CAUSES.length; i++) {
        if (START_CAUSES[i][0].test(cause)) {
            var words = START_CAUSES[i][1];
            return { kind: words.kind, title: words.title, action: words.action, lines: [statusCauseLine(words.line || line)] };
        }
    }
    return { kind: DAEMON_EXIT.kind, title: DAEMON_EXIT.title, action: DAEMON_EXIT.action, lines: [line] };
}

// The `daemon` value after a failed start, RETRYING or stopped for good:
// the bar words it from its title and hint; the keyed cause is only its
// line, which the Daemon row keeps for diagnostics.
function startStatus(cause, retrying) {
    var problem = startCause(cause);
    return { tone: retrying ? "warning" : "danger", text: problem.title,
        hint: retrying ? RETRYING_START : problem.action, lines: problem.lines };
}

// The desktop notices after CAUSE stopped Jarvis for good, and after it
// refused a mute press: the cause's title and action, never its key.
function stoppedNotice(cause) {
    var problem = startCause(cause);
    return { title: problem.title, message: problem.action, tone: "danger", icon: "mic" };
}
function muteRefusedNotice(cause) {
    return { title: "Jarvis mute not saved", message: "Mute request could not be saved: " + startCause(cause).title + ".",
        tone: "danger", icon: "mic" };
}
// The installed voice stays verified. Reinstalling it cannot free memory.
var MEMORY = {
    "speech=local-memory-insufficient": { tone: "warning", text: "Not enough memory",
        hint: "Close other apps, then turn Jarvis off and on.", action: false },
    "speech=local-memory-unavailable": { tone: "warning", text: "Memory check failed",
        hint: "Turn Jarvis off and on.", action: false }
};
// A required step once the daemon stopped: no check runs, none is offered.
var UNCHECKED = { tone: "warning", text: "Not checked", action: false };
// The AI model step declares named actions, Add key ("key"), Sign in
// ("signIn") and Update Pi ("update"), so its value names the one that
// applies or carries no action: the manifest judge refuses a boolean on it.
function noAction(value) {
    var out = Object.assign({}, value);
    delete out.action;
    return out;
}
var SIGNED_OUT_HINT = "Your Claude Code or Codex account is not signed in. Sign in, then choose it in Settings > AI model.";

// Account discovery supplies typed states even before it offers a model:
// present while an app is signed in, signed-out while an app Sign in serves
// is found signed out (the account list's signIn), else absent. A found CLI
// folder alone does not establish that its app is signed in.
function accountAccess(accounts) {
    if (accounts.some(function (account) {
        return account.source === "cli" && ["signed-in", "verified", "verifying"].indexOf(account.state) !== -1;
    })) return { kind: "present" };
    return { kind: accounts.some(function (account) { return account.signIn === true; }) ? "signed-out" : "absent" };
}

// The model row keeps Sign in for a signed-out cause. Otherwise it offers
// a step only after both readers find no key or signed-in app: Sign in
// while an app is found signed out, else Add key. Missing reader output
// stays checking, without an action.
function modelStep(value, keys, access) {
    if (value.action !== "key") return value;
    var absent = keys !== undefined && keys.every(function (key) { return key.value === "absent"; });
    if (absent && access.kind === "absent") return value;
    if (absent && access.kind === "signed-out") return Object.assign({}, value, { hint: SIGNED_OUT_HINT, action: "signIn" });
    return noAction(value);
}

// The summary and required step values for ANSWER: { kind: "checking" }
// while the daemon has not answered, { kind: "stopped" } once it stopped
// for good, { kind: "problem", cause } after a failed start, or
// { kind: "answered", causes } from its status, as { setup, setupHome,
// setupVoice, setupModel }. No value holds a keyed cause: the log and the
// Daemon row keep it.
function readiness(answer) {
    switch (answer.kind) {
    case "checking":
        return { setup: CHECKING_SUMMARY, setupHome: HOME_READY, setupVoice: CHECKING, setupModel: noAction(CHECKING) };
    case "stopped":
        return { setup: { tone: "danger", text: "Not ready", hint: "Jarvis stopped after a problem. Turn Jarvis off and on again." },
            setupHome: HOME_READY, setupVoice: UNCHECKED, setupModel: noAction(UNCHECKED) };
    case "problem":
        var problem = startCause(answer.cause);
        return { setup: { tone: "danger", text: problem.title, hint: answer.action || problem.action },
            setupHome: HOME_READY, setupVoice: UNCHECKED, setupModel: noAction(UNCHECKED) };
    case "answered":
        // The summary says only its state and hint: each step words its own
        // causes, and a caution's hint is its words.
        var blocking = answer.causes.filter(function (cause) { return !Object.prototype.hasOwnProperty.call(CAUTION, cause); });
        var out = { setup: answer.causes.length === 0 ? { tone: "ok", text: "Ready" }
                : blocking.length === 0 ? { tone: "ok", text: "Ready", hint: answer.causes.map(function (cause) { return CAUTION[cause]; }).join(" ") }
                    : { tone: "warning", text: "Not ready" },
            setupHome: HOME_READY, setupVoice: DONE, setupModel: noAction(DONE) };
        blocking.forEach(function (cause) {
            var step = cause.slice(0, cause.indexOf("="));
            if (!Object.prototype.hasOwnProperty.call(REQUIRED, step)) throw new Error("jarvis-setup: cause=" + cause + " names no step");
            if (REQUIRED[step] === "setupHome") {
                out.setupHome = { tone: "warning", text: "To do",
                    hint: Object.prototype.hasOwnProperty.call(HOME_TODO, cause) ? HOME_TODO[cause] : HOME_STEP_TODO };
                return;
            }
            if (cause === "speech=local-loading" || cause === "speech=dictation-starting") {
                out.setupVoice = LOADING;
                if (blocking.length === 1) out.setup = LOADING_SUMMARY;
                return;
            }
            if (Object.prototype.hasOwnProperty.call(MEMORY, cause)) {
                out.setupVoice = MEMORY[cause];
                return;
            }
            if (Object.prototype.hasOwnProperty.call(DICTATION, cause)) {
                out.setupVoice = DICTATION[cause];
                return;
            }
            var hint = Object.prototype.hasOwnProperty.call(TODO, cause) ? TODO[cause] : STEP_TODO[step];
            var action = step === "brain" ? (cause === "brain=signed-out" ? "signIn" : cause === "brain=pi-update" ? "update" : "key") : setupActs(cause);
            var text = cause === "speech=local-ready-timeout" ? TIMED_OUT : "To do";
            out[REQUIRED[step]] = hint === undefined ? { tone: "warning", text: text, action: action }
                : { tone: "warning", text: text, hint: hint, action: action };
        });
        return out;
    }
    throw new Error("jarvis-setup: answer=" + JSON.stringify(answer.kind) + " unexpected");
}

// The Copilot Memory row for ACCOUNTS, the account list's items: shown
// while a GitHub Copilot account is found signed in or unchecked. GitHub
// keeps Copilot Memory in the account, where only the user can turn it off;
// its entry's hint and link say where (D075).
function copilotMemory(accounts) {
    return accounts.some(function (account) { return account.provider === "copilot" && account.value === "present"; })
        ? { tone: "info", text: "Your step" } : { hidden: true };
}

// The voice the daemon runs for SETTINGS, the plugin's: the provider the
// user chose, or for "auto" Realtime while the Voice key setting names a
// stored OpenAI key, else Local. Always talk mode listens on this
// computer, so "auto" stays Local in it. OFFERED is the account reader's
// stored cloud voice keys, each {value, label, provider}, undefined while
// it has no answer, before its first read and after a failed one. A key's
// id does not tell its provider, so with no answer "auto" is Local: the
// named key may be a Gemini key, which Realtime cannot use, and the first
// answer moves "auto" to Realtime when it names an OpenAI key. Jarvis
// names a sole stored key itself (voiceChoice).
function voiceProvider(settings, offered) {
    if (settings.voiceProvider !== "auto") return settings.voiceProvider;
    if (settings.mode === "always" || offered === undefined) return "local";
    return offered.some(function (key) { return key.provider === "openai" && key.value === settings.voiceAccount; }) ? "realtime" : "local";
}

// The account provider whose keys the Voice key setting offers for
// SETTINGS: Gemini for Gemini Live, else OpenAI, which Realtime and Auto use.
function voiceKeyProvider(settings) {
    return settings.voiceProvider === "gemini" ? "gemini" : "openai";
}

// The Voice key choices for SETTINGS from KEYS, the account reader's stored
// cloud voice keys: the keys of the selected cloud voice's provider.
function voiceKeys(keys, settings) {
    var provider = voiceKeyProvider(settings);
    return keys.filter(function (key) { return key.provider === provider; })
        .map(function (key) { return { value: key.value, label: key.label }; });
}

// The key Jarvis selects for the user from KEYS, or null: the sole stored
// key of the selected cloud voice, while the Voice key setting names none,
// or, while Realtime or Gemini is chosen, a stored key of the other cloud
// voice, as after a change of Voice provider. Under Local or Auto a named
// key stays, so a Gemini key chosen before survives a visit to Local; a
// named key that is not stored, such as a locked one, stays too.
function voiceChoice(keys, settings) {
    var offered = voiceKeys(keys, settings);
    if (offered.length !== 1) return null;
    var named = settings.voiceAccount;
    if (named === "") return offered[0].value;
    var cloud = settings.voiceProvider === "realtime" || settings.voiceProvider === "gemini";
    var other = cloud && keys.some(function (key) { return key.value === named && key.provider !== voiceKeyProvider(settings); });
    return other ? offered[0].value : null;
}

// The Cloned voice setup row (the manifest's clonedVoiceSetup) for VALUE,
// `setup-local clone status`'s answer, or the reader's own failure value
// with `action: true`. PROVIDER is the voice the daemon runs
// (voiceProvider). The cloned voice speaks only through the local voice,
// beside its graphics card tier (VGS-1384): while either is missing, Set up
// is withheld with the reason. Remove recording stays offered whatever the
// voice. `recording` and `tierReady` are setup-local's, for this row only;
// a failed read has neither, and its setup judges the tier itself. The row
// words its state: a failed read's keyed line stays off it. It is an
// optional step of the Setup tab, as Browser and Input are: any state but
// ready reads info, so it never makes Jarvis read Setup needed nor takes the
// page's primary action from a required step (Steps.js stepOpen).
var CLONE_WITHHELD = {
    provider: { text: "Needs the Local voice", hint: "Choose Local as the Voice provider to use a cloned voice." },
    tier: { text: "Needs the Large model", hint: "Set up the Large local voice model, which needs an NVIDIA graphics card." }
};
// The hint of a ready row: what the recording gives now. The declared hint
// says how to set the step up, which a done step no longer asks.
var CLONE_READY_HINT = "Jarvis speaks in this voice while Cloned voice is on in Settings > Local voice.";
function clonedVoiceStep(value, provider) {
    var action = value.action === true ? "setup" : value.action;
    var reason = provider !== "local" ? CLONE_WITHHELD.provider : value.tierReady === false ? CLONE_WITHHELD.tier : null;
    // A row of named actions offers none by leaving `action` out.
    if (reason !== null && action !== "remove") return { tone: "info", text: reason.text, hint: reason.hint };
    var row = { tone: value.tone === "ok" ? "ok" : "info", text: value.text };
    if (typeof action === "string") row.action = action;
    if (reason !== null) row.hint = reason.hint;
    else if (value.hint !== undefined) row.hint = value.hint;
    else if (row.tone === "ok") row.hint = CLONE_READY_HINT;
    return row;
}

// What a key unlocks and where to get one (D075), by the Voice provider
// setting: the chosen cloud voice's key, or under Local and Auto both. The
// row's one link, Google AI Studio, draws where the hint names it.
var VOICE_KEY_HINTS = {
    realtime: "An OpenAI key lets Jarvis use the Realtime voice: OpenAI hears you and speaks the reply. Get a key from OpenAI API keys.",
    gemini: "A Gemini key lets Jarvis use the Gemini Live voice: Google hears you and speaks the reply. Get a key from Google AI Studio.",
    other: "An OpenAI key lets Auto use the Realtime voice; a Gemini key serves Gemini Live once you choose it. Get a key from OpenAI API keys or Google AI Studio."
};
// The Voice group's key row for OFFERED, the stored keys of the cloud voice
// SETTINGS select (voiceKeys), or null while the account reader could not
// read them: Add key is offered until one is stored.
function voiceKey(offered, settings) {
    var hint = VOICE_KEY_HINTS[settings.voiceProvider === "realtime" || settings.voiceProvider === "gemini" ? settings.voiceProvider : "other"];
    if (offered === null) return { tone: "warning", text: "Could not check", hint: hint, action: true };
    return offered.length === 0 ? { tone: "info", text: "No key stored", hint: hint, action: true }
        : { tone: "ok", text: "Key stored", hint: hint, action: false };
}

// The Voice preview row's words for a cloud voice PROVIDER (voiceProvider):
// whose key the preview uses, and that it may cost money.
function previewCost(provider) {
    return provider === "gemini"
        ? { tone: "info", text: "Uses your Gemini key", hint: "A preview of the Gemini Live voice may cost money.", action: true }
        : { tone: "info", text: "Uses your OpenAI key", hint: "A preview of the Realtime voice may cost money.", action: true };
}

// The Agent fleet row (the manifest's setupFleet) for HOME, the home folder
// the setting names or null, and TOOL, the kendex mail tool Home.mailTool
// finds there or null: hidden while no home is chosen, which the home row
// covers, and once the tool is found; else offering its setup, which the
// core withholds behind the requirement notice while kendex is missing.
function fleetStep(home, tool) {
    if (home === null || tool !== null) return { hidden: true };
    return { tone: "info", text: "Optional", action: true };
}

// The Jarvis session row (the manifest's sessionStart): what the Jarvis
// package's session command answers, in the page's words. Each sentence is
// the owner's (VGS-1439, 2026-10-12).
var SESSION_BOOT = "When VGS starts after you sign in, a tmux session starts Jarvis in your selected home folder.";
var SESSION_BLOCKS = {
    "no-account": "No session can start without an account: under AI model, choose an app as the Account.",
    "not-app": "No session can start with an API key or a local model: under AI model, choose an app as the Account.",
    "no-home": "No session can start without a home folder: choose a Home folder.",
    "package": "Install or update the Jarvis package in this home folder."
};
var SESSION_FAILED = "Jarvis did not start.";
// PluginLogic STATUS_HINT_MAX, the longest hint a status row takes.
var SESSION_HINT_MAX = 200;
// The states of a session that lives, which a status read may find.
var SESSION_LIVE = ["running", "starting", "handing-over"];
function sessionLive(state) {
    return SESSION_LIVE.indexOf(state) !== -1;
}
// The package's state and reason, as "state reason", to the row. `detail`
// takes the package's own line, `names` the recorded session's home and
// account, `wanted` the row of the boot setting, and `action` names the
// manifest action the row offers.
var SESSION_ROWS = {
    "off app-off": { tone: "info", text: "Off", hint: "Jarvis is off." },
    "blocked app-off": { tone: "info", text: "Off", hint: "Jarvis is off." },
    "stopped never-started": { wanted: true },
    "stopped stopped": { wanted: true },
    "stopped ended": { wanted: true },
    "starting launching": { tone: "info", text: "Starting", hint: "Jarvis is starting in your selected home folder." },
    "running new-no-record": { tone: "ok", text: "Running", hint: "No previous Jarvis session was saved. Started a new session." },
    "running new-history-gone": { tone: "ok", text: "Running", hint: "The saved conversation is unavailable. A new session continued your saved work." },
    "running new-selection-changed": { tone: "ok", text: "Running", hint: "A new session continued your saved work on the selected account." },
    "running resumed": { tone: "ok", text: "Running", names: true },
    "running new-requested": { tone: "ok", text: "Running", names: true },
    "running existing": { tone: "ok", text: "Running", names: true },
    "handing-over succession": { tone: "info", text: "Handing over", hint: "Jarvis is moving its saved work to a new session." },
    "stopping stop-requested": { tone: "info", text: "Stopping", hint: "Jarvis is saving its state and stopping." },
    "blocked name-conflict": { tone: "warning", text: "Cannot start", hint: "A different session uses the Jarvis terminal. Close it or select the home it belongs to." },
    "blocked record-unreadable": { tone: "warning", text: "Cannot start", hint: "Jarvis cannot read its saved session record." },
    "blocked sign-in-required": { tone: "warning", text: "Cannot start", detail: true },
    "blocked selection-conflict": { tone: "warning", text: "Cannot start", hint: "Changing the home or account restarts Jarvis after the new selection is checked." },
    "blocked tmux-missing": { tone: "warning", text: "Cannot start", hint: "No session can start without tmux.", action: "tmux" },
    "blocked app-missing": { tone: "warning", text: "Cannot start", hint: "No session can start, because the app of the selected account is not installed." },
    "failed launch-failed": { tone: "danger", text: "Not started", detail: true, action: "retry" },
    "failed handover-failed": { tone: "danger", text: "Not started", detail: true, action: "retry" }
};
// The setting's two session choices; the first is what the unset value means.
var SESSION_MODES = [{ label: "Resume the last session", value: "resume" }, { label: "Start a new session", value: "new" }];

// The row for RESULT, backend/session-control.js's answer, null before the
// first one and { kind: "failed" } where the helper gave none. WANTED is
// the Start Jarvis at boot setting, which words only a session that does
// not run: a live session reads as it is, whatever the setting.
function sessionStart(wanted, result) {
    if (result === null) return { hidden: true };
    if (result.kind === "blocked") {
        if (!Object.prototype.hasOwnProperty.call(SESSION_BLOCKS, result.block)) throw new Error("jarvis-setup: session=" + result.block);
        return { tone: "warning", text: "Cannot start", hint: SESSION_BLOCKS[result.block] };
    }
    var failure = { tone: "danger", text: "Not started", hint: SESSION_FAILED, action: "retry" };
    if (result.kind !== "answer") return failure;
    var row = SESSION_ROWS[result.state + " " + result.reason];
    if (row === undefined) return failure;
    var value;
    if (row.wanted) value = wanted ? { tone: "info", text: "Starts at the next boot", hint: SESSION_BOOT, action: "start" }
        : { tone: "info", text: "Not started", hint: "Start Jarvis to continue your work. Automatic start is off.", action: "start" };
    else {
        var hint = row.detail ? (result.detail !== "" ? result.detail : SESSION_FAILED)
            : row.names ? (result.names === null ? "" : "Jarvis runs in " + result.names.home + " with " + result.names.account + ".") : row.hint;
        // The status judge takes a hint of 1 to SESSION_HINT_MAX
        // characters: a recorded session with no names, or with names too
        // long for one, reads by its row text alone.
        value = hint === "" || hint.length > SESSION_HINT_MAX ? { tone: row.tone, text: row.text } : { tone: row.tone, text: row.text, hint: hint };
        if (row.action !== undefined) value.action = row.action;
    }
    // The selection that failed its check, beside the session that stays.
    if (result.unapplied !== undefined) value.lines = [SESSION_BLOCKS[result.unapplied]];
    return value;
}

// The session choices the page offers: none while the setting is off, so
// the page draws no session field.
function sessionModes(wanted) {
    return wanted ? SESSION_MODES : [];
}

// The optional steps, by their status key. Their guidance is declared by
// the manifest and does not change with their state.
var OPTIONAL = {
    setupBrowser: true,
    setupInput: true
};

// The value of optional step KEY from VALUE, its reader's state: done while
// that state is ok, else Optional, offering the step while the
// reader offers its own action.
function optionalStep(key, value) {
    if (!Object.prototype.hasOwnProperty.call(OPTIONAL, key)) throw new Error("jarvis-setup: step=" + key + " is not optional");
    if (value.tone === "ok") return DONE;
    return { tone: "info", text: "Optional", action: value.action === true };
}

// The Local voice setting (`localTier`) and its downloads. WANTED is the
// setting: a tier, or "auto" for PICK, the tier setup-local reads as best
// for this computer. READY is the tier setup left ready, null for none.
function wantedTier(wanted, pick) {
    return wanted === "auto" ? pick : wanted;
}

// The arguments of the setup-local run that a change of the setting to
// WANTED starts, null for none: none while the wanted tier is ready, else
// the wanted tier, or none for the pick, which setup-local installs then.
function tierRun(wanted, pick, ready) {
    if (wantedTier(wanted, pick) === ready) return null;
    return wanted === "auto" ? [] : [wanted];
}

// The setting after a setup run ended, null to keep it: once the run left
// another tier than the wanted one ready, a cancelled pick or the Setup
// button's install of the pick, the setting names that tier, "auto" for the
// pick, so the page shows what is installed. A run that left none keeps it:
// READY null is then returned.
function tierAfterRun(wanted, pick, ready) {
    if (wantedTier(wanted, pick) === ready) return null;
    return ready === pick ? "auto" : ready;
}
