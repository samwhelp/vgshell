# Cloud Sync

Cloud Sync keeps Google Drive folders on this computer and sends one folder of this computer to Google Drive. It runs every hour, also while VGS is closed, and never deletes a file.

![The Cloud Sync page in Settings](../../../docs/images/plugins/vgs.cloud-sync-page.webp)

Screenshot made with `scripts/readme-shots.sh` in the nested sandbox, with the default theme at scale 2.

## Features

- Folder pairs: each pair joins one Google Drive folder and one folder on this computer. A download pair copies the Drive folder to this computer. An upload pair copies the folder on this computer to Drive.
- Every hour, and when you select Sync now. One sync of a pair runs at a time, whoever starts it.
- Google Docs, Sheets, Slides and Drawings arrive as Word, Excel, PowerPoint and SVG files. A file that Cloud Sync sends to Drive stays a file.
- Nothing is deleted. A file you changed on this computer since the last download is kept in Cloud Sync's records, and the Drive version takes its place. A file that Drive removed stays on this computer. The window lists each one under To review, with Open for review, which opens the folders that hold its versions.
- Editor temporary files, unfinished downloads, Git and agent folders, `local/`, keys and credential files and old backups are never copied.
- A bar icon shows the state: up to date, syncing, paused, offline, sign-in needed or failed, with the count of files to review. Its tooltip names each folder pair and its state. It never shows a file name or an account.
- A window with the state, the last complete sync, how current the files are, the last problem, the folder pairs and the files to review, with Sync now, Pause and Resume.
- A notification when Cloud Sync needs you: a sign-in, a failed sync or files to review.
- Pause stays on after VGS or the computer restarts. Disabling the plugin does not stop the hourly sync.
- When Google Drive cannot be reached, the files stay as the last complete sync left them, and the window shows the time of that sync.

## Setup

Open the Cloud Sync page in Settings. The Setup section holds every step.

1. Select Set up Cloud Sync. A setup window starts the hourly sync.
2. Get the Google Drive keys from [Google Cloud credentials](https://console.cloud.google.com/apis/credentials). Create an OAuth client ID of type Desktop app for downloads, and a second one for the upload folder. Downloads only read your Drive. The upload client reaches only the files and folders that Cloud Sync made.
3. Under Google Drive keys, select Add key beside each client ID and client secret, and paste it into the masked field. VGS stores every key in your keyring.
4. Select Connect Google Drive, and Connect the upload folder when you use one. Google opens in your browser. Sign in and allow access. VGS stores the sign-in in your keyring.
5. Select Add a folder pair. A setup window asks for a name, the direction, the Google Drive folder and the folder on this computer. A folder pair cannot be your home folder, a Git repository or the whole Drive, and two pairs cannot overlap.

Remove a folder pair stops the sync of a pair. Its files stay on this computer and on Drive.

When the Cloud Sync status reads Sign-in needed, select Connect Google Drive again.

[developer.md](developer.md) states how a sync works, the files and the runner's commands.
