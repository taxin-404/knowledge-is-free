pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const shelfEl = document.getElementById("shelf");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");

const reader = document.getElementById("reader");
const readerFrame = document.getElementById("reader-frame");
const readerTitle = document.getElementById("reader-title");
const readerClose = document.getElementById("reader-close");

// ---- Upload key (password) handling ----
function getUploadKey(promptIfMissing) {
  let key = sessionStorage.getItem("uploadKey");
  if (!key && promptIfMissing) {
    key = window.prompt("Enter the upload password:");
    if (key) sessionStorage.setItem("uploadKey", key);
  }
  return key || "";
}
function clearUploadKey() {
  sessionStorage.removeItem("uploadKey");
}

// ---- Helpers ----
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

// ---- Thumbnail generation (client-side, via pdf.js) ----
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

// ---- Catalog rendering ----
async function loadFiles() {
  const res = await fetch("/api/files");
  const files = await res.json();
  shelfEl.innerHTML = "";
  countEl.textContent = `${files.length} document${files.length === 1 ? "" : "s"}`;
  emptyEl.hidden = files.length > 0;

  files.forEach((f) => {
    const book = document.createElement("div");
    book.className = "book";
    book.innerHTML = `
      <div class="book-cover">
        <img src="/api/thumbs/${f.id}" alt="" loading="lazy"
             onerror="this.remove()">
        <div class="fallback">
          <span class="glyph">&#128214;</span>
          <span class="ext">PDF</span>
        </div>
      </div>
      <div class="book-name">${escapeHtml(displayName(f.name))}</div>
      <div class="book-meta">${formatSize(f.size)} &middot; ${formatDate(f.uploaded_at)}</div>
      <button class="book-remove" data-id="${f.id}">Remove</button>
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

// Hide the fallback glyph once a real cover image loads
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

function openReader(f) {
  readerTitle.textContent = displayName(f.name);
  readerFrame.src = `/api/files/${f.id}`;
  reader.classList.add("open");
}
readerClose.addEventListener("click", () => {
  reader.classList.remove("open");
  readerFrame.src = "";
});

async function deleteFile(id) {
  if (!confirm("Remove this document from the shelf?")) return;
  const key = getUploadKey(true);
  const res = await fetch(`/api/files/${id}`, {
    method: "DELETE",
    headers: { "x-upload-key": key },
  });
  if (res.status === 401) {
    clearUploadKey();
    alert("Wrong password.");
    return;
  }
  loadFiles();
}

async function uploadFile(file) {
  if (file.type !== "application/pdf") {
    alert("Only PDF files are accepted.");
    return;
  }

  const key = getUploadKey(true);
  if (!key && sessionStorage.getItem("uploadKeyRequired") !== "no") {
    // key may legitimately be empty if no password is configured server-side;
    // we still attempt the upload and let the server decide.
  }

  progress.hidden = false;
  progressBar.style.width = "10%";
  progressLabel.textContent = "Reading cover...";

  const thumb = await generateThumbnail(file);

  const form = new FormData();
  form.append("file", file);
  if (thumb) form.append("thumb", thumb, "thumb.png");

  progressLabel.textContent = "Filing...";

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
    progressLabel.textContent = "Filed.";
  } catch (err) {
    if (err.message === "unauthorized") {
      progressLabel.textContent = "Wrong password.";
      alert("Wrong password — upload cancelled.");
    } else {
      progressLabel.textContent = "Failed — try again.";
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

loadFiles();
