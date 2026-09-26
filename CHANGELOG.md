# Changelog

## 1.0.10

- Turn the Code Boy activity-bar icon into a show/hide toggle for the mascot.
- Persist mascot visibility across editor restarts.

## 1.0.9

- Render the draggable mascot natively in the editor workbench with an embedded sprite.
- Remove the overlay's dependency on localhost, CSP-sensitive scripts, and webview startup.
- Validate the injected browser snippet before modifying VS Code or Antigravity.

## 1.0.8

- Inline the compiled mascot overlay directly into the Workbench patch.
- Remove CSP-sensitive blob script injection from the overlay startup path.
- Keep localhost only for state, actions, and local sprite assets.

## 1.0.7

- Move the activity-bar click interception into the startup Workbench patch.
- Block the legacy sidebar before the localhost overlay bundle finishes loading.
- Queue mascot display when the icon is clicked during overlay startup.

## 1.0.6

- Make the Code Boy activity-bar icon open the editor mascot directly.
- Prevent the legacy sidebar webview from flashing when the icon is clicked.
- Always show the mascot on icon activation instead of accidentally toggling it off.

## 1.0.5

- Move Code Boy out of the sidebar room and directly over the active code editor.
- Add mouse dragging constrained to the editor, with editor-relative position persistence.
- Keep VS Code and Antigravity overlay connections isolated when both editors are running.
- Make the floating editor companion the default Code Boy surface.

## 1.0.0

- Original pixel companion, animated room and manifest-driven sprite system.
- Editor, diagnostics, task, debug and safe terminal activity reactions.
- Mood, energy, focus, happiness, boredom, XP, levels and local daily statistics.
- Manual music and vibe mode, optional Windows media and Spotify providers.
- Cosmetic unlocks, six room themes, developer gallery and accessibility controls.
