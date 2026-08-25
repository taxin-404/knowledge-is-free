pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------------- i18n ---------------- */
const I18N = {
  en: {
    title: "Knowledge is Free",
    tagline: "a private archive of documents",
    dzLabel: "Drop a PDF here, or click to choose one",
    dzSub: "Only .pdf files are accepted",
    shelf: "Shelf",
    searchPlaceholder: "Search books... (English, বাংলা, or Avro)",
    remove: "Remove",
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
    title: "Knowledge is Free",
    tagline: "ব্যক্তিগত দলিল সংরক্ষণাগার",
    dzLabel: "একটি পিডিএফ এখানে ফেলুন, অথবা ক্লিক করে বেছে নিন",
    dzSub: "শুধুমাত্র .pdf ফাইল গ্রহণযোগ্য",
    shelf: "তাক",
    searchPlaceholder: "বই খুঁজুন... (ইংরেজি, বাংলা, বা অভ্র)",
    remove: "মুছুন",
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
const readerTitle = document.getElementById("reader-title");
const readerClose = document.getElementById("reader-close");

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
  if (displayName(name).includes(query)) return true; // direct Bangla substring
  const avro = avroTransliterate(query);
  if (avro && displayName(name).includes(avro)) return true;
  return false;
}

/* ---------------- Thumbnail generation ---------------- */
async function generateThumbnail(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 300;
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.85));
  } catch (err) {
    console.warn("Thumbnail generation failed:", err);
    return null;
  }
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
  readerTitle.textContent = displayName(f.name);
  reader.classList.add("open");
  const container = document.getElementById("reader-frame");
  container.innerHTML = "";
  if (window.EmbedPDF) {
    window.EmbedPDF.init({
      type: "container",
      target: container,
      src: `/api/files/${f.id}`,
      theme: { preference: "dark" },
    });
  } else {
    // Fallback if EmbedPDF failed to load for any reason
    const iframe = document.createElement("iframe");
    iframe.src = `/api/files/${f.id}`;
    iframe.title = "PDF viewer";
    iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
    container.appendChild(iframe);
  }
}
readerClose.addEventListener("click", () => {
  reader.classList.remove("open");
  document.getElementById("reader-frame").innerHTML = "";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && reader.classList.contains("open")) {
    reader.classList.remove("open");
    document.getElementById("reader-frame").innerHTML = "";
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

async function uploadFile(file) {
  if (file.type !== "application/pdf") {
    alert(t("onlyPdf"));
    return;
  }

  const key = getUploadKey(true);

  progress.hidden = false;
  progressBar.style.width = "10%";
  progressLabel.textContent = t("readingCover");

  const thumb = await generateThumbnail(file);

  const form = new FormData();
  form.append("file", file);
  if (thumb) form.append("thumb", thumb, "thumb.png");

  progressLabel.textContent = t("filing");

  try {
    const xhr = new XMLHttpRequest();
    await new Promise((resolve, reject) => {
      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-upload-key", key);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          progressBar.style.width = `${(e.loaded / e.total) * 100}%`;
        }
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          clearUploadKey();
          reject(new Error("unauthorized"));
        } else if (xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(xhr.responseText));
        }
      };
      xhr.onerror = () => reject(new Error("upload failed"));
      xhr.send(form);
    });
    progressLabel.textContent = t("filed");
  } catch (err) {
    if (err.message === "unauthorized") {
      progressLabel.textContent = t("wrongPassword");
      alert(t("wrongPassword"));
    } else {
      progressLabel.textContent = t("failed");
      console.error(err);
    }
  } finally {
    setTimeout(() => (progress.hidden = true), 900);
    loadFiles();
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
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
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

applyLang();
loadFiles();
