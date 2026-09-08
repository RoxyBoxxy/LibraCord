const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");
const config = dotenv.config({ path: path.join(root, ".env.screenshots.local"), quiet: true }).parsed || {};
const targetUrl = process.env.SCREENSHOT_URL || config.SCREENSHOT_URL;
const username = process.env.SCREENSHOT_USERNAME || config.SCREENSHOT_USERNAME;
const password = process.env.SCREENSHOT_PASSWORD || config.SCREENSHOT_PASSWORD;
const outputDirectory = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.join(root, "docs", "assets", "screenshots");

if (!targetUrl || !username || !password) {
  console.error("Configure SCREENSHOT_URL, SCREENSHOT_USERNAME, and SCREENSHOT_PASSWORD in .env.screenshots.local.");
  process.exit(1);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function setInputValue(window, selector, value) {
  return window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
}

async function clickMatching(window, pattern) {
  return window.webContents.executeJavaScript(`(() => {
    const pattern = new RegExp(${JSON.stringify(pattern)}, "i");
    const candidates = [...document.querySelectorAll("button, a, [role=button]")];
    const target = candidates.find((element) => pattern.test([
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ].filter(Boolean).join(" ")));
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function clickSelector(window, selector) {
  return window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function capture(window, filename) {
  window.webContents.invalidate();
  await wait(1200);
  // Hidden Electron windows can return the previous compositor frame after a
  // modal transition. Prime capturePage once, then request a fresh frame.
  await window.webContents.capturePage();
  window.webContents.invalidate();
  await wait(250);
  const image = await window.webContents.capturePage();
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, filename), image.toPNG());
  console.log(`Captured ${filename}`);
}

async function sanitizeDemoContent(window) {
  await window.webContents.executeJavaScript(`(() => {
    const demoMessages = [
      "Hello from LibraCord!",
      "Realtime messages appear instantly.",
      "Welcome to the community 👋",
    ];
    document.querySelectorAll(".messages > article > div > p").forEach((node, index) => {
      node.textContent = demoMessages[index] || "A community conversation.";
    });
    document.querySelectorAll(".themed-member small").forEach((node, index) => {
      if (index === 0) node.textContent = "Building a better fediverse";
    });
  })()`);
}

async function main() {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: "#090b16",
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  await window.loadURL(targetUrl);
  await wait(1500);

  const hasPassword = await window.webContents.executeJavaScript("Boolean(document.querySelector('input[type=password]'))");
  if (hasPassword) {
    const userSelector = "input[type=email], input[autocomplete=username], input[name*=email i], input[name*=user i]";
    const passwordSelector = "input[type=password]";
    if (!(await setInputValue(window, userSelector, username))) throw new Error("Could not find the username input.");
    if (!(await setInputValue(window, passwordSelector, password))) throw new Error("Could not find the password input.");
    const submitted = await window.webContents.executeJavaScript(`(() => {
      const password = document.querySelector("input[type=password]");
      const form = password?.closest("form");
      if (form) { form.requestSubmit(); return true; }
      return false;
    })()`);
    if (!submitted && !(await clickMatching(window, "sign in|log in|login|continue"))) throw new Error("Could not submit the login form.");
    await wait(3500);
  }

  if (await clickSelector(window, 'button[title="User settings"]')) {
    await capture(window, "05-profile-customization.png");
    await clickMatching(window, "Back to chat");
  }

  await clickMatching(window, "^LibraCord Home$");
  await wait(500);
  await clickMatching(window, "^Pulse$");
  await capture(window, "01-overview.png");
  if (await clickMatching(window, "^Friends$")) {
    await capture(window, "02-friends.png");
  }
  if (await clickMatching(window, "^Woof")) {
    await wait(300);
    if (await clickMatching(window, "^WoofCommunity$")) {
      await clickMatching(window, "^general$");
      await sanitizeDemoContent(window);
      await capture(window, "03-community.png");
      if (await clickSelector(window, '.avatar-button[title="View profile"]')) {
        await capture(window, "04-profile.png");
        await clickSelector(window, '.profile-card-close[title="Close profile"]');
      }
      if (await clickSelector(window, 'button[title="User settings"]')) {
        await capture(window, "05-profile-customization.png");
      }
    }
  }
  window.destroy();
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error.message);
  app.exit(1);
});
