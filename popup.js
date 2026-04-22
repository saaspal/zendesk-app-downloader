const statusEl = document.getElementById("status");
const versionBox = document.getElementById("version-box");
const versionSel = document.getElementById("version-list");
const downloadBtn = document.getElementById("download-btn");
const errorEl = document.getElementById("error");

let auth = null; // {cookies, zafHeaders, origin}
let appId = null;
let subdomain = null;
let appVersions = [];

const ZENDESK_GARDEN_VERSION = "^9.12.2";

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
  appVersions = j.versions;
  populateSelect(j.versions);
  statusEl.innerHTML = `${j.versions[0] ? "Choose a version for the app : <strong>"+j.versions[0].title+"</strong>" : "Please visit an app page"}`;
  versionBox.hidden = false;
}

// 4.  populate <select>
function populateSelect(versions) {
  versions.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = v.versionId;
    const versionNumber = versions.length - i;
    opt.textContent = `Version ${versionNumber} ${i === 0 ? "(latest)" : ""}`;
    opt.dataset.versionNumber = versionNumber;
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
  const advancedMode = document.getElementById("advanced-mode").checked;
  const excludeJson = document.getElementById("exclude-json").checked;

  if (advancedMode) {
    await buildAdvancedZip(zip, files, excludeJson);
  } else {
    const versionId = versionSel.value;
    const versionObj = appVersions.find((v) => v.versionId == versionId);
    const appTitle = versionObj ? versionObj.title || "App" : "App";

    Object.entries(files).forEach(([name, content]) => {
      if (excludeJson && name.endsWith(".json") && name !== "manifest.json") return; // exclude App Builder system files
      
      content = fixAppBuilderCodeArtifacts(name, content);
      if (name === "manifest.json") {
        content = fixManifestJson(content, appTitle);
      }
      
      zip.file(name, content);
    });
  }

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

function fixAppBuilderCodeArtifacts(name, content) {
  if (name.endsWith(".js") || name.endsWith(".jsx")) {
    // Revert Zendesk JSON encoded newlines back to escaped characters inside string literals 
    content = content.replace(/'\n'/g, "'\\n'").replace(/"\n"/g, '"\\n"');
    content = content.replace(/'\r\n'/g, "'\\n'").replace(/"\r\n"/g, '"\\n"');
  }
  return content;
}

function fixManifestJson(content, appTitle) {
  try {
    const manifestObj = JSON.parse(content);
    manifestObj.name = appTitle; // Bind manifest name string to Application Title
    if (manifestObj.location) {
      for (const product in manifestObj.location) {
         for (const locationType in manifestObj.location[product]) {
             const locVal = manifestObj.location[product][locationType];
             if (typeof locVal === 'string') {
                 manifestObj.location[product][locationType] = "http://localhost:3000";
             } else if (locVal && typeof locVal === 'object' && locVal.url) {
                 locVal.url = "http://localhost:3000";
             }
         }
      }
    }
    return JSON.stringify(manifestObj, null, 2);
  } catch(e) { 
    console.error("Failed to parse/modify manifest.json", e);
    return content;
  }
}

async function getBoilerplateFiles() {
  return new Promise((resolve, reject) => {
    chrome.runtime.getPackageDirectoryEntry((root) => {
      root.getDirectory("boilerplate", { create: false }, async (bpDir) => {
        const results = [];
        
        async function readDir(dirEntry, currentPath) {
          const reader = dirEntry.createReader();
          let entries = [];
          
          let readBatch;
          do {
            readBatch = await new Promise((res) => reader.readEntries(res));
            entries = entries.concat(readBatch);
          } while (readBatch.length > 0);

          for (const entry of entries) {
            if (entry.isFile) {
              results.push(currentPath + entry.name);
            } else if (entry.isDirectory) {
              await readDir(entry, currentPath + entry.name + '/');
            }
          }
        }

        await readDir(bpDir, "boilerplate/");
        resolve(results);
      }, (err) => {
        console.error("Could not read boilerplate directory", err);
        resolve([]); // fallback or handle error
      });
    });
  });
}

async function buildAdvancedZip(zip, files, excludeJson) {
  const versionId = versionSel.value;
  const versionObj = appVersions.find((v) => v.versionId == versionId);
  const appTitle = versionObj ? versionObj.title || "App" : "App";
  const kebabName = appTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const versionNumber = versionSel.options[versionSel.selectedIndex].dataset.versionNumber || "1";

  const zdImports = new Set();
  const regex = /['"]@zendeskgarden\/([^'"]+)['"]/g;

  // Dynamically fetch file list
  const dynamicBoilerplateFiles = await getBoilerplateFiles();

  // Process API files first
  for (let [name, content] of Object.entries(files)) {
    if (excludeJson && name.endsWith(".json") && name !== "manifest.json") {
      continue; // exclude system json files
    }

    content = fixAppBuilderCodeArtifacts(name, content);

    if (name.endsWith(".js") || name.endsWith(".jsx")) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        zdImports.add(`@zendeskgarden/${match[1]}`);
      }
    }
    
    if (name === "manifest.json") {
      content = fixManifestJson(content, appTitle);
    }

    const targetPath = name === "manifest.json" ? `src/manifest.json` : `src/app/${name}`;
    zip.file(targetPath, content);
  }

  // Fetch and inject boilerplate files
  for (const f of dynamicBoilerplateFiles) {
    const res = await fetch(chrome.runtime.getURL ? chrome.runtime.getURL(f) : f);
    let content;
    if (f.endsWith(".png")) {
      content = await res.arrayBuffer();
    } else {
      content = await res.text();
    }

    const destPath = f.replace(/^boilerplate\//, "");

    if (destPath === "package.json") {
      try {
        const pkg = JSON.parse(content);
        pkg.name = kebabName;
        pkg.version = `1.0.${versionNumber}`;
        if (!pkg.dependencies) pkg.dependencies = {};
        zdImports.forEach(dep => {
          pkg.dependencies[dep] = ZENDESK_GARDEN_VERSION;
        });
        content = JSON.stringify(pkg, null, 2);
      } catch (e) {
        console.error("Failed to parse package.json", e);
      }
    }

    if (destPath === "src/translations/en.json") {
      try {
        const trans = JSON.parse(content);
        if (trans.app) {
          trans.app.name = appTitle;
          trans.app.title = appTitle;
        }
        content = JSON.stringify(trans, null, 2);
      } catch (e) {
        console.error("Failed to parse en.json", e);
      }
    }

    if (destPath === "src/manifest.json") {
      if (Object.keys(files).includes("manifest.json")) {
        continue; // skip boilerplate manifest because API override is already there
      }
    }

    zip.file(destPath, content);
  }
}
