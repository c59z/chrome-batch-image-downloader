// This function runs in the source tab's isolated world.
export function collectImages(selector) {
  const imageFile = /\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|tiff?|webp)$/i;
  const thumbPath = /\/(?:thumbnails?|thumbs?|previews?)(?:\/|$)/i;
  let roots;
  if (selector) {
    try { roots = [...document.querySelectorAll(selector)]; }
    catch { return {error: "Invalid CSS selector."}; }
  } else {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    roots = headings.filter(h => /^files$/i.test(h.textContent.trim()))
      .map(h => h.nextElementSibling).filter(Boolean);
    if (!roots.length) return {error: "No Files section found. Enter a list selector such as article ul.gallery."};
  }
  if (!roots.length) return {error: "No matching list. Check the CSS selector."};

  const found = new Map();
  function add(raw, anchor, explicit) {
    if (!raw || raw.trim().startsWith("#")) return false;
    let url;
    try { url = new URL(raw, document.baseURI); } catch { return false; }
    if (!/^https?:$/.test(url.protocol) || thumbPath.test(url.pathname)) return false;
    let pathName = url.pathname.split("/").pop();
    try { pathName = decodeURIComponent(pathName); } catch {}
    const name = anchor?.getAttribute("download") || url.searchParams.get("f") || pathName;
    if (!explicit && !imageFile.test(name) && !imageFile.test(pathName)) return false;
    if (found.has(url.href)) return true;
    found.set(url.href, {url: url.href, name: name || "image"});
    return true;
  }

  const fullKeys = ["data-full-url","data-original-url","data-full","data-large-image","data-zoom-image"];
  let skipped = 0;
  const nodes = new Set();
  for (const root of roots) {
    // A custom rule can select the list, its items, links, or images directly.
    if (root.matches("img,a[href]")) nodes.add(root);
    for (const el of root.querySelectorAll("a[href], img")) nodes.add(el);
  }
  for (const el of nodes) {
    const anchor = el.closest("a[href]");
    const img = el.matches("img") ? el : el.querySelector("img");
    if (el.matches("a") && img && nodes.has(img)) continue;
    const full = fullKeys.some(key => add(img?.getAttribute(key) || anchor?.getAttribute(key), null, true));
    if (full) continue;
    if (anchor && add(anchor.getAttribute("href"), anchor, anchor.classList.contains("image-link") && !!img)) continue;
    if (img) skipped++;
  }
  return {title: document.title, images: [...found.values()], skipped};
}