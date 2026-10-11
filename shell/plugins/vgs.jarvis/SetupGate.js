.pragma library

// Which setup step Jarvis offers while a command its setup needs is missing,
// pure so scripts/test-jarvis-setup-gate.js runs it under node. MISSING is
// the requirements capability's list: the plugin's declared commands the
// core's last scan did not find. A missing command is offered as Install on
// its own status row, which raises the core's requirement notice, and the
// setup step that needs it is withheld until a scan finds it.

// The value a setup reader publishes: its probe's VALUE while every command
// of REQUIRES is found, else a warning naming the missing commands that
// offers no action.
function setupValue(value, requires, missing) {
    var lacking = requires.filter(function (command) { return missing.indexOf(command) !== -1; });
    if (lacking.length === 0) return value;
    return { tone: "warning", text: "Needs " + lacking.join(" and "), action: false };
}

// The value of COMMAND's own status row, whose action is its install: offered
// while the last scan did not find it.
function requirementValue(command, missing) {
    if (missing.indexOf(command) === -1) return { tone: "ok", text: "Installed", action: false };
    return { tone: "warning", text: "Not installed", action: true };
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
var REQUIRED = { home: "setupHome", guidance: "setupHome", speech: "setupVoice", setup: "setupVoice", brain: "setupModel" };
// The hint a required step still to do shows in place of its declared one,
// by its cause: what the step's own action does not already say. A cause
// named nowhere here takes its step's hint below; a step with none there,
// such as local voice not set up, keeps the declared hint, which says what
// the step gives, since its action already says to set it up.
var TODO = {
    "brain=unselected": "Choose an AI model in Settings > AI model.",
    "brain=account-unavailable": "The chosen AI model cannot be used. Add a key or sign in, then choose it below.",
    "brain=model-required": "The chosen AI model cannot be used. Choose another AI model below.",
    "brain=signed-out": "The chosen AI model is not signed in. Sign in, then choose it below.",
    "brain=pi-update": "Jarvis needs Pi 1.1.0 or later. Update Pi, or choose another AI model below.",
    "brain=accounts-unreadable": "Jarvis could not read your accounts. Open Accounts to check them.",
    "speech=live-account-unselected": "Add an OpenAI key under Setup at the top of this page.",
    "speech=live-account-unreadable": "Jarvis could not read your OpenAI key. Use Accounts in Setup to check it.",
    "speech=live-key-required": "Add an OpenAI key under Setup at the top of this page.",
    "speech=local-not-ready": "Local voice did not start. Set it up again.",
    "speech=local-ready-timeout": "Local voice did not get ready in time. Turn Jarvis off and on again, or set it up again in Settings > Jarvis.",
    "setup=probe-timeout": "Jarvis setup check timed out. Turn Jarvis off and on again in Settings > Jarvis.",
    "speech=always-local-voice": "Always talk mode listens for Hey Jarvis on this computer. Choose Local in Settings > Voice, or Hold or Toggle in Settings > Listening."
};
// Causes whose step the voice setup action cannot complete: the user
// changes a setting or adds a key instead.
function setupActs(cause) {
    return cause.indexOf("speech=live-") !== 0 && cause !== "speech=always-local-voice";
}
var STEP_TODO = { brain: "The chosen AI model cannot be used. Add a key or sign in, then choose it below." };
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
// Voice setup uses Session's check result, which only the local wake detector supplies.
function voiceCheck(value, check) {
    if (value.tone !== "ok" || check === null || check.kind === "unavailable") return value.action === true
        ? Object.assign({}, value, { action: "setup" }) : noAction(value);
    if (check.kind === "waiting" || check.kind === "recording")
        return { tone: "info", text: "Say Hey Jarvis", hint: "The microphone is open for three seconds." };
    if (check.kind === "finishing") return { tone: "info", text: "Checking" };
    if (check.kind === "done") {
        if (check.result === "ready") return { tone: "ok", text: "Ready", action: "check" };
        if (check.result === "silent") return { tone: "warning", text: "Muted or silent", hint: "The microphone is muted or sends silence. Check Settings > Jarvis > Audio > Microphone.", action: "check" };
        return { tone: "warning", text: "Not heard", hint: "Jarvis did not hear Hey Jarvis: try again closer or in a quieter room", action: "check" };
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
    [/^jarvis: protocol=/, { kind: "wire-defect", title: "Jarvis and its daemon could not understand each other", action: START_RESTART }],
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

function setupCauseLine(cause) {
    if (cause === "setup=probe-timeout") return statusCauseLine("jarvis: setup=probe-timeout");
    return statusCauseLine(cause);
}

function stepCauseLines(cause) {
    return cause === "speech=local-ready-timeout" || cause === "setup=probe-timeout" ? [setupCauseLine(cause)] : undefined;
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
var SIGNED_OUT_HINT = "Your Claude Code or Codex account is not signed in. Sign in, then choose it below.";

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
// for good, or { kind: "answered", causes } from its status, as { setup,
// setupHome, setupVoice, setupModel }.
function readiness(answer) {
    switch (answer.kind) {
    case "checking":
        return { setup: CHECKING_SUMMARY, setupHome: HOME_READY, setupVoice: CHECKING, setupModel: noAction(CHECKING) };
    case "stopped":
        return { setup: { tone: "danger", text: "Not ready", hint: "Jarvis stopped after a problem. Turn Jarvis off and on again." },
            setupHome: HOME_READY, setupVoice: UNCHECKED, setupModel: noAction(UNCHECKED) };
    case "problem":
        var problem = startCause(answer.cause);
        return { setup: { tone: "danger", text: problem.title, hint: answer.action || problem.action, lines: problem.lines },
            setupHome: HOME_READY, setupVoice: UNCHECKED, setupModel: noAction(UNCHECKED) };
    case "answered":
        var out = { setup: answer.causes.length === 0 ? { tone: "ok", text: "Ready" } : { tone: "warning", text: "Not ready", lines: answer.causes.map(setupCauseLine) },
            setupHome: HOME_READY, setupVoice: DONE, setupModel: noAction(DONE) };
        answer.causes.forEach(function (cause) {
            var step = cause.slice(0, cause.indexOf("="));
            if (!Object.prototype.hasOwnProperty.call(REQUIRED, step)) throw new Error("jarvis-setup: cause=" + cause + " names no step");
            if (REQUIRED[step] === "setupHome") {
                out.setupHome = { tone: "warning", text: "To do",
                    hint: Object.prototype.hasOwnProperty.call(HOME_TODO, cause) ? HOME_TODO[cause] : HOME_STEP_TODO };
                return;
            }
            if (cause === "speech=local-loading") {
                out.setupVoice = LOADING;
                if (answer.causes.length === 1) out.setup = LOADING_SUMMARY;
                return;
            }
            if (Object.prototype.hasOwnProperty.call(MEMORY, cause)) {
                out.setupVoice = MEMORY[cause];
                return;
            }
            var hint = Object.prototype.hasOwnProperty.call(TODO, cause) ? TODO[cause] : STEP_TODO[step];
            var action = step === "brain" ? (cause === "brain=signed-out" ? "signIn" : cause === "brain=pi-update" ? "update" : "key") : setupActs(cause);
            var lines = stepCauseLines(cause);
            out[REQUIRED[step]] = hint === undefined ? { tone: "warning", text: "To do", action: action }
                : lines === undefined ? { tone: "warning", text: "To do", hint: hint, action: action }
                    : { tone: "warning", text: "To do", hint: hint, action: action, lines: lines };
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
// user chose, or for "auto" Realtime while the Realtime key setting names
// a stored OpenAI key, else Local. Always talk mode listens on this
// computer, so "auto" stays Local in it. OFFERED is the account reader's
// stored OpenAI keys, undefined while it has no answer, before its first
// read and after a failed one: the named key then counts as stored, so a
// start loads no local voice the first answer would replace, and the
// daemon judges a key it cannot read. Jarvis names a sole stored key
// itself (Accounts.qml).
function voiceProvider(settings, offered) {
    if (settings.voiceProvider !== "auto") return settings.voiceProvider;
    if (settings.mode === "always" || settings.voiceAccount === "") return "local";
    var stored = offered === undefined || offered.some(function (key) { return key.value === settings.voiceAccount; });
    return stored ? "realtime" : "local";
}

// The Voice group's key row for OFFERED, the stored OpenAI keys, or null
// while the account reader could not read them: Add key is offered until
// one is stored. The entry's hint says what the key unlocks (D075).
function voiceKey(offered) {
    if (offered === null) return { tone: "warning", text: "Could not check", action: true };
    return offered.length === 0 ? { tone: "info", text: "No key stored", action: true } : { tone: "ok", text: "Key stored", action: false };
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
