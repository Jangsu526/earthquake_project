"""Verify localhost:3000 input menus with installed Windows Chrome; stdlib only.

Run from earthquake_project:
  .venv/Scripts/python.exe seismic-ai-dashboard/scripts/verify-input-menus.py
No prediction is executed by default. --history checks DB history and reload;
--history --predict also executes one real STEAD inference and saves a DB record.
A separate temporary browser profile is removed on exit.
"""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request


class DevTools:
    def __init__(self, url):
        address = urllib.parse.urlparse(url)
        self.connection = socket.create_connection((address.hostname, address.port), timeout=10)
        self.buffer = b""
        self.sequence = 0
        self.events = []
        key = base64.b64encode(os.urandom(16)).decode()
        self.connection.sendall((
            f"GET {address.path} HTTP/1.1\r\nHost: {address.netloc}\r\n"
            f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        while b"\r\n\r\n" not in self.buffer:
            self.buffer += self.connection.recv(4096)
        header, self.buffer = self.buffer.split(b"\r\n\r\n", 1)
        if header.split(b" ", 2)[1] != b"101":
            raise RuntimeError("Chrome DevTools WebSocket handshake failed: " + header.split(b"\r\n", 1)[0].decode())

    def read(self, length):
        while len(self.buffer) < length:
            chunk = self.connection.recv(65536)
            if not chunk:
                raise RuntimeError("Chrome DevTools connection closed")
            self.buffer += chunk
        data, self.buffer = self.buffer[:length], self.buffer[length:]
        return data

    def send(self, data, opcode=1):
        mask = os.urandom(4)
        length = len(data)
        header = bytes([0x80 | opcode])
        if length < 126:
            header += bytes([0x80 | length])
        elif length < 65536:
            header += bytes([0x80 | 126]) + struct.pack("!H", length)
        else:
            header += bytes([0x80 | 127]) + struct.pack("!Q", length)
        self.connection.sendall(header + mask + bytes(byte ^ mask[i % 4] for i, byte in enumerate(data)))

    def receive(self):
        fragments = b""
        while True:
            first, second = self.read(2)
            length = second & 127
            if length == 126:
                length = struct.unpack("!H", self.read(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self.read(8))[0]
            mask = self.read(4) if second & 128 else None
            payload = self.read(length)
            if mask:
                payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
            opcode = first & 15
            if opcode == 8:
                raise RuntimeError("Chrome closed the DevTools connection")
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode in (0, 1):
                fragments += payload
                if first & 128:
                    return json.loads(fragments)

    def call(self, method, params=None):
        self.sequence += 1
        self.send(json.dumps({"id": self.sequence, "method": method, "params": params or {}}).encode())
        while True:
            message = self.receive()
            if "method" in message:
                self.events.append(message)
                self.events = self.events[-500:]
            if message.get("id") == self.sequence:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message.get("result", {})

    def evaluate(self, expression):
        response = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in response:
            raise RuntimeError(response["exceptionDetails"])
        return response.get("result", {}).get("value")


STATE = """(() => {
  const visible = e => !!e && e.getBoundingClientRect().width > 0 &&
    e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' &&
    getComputedStyle(e).display !== 'none';
  return {
    menus: [...document.querySelectorAll('.input-modes button')].filter(visible).map(e => e.textContent.trim()),
    selected: document.querySelector('.input-modes button[aria-pressed="true"]')?.textContent.trim(),
    textarea: visible(document.querySelector('#waveform-json')),
    validate: [...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'JSON 검증 및 파형 표시' && visible(e)),
    file: visible(document.querySelector('#waveform-file')),
    stead: visible(document.querySelector('#stead-sample')),
    day17: !!document.body?.textContent.includes('DAY 17'),
  };
})()"""


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    chrome = Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Google/Chrome/Application/chrome.exe"
    if not chrome.exists():
        raise RuntimeError("Installed Windows Chrome was not found")
    with tempfile.TemporaryDirectory(prefix="seismic-menu-check-", ignore_cleanup_errors=True) as profile:
        browser = subprocess.Popen([
            str(chrome), "--headless", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", "--disable-extensions", "--disable-background-networking",
            "--remote-debugging-port=0", f"--user-data-dir={profile}", "http://localhost:3000",
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        devtools = None
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 30
            while not port_file.exists():
                if time.monotonic() > deadline:
                    raise RuntimeError("Chrome did not start")
                time.sleep(0.2)
            port = port_file.read_text().splitlines()[0]
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=10) as response:
                pages = json.load(response)
            page = next(page for page in pages if page["type"] == "page")
            devtools = DevTools(page["webSocketDebuggerUrl"])
            devtools.call("Runtime.enable")
            devtools.call("Log.enable")
            devtools.call("Network.enable")
            devtools.call("Page.reload", {"ignoreCache": True})
            deadline = time.monotonic() + 30
            while True:
                state = devtools.evaluate(STATE)
                if len(state["menus"]) == 3 and state["day17"]:
                    break
                if time.monotonic() > deadline:
                    raise AssertionError(f"Latest menus are not visible: {state}")
                time.sleep(0.3)
            expected = ["STEAD 샘플", "JSON 붙여넣기", "JSON 파일"]
            assert state["menus"] == expected and state["stead"], state
            print("PASS: localhost:3000 renders DAY 17 and all three visible input menus")
            for name, fields in ([] if "--history" in sys.argv else [("JSON 붙여넣기", ("textarea", "validate")), ("JSON 파일", ("file",)), ("STEAD 샘플", ("stead",))]):
                # SSR buttons can be visible before React hydration has attached handlers.
                # Wait for observable interaction rather than relying on a fixed delay.
                deadline = time.monotonic() + 30
                while True:
                    devtools.evaluate("[...document.querySelectorAll('.input-modes button')].find(e => e.textContent.trim() === " + json.dumps(name) + ")?.click()")
                    time.sleep(0.2)
                    state = devtools.evaluate(STATE)
                    if state.get("selected") == name and all(state.get(field) for field in fields):
                        break
                    if time.monotonic() > deadline:
                        raise AssertionError(f"Menu interaction failed: {state}; page: " + str(devtools.evaluate("document.body?.innerText.slice(0, 2500)")))
                print(f"PASS: clicking {name} displays its controls")
            if "--history" in sys.argv:
                def wait_history(expected_first=None):
                    deadline = time.monotonic() + (140 if expected_first is not None else 30)
                    while True:
                        try:
                            snapshot = devtools.evaluate("""(() => ({
                              loading: document.querySelector('#history')?.getAttribute('aria-busy'),
                              ids: [...document.querySelectorAll('#history [data-record-id]')].map(e=>Number(e.dataset.recordId)),
                              error: document.querySelector('#history [role=alert]')?.textContent,
                              empty: document.querySelector('#history')?.textContent.includes('저장된 추론 이력이 없습니다.')
                            }))()""")
                            if snapshot.get("error"):
                                raise AssertionError(snapshot["error"])
                            if snapshot.get("loading") == "false" and (snapshot["ids"] or snapshot.get("empty")):
                                if expected_first is None or (snapshot["ids"] and snapshot["ids"][0] > expected_first):
                                    return snapshot["ids"]
                        except RuntimeError:
                            # Navigation can briefly destroy the execution context.
                            pass
                        if time.monotonic() > deadline:
                            raise AssertionError("DB history did not load: " + str(snapshot) + "; browser errors: " + str([event for event in devtools.events if event["method"] in ("Runtime.exceptionThrown", "Network.loadingFailed", "Log.entryAdded", "Runtime.consoleAPICalled")][-20:]))
                        time.sleep(0.3)

                ids = wait_history()
                api = devtools.evaluate("""(async () => {
                  const response = await fetch('/api/predictions?limit=10', {cache:'no-store'});
                  if (!response.ok) throw Error('History API failed');
                  return response.json();
                })()""")
                expected_ids = sorted([row["id"] for row in api["predictions"]], reverse=True)
                assert ids == expected_ids, (ids, expected_ids)
                print(f"PASS: actual browser DB history matches API, newest first: {ids}")
                if "--predict" in sys.argv:
                    previous_id = ids[0] if ids else 0
                    devtools.evaluate("""(() => {
                      const select = document.querySelector('#stead-sample');
                      select.value = '152A.N4_20180623135517_EV';
                      select.dispatchEvent(new Event('change', {bubbles:true}));
                    })()""")
                    deadline = time.monotonic() + 20
                    while not devtools.evaluate("!!document.querySelector('.primary-button') && !document.querySelector('.primary-button').disabled"):
                        # A development-server refresh may replace the select after the first event.
                        devtools.evaluate("""(() => {
                          const select = document.querySelector('#stead-sample');
                          if (select && !select.disabled && !select.value) {
                            select.value = '152A.N4_20180623135517_EV';
                            select.dispatchEvent(new Event('change', {bubbles:true}));
                          }
                        })()""")
                        if time.monotonic() > deadline:
                            raise AssertionError("STEAD sample did not become ready: " + str(devtools.evaluate("({selected:document.querySelector('#stead-sample')?.value,status:document.querySelector('#input-status')?.textContent,error:document.querySelector('.run-area [role=alert]')?.textContent})")))
                        time.sleep(0.2)
                    devtools.evaluate("document.querySelector('.primary-button').click()")
                    ids = wait_history(previous_id)
                    print(f"PASS: successful real STEAD prediction refreshes DB history, new ID {ids[0]}")
                devtools.call("Page.reload", {"ignoreCache": True})
                reloaded = wait_history()
                assert reloaded == ids, (reloaded, ids)
                print(f"PASS: page reload restores the same DB records: {reloaded}")
            devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
            time.sleep(0.3)
            assert devtools.evaluate(STATE)["menus"] == expected
            print("PASS: all three menus remain visible at 390px viewport")
        finally:
            if devtools:
                devtools.connection.close()
            # Only the separately launched test browser and its own children are stopped.
            subprocess.run(["taskkill", "/PID", str(browser.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            browser.wait(timeout=10)


if __name__ == "__main__":
    main()
