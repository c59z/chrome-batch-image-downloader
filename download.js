import {collectImages} from "./collect.js";

const $ = id => document.getElementById(id);
const sourceId = Number(location.hash.slice(1));
let directory;
let entries = [];
let busy = false;

function selection() {
  return entries.filter(entry => !entry.isCover || $("cover").checked);
}

function showSelection() {
  const chosen = selection();
  const width = Math.max(2, String(chosen.length).length);
  for (const entry of entries) entry.state.parentElement.hidden = entry.isCover && !$("cover").checked;
  chosen.forEach((entry, index) => {
    entry.prefix = String(index + 1).padStart(width, "0") + "_";
    entry.link.textContent = entry.prefix + entry.name;
  });
  $("status").textContent = "Found " + entries.length + " originals. Selected " + selection().length + "." + skipMessage;
  refresh();
}

let skipMessage = "";
$("cover").onchange = showSelection;
$("subfolder").oninput = refresh;

function folderError(name) {
  if (!name.trim()) return "Enter a folder name.";
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name))
    return "Remove invalid characters and any trailing space or period.";
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))
    return "Choose a name that Windows allows.";
  return "";
}
function refresh() {
  const pending = selection().some(entry => !entry.done);
  const started = entries.some(entry => entry.done);
  const name = $("subfolder").value;
  const error = folderError(name);
  $("destination").textContent = error || (directory ? "Save to " + directory.name + " / " + name : "Choose a parent folder.");
  $("subfolder").setCustomValidity(error);
  $("subfolder").disabled = busy || started;
  $("folder").disabled = busy || started || !pending;
  $("save").disabled = busy || !directory || !!error || !pending;
  $("ruleForm").querySelector("button").disabled = busy;
  $("selector").disabled = busy;
  $("cover").disabled = busy || started;
}

async function inspect(event) {
  event?.preventDefault();
  if (busy) return;
  busy = true;
  entries = [];
  $("save").textContent = "Download";
  $("list").replaceChildren();
  $("coverOption").hidden = true;
  $("cover").checked = false;
  refresh();
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: {tabId: sourceId}, func: collectImages, args: [$("selector").value.trim()]
    });
    const data = frame.result;
    if (!data || data.error) throw new Error(data?.error || "Could not read the page.");
    $("source").textContent = data.title;
    for (const item of data.images) {
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.textContent = item.name;
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const state = document.createElement("small");
      row.append(link, state);
      $("list").append(row);
      const isCover = data.images.length > 1 && /^cover\.(?:jpe?g|png|webp|avif|gif)$/i.test(item.name);
      entries.push({...item, link, state, isCover, done: false});
      if (isCover) {
        $("coverOption").hidden = false;
        $("coverName").textContent = item.name;
      }
    }
    skipMessage = data.skipped ? " Skipped " + data.skipped + " without an original image link." : "";
    showSelection();
    if (!entries.length) $("rules").open = true;
  } catch (err) {
    $("status").textContent = err.message + " Keep the source tab open. For local HTML, enable “Allow access to file URLs” in extension details.";
    $("rules").open = true;
  } finally { busy = false; refresh(); }
}

$("folder").onclick = async () => {
  try {
    directory = await showDirectoryPicker({id: "list-images", mode: "readwrite"});
  } catch (err) {
    if (err.name !== "AbortError") $("status").textContent = "Could not open folder: " + err.message;
  }
  refresh();
};

async function readImage(url) {
  const response = await fetch(url, {credentials:"include", signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error("HTTP " + response.status);
  if (/\/(?:thumbnails?|thumbs?|previews?)(?:\/|$)/i.test(new URL(response.url).pathname))
    throw new Error("The original link redirects to a preview.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("The server returned an empty file.");
  const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const head = String.fromCharCode(...bytes);
  let ext;
  if (head.startsWith("\xff\xd8\xff")) ext = "jpg";
  else if (head.startsWith("\x89PNG\r\n\x1a\n")) ext = "png";
  else if (/^GIF8[79]a/.test(head)) ext = "gif";
  else if (head.startsWith("RIFF") && head.slice(8,12) === "WEBP") ext = "webp";
  else if (head.slice(4,8) === "ftyp" && /avif|avis/.test(head)) ext = "avif";
  else if (head.startsWith("BM")) ext = "bmp";
  else if (/^(II\x2a\x00|MM\x00\x2a)/.test(head)) ext = "tif";
  else if (head.startsWith("\x00\x00\x01\x00")) ext = "ico";
  else if (blob.type.split(";")[0] === "image/svg+xml") {
    const xml = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
    if (xml.documentElement.localName === "svg") ext = "svg";
  }
  if (!ext) throw new Error("Expected an image. The server may have returned a login or error page.");
  return {blob, ext};
}

function safeName(raw, ext) {
  let name = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/[. ]+$/, "");
  let stem = name.replace(/\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|tiff?|webp)$/i, "");
  let suffix = name.slice(stem.length + 1);
  const aliases = {jpg:["jpg","jpeg","jfif"], tif:["tif","tiff"]};
  if (!(aliases[ext] || [ext]).includes(suffix.toLowerCase())) suffix = ext;
  stem = Array.from(stem || "image").slice(0, 96).join("");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = "_" + stem;
  return {stem, suffix};
}

async function writeNew(dir, item, image) {
  const {stem, suffix} = safeName(item.name, image.ext);
  for (let n = 0; ; n++) {
    const name = item.prefix + stem + (n ? " (" + n + ")" : "") + "." + suffix;
    try { await dir.getFileHandle(name); continue; }
    catch (err) {
      if (err.name === "TypeMismatchError") continue;
      if (err.name !== "NotFoundError") throw err;
    }
    const handle = await dir.getFileHandle(name, {create:true});
    let stream;
    try {
      stream = await handle.createWritable();
      await stream.write(image.blob);
      await stream.close();
    } catch (err) {
      if (stream) await stream.abort().catch(() => {});
      if ((await handle.getFile()).size === 0) await dir.removeEntry(name);
      throw err;
    }
    return name;
  }
}

$("save").onclick = async () => {
  const folderName = $("subfolder").value;
  if (busy || !directory || folderError(folderName)) return;
  const chosen = selection();
  const pending = chosen.filter(item => !item.done);
  const origins = [...new Set(pending.map(item => new URL(item.url).origin + "/*"))];
  busy = true;
  refresh();
  try {
    if (!await chrome.permissions.request({origins})) throw new Error("Allow access to the image hosts to download originals.");
    let target;
    try {
      target = await directory.getDirectoryHandle(folderName, {create:true});
    } catch (err) {
      if (err.name === "TypeMismatchError") throw new Error("A file already has that name. Choose another folder name.");
      throw err;
    }
    let count = chosen.length - pending.length;
    for (const item of pending) {
      $("status").textContent = "Saved " + count + " / " + chosen.length + ". Keep this tab open.";
      item.state.textContent = "Downloading…";
      try {
        const image = await readImage(item.url);
        const name = await navigator.locks.request("save-list-image", () => writeNew(target, item, image));
        item.state.textContent = "Saved · " + name;
        item.done = true;
        count++;
      } catch (err) { item.state.textContent = "Failed · " + err.message; }
    }
    const failed = chosen.length - count;
    $("status").textContent = "Saved " + count + " / " + chosen.length + "." + (failed ? " Failed: " + failed + "." : "");
    if (failed) $("save").textContent = "Retry failed downloads";
  } catch (err) { $("status").textContent = err.message; }
  finally { busy = false; refresh(); }
};
$("ruleForm").onsubmit = inspect;
inspect();