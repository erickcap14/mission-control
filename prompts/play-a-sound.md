# Claude Code Audio Notification Setup Prompt

Use this prompt to configure Claude Code to play a sound when it needs your input:

---

## Prompt:

```
I want to configure Claude Code to play an audio notification whenever you need my input (questions, permissions, etc.) so I can multitask while you work autonomously.

Please update my .claude/settings.local.json file to add hooks that:

1. Play this sound file: [REPLACE WITH YOUR SOUND FILE PATH]
   - Use the macOS `afplay` command
   - Make sure to properly handle any spaces in the file path

2. Configure these hooks:
   - PreToolUse hook with AskUserQuestion matcher (for explicit questions)
   - Notification hook (for any notification requiring attention)

3. Preserve any existing permissions in my settings file

Use a 10-second timeout for the audio playback. This is a combined approach for comprehensive coverage of all cases where I need to respond to Claude Code.
```

---

## Example with actual file path:

```
I want to configure Claude Code to play an audio notification whenever you need my input (questions, permissions, etc.) so I can multitask while you work autonomously.

Please update my .claude/settings.local.json file to add hooks that:

1. Play the sound file that is in the /sounds directory.
   - Use the macOS `afplay` command
   - Make sure to properly handle any spaces in the file path

2. Configure these hooks:
   - PreToolUse hook with AskUserQuestion matcher (for explicit questions)
   - Notification hook (for any notification requiring attention)

3. Preserve any existing permissions in my settings file

Use a 10-second timeout for the audio playback. This is a combined approach for comprehensive coverage of all cases where I need to respond to Claude Code.
```

---

## What this does:

Claude Code will automatically:
- Read your current settings.local.json
- Add the PreToolUse and Notification hooks
- Configure both to play your chosen sound file
- Keep all your existing permissions intact

---

## For Windows users:

Replace the `afplay` command with:
```
powershell -c (New-Object Media.SoundPlayer "[SOUND_FILE_PATH]").PlaySync()
```

For Linux users:
```
aplay "[SOUND_FILE_PATH]"
```
or
```
paplay "[SOUND_FILE_PATH]"
```

---

## Notes:

- The sound file can be .mp3, .wav, .m4a, or any format supported by your OS
- You can use any notification sound you like - download one or record your own
- The timeout (10 seconds) prevents the hook from hanging if audio playback fails
- This works across all Claude Code projects once configured in each project's .claude/settings.local.json
