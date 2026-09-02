pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------------- i18n ---------------- */
const I18N = {
  en: {
    title: "Knowledge Should Be Free",
    tagline: "a private archive of documents",
    dzLabel: "Drop PDFs here, or click to choose one or more",
    dzSub: "Only .pdf files are accepted",
    shelf: "Shelf",
    searchPlaceholder: "Search books...",
    remove: "Remove",
    back: "Back",
    close: "Close",
    filing: "Filing...",
    readingCover: "Reading cover...",
    filed: "Filed.",
    failed: "Failed — try again.",
    empty: "Nothing filed yet. Add your first document above.",
    noResults: "No matches for that search.",
    wrongPassword: "Wrong password.",
    onlyPdf: "Only PDF files are accepted.",
  },
  bn: {
    title: "জ্ঞান মুক্ত হওয়া উচিত",
    tagline: "ব্যক্তিগত দলিল সংরক্ষণাগার",
    dzLabel: "একটি বা একাধিক পিডিএফ এখানে ফেলুন, অথবা ক্লিক করে বেছে নিন",
    dzSub: "শুধুমাত্র .pdf ফাইল গ্রহণযোগ্য",
    shelf: "তাক",
    searchPlaceholder: "বই খুঁজুন...",
    remove: "মুছুন",
    back: "ফিরে যান",
    close: "বন্ধ করুন",
    filing: "জমা হচ্ছে...",
    readingCover: "প্রচ্ছদ পড়া হচ্ছে...",
    filed: "জমা হয়েছে।",
    failed: "ব্যর্থ — আবার চেষ্টা করুন।",
    empty: "এখনো কিছু জমা হয়নি। উপরে আপনার প্রথম দলিল যোগ করুন।",
    noResults: "এই অনুসন্ধানের সাথে মেলে এমন কিছু নেই।",
    wrongPassword: "ভুল পাসওয়ার্ড।",
    onlyPdf: "শুধুমাত্র পিডিএফ ফাইল গ্রহণযোগ্য।",
  },
};

let currentLang = localStorage.getItem("lang") || "en";
let currentTheme = localStorage.getItem("theme") || "dark";

function applyTheme() {
  document.getElementById("html-root").setAttribute("data-theme", currentTheme);
  document.getElementById("theme-icon").innerHTML = currentTheme === "dark" ? "&#9789;" : "&#9788;";
}
document.getElementById("theme-toggle").addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", currentTheme);
  applyTheme();
});
applyTheme();

function t(key) {
  return I18N[currentLang][key] ?? I18N.en[key];
}

function applyLang() {
  document.getElementById("html-root").setAttribute("data-lang", currentLang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  countEl.textContent = countLabel(lastFileCount);
}

document.getElementById("lang-toggle").addEventListener("click", () => {
  currentLang = currentLang === "en" ? "bn" : "en";
  localStorage.setItem("lang", currentLang);
  applyLang();
});

/* ---------------- Elements ---------------- */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const shelfEl = document.getElementById("shelf");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const noResultsEl = document.getElementById("no-results");
const searchInput = document.getElementById("search-input");

const reader = document.getElementById("reader");

let allFiles = [];
let lastFileCount = 0;

/* ---------------- Upload key (password) handling ---------------- */
function getUploadKey(promptIfMissing) {
  let key = sessionStorage.getItem("uploadKey");
  if (!key && promptIfMissing) {
    key = window.prompt(
      currentLang === "bn" ? "আপলোড পাসওয়ার্ড দিন:" : "Enter the upload password:"
    );
    if (key) sessionStorage.setItem("uploadKey", key);
  }
  return key || "";
}
function clearUploadKey() {
  sessionStorage.removeItem("uploadKey");
}

/* ---------------- Helpers ---------------- */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function displayName(name) {
  return name.replace(/\.pdf$/i, "").replace(/_/g, " ");
}
function countLabel(n) {
  if (currentLang === "bn") return `${n} টি দলিল`;
  return `${n} document${n === 1 ? "" : "s"}`;
}

/* ---------------- Avro-style phonetic -> Bangla (approximate) ----------------
   This is a lightweight, best-effort transliterator used only to widen search
   matching (typing "boi" should find a book named "বই"). It does not aim to
   be a complete/perfect Avro implementation. */
const AVRO_VOWELS = [
  ["OI", "ঐ", "ৈ"], ["oI", "ঐ", "ৈ"],
  ["OU", "ঔ", "ৌ"], ["oU", "ঔ", "ৌ"],
  ["rri", "ঋ", "ৃ"],
  ["a", "আ", "া"], ["i", "ই", "ি"], ["I", "ঈ", "ী"], ["ee", "ঈ", "ী"],
  ["u", "উ", "ু"], ["U", "ঊ", "ূ"], ["oo", "ঊ", "ূ"],
  ["e", "এ", "ে"], ["o", "ও", ""],
];
const AVRO_CONSONANTS = [
  ["kh", "খ"], ["gh", "ঘ"], ["Ng", "ঙ"], ["ch", "চ"], ["Ch", "ছ"],
  ["jh", "ঝ"], ["NG", "ঞ"], ["Th", "ঠ"], ["th", "থ"], ["Dh", "ঢ"],
  ["dh", "ধ"], ["ph", "ফ"], ["bh", "ভ"], ["sh", "শ"], ["Sh", "ষ"],
  ["k", "ক"], ["g", "গ"], ["c", "চ"], ["j", "জ"], ["T", "ট"], ["D", "ড"],
  ["N", "ণ"], ["t", "ত"], ["d", "দ"], ["n", "ন"], ["p", "প"], ["f", "ফ"],
  ["b", "ব"], ["v", "ভ"], ["m", "ম"], ["z", "জ"], ["r", "র"], ["R", "ড়"],
  ["l", "ল"], ["s", "স"], ["S", "শ"], ["h", "হ"], ["y", "য়"], ["Y", "য"],
  ["w", "ও"],
];

function avroTransliterate(input) {
  let out = "";
  let i = 0;
  let prevWasConsonant = false;
  const lower = input;

  while (i < lower.length) {
    let matchedVowel = null;
    for (const [pat, standalone, matra] of AVRO_VOWELS) {
      if (lower.startsWith(pat, i)) {
        matchedVowel = { pat, standalone, matra };
        break;
      }
    }
    if (matchedVowel) {
      out += prevWasConsonant ? matchedVowel.matra : matchedVowel.standalone;
      i += matchedVowel.pat.length;
      prevWasConsonant = false;
      continue;
    }

    let matchedCons = null;
    for (const [pat, glyph] of AVRO_CONSONANTS) {
      if (lower.startsWith(pat, i)) {
        matchedCons = { pat, glyph };
        break;
      }
    }
    if (matchedCons) {
      if (prevWasConsonant) out += "\u09CD"; // hasant, joins consonant clusters
      out += matchedCons.glyph;
      i += matchedCons.pat.length;
      prevWasConsonant = true;
      continue;
    }

    // unknown character (space, digit, punctuation) — pass through, reset state
    out += lower[i];
    prevWasConsonant = false;
    i += 1;
  }
  return out;
}

function matchesSearch(name, query) {
  if (!query) return true;
  const plain = displayName(name).toLowerCase();
  const q = query.toLowerCase();
  if (plain.includes(q)) return true;
  if (plain.includes(query)) return true; // direct Bangla substring (no case)
  const avro = avroTransliterate(query).toLowerCase();
  if (avro && plain.includes(avro)) return true;
  return false;
}

/* ---------------- Thumbnail generation ---------------- */
const A4_W = 210;
const A4_H = 297;

async function generateThumbnail(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);

    // Render the cover page at a fixed pixel height so any page ratio is
    // captured with enough detail to sample its border color.
    const rawViewport = page.getViewport({ scale: 1 });
    const renderHeight = 600;
    const scale = renderHeight / rawViewport.height;
    const pageViewport = page.getViewport({ scale });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = pageViewport.width;
    pageCanvas.height = pageViewport.height;
    const pageCtx = pageCanvas.getContext("2d");
    await page.render({ canvasContext: pageCtx, viewport: pageViewport }).promise;

    // Sample the average color of the cover's outer border so the empty A4
    // space around it can blend in seamlessly (instead of a flat page color).
    const edgeColor = sampleEdgeColor(pageCanvas);

    // Build an A4-proportioned thumbnail and draw the cover fitted inside it.
    const THUMB_W = 300;
    const THUMB_H = Math.round(300 * (A4_H / A4_W));
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = edgeColor;
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    const fitScale = Math.min(THUMB_W / pageViewport.width, THUMB_H / pageViewport.height);
    const dw = pageViewport.width * fitScale;
    const dh = pageViewport.height * fitScale;
    const dx = (THUMB_W - dw) / 2;
    const dy = (THUMB_H - dh) / 2;
    ctx.drawImage(pageCanvas, dx, dy, dw, dh);

    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.85));
  } catch (err) {
    console.warn("Thumbnail generation failed:", err);
    return null;
  }
}

// Determine the cover's edge color from the page's outer border pixels.
// Using the most common (dominant) color rather than a mean avoids the muddy
// tint you get when averaging text bleed / off-white casts into one color,
// so white pages stay white.
function sampleEdgeColor(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const thickness = Math.max(2, Math.round(Math.min(w, h) * 0.015));
  const data = ctx.getImageData(0, 0, w, h).data;

  const buckets = new Map();
  const add = (idx) => {
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // quantize 4 bits/channel
    buckets.set(key, (buckets.get(key) || 0) + 1);
  };

  for (let t = 0; t < thickness; t++) {
    for (let x = 0; x < w; x++) add((t * w + x) * 4);          // top
    for (let x = 0; x < w; x++) add(((h - 1 - t) * w + x) * 4); // bottom
  }
  for (let t = 0; t < thickness; t++) {
    for (let y = 0; y < h; y++) add((y * w + t) * 4);          // left
    for (let y = 0; y < h; y++) add((y * w + w - 1 - t) * 4);  // right
  }

  let bestKey = null, bestCount = -1;
  for (const [key, count] of buckets) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  if (bestKey === null) return "#e4e0d8";
  const r = (bestKey >> 8) & 0xf0;
  const g = (bestKey >> 4) & 0xf0;
  const b = bestKey & 0xf0;
  return `rgb(${r + 8}, ${g + 8}, ${b + 8})`;
}

/* ---------------- Rendering ---------------- */
function renderShelf() {
  const query = searchInput.value.trim();
  const filtered = allFiles.filter((f) => matchesSearch(f.name, query));

  shelfEl.innerHTML = "";
  lastFileCount = allFiles.length;
  countEl.textContent = countLabel(allFiles.length);
  emptyEl.hidden = allFiles.length > 0;
  noResultsEl.hidden = !(allFiles.length > 0 && filtered.length === 0);

  filtered.forEach((f) => {
    const book = document.createElement("div");
    book.className = "book";
    book.innerHTML = `
      <div class="book-cover">
        <img src="/api/thumbs/${f.id}" alt="" loading="lazy" onerror="this.remove()">
        <div class="fallback">
          <span class="glyph">&#128214;</span>
          <span class="ext">PDF</span>
        </div>
      </div>
      <div class="book-name">${escapeHtml(displayName(f.name))}</div>
      <div class="book-meta">${formatSize(f.size)} &middot; ${formatDate(f.uploaded_at)}</div>
      <button class="book-remove" data-i18n="remove">${t("remove")}</button>
    `;
    book.querySelector(".book-cover").addEventListener("click", () => openReader(f));
    book.querySelector(".book-name").addEventListener("click", () => openReader(f));
    book.querySelector(".book-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(f.id);
    });
    shelfEl.appendChild(book);
  });
}

document.addEventListener(
  "load",
  (e) => {
    if (e.target.tagName === "IMG" && e.target.closest(".book-cover")) {
      const fallback = e.target.parentElement.querySelector(".fallback");
      if (fallback) fallback.style.display = "none";
    }
  },
  true
);

searchInput.addEventListener("input", renderShelf);

async function loadFiles() {
  const res = await fetch("/api/files");
  allFiles = await res.json();
  renderShelf();
}

function openReader(f) {
  reader.classList.add("open");
  const container = document.getElementById("reader-frame");
  container.innerHTML = "";
  if (window.EmbedPDF) {
    window.EmbedPDF.init({
      type: "container",
      target: container,
      src: `/api/files/${f.id}`,
      theme: { preference: currentTheme },
    });
  } else {
    // Fallback if EmbedPDF failed to load for any reason
    const iframe = document.createElement("iframe");
    iframe.src = `/api/files/${f.id}`;
    iframe.title = "PDF viewer";
    iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
    container.appendChild(iframe);
  }
  // Push a history state so the browser/Android back button closes the reader.
  history.pushState({ reader: true }, "");
}

function closeReader() {
  reader.classList.remove("open");
  document.getElementById("reader-frame").innerHTML = "";
}

window.addEventListener("popstate", () => {
  closeReader();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && reader.classList.contains("open")) {
    closeReader();
    if (history.state && history.state.reader) history.back();
  }
});

async function deleteFile(id) {
  if (!confirm(currentLang === "bn" ? "এই দলিলটি তাক থেকে সরাবেন?" : "Remove this document from the shelf?")) return;
  const key = getUploadKey(true);
  const res = await fetch(`/api/files/${id}`, {
    method: "DELETE",
    headers: { "x-upload-key": key },
  });
  if (res.status === 401) {
    clearUploadKey();
    alert(t("wrongPassword"));
    return;
  }
  loadFiles();
}

async function uploadFile(file, key, indexLabel) {
  if (file.type !== "application/pdf") {
    alert(`${t("onlyPdf")} (${file.name})`);
    return false;
  }

  const setLabel = (msg) => {
    progressLabel.textContent = `${indexLabel ? indexLabel + " — " : ""}${msg}`;
  };

  try {
    // Step 1: get a presigned R2 upload URL from the Worker
    setLabel(t("readingCover"));
    const thumb = await generateThumbnail(file);

    progressBar.style.width = "5%";
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json", "x-upload-key": key },
      body: JSON.stringify({ filename: file.name }),
    });
    if (urlRes.status === 401) throw new Error("unauthorized");
    if (!urlRes.ok) throw new Error("could not get upload URL");
    const { id, uploadUrl } = await urlRes.json();

    // Step 2: PUT the file straight to R2 — this bypasses the Worker
    // entirely, so there's no size limit from our own server.
    setLabel(t("filing"));
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          progressBar.style.width = `${5 + (e.loaded / e.total) * 85}%`;
        }
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("R2 upload failed")));
      xhr.onerror = () => reject(new Error("R2 upload failed"));
      xhr.send(file);
    });

    // Step 3: upload the thumbnail (small, goes through the Worker fine)
    if (thumb) {
      const form = new FormData();
      form.append("id", id);
      form.append("thumb", thumb, "thumb.png");
      await fetch("/api/upload-thumb", {
        method: "POST",
        headers: { "x-upload-key": key },
        body: form,
      });
    }

    // Step 4: record the metadata
    progressBar.style.width = "95%";
    const finalizeRes = await fetch("/api/finalize", {
      method: "POST",
      headers: { "content-type": "application/json", "x-upload-key": key },
      body: JSON.stringify({ id, name: file.name, size: file.size }),
    });
    if (finalizeRes.status === 401) throw new Error("unauthorized");
    if (!finalizeRes.ok) throw new Error("could not finalize upload");

    progressBar.style.width = "100%";
    return true;
  } catch (err) {
    if (err.message === "unauthorized") {
      clearUploadKey();
      alert(t("wrongPassword"));
      throw err; // stop the whole queue — password is wrong for all of them
    }
    console.error(err);
    return false; // this file failed, but keep going with the rest
  }
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type === "application/pdf");
  if (files.length === 0) {
    alert(t("onlyPdf"));
    return;
  }

  const key = getUploadKey(true);
  progress.hidden = false;

  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const label = files.length > 1 ? `${i + 1}/${files.length}` : "";
    try {
      const ok = await uploadFile(files[i], key, label);
      if (!ok) failed++;
    } catch (err) {
      // wrong password — abort the rest of the queue
      break;
    }
  }

  progressLabel.textContent = failed > 0 ? t("failed") : t("filed");
  setTimeout(() => (progress.hidden = true), 900);
  loadFiles();
}

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

applyLang();
loadFiles();

/* ---------------- Back to top ---------------- */
const backToTop = document.getElementById("back-to-top");
window.addEventListener("scroll", () => {
  backToTop.classList.toggle("show", window.scrollY > 400);
});
backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
