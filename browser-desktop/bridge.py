#!/usr/bin/env python3
import json, os, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

proc = None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        global proc
        if self.path != '/stream':
            self.send_response(404); self.end_headers(); return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('content-length','0'))))
            target = str(body['rtmpUrl'])
            if not target.startswith('rtmp://'):
                raise ValueError('RTMP URL required')
            if proc: proc.terminate()
            proc = subprocess.Popen([
                'ffmpeg','-hide_banner','-loglevel','warning','-f','x11grab','-video_size','1280x720',
                '-framerate',str(body.get('fps',30)),'-i',':99+80,90','-f','pulse','-i','browser.monitor',
                '-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-crf','19',
                '-b:v','8M','-maxrate','8M','-bufsize','1M','-g','30','-keyint_min','30',
                '-sc_threshold','0','-pix_fmt','yuv420p','-threads','4',
                '-c:a','aac','-ar','48000','-b:a','160k','-af','aresample=async=1','-f','flv',target
            ], env={**os.environ, 'PULSE_SERVER':'unix:/tmp/pulse/native', 'PULSE_RUNTIME_PATH':'/tmp/pulse'})
            self.send_response(202); self.end_headers(); self.wfile.write(b'{"ok":true}')
        except Exception as exc:
            self.send_response(400); self.end_headers(); self.wfile.write(json.dumps({'error':str(exc)}).encode())

HTTPServer(('0.0.0.0', 8091), Handler).serve_forever()
