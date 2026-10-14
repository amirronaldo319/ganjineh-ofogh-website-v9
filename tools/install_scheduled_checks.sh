#!/bin/sh
# Installs the daily health check and the weekly Lighthouse run as macOS LaunchAgents.
#   sh tools/install_scheduled_checks.sh [site-url]        (default: the shared GitHub Pages preview)
#   sh tools/install_scheduled_checks.sh --remove
#
# launchd jobs are not allowed to read ~/Desktop, so the three small tools and a copy of node_modules are staged in
# ~/.ganjineh-checks and the jobs run from there. Re-run this after changing tools/monitor.py or lighthouse_weekly.mjs.
# A failing check shows a macOS notification; every run is logged in ~/Library/Logs/ganjineh/.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$HOME/.ganjineh-checks"
AGENTS="$HOME/Library/LaunchAgents"
if [ "${1:-}" = "--remove" ]; then
  for n in monitor lighthouse; do
    launchctl unload "$AGENTS/com.ganjineh.$n.plist" 2>/dev/null || true
    rm -f "$AGENTS/com.ganjineh.$n.plist"
  done
  echo "removed (staged files stay in $STAGE)"; exit 0
fi
URL="${1:-https://amirronaldo319.github.io/ganjineh-ofogh}"
NODE="$(command -v node)"; PYTHON="$(command -v python3)"
mkdir -p "$STAGE/tools" "$AGENTS" "$HOME/Library/Logs/ganjineh"
cp "$HERE/tools/monitor.py" "$HERE/tools/run_scheduled_check.sh" "$HERE/tools/lighthouse_weekly.mjs" "$STAGE/tools/"
if [ ! -d "$STAGE/node_modules/lighthouse" ]; then
  mkdir -p "$STAGE/node_modules"
  cp -R "$HERE/node_modules/." "$STAGE/node_modules/"
fi
cat > "$AGENTS/com.ganjineh.monitor.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ganjineh.monitor</string>
  <key>WorkingDirectory</key><string>$STAGE</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>tools/run_scheduled_check.sh</string><string>monitor</string>
    <string>$PYTHON</string><string>tools/monitor.py</string><string>$URL</string><string>--preview</string><string>-q</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
</dict></plist>
PLIST
cat > "$AGENTS/com.ganjineh.lighthouse.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ganjineh.lighthouse</string>
  <key>WorkingDirectory</key><string>$STAGE</string>
  <key>EnvironmentVariables</key><dict><key>SSL_CERT_FILE</key><string>/etc/ssl/cert.pem</string></dict>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>tools/run_scheduled_check.sh</string><string>lighthouse</string>
    <string>$NODE</string><string>tools/lighthouse_weekly.mjs</string><string>$URL</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
</dict></plist>
PLIST
for n in monitor lighthouse; do
  plutil -lint "$AGENTS/com.ganjineh.$n.plist" >/dev/null
  launchctl unload "$AGENTS/com.ganjineh.$n.plist" 2>/dev/null || true
  launchctl load "$AGENTS/com.ganjineh.$n.plist"
done
echo "installed: monitor daily 08:30, Lighthouse Mondays 09:00 → $URL"
echo "run one now:  launchctl kickstart gui/\$(id -u)/com.ganjineh.monitor"
