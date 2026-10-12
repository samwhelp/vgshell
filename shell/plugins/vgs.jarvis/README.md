# Jarvis

Jarvis is a voice assistant for your desktop. You talk to it, it answers through the AI model you choose, and it can act on your windows, files, clipboard, media, screen and a private browser.

![The Jarvis daemon's status on its Settings page](../../../docs/images/plugins/vgs.jarvis-page.webp)

Screenshot made with `scripts/readme-shots.sh` in the nested sandbox, with the default theme at scale 2.

## Features

- A bar icon that shows what Jarvis is doing.
- Keys to talk, mute, stop, confirm a request and open the Console.
- A Console window with Conversation, Tasks and Audit tabs.
- A mute that stays on across restarts.
- A listening bubble that lets clicks reach the window below.
- Always talk mode: say Hey Jarvis to start a request.
- A home folder with your instructions, skills and memory, shared by every AI model.
- Requests to your agent fleet, sent after you confirm them.
- Start Jarvis at boot: your Jarvis session starts in tmux in the home folder when VGS starts after you sign in.
- An AI model from an API key or a signed-in app: Claude Code, Codex, GitHub Copilot, or Pi with its own providers.
- Backup models that Jarvis tries when the answering model fails.
- Local voice, the default: speech to text and spoken replies on your computer.
- Realtime voice from OpenAI with a saved OpenAI key, a slower cloud option.
- Talk interrupts Jarvis while it speaks.
- Provider keys kept in your desktop keyring.
- Accounts finds the keys and sign-ins your other tools already have.
- Verify checks that an account answers.
- Short commands, such as "turn the volume up" or "go to workspace three", act at once with no AI model call.
- Window, workspace and application control.
- File tools for your home folder.
- Shell commands inside a sandbox.
- Clipboard, media, volume and notification tools.
- Screen reading, with private windows painted black.
- A private browser that asks before it submits.
- Coding tasks in tmux or a floating terminal.
- Spoken questions and answers with your coding agents.

## Bar icon

The icon's tooltip says what to do next and names the answering AI model when one is active. A click toggles mute.

| State | Icon | When | What the tooltip tells you |
| --- | --- | --- | --- |
| Off | `power-off` | Jarvis needs setup, a requirement, or an unlocked screen. | What setting or action turns Jarvis on. |
| Loading | `loader` | Jarvis starts, checks setup or loads local voice. | What is loading and to wait. |
| Ready | `mic` | Jarvis can listen. | How to talk: hold Talk, press Talk, or say Hey Jarvis. When an AI model is active, its name appears on its own line. |
| Listening | `audio-lines` | The microphone is open. | Speak now, or say Hey Jarvis in Always mode. |
| Working | `brain` | Jarvis is thinking, waiting for confirmation or using a tool. | What Jarvis is doing and the Stop or Confirm key to use. |
| Speaking | `volume-2` | Jarvis plays its answer. | That Jarvis is speaking and the Stop key to use. |
| Muted | `mic-off` | Privacy mute is on. | Click or press the Mute key to unmute. |
| Problem | `circle-alert` | Jarvis or audio stopped with a fault. | What failed and what action to take, from the first failed start. |

## Keys and voice

| Key | Default | What it does |
| --- | --- | --- |
| Talk | Super with Right Alt | Opens the microphone; Talk mode decides whether you hold it or press it. Pressing it while Jarvis speaks interrupts it. |
| Mute | Super with Shift and Right Alt | Turns the Jarvis microphone off, or on again. Mute stays on across restarts and blocks talk input. |
| Stop | Super with Alt and Period | Ends what Jarvis is doing now: listening, thinking or speaking. |
| Confirm | Super with Alt and Y | Confirms the Jarvis request shown on screen. |
| Console | Super with Alt and C | Opens the Console window. |

- Conversation lets you type to Jarvis and review its replies. Tasks shows coding tasks and lets you open or stop the selected task. Audit shows recent refused or failed actions.
- The listening bubble's orb and text let clicks reach the application below. While Jarvis waits for Hey Jarvis, its bubble shows a still orb.
- In Always talk mode the local voice on this computer hears Hey Jarvis. Nothing reaches the AI model until you speak after it.
- Audio is half duplex: Jarvis closes its microphone while speech plays, and Talk interrupts speech.
- Local voice runs speech to text and spoken replies on your computer, with no network access, after Set up local voice. voxtype, the dictation program that Voice also uses, records your words and hears the system default microphone. Its tones, which you set in Voice, tell you when it records.
- With the Realtime voice, OpenAI hears you and speaks the reply. The selected AI model answers each request through Jarvis's action and release checks.

## Setup

The Setup section at the top of the Jarvis page says Ready when Jarvis has an AI model it can use and the selected voice provider, and Not ready when it does not. It offers Sign in, AI model, Voice, Browser and Input. The AI model and voice steps read Done or To do. Sign in is optional. A step with a setup action shows its action beside it. The browser and input steps read Optional until they are done. If start fails, Setup names the cause and shows the keyed cause on its detail line.

Setup actions are buttons on the Jarvis page in Plugins or rows in the launcher's Jarvis group. These actions open a floating terminal. Jarvis uses the local voice unless you choose Realtime under Voice provider, and Setup does not ask for a key. For the Realtime voice, use Add key under Setup at the top of this page to save an OpenAI key. Jarvis selects the only available OpenAI key when Realtime key is empty, and Voice provider Auto then uses the Realtime voice. With several keys, choose one under Voice.

- Add key stores a new API key from an AI provider in your desktop keyring, with hidden key input. Plugins shows whether a key is present, absent, locked or unavailable without reading it. You choose the provider from a list that names the page where it makes keys, then give the key a name.
- Sign in opens the app's own sign-in: Claude Code, Codex, GitHub Copilot or Pi. Give a new account a name, or select an existing account folder. Jarvis shows the folder before sign-in and creates it if needed. After sign-in, select the account as the AI model. The app keeps its login token.
- Set up local voice downloads the local voice model that runs best on this computer; choose another under Local voice in Settings. It checks free space, downloads the models and a private runtime, and reports Ready only after verification and a bundled test clip succeed.
- Set up dictation gets voxtype ready for the local voice and downloads its speech model. The voxtype row offers Install while voxtype is missing.
- Set up browser checks an installed browser on a blank page, or offers a private download. The Browser driver row offers Install while agent-browser is missing.
- Accounts adds a directory, chooses an existing keyring item by label or inspects login hints. It finds the account folders of other tools in your home, config and data folders, and can remember a key another tool stored without copying its value. A login hint never proves that the AI answers.
- Verify sends one small request to an account after you consent, because a real request may cost money.
- Check input checks the desktop input tools.

The shell's requirement notice installs a missing tool in one click.

Home folder shows in Setup only when Jarvis cannot use the folder you chose, and says what to change. Jarvis checks the folder again when you press Talk.

With a GitHub Copilot account, Setup shows Copilot Memory. GitHub keeps that memory in your account, so only you can turn it off: open [GitHub Copilot settings](https://github.com/settings/copilot/features) and set Copilot Memory to Disabled.

## Settings

| Setting | What it changes |
| --- | --- |
| Talk mode | Hold: Jarvis takes what you said when you let go of the Talk key. Toggle: the conversation stays open until you press Talk again. Always: say Hey Jarvis, then your request; Talk listens at once. Always needs the local voice: the word is heard on this computer, and the bubble stays on screen while the microphone is open. |
| Microphone, Speaker | The audio devices Jarvis uses. |
| Voice provider | Local is the default: it keeps speech on this computer and answers fastest. Realtime sends microphone audio and released results to OpenAI and answers more slowly. Auto uses Realtime when an OpenAI key is stored, else Local; in Always talk mode it stays Local. A choice of Local or Realtime stays, whatever keys are stored. Changing it ends the conversation. |
| Local voice model | Auto is the model that runs best on this computer, from its graphics card memory, its memory and its processor threads. The list shows each other model this computer can run, with its download size. Choosing one downloads it now in a floating terminal, which asks first when it would replace a ready model. The choice changes the voice Jarvis speaks with. Dictation uses voxtype's model: change it with Choose model in Voice. |
| Realtime key | A saved OpenAI key the Realtime voice uses. Add key opens hidden key input and stores the key in your desktop keyring. Get the key at [OpenAI API keys](https://platform.openai.com/api-keys). |
| AI model | The AI that answers you: an API key you added, or an app you are signed in to. It lists only the choices Jarvis can use. An app with more than one account shows each by its sign-in email. |
| Model | The model the chosen app runs, from that app's own list. Jarvis reads the list while this page is open, and saves Fable 5.1 where the app offers it, else Opus 5.5, else the app's own model. Pi names each model with its provider, and Jarvis saves Pi's own model. Before the page reads a list, Claude Code runs Fable 5.1 at high effort, an Anthropic API key runs Opus 5.5 at high effort, and any other app runs its own model. A saved model that leaves the app's list stays saved and reads as unavailable. The field shows for Claude Code, Codex, GitHub Copilot, Pi and an Anthropic API key. For an Anthropic API key the list is the models Jarvis runs with that key, and Jarvis saves Opus 5.5 at high effort. Each read of GitHub Copilot's list leaves one empty session in your Copilot history, one per time you open this page. When the app does not give its list, the field shows the model Jarvis runs with "list not read". When the answering app cannot use the model, Jarvis says so with the model's name and tries the next backup model. Changing it ends the conversation. |
| Backup models | The ordered models Jarvis tries when the answering app refuses a turn, needs sign-in, hits a usage wall or stops during an outage. Jarvis tells you that the new model has not heard the earlier conversation. It sends the refused request again only when no tool ran and no reply was spoken; otherwise it asks you to say the request again and says the new model has not heard the earlier conversation. Changing it ends the conversation. |
| Effort | How much the model thinks before it answers. Jarvis saves High for Fable 5.1 and Opus 5.5, and the model's own level for any other model. For Pi, Jarvis saves the model's own level for every model. The field shows only for a model that takes an effort level. GitHub Copilot sets its own effort, so it shows none. Changing it ends the conversation. |
| Home folder | The folder for what Jarvis knows. The list holds the homes Jarvis used. None leaves Jarvis with what VGS ships. Changing it ends the conversation. |
| Start Jarvis at boot | Off at first. When VGS starts after you sign in, a tmux session starts Jarvis in your selected home folder, with the app of the account under AI model. The Jarvis package in the home folder owns that session: Settings shows what it reports under Jarvis session on Details, with Start while no session runs and Retry after a failed start. A restart of the shell starts no second session. With an API key or a local model as the account, no session can start; choose an app as the account. Changing the home or account restarts Jarvis after the new selection is checked. |
| Session at boot | Shows while Start Jarvis at boot is on. Resume the last session resumes your saved Jarvis conversation and checks its unfinished work; if that conversation is unavailable, a new session continues the saved work. Start a new session starts a fresh conversation and continues the work saved in your Jarvis home. It applies at the next boot, and a session already running is not replaced. |
| Task terminal | Where a coding task opens. Auto uses tmux when it is installed, so several tasks run at once, and the floating terminal otherwise. |
| Screen to cloud | Whether a screenshot or its text goes to an AI outside this computer. Ask withholds it unless granted for the conversation, Allow sends it, Never withholds it. When the AI and the voice both run on this computer, they always receive it. |
| Private windows | Comma-separated words. A window whose class or title contains one is painted black before a screenshot leaves Jarvis. A title cannot always show private browsing. |

The keys are under Keys on the same page. Enabled is the one switch that turns Jarvis on or off: turning it off stops its session and prevents automatic starts. Mute closes only the microphone, and Show in bar puts the bar icon back after Hide.

## Tools

- Window, workspace and application tools read each change back from Hyprland before they report it done.
- File tools list, read, search, write, move and delete files in your home folder. They refuse credential stores, account folders and VGS's own files, and never follow a link out of your home folder.
- Shell tools keep commands inside a kernel sandbox. Plugins shows whether the sandbox is ready and offers Install Bubblewrap when it is missing.
- Desktop tools read and copy clipboard text, play, pause and skip media, set and mute the speaker volume, and show a notification. A clipboard read refuses a copy that a password manager marks as secret.
- Screen tools read the screen, a monitor, a window, a region or an area you draw, at most four times a turn. Windows of password managers and private browsing are painted black before a screenshot leaves Jarvis.
- The private browser comes from Set up browser. Jarvis asks for input access to each site, a submit needs your confirmation, and password entry stays with you.
- Coding tasks run in their own tmux session or a floating terminal. Plugins shows how many are running. A stop ends every process of the task before it is recorded as stopped.
- Jarvis speaks a coding agent's question and sends your spoken answer back to it. It calls a task done only when the agent reports it done. With no conversation open, it shows these as desktop notifications.

## Home folder

Choose a folder under Settings → Plugins → Jarvis → Home folder. Switch between homes there or open Jarvis homes in the launcher and select a folder. The current home has a checked folder icon. Every AI model uses your instructions, skills, memory and state in it the same way. No AI model can change anything in the folder but its `state/` part, apart from an agent fleet request. Jarvis adds the entries the folder lacks and changes no file it finds outside `skills/base/`. It never follows a link in the folder, and it does not start with a folder that has a link in place of an entry below or anywhere in `skills/base/`.

| Entry | What it holds |
| --- | --- |
| `AGENTS.md` | Your instructions for Jarvis: who it is and how it talks. Every AI model gets this text at the start of a conversation, so keep it under 8 KB. |
| `CLAUDE.md` | One line that points Claude Code at `AGENTS.md`, for your own Claude Code session in this folder. |
| `skills/base/jarvis/` | The Jarvis skill VGS provides: `SKILL.md`, `persona.md`, `README.md` and `references/` with `accounts-and-secrets.md`, `browser.md`, `communication.md`, `computer-use.md`, `decisions.md`, `long-session.md`, `memory.md`, `research.md` and `verification.md`. Every AI model gets `persona.md` before `AGENTS.md`, and reads the skill and each reference when it needs it. When this folder differs from the copy VGS installed, after an update or an edit, Jarvis replaces `skills/base/` with that copy and removes anything else in it. Keep your changes in `AGENTS.md` and `skills/own/`. In a folder where kendex has installed its Jarvis skill, `.agents/skills/jarvis/`, Jarvis reads that skill instead and removes `skills/base/`. Jarvis does not start with the folder while that skill lacks `SKILL.md` or `persona.md`, is a link, or holds a link or an entry that is neither a folder nor a file. |
| `skills/own/` | Your own skills. A skill is a Markdown file, or a folder with a `SKILL.md` file. Its name is the file name without `.md`, or the folder name: it starts with a letter or a digit and has only letters, digits, `_` and `-`, at most 48 characters. Jarvis skips a skill with any other name. A folder skill's `references/` holds more Markdown files, each a skill named `<skill>/<file name without .md>` by the same rule, and its `workflows/` holds its task steps, each a skill named `<skill>/workflows/<file name without .md>`, so a reference and a workflow may share a file name. Every AI model gets each skill's name and first line, or its `description`, and reads the skill itself when it needs it. A skill has no size limit. |
| `memory/` | Your memory notes. `MEMORY.md` is their bootstrap: write one line for each note, with the note's path in this folder. Every AI model gets `MEMORY.md` at the start of a conversation, searches notes when it needs memory, and reads notes by id. Keep `MEMORY.md` under 4 KB. A note is a Markdown file whose name ends in `.md`. Jarvis reads no note whose name or folder name starts with a dot, and nothing in `inbox/`: keep a note there until you have checked it. |
| `state/` | Work in progress. This is the one part of the folder that Jarvis's file tools can read or change. They refuse every other path in the folder, a file of your own that this table does not name included. Jarvis tells every AI model where this folder is. |
| `.claude/settings.json`, `.codex/config.toml` | Settings that turn off Claude Code's and Codex's own memory for your own session in this folder. |

A size limit applies only to what every conversation starts with: `AGENTS.md`, at 8 KB, and the list of skill names and first lines, at 8 KB for the whole list and 256 entries in `skills/own/` or in one skill's `references/` or `workflows/`. That text takes room in every conversation. Jarvis starts no conversation with a folder that is over a limit, and says which limit. A skill, a reference or a workflow takes room only in the conversation that reads it, so it has no limit.

The folder gives Jarvis knowledge, never permission. A skill that says an action needs no question changes nothing: Jarvis still asks before it deletes a file, runs a command or sends something.

The AI models never run inside this folder. A setting, hook or server that you keep there for your own tools does not run in Jarvis. Each app's own memory is off while Jarvis uses the app.

### Agent fleet requests

A request for your agent fleet goes to the mailbox of your Jarvis session, the session that runs it. Jarvis shows you the text and asks you to confirm it, then hands it to that mailbox in the home folder with the kendex mail tool there, and tells you the row's id once the mailbox reads it back. The Jarvis session acts on the request when it next reads its mail; Jarvis does not check that a session is running; Start Jarvis at boot under Settings starts yours at every boot. A turn hands over one request. The mail tool and the Jarvis package's session command are the two programs in the home folder that VGS starts. Agent fleet under Setup installs it, and Jarvis offers the request once your Jarvis session has read this folder's mail.

<details>
<summary>Show command details</summary>

VGS starts and stops the session with `.agents/skills/jarvis/scripts/jarvis-session` of the Jarvis package in the home folder, which kendex installs. The session is the tmux session `jarvis` on your own tmux server, and `tmux attach -t jarvis` opens it.

</details>

### Memory add-ons

Jarvis searches notes in `memory/`. Its search index is private Jarvis state and rebuilds itself when it is missing.

Optional add-ons give another app its own view of the notes. Install them yourself and point each at `memory/` read-only.

- Basic Memory can use the folder. Basic Memory is AGPL software. VGS never bundles it.
- Obsidian can use the folder as a vault.
- QMD can use the folder for Markdown notes.

A note can carry front matter fields that Jarvis reads: `title`, `aliases`, `date` as `YYYY-MM-DD`, and `sources`. A `sources` value such as `web` tells Jarvis where the note came from, so it keeps asking before it sends that note's text out. `[[note]]` links connect notes and give backlinks when Jarvis reads them.

Semantic search is not built yet. VGS adds it only after measured search misses show that keyword search is not enough.

Jarvis asks the Realtime voice to speak each sentence of a result exactly. Jarvis counts formatting violations in the transcript of what the voice said. This check does not control the audio OpenAI makes.
