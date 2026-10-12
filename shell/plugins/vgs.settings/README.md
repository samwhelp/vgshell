# Plugins

Plugins is the window where you manage your plugins, their settings and their shortcuts. Open it with `SUPER+M`, the plug in the bar, or Settings > Plugin settings in the launcher. Plugins is always on.

![The Settings plugin list window](../../../docs/images/plugins/vgs.settings-window.webp)

Screenshot made with `scripts/readme-shots.sh` in the nested sandbox, with the default theme at scale 2.

## Features

- Search for a plugin and open its page.
- Turn a plugin on or off. Plugins itself stays on.
- Show a plugin in the bar, or take it out while its other features stay on.
- Change a plugin's settings. Under Keys, select a shortcut and press its new keys. A shortcut can have more than one key: the add button listens for another, and Delete removes the one you select. Use my binding keeps one of your own Hyprland binds on the same keys.
- See which plugins need something from you. A plugin that is on shows Setup needed in the list while a setup step is open, and a warning icon while an optional tool is missing.
- Finish a plugin's setup under Setup: run its steps, and add, change or remove a key or token it stores. A masked field takes the key, and your keyring holds it. Install all missing installs its missing tools.
- Read a plugin's status under Details.
- Add a plugin from its git address, update it with its changes shown first, or remove it.
- Escape returns to the list, then closes the window.
