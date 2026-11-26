const $ = (id) => document.getElementById(id);
const FORMAT = "scrollmark-export";

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

async function getMarks() {
  const { scrollmarks } = await browser.storage.local.get({ scrollmarks: [] });
  return scrollmarks;
}

async function refreshCount() {
  $("count").textContent = (await getMarks()).length;
}

async function exportMarks() {
  const marks = await getMarks();
  const payload = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), scrollmarks: marks };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `scrollmark-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  setStatus(`Exported ${marks.length} position${marks.length === 1 ? "" : "s"}.`);
}

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const str = (v) => (typeof v === "string" ? v : undefined);

// Keep only known fields with the right types; reject anything that isn't a web page.
function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  let url;
  try {
    url = new URL(raw.url);
  } catch (_) {
    return null;
  }
  if (!["http:", "https:", "file:"].includes(url.protocol)) return null;
  return {
    id: str(raw.id) || crypto.randomUUID(),
    url: url.href,
    title: str(raw.title) || url.hostname,
    label: str(raw.label),
    savedAt: num(raw.savedAt, Date.now()),
    scrollY: num(raw.scrollY),
    selector: str(raw.selector),
    text: str(raw.text),
    offsetInElement: num(raw.offsetInElement),
    viewportY: num(raw.viewportY)
  };
}

async function importMarks(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    return setStatus("That file isn't valid JSON.", true);
  }
  const list = Array.isArray(data) ? data : data?.scrollmarks;
  if (!Array.isArray(list)) return setStatus("That file doesn't look like a ScrollMark export.", true);

  const existing = await getMarks();
  const seen = new Set(existing.map((m) => m.id));
  const added = [];
  let skipped = 0;
  for (const raw of list) {
    const mark = sanitize(raw);
    if (!mark || seen.has(mark.id)) {
      skipped++;
      continue;
    }
    seen.add(mark.id);
    added.push(mark);
  }
  const merged = [...existing, ...added].sort((a, b) => b.savedAt - a.savedAt);
  await browser.storage.local.set({ scrollmarks: merged });
  await refreshCount();
  setStatus(`Imported ${added.length}, skipped ${skipped} (duplicates or invalid).`, added.length === 0 && skipped > 0);
}

$("export").addEventListener("click", exportMarks);
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) await importMarks(file);
});
refreshCount();
