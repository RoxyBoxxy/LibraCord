#!/bin/sh
set -eu
mkdir -p /tmp/.X11-unix
rm -rf /home/browser/.mozilla /home/browser/.cache/mozilla
Xvfb :99 -screen 0 1440x900x24 -ac +extension RANDR &
sleep 1
mkdir -p /tmp/pulse
chown -R browser:browser /tmp/pulse
su -s /bin/sh browser -c 'XDG_RUNTIME_DIR=/tmp/pulse PULSE_RUNTIME_PATH=/tmp/pulse pulseaudio --daemonize=true --exit-idle-time=-1 --load="module-native-protocol-unix auth-anonymous=1" >/tmp/pulseaudio.log 2>&1' || true
su -s /bin/sh browser -c 'XDG_RUNTIME_DIR=/tmp/pulse PULSE_RUNTIME_PATH=/tmp/pulse PULSE_SERVER=unix:/tmp/pulse/native pactl load-module module-null-sink sink_name=browser sink_properties=device.description=LibraCord' >/dev/null 2>&1 || true
python3 /usr/local/bin/browser-bridge.py >/tmp/browser-bridge.log 2>&1 &
su -s /bin/sh browser -c 'DISPLAY=:99 fluxbox >/tmp/fluxbox.log 2>&1' &
sleep 1
su -s /bin/sh browser -c 'DISPLAY=:99 XDG_RUNTIME_DIR=/tmp/pulse PULSE_RUNTIME_PATH=/tmp/pulse PULSE_SERVER=unix:/tmp/pulse/native PULSE_SINK=browser firefox-esr --no-remote --new-window --width 1440 --height 900 about:blank >/tmp/firefox.log 2>&1' &
x11vnc -display :99 -forever -shared -rfbport 5900 -localhost -nopw -cursor arrow -clip 1440x900 >/tmp/x11vnc.log 2>&1 &
exec websockify --web=/usr/share/novnc 6080 localhost:5900
