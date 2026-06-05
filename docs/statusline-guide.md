# Status Line Setup Guide

## What Is This?

A persistent status bar at the bottom of your Claude Code terminal that shows real-time token usage with color-coded warnings:

```
Opus 4.5 | Used: 143k/200k | 6% until compact | in:0k cache:143k out:0k
```

**Why this matters for beginners:** Claude Code has a context window limit. When you hit it, the system "autocompacts" - summarizing your conversation to free up space. This can lose important details. The status line helps you stay aware of usage so you can proactively manage context (start fresh sessions, be concise, etc.) before autocompact kicks in.

---

## Quick Setup

Run this command in Claude Code:

```
/setup-statusline
```

That's it! Restart Claude Code and you'll see the status line.

---

## What the Colors Mean

The status line shows "% until compact" - how much usable space remains before autocompact triggers.

| Color | Meaning |
|-------|---------|
| **Green** | >40% until compact - You're comfortable |
| **Yellow** | 20-40% until compact - Getting tight, consider wrapping up |
| **Red + Bold** | <20% until compact - Danger zone, autocompact imminent |

---

## Why "Until Compact" Instead of "Free"?

Claude Code reserves ~22.5% of your context window as an **autocompact buffer**. This means:

| Context Window | Raw Capacity | Usable Before Autocompact |
|----------------|--------------|---------------------------|
| 200k tokens    | 200k         | ~155k (77.5%)             |

A naive "% free" calculation would show 28% free when you actually only have 4.6% usable space remaining. This status line calculates against the **usable capacity** so you get accurate warnings.

---

## Manual Installation

If you prefer to set this up manually instead of using `/setup-statusline`:

### Step 1: Create the Script

Create file `~/.claude/statusline.sh`:

```bash
#!/bin/bash
# Claude Code Status Line - Autocompact-aware context tracking
#
# TO REMOVE THIS FEATURE:
# 1. Delete this file: rm ~/.claude/statusline.sh
# 2. Remove "statusLine" block from ~/.claude/settings.json
#

input=$(cat)

# Parse JSON values
MODEL=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
CONTEXT_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
USAGE=$(echo "$input" | jq '.context_window.current_usage // null')

# ANSI color codes
RESET="\033[0m"
DIM="\033[2m"
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"

# HARDCODED: Autocompact buffer percentage (not exposed in statusLine JSON)
# Claude Code reserves ~22.5% of context window as autocompact buffer.
# Verify this value periodically by running /context and checking the buffer %.
AUTOCOMPACT_BUFFER_PERCENT=22.5

if [ "$USAGE" != "null" ] && [ "$CONTEXT_SIZE" != "0" ]; then
    # Extract token breakdown
    INPUT=$(echo "$USAGE" | jq '.input_tokens // 0')
    CACHE_CREATE=$(echo "$USAGE" | jq '.cache_creation_input_tokens // 0')
    CACHE_READ=$(echo "$USAGE" | jq '.cache_read_input_tokens // 0')
    OUTPUT=$(echo "$USAGE" | jq '.output_tokens // 0')

    # Calculate totals
    CURRENT=$((INPUT + CACHE_CREATE + CACHE_READ))
    TOTAL_K=$((CONTEXT_SIZE / 1000))
    CURRENT_K=$((CURRENT / 1000))

    # Calculate usable capacity (context minus autocompact buffer)
    USABLE_CAPACITY=$(awk "BEGIN {printf \"%.0f\", $CONTEXT_SIZE * (100 - $AUTOCOMPACT_BUFFER_PERCENT) / 100}")
    FREE_UNTIL_COMPACT=$((USABLE_CAPACITY - CURRENT))
    if [ "$FREE_UNTIL_COMPACT" -lt 0 ]; then
        FREE_UNTIL_COMPACT=0
    fi
    FREE_K=$((FREE_UNTIL_COMPACT / 1000))
    PERCENT_UNTIL_COMPACT=$((FREE_UNTIL_COMPACT * 100 / USABLE_CAPACITY))

    # Choose color based on % until autocompact
    if [ "$PERCENT_UNTIL_COMPACT" -lt 20 ]; then
        FREE_COLOR="${RED}${BOLD}"
    elif [ "$PERCENT_UNTIL_COMPACT" -lt 40 ]; then
        FREE_COLOR="${YELLOW}"
    else
        FREE_COLOR="${GREEN}"
    fi

    # Format: Model | Used/Total | % until compact | Breakdown
    printf "${DIM}${CYAN}%s${RESET} ${DIM}|${RESET} " "$MODEL"
    printf "${DIM}Used:${RESET} %dk/%dk " "$CURRENT_K" "$TOTAL_K"
    printf "${DIM}|${RESET} ${FREE_COLOR}%d%% until compact${RESET} " "$PERCENT_UNTIL_COMPACT"
    printf "${DIM}| in:%dk cache:%dk out:%dk${RESET}" "$((INPUT/1000))" "$(((CACHE_CREATE+CACHE_READ)/1000))" "$((OUTPUT/1000))"
else
    printf "${DIM}${CYAN}%s${RESET} ${DIM}| Context: Ready${RESET}" "$MODEL"
fi
```

### Step 2: Make Executable

```bash
chmod +x ~/.claude/statusline.sh
```

### Step 3: Update Settings

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
```

### Step 4: Restart Claude Code

---

## Requirements

- **jq**: JSON processor (install via `brew install jq` on macOS, `apt install jq` on Linux)
- **awk**: Standard on all Unix systems
- **Claude Code CLI**: v2.1.0 or later

---

## Uninstallation

```bash
# Remove the script
rm ~/.claude/statusline.sh

# Edit ~/.claude/settings.json and remove the "statusLine" block
```

---

## Verifying Accuracy

To confirm the status line matches Claude Code's internal tracking:

1. Run `/context` in Claude Code
2. Compare "Free space" percentage with "% until compact" in the status line
3. They should match (within rounding differences)

If they don't match, the autocompact buffer percentage may have changed. Update `AUTOCOMPACT_BUFFER_PERCENT` in the script.

---

## Customization

### Different Warning Thresholds

For earlier warnings, edit the script:

```bash
if [ "$PERCENT_UNTIL_COMPACT" -lt 30 ]; then
    FREE_COLOR="${RED}${BOLD}"
elif [ "$PERCENT_UNTIL_COMPACT" -lt 50 ]; then
    FREE_COLOR="${YELLOW}"
```

### Minimal Display

Just show the percentage:

```bash
printf "%d%% until compact" "$PERCENT_UNTIL_COMPACT"
```

### Adjust Buffer Percentage

If Claude Code changes its autocompact buffer:

```bash
AUTOCOMPACT_BUFFER_PERCENT=25  # or whatever the new value is
```

---

## How It Works

1. Claude Code calls your script with JSON payload via stdin
2. Script parses context window stats
3. Script calculates **usable capacity** = context size × 77.5%
4. Script calculates **% until compact** = remaining usable tokens ÷ usable capacity
5. Script outputs formatted, colorized text
6. Claude Code displays output as a persistent status bar

**Note:** This config lives in `~/.claude/` so it applies globally to all projects.
