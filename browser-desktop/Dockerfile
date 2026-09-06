FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:99 HOME=/home/browser
RUN apt-get update && apt-get install -y --no-install-recommends \
  firefox-esr xvfb fluxbox x11vnc novnc websockify dbus-x11 ca-certificates \
  fonts-liberation pulseaudio ffmpeg python3 tini && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash browser
COPY start.sh /usr/local/bin/start-browser
COPY bridge.py /usr/local/bin/browser-bridge.py
RUN chmod +x /usr/local/bin/start-browser && mkdir -p /home/browser && chown -R browser:browser /home/browser
RUN chmod +x /usr/local/bin/browser-bridge.py
EXPOSE 6080 5900 8091
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["/usr/local/bin/start-browser"]
