"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseBankText } from "../lib/bank-ocr";

type Expense = { id: number; merchant: string; category: string; amount: number; expenseDate: string; note: string | null };
type ScannedExpense = Omit<Expense, "id"> & { confidence: number; selected: boolean; duplicate: boolean };
const categories = ["Food & dining", "Groceries", "Transport", "Shopping", "Bills & utilities", "Health", "Entertainment", "Travel", "Other"];
const categoryMeta: Record<string, { icon: string; color: string }> = {
  "Food & dining": { icon: "☕", color: "#ff6933" }, Groceries: { icon: "✦", color: "#54b89a" }, Transport: { icon: "↗", color: "#8c6dc2" }, Shopping: { icon: "◇", color: "#e89c50" }, "Bills & utilities": { icon: "⌁", color: "#5b8def" }, Health: { icon: "+", color: "#e45c75" }, Entertainment: { icon: "♪", color: "#9f7aea" }, Travel: { icon: "✈", color: "#3ca5a5" }, Other: { icon: "•", color: "#aaa69d" },
};
const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

function friendlyDate(date: string) {
  const value = new Date(`${date}T12:00:00`); const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((today - new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()) / 86400000);
  if (diff === 0) return "Today"; if (diff === 1) return "Yesterday";
  return value.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true); const [modal, setModal] = useState(false);
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("All categories");
  const [toast, setToast] = useState(""); const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false); const [scanStep, setScanStep] = useState<"upload" | "scanning" | "review">("upload");
  const [scanFiles, setScanFiles] = useState<File[]>([]); const [scanned, setScanned] = useState<ScannedExpense[]>([]); const [scanError, setScanError] = useState("");
  const [form, setForm] = useState({ merchant: "", category: "Food & dining", amount: "", expenseDate: new Date().toISOString().slice(0, 10), note: "" });

  async function loadExpenses() {
    const saved = localStorage.getItem("penny-expenses");
    if (saved) {
      try { setExpenses(JSON.parse(saved)); } catch { localStorage.removeItem("penny-expenses"); }
    }
    setLoading(false);
  }
  useEffect(() => { loadExpenses(); navigator.serviceWorker?.register("/sw.js").catch(() => undefined); }, []);

  const filtered = useMemo(() => expenses.filter(e => (filter === "All categories" || e.category === filter) && `${e.merchant} ${e.note ?? ""}`.toLowerCase().includes(search.toLowerCase())), [expenses, filter, search]);
  const monthKey = new Date().toISOString().slice(0, 7); const monthExpenses = expenses.filter(e => e.expenseDate.startsWith(monthKey));
  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0); const dailyAverage = total / Math.max(new Date().getDate(), 1);
  const totals = Object.entries(monthExpenses.reduce<Record<string, number>>((all, e) => ({ ...all, [e.category]: (all[e.category] || 0) + e.amount }), {})).sort((a, b) => b[1] - a[1]);
  const topCategory = totals[0]?.[0] ?? "No expenses yet";

  async function addExpense(event: FormEvent) {
    event.preventDefault(); if (!form.merchant.trim() || Number(form.amount) <= 0) return;
    setSaving(true);
    const item: Expense = { id: Date.now(), merchant: form.merchant.trim(), category: form.category, amount: Number(form.amount), expenseDate: form.expenseDate, note: form.note.trim() || null };
    setExpenses(old => { const next = [item, ...old]; localStorage.setItem("penny-expenses", JSON.stringify(next)); return next; });
    setModal(false); setForm(f => ({ ...f, merchant: "", amount: "", note: "" })); setToast("Expense added"); setSaving(false); setTimeout(() => setToast(""), 3500);
  }
  async function removeExpense(id: number) {
    if (!confirm("Delete this expense?")) return;
    setExpenses(old => { const next = old.filter(e => e.id !== id); localStorage.setItem("penny-expenses", JSON.stringify(next)); return next; });
    setToast("Expense deleted"); setTimeout(() => setToast(""), 2500);
  }
  function exportReport() {
    const rows = [["Penny expense report"], ["Generated", new Date().toLocaleString("en-AU")], ["Monthly total", total.toFixed(2)], [], ["Date", "Merchant", "Category", "Amount (AUD)", "Note"], ...expenses.map(e => [e.expenseDate, e.merchant, e.category, e.amount.toFixed(2), e.note ?? ""])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `penny-expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setToast("Report exported"); setTimeout(() => setToast(""), 2500);
  }

  function closeScan() { setScanOpen(false); setScanStep("upload"); setScanFiles([]); setScanned([]); setScanError(""); }
  function chooseScreenshots(files: FileList | null) {
    const selected = Array.from(files ?? []).filter(file => ["image/png", "image/jpeg", "image/webp"].includes(file.type)).slice(0, 4);
    setScanFiles(selected); setScanError(selected.length ? "" : "Choose PNG, JPEG, or WebP screenshots.");
  }
  async function scanScreenshots() {
    if (!scanFiles.length) return; setScanStep("scanning"); setScanError("");
    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng");
      const transactions: Array<Omit<ScannedExpense, "selected" | "duplicate">> = [];
      for (const file of scanFiles) {
        const result = await worker.recognize(file);
        transactions.push(...parseBankText(result.data.text));
      }
      const parsed = transactions.map(item => ({ ...item, selected: true, duplicate: expenses.some(e => e.expenseDate === item.expenseDate && Math.abs(e.amount - item.amount) < 0.01 && e.merchant.toLowerCase() === item.merchant.toLowerCase()) }));
      setScanned(parsed); setScanStep("review");
    } catch { setScanError("This screenshot could not be read. Try a clearer image with visible dates and amounts."); setScanStep("upload"); }
    finally { await worker?.terminate(); }
  }
  function updateScanned(index: number, changes: Partial<ScannedExpense>) { setScanned(old => old.map((item, i) => i === index ? { ...item, ...changes } : item)); }
  async function importScanned() {
    const chosen = scanned.filter(item => item.selected && !item.duplicate); if (!chosen.length) return; setSaving(true);
    const created = chosen.map(({ merchant, category, amount, expenseDate, note }, index) => ({ id: Date.now() + index, merchant, category, amount, expenseDate, note }));
    setExpenses(old => { const next = [...created, ...old]; localStorage.setItem("penny-expenses", JSON.stringify(next)); return next; });
    closeScan(); setToast(`${created.length} expense${created.length === 1 ? "" : "s"} imported`); setTimeout(() => setToast(""), 3000); setSaving(false);
  }

  const monthLabel = new Date().toLocaleDateString("en-AU", { month: "long" });
  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#top"><span className="brand-mark">P</span><span>Penny</span></a><nav aria-label="Main navigation"><a className="nav-item active" href="#top"><span>⌂</span> Overview</a><a className="nav-item" href="#expenses"><span>↕</span> Transactions</a><a className="nav-item" href="#insights"><span>◔</span> Insights</a></nav><div className="sidebar-bottom"><div className="storage-note"><span>✓</span><div><strong>Saved privately</strong><small>Your expenses stay in this browser.</small></div></div></div></aside>
    <section className="content" id="top">
      <header className="topbar"><div><p className="eyebrow">OVERVIEW</p><h1>Your money, made clear.</h1><p className="subtitle">Here’s where your money went this month.</p></div><div className="header-actions"><button className="secondary scan-button" onClick={() => setScanOpen(true)}>▣ <span>Scan screenshots</span></button><button className="secondary" onClick={exportReport}>⇩ <span>Export report</span></button><button className="primary" onClick={() => setModal(true)}>＋ <span>Add expense</span></button></div></header>
      <div className="metric-grid"><article className="metric-card hero-card"><p>Total spent <span className="info">i</span></p><div className="metric-row"><strong>{money.format(total)}</strong></div><small>Across {monthExpenses.length} expense{monthExpenses.length === 1 ? "" : "s"} in {monthLabel}</small><div className="sparkline" aria-hidden="true">{[16, 21, 14, 29, 24, 37, 30, 34, 25, 22, 17, 12].map((h, i) => <i key={i} style={{ height: `${h}px` }}/>)}</div></article><article className="metric-card"><div className="card-icon orange">↗</div><p>Daily average</p><strong>{money.format(dailyAverage)}</strong><small>{new Date().getDate()} days into {monthLabel}</small></article><article className="metric-card"><div className="card-icon purple">◎</div><p>Top category</p><strong>{topCategory}</strong><small>{totals[0] ? `${money.format(totals[0][1])} · ${total ? ((totals[0][1] / total) * 100).toFixed(0) : 0}% of spend` : "Add an expense to see insights"}</small></article></div>
      <div className="toolbar" id="expenses"><div className="search"><span>⌕</span><input aria-label="Search expenses" placeholder="Search expenses" value={search} onChange={e => setSearch(e.target.value)}/></div><select aria-label="Filter by category" value={filter} onChange={e => setFilter(e.target.value)}><option>All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="main-grid"><section className="panel recent"><div className="panel-head"><div><h2>Expenses</h2><p>{filtered.length} record{filtered.length === 1 ? "" : "s"}</p></div><button className="text-button" onClick={() => setModal(true)}>Add new →</button></div><div className="expense-list">{loading ? <div className="empty"><div className="spinner"/>Loading expenses…</div> : filtered.length ? filtered.map(e => { const meta = categoryMeta[e.category] || categoryMeta.Other; return <div className="expense-row" key={e.id}><div className="expense-icon" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.icon}</div><div className="expense-name"><strong>{e.merchant}</strong><small>{e.category}{e.note ? ` · ${e.note}` : ""}</small></div><span className="date">{friendlyDate(e.expenseDate)}</span><strong className="amount">{money.format(e.amount)}</strong><button className="delete" aria-label={`Delete ${e.merchant}`} onClick={() => removeExpense(e.id)}>×</button></div>}) : <div className="empty"><div className="empty-icon">＋</div><strong>No expenses here yet</strong><span>Add your first expense to start seeing patterns.</span><button className="primary" onClick={() => setModal(true)}>Add expense</button></div>}</div></section>
      <section className="panel spending" id="insights"><div className="panel-head"><div><h2>Spending by category</h2><p>{monthLabel} 1–{new Date().getDate()}</p></div></div><div className="donut-wrap"><div className="donut" style={{ background: totals.length ? `conic-gradient(${totals.map(([c, value], i) => { const before = totals.slice(0, i).reduce((s, [, v]) => s + v, 0) / total * 100; const after = (before + value / total * 100); return `${categoryMeta[c]?.color || "#aaa"} ${before}% ${after}%`; }).join(",")})` : "#ece9e1" }}><div><strong>{money.format(total)}</strong><small>Total</small></div></div></div><div className="legend">{totals.length ? totals.slice(0, 6).map(([c, value]) => <span key={c}><i style={{ background: categoryMeta[c]?.color || "#aaa" }}/>{c}<b>{money.format(value)}</b></span>) : <p className="insight-empty">Your category breakdown will appear here.</p>}</div></section></div>
    </section>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW TRANSACTION</p><h2 id="add-title">Add an expense</h2></div><button className="close" onClick={() => setModal(false)} aria-label="Close">×</button></div><form onSubmit={addExpense}><label>Merchant or description<input required autoFocus placeholder="e.g. Corner Cafe" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })}/></label><div className="form-row"><label>Amount (AUD)<input required min="0.01" step="0.01" type="number" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/></label><label>Date<input required type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })}/></label></div><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Note <span>(optional)</span><input placeholder="Add a little context" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save expense"}</button></div></form></section></div>}
    {scanOpen && <div className="modal-backdrop" role="presentation" onMouseDown={closeScan}><section className="modal scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">SMART IMPORT</p><h2 id="scan-title">{scanStep === "review" ? "Review expenses" : "Scan bank screenshots"}</h2></div><button className="close" onClick={closeScan} aria-label="Close">×</button></div>{scanStep === "upload" && <><p className="scan-intro">Upload up to four screenshots. Penny will find purchases and prepare them for your approval.</p><label className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseScreenshots(e.dataTransfer.files); }}><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => chooseScreenshots(e.target.files)}/><span className="upload-icon">▣</span><strong>Drop banking screenshots here</strong><small>or click to browse · PNG, JPEG or WebP · 10 MB each</small></label>{scanFiles.length > 0 && <div className="file-list">{scanFiles.map(file => <span key={file.name}><i>✓</i>{file.name}<small>{(file.size / 1048576).toFixed(1)} MB</small></span>)}</div>}<div className="privacy-note"><span>◉</span><p><strong>Stays on your device</strong>Open-source OCR reads your screenshots inside this browser. Images are never uploaded, and nothing is imported without your approval.</p></div>{scanError && <p className="scan-error">{scanError}</p>}<div className="modal-actions"><button className="secondary" onClick={closeScan}>Cancel</button><button className="primary" disabled={!scanFiles.length} onClick={scanScreenshots}>Scan {scanFiles.length || ""} screenshot{scanFiles.length === 1 ? "" : "s"}</button></div></>}{scanStep === "scanning" && <div className="scanning"><div className="scan-animation"><span/><i/></div><strong>Reading locally on your device…</strong><p>The first scan downloads the OCR language data. Future scans will be faster.</p></div>}{scanStep === "review" && <><p className="scan-intro">Check every detail before importing. Possible duplicates are left unselected.</p><div className="review-list">{scanned.length ? scanned.map((item, index) => <div className={`review-row ${item.duplicate ? "is-duplicate" : ""}`} key={`${item.merchant}-${index}`}><input className="review-check" type="checkbox" checked={item.selected && !item.duplicate} disabled={item.duplicate} onChange={e => updateScanned(index, { selected: e.target.checked })}/><div className="review-fields"><input aria-label="Merchant" value={item.merchant} onChange={e => updateScanned(index, { merchant: e.target.value })}/><div><select aria-label="Category" value={item.category} onChange={e => updateScanned(index, { category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select><input aria-label="Date" type="date" value={item.expenseDate} onChange={e => updateScanned(index, { expenseDate: e.target.value })}/></div></div><div className="review-amount"><span>$</span><input aria-label="Amount" type="number" min="0.01" step="0.01" value={item.amount} onChange={e => updateScanned(index, { amount: Number(e.target.value) })}/>{item.duplicate ? <small>Possible duplicate</small> : <small>{Math.round(item.confidence * 100)}% confidence</small>}</div></div>) : <div className="no-scan-results"><strong>No expenses found</strong><span>Try a clearer screenshot that shows transaction dates and amounts.</span></div>}</div>{scanError && <p className="scan-error">{scanError}</p>}<div className="modal-actions split-actions"><button className="secondary" onClick={() => setScanStep("upload")}>← Choose different images</button><button className="primary" disabled={saving || !scanned.some(item => item.selected && !item.duplicate)} onClick={importScanned}>{saving ? "Importing…" : `Import ${scanned.filter(item => item.selected && !item.duplicate).length} expenses`}</button></div></>}</section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
