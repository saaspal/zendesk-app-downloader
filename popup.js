const statusEl = document.getElementById("status");
const versionBox = document.getElementById("version-box");
const versionSel = document.getElementById("version-list");
const downloadBtn = document.getElementById("download-btn");
const errorEl = document.getElementById("error");

let auth = null; // {cookies, zafHeaders, origin}
let appId = null;
let subdomain = null;

// 1.  figure out which Zendesk tab we are talking to
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];
  const u = new URL(tab.url);

  if (
    !u.hostname.includes(".zendesk.com") ||
    !u.pathname.includes("/admin/apps-integrations/apps/app-builder/")
  ) {
    return showError("Not on a Zendesk app-builder page.");
  }

  subdomain = u.hostname.replace(".zendesk.com", "");
  const m = u.pathname.match(/app-builder\/([a-f0-9-]+)/i);
  if (!m) return showError("Cannot extract appId from URL.");
  appId = m[1];

  // 2.  ask the content-script for cookies + headers
  try {
    auth = await chrome.tabs.sendMessage(tab.id, { type: "GET_AUTH" });
    if (!auth) throw new Error("No auth returned");
    await loadVersions();
  } catch (e) {
    showError(e.message);
  }
});

// 3.  fetch version list
async function loadVersions() {
  const api = `${auth.origin}/api/v2/app-builder/conversations/${appId}/versions`;
  const r = await fetch(api, {
    credentials: "include",
    headers: buildHeaders(),
  });
  if (!r.ok) throw new Error("Versions fetch failed: " + r.status);
  const j = await r.json();

  if (!j.versions || !j.versions.length) throw new Error("No versions.");
  populateSelect(j.versions);
  statusEl.textContent = "Choose a version:";
  versionBox.hidden = false;
}

// 4.  populate <select>
function populateSelect(versions) {
  versions.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = v.versionId;
    opt.textContent = `${v.title}  –  ${new Date(
      v.createdAt
    ).toLocaleString()} ${i === 0 ? "(latest)" : ""}`;
    versionSel.appendChild(opt);
  });
  versionSel.selectedIndex = 0;
  downloadBtn.disabled = false;
}

// 5.  download button
downloadBtn.onclick = async () => {
  const versionId = versionSel.value;
  if (!versionId) return;
  downloadBtn.disabled = true;
  try {
    const api = `${auth.origin}/api/v2/app-builder/conversations/${appId}/app-code?versionId=${versionId}`;
    const r = await fetch(api, {
      credentials: "include",
      headers: buildHeaders(),
    });
    if (!r.ok) throw new Error("Download failed: " + r.status);
    const { files } = await r.json();
    await saveZip(files);
  } catch (e) {
    showError(e.message);
  } finally {
    downloadBtn.disabled = false;
  }
};

// 6.  build headers (cookies go in Cookie header, zaf headers merged)
function buildHeaders() {
  const h = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Cookie: auth.cookies,
  };
  return Object.assign(h, auth.zafHeaders);
}

// 7.  create ZIP and save
async function saveZip(files) {
  const zip = new JSZip();
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `app-${appId}-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  statusEl.textContent = "Error";
  versionBox.hidden = true;
}
