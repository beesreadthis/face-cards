
const STORAGE_KEY = "facecards-v1";
let cards = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map((c, i) => ({
  ...c,
  category: c.category || "",
  notes: c.notes || "",
  order: Number.isFinite(c.order) ? c.order : i
}));
let editingId = null;
let activeId = null;
let uploadedDataUrl = "";
let currentFilter = "all";
let dragId = null;

const $ = id => document.getElementById(id);
const grid = $("cardGrid");
const empty = $("emptyState");
const dialog = $("personDialog");
const form = $("personForm");
const results = $("results");
const editorArea = $("editorArea");
const lookupArea = $("lookupArea");

const placeholder = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700">
<rect width="100%" height="100%" fill="#e9e3f8"/>
<circle cx="250" cy="260" r="105" fill="#b9acd9"/>
<path d="M75 700c15-190 110-285 175-285s160 95 175 285" fill="#b9acd9"/>
</svg>`);

function normalizeOrder() {
  cards.sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  cards.forEach((c,i) => c.order = i);
}
function save() {
  normalizeOrder();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  render();
}
function formatDate(value) {
  if (!value) return "Not entered";
  const [y,m,d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {year:"numeric", month:"long", day:"numeric"}).format(new Date(y,m-1,d));
}
function categoryLabel(v) {
  return v === "male" ? "MALE" : v === "female" ? "FEMALE" : "OTHER / UNSET";
}
function makeCard(card, large=false) {
  const node = $("cardTemplate").content.firstElementChild.cloneNode(true);
  node.dataset.id = card.id;
  node.draggable = !large;
  node.querySelector("img").src = card.photo || placeholder;
  node.querySelector("img").alt = card.name;
  node.querySelector(".back-category").textContent = categoryLabel(card.category);
  node.querySelector(".back-name").textContent = card.name;
  node.querySelector(".back-birthday").textContent = formatDate(card.birthday);
  node.querySelector(".back-notes").textContent = card.notes || "No notes yet.";

  const flip = () => node.classList.toggle("flipped");
  node.addEventListener("click", () => large ? flip() : openCard(card.id));
  node.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); large ? flip() : openCard(card.id); }
  });

  if (!large) {
    node.addEventListener("dragstart", e => {
      dragId = card.id;
      node.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", () => {
      dragId = null;
      document.querySelectorAll(".face-card").forEach(n => n.classList.remove("dragging","drag-over"));
    });
    node.addEventListener("dragover", e => { e.preventDefault(); node.classList.add("drag-over"); });
    node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
    node.addEventListener("drop", e => {
      e.preventDefault();
      node.classList.remove("drag-over");
      if (!dragId || dragId === card.id) return;
      moveBefore(dragId, card.id);
    });
  }
  return node;
}
function render() {
  normalizeOrder();
  const q = $("searchCards").value.trim().toLowerCase();
  let filtered = cards.filter(c => c.name.toLowerCase().includes(q));
  if (currentFilter !== "all") {
    filtered = filtered.filter(c => currentFilter === "other" ? !["male","female"].includes(c.category) : c.category === currentFilter);
  }
  grid.innerHTML = "";
  filtered.forEach(c => grid.appendChild(makeCard(c)));
  empty.hidden = cards.length > 0;
  grid.hidden = cards.length === 0;

  $("countAll").textContent = `(${cards.length})`;
  $("countMale").textContent = `(${cards.filter(c=>c.category==="male").length})`;
  $("countFemale").textContent = `(${cards.filter(c=>c.category==="female").length})`;
  $("countOther").textContent = `(${cards.filter(c=>!["male","female"].includes(c.category)).length})`;
}
function moveBefore(movingId, targetId) {
  normalizeOrder();
  const from = cards.findIndex(c => c.id === movingId);
  const to = cards.findIndex(c => c.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = cards.splice(from,1);
  cards.splice(to,0,moved);
  save();
}
function moveBy(id, delta) {
  normalizeOrder();
  const i = cards.findIndex(c => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cards.length) return;
  [cards[i], cards[j]] = [cards[j], cards[i]];
  save();
}
function resetDialog() {
  form.reset();
  results.innerHTML = "";
  $("lookupStatus").hidden = true;
  editorArea.hidden = true;
  lookupArea.hidden = false;
  editingId = null;
  uploadedDataUrl = "";
  $("dialogEyebrow").textContent = "NEW CARD";
  $("dialogTitle").textContent = "Add a person";
}
function openAdd() { resetDialog(); dialog.showModal(); }
function openEditor(data, id=null) {
  editingId = id;
  lookupArea.hidden = true;
  editorArea.hidden = false;
  $("personName").value = data.name || "";
  $("birthday").value = data.birthday || "";
  $("category").value = data.category || "";
  $("notes").value = data.notes || "";
  $("photoUrl").value = data.photo?.startsWith("data:") ? "" : (data.photo || "");
  $("previewImage").src = data.photo || placeholder;
  uploadedDataUrl = data.photo?.startsWith("data:") ? data.photo : "";
  if (id) {
    $("dialogEyebrow").textContent = "EDIT CARD";
    $("dialogTitle").textContent = data.name;
  }
}
function openGqSearch(name) {
  const q = (name || "").trim();
  if (!q) { alert("Enter the person's name first."); return; }
  const url = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(`site:gq.com "${q}"`);
  window.open(url, "_blank", "noopener,noreferrer");
}
async function searchPeople() {
  const name = $("lookupName").value.trim();
  if (!name) return;
  const status = $("lookupStatus");
  status.hidden = false; status.textContent = "Searching…"; results.innerHTML = "";
  try {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action:"wbsearchentities", search:name, language:"en", uselang:"en",
      type:"item", limit:"8", format:"json", origin:"*"
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error("Search failed");
    const data = await response.json();
    const candidates = data.search || [];
    if (!candidates.length) {
      status.textContent = "No matches found. You can still add the information manually.";
      addManualButton(name); return;
    }
    status.hidden = true;
    for (const candidate of candidates) {
      const details = await fetchEntity(candidate.id);
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "result";
      btn.innerHTML = `<img alt="" src="${details.photo || placeholder}">
        <div><strong>${escapeHtml(candidate.label || name)}</strong>
        <span>${escapeHtml(candidate.description || "No description")}</span>
        <span>${details.birthday ? "Born " + formatDate(details.birthday) : "Birthday unavailable"}</span></div>`;
      btn.onclick = () => openEditor({
        name: candidate.label || name, birthday: details.birthday, photo: details.photo,
        category:"", notes:""
      });
      results.appendChild(btn);
    }
    addManualButton(name);
  } catch {
    status.textContent = "Automatic search is unavailable right now. You can enter the card manually.";
    addManualButton(name);
  }
}
function addManualButton(name) {
  const manual = document.createElement("button");
  manual.type = "button"; manual.className = "secondary";
  manual.textContent = "Enter manually";
  manual.onclick = () => openEditor({name, birthday:"", photo:"", category:"", notes:""});
  results.appendChild(manual);
}
async function fetchEntity(id) {
  try {
    const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
    const data = await r.json();
    const entity = data.entities[id];
    const birthClaim = entity.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time || "";
    const birthday = birthClaim ? birthClaim.slice(1, 11) : "";
    const fileName = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value || "";
    const photo = fileName ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=700` : "";
    return {birthday, photo};
  } catch { return {birthday:"", photo:""}; }
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[s]));
}
function openCard(id) {
  activeId = id;
  const card = cards.find(c => c.id === id);
  const current = $("largeCard");
  const replacement = makeCard(card, true);
  replacement.id = "largeCard";
  current.replaceWith(replacement);
  $("cardDialog").showModal();
}
$("closeCardDialog").onclick = () => $("cardDialog").close();
$("editCardBtn").onclick = () => {
  const card = cards.find(c => c.id === activeId);
  $("cardDialog").close(); resetDialog(); openEditor(card, card.id); dialog.showModal();
};
$("deleteCardBtn").onclick = () => {
  const card = cards.find(c => c.id === activeId);
  if (confirm(`Delete ${card.name}'s card?`)) {
    cards = cards.filter(c => c.id !== activeId); save(); $("cardDialog").close();
  }
};
$("moveLeftBtn").onclick = () => moveBy(activeId, -1);
$("moveRightBtn").onclick = () => moveBy(activeId, 1);

form.addEventListener("submit", e => {
  e.preventDefault();
  const existing = cards.find(c => c.id === editingId);
  const card = {
    id: editingId || crypto.randomUUID(),
    name: $("personName").value.trim(),
    birthday: $("birthday").value,
    category: $("category").value,
    notes: $("notes").value.trim(),
    photo: uploadedDataUrl || $("photoUrl").value.trim(),
    order: existing?.order ?? cards.length
  };
  if (!card.name) return;
  if (editingId) cards = cards.map(c => c.id === editingId ? card : c);
  else cards.push(card);
  save(); dialog.close();
});
$("photoUrl").addEventListener("input", e => { if (!uploadedDataUrl) $("previewImage").src = e.target.value || placeholder; });
$("photoUpload").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { uploadedDataUrl = reader.result; $("previewImage").src = reader.result; };
  reader.readAsDataURL(file);
});
$("lookupBtn").onclick = searchPeople;
$("lookupName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); searchPeople(); }});
$("gqSearchBtn").onclick = () => openGqSearch($("lookupName").value);
$("editorGqSearchBtn").onclick = () => openGqSearch($("personName").value);
$("backToSearch").onclick = () => { editorArea.hidden = true; lookupArea.hidden = false; };
$("addBtn").onclick = openAdd;
$("emptyAddBtn").onclick = openAdd;
$("searchCards").addEventListener("input", render);

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active"); currentFilter = btn.dataset.filter; render();
}));

$("backupBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({version:2, cards}, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `face-cards-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
$("restoreInput").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.cards)) throw new Error();
    if (confirm(`Restore ${data.cards.length} cards? This will replace the current deck.`)) {
      cards = data.cards.map((c,i)=>({...c, category:c.category||"", notes:c.notes||"", order:Number.isFinite(c.order)?c.order:i}));
      save();
    }
  } catch { alert("That backup file could not be read."); }
  e.target.value = "";
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}
save();
