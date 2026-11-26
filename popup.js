const $ = (id) => document.getElementById(id);
let marks = [];
let query = "";

async function load() {
  ({ scrollmarks: marks } = await browser.storage.local.get({ scrollmarks: [] }));
  render();
}

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function visibleMarks() {
  const q = query.trim().toLowerCase();
  if (!q) return marks;
  return marks.filter((m) => [m.label, m.title, m.url].some((v) => v && v.toLowerCase().includes(q)));
}

function render() {
  const shown = visibleMarks();
  $("items").textContent = "";
  $("count").textContent = query.trim() ? `${shown.length} / ${marks.length}` : marks.length;
  $("search").hidden = marks.length < 5;
  $("empty").innerHTML = marks.length ? "No matches." : "No saved positions yet.<br>Scroll to a spot and save it.";
  $("empty").style.display = shown.length ? "none" : "block";
  for (const mark of shown) {
    const li = document.createElement("li");
    li.className = "item";

    const title = document.createElement("span");
    title.className = "item-title";
    title.textContent = mark.label || mark.title || new URL(mark.url).hostname;

    const url = document.createElement("div");
    url.className = "item-url";
    url.textContent = mark.url;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const open = document.createElement("button");
    open.className = "open";
    open.textContent = "Open";
    open.addEventListener("click", () => openMark(mark));

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener("click", () => startRename(mark, title));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteMark(mark));

    actions.append(open, rename, remove);
    li.append(title, url, actions);
    $("items").append(li);
  }
}

async function saveCurrent() {
  const result = await browser.runtime.sendMessage({ type: "SAVE_ACTIVE" });
  if (result?.ok) {
    setStatus("Position saved.");
    await load();
  } else {
    setStatus("This page doesn't allow extensions (for example about: pages or the add-ons site).", true);
  }
}

async function openMark(mark) {
  // The popup closes when the new tab opens, so the background script finishes the job.
  await browser.runtime.sendMessage({ type: "OPEN_MARK", record: mark });
  window.close();
}

// window.prompt() is unreliable in Firefox popups, so rename happens inline.
function startRename(mark, titleEl) {
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = mark.label || mark.title || "";
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      mark.label = input.value.trim() || mark.title;
      await saveMarks();
    } else {
      render();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

async function deleteMark(mark) {
  marks = marks.filter(x => x.id !== mark.id);
  await saveMarks();
}

async function saveMarks() {
  await browser.storage.local.set({ scrollmarks: marks });
  render();
}

$("save").addEventListener("click", saveCurrent);
$("search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});
$("backup").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});
load();
