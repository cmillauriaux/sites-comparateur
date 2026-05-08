#!/usr/bin/env bash
# Retry wrapper around the Claude Code CLI. Modeled on adult-visual-novel.
# Usage: claude_retry -p --dangerously-skip-permissions "<prompt>"

claude_retry() {
  local max_attempts=3
  local attempt=1
  local delay=15

  while [ $attempt -le $max_attempts ]; do
    if claude "$@"; then
      return 0
    fi
    local exit_code=$?
    if [ $attempt -lt $max_attempts ]; then
      echo "claude exited $exit_code, retry $attempt/$max_attempts in ${delay}s..." >&2
      sleep $delay
      delay=$((delay * 2))
    fi
    attempt=$((attempt + 1))
  done

  echo "claude failed after $max_attempts attempts" >&2
  return 1
}

export -f claude_retry
