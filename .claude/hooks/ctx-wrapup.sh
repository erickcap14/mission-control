#!/bin/bash
# Fires when Claude stops.
#
# State machine (3 states, tracked via sentinel files):
#   1. ALERT only         → trigger wrapup (inject prompt to Claude)
#   2. ALERT + WRAPUP     → wrapup just finished; alert user to /clear (sound + notification)
#   3. No ALERT + WRAPUP  → context compacted; clean up sentinels

RAW_PATH="${PWD:-$(pwd)}"
SHORT_PATH="${RAW_PATH/#$HOME/~}"
PROJECT_KEY=$(echo "$SHORT_PATH" | awk -F'/' '{if(NF>2) print $(NF-1)"/"$NF; else print $0}' | tr '/~' '__')

ALERT_FILE="/tmp/claude_ctx_50_${PROJECT_KEY}"
WRAPUP_FILE="/tmp/claude_wrapup_triggered_${PROJECT_KEY}"
CLEAR_FILE="/tmp/claude_clear_notified_${PROJECT_KEY}"

# State 3: context compacted — reset for next high-context session
if [ ! -f "$ALERT_FILE" ] && [ -f "$WRAPUP_FILE" ]; then
    rm -f "$WRAPUP_FILE" "$CLEAR_FILE"
    exit 0
fi

# State 2: wrapup done — notify user to /clear (fire once)
if [ -f "$ALERT_FILE" ] && [ -f "$WRAPUP_FILE" ] && [ ! -f "$CLEAR_FILE" ]; then
    touch "$CLEAR_FILE"
    afplay /System/Library/Sounds/Hero.aiff &>/dev/null &
    osascript -e 'display notification "Wrapup complete — type /clear then /gogogo" with title "Claude Code" subtitle "Session ready to reset"' &>/dev/null &
    exit 0
fi

# State 1: first stop after context ≥50% — trigger wrapup
if [ -f "$ALERT_FILE" ] && [ ! -f "$WRAPUP_FILE" ]; then
    touch "$WRAPUP_FILE"
    echo "CONTEXT WINDOW ≥50%: Find a good stopping point in the current task, then run /wrapup to commit changes, update docs, and close this session cleanly. After /wrapup completes, tell the user to type /clear to reset the conversation, then /gogogo which will use multiple agents to reload context in parallel."
fi
