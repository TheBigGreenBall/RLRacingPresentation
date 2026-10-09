#!/usr/bin/env bash
# Render Remotion compositions to public/videos/<id>.mp4 plus a poster frame to public/posters/<id>.png.
# usage: scripts/render_videos.sh [CompositionId ...]   (default: all six). Works with macOS bash 3.2.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/videos public/posters
poster_frame() {
  case "$1" in
    RLLoop) echo 60 ;; EventTimeline) echo 290 ;; ScoringRule) echo 260 ;;
    DQRules) echo 230 ;; ObsLayoutBar) echo 290 ;; PPOPipeline) echo 290 ;; *) echo 0 ;;
  esac
}
if [ "$#" -eq 0 ]; then set -- RLLoop EventTimeline ScoringRule DQRules ObsLayoutBar PPOPipeline; fi
for id in "$@"; do
  echo "== $id"
  npx remotion still remotion/index.ts "$id" "public/posters/$id.png" --frame "$(poster_frame "$id")" --log=error
  npx remotion render remotion/index.ts "$id" "public/videos/$id.mp4" --codec h264 --crf 20 --log=error
done
ls -la public/videos public/posters
