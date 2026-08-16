"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Expense = { id: number; merchant: string; category: string; amount: number; expenseDate: string; note: string | null };
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
  const [form, setForm] = useState({ merchant: "", category: "Food & dining", amount: "", expenseDate: new Date().toISOString().slice(0, 10), note: "" });

  async function loadExpenses() {
    try { const res = await fetch("/api/expenses"); if (!res.ok) throw new Error(); const data = await res.json() as Expense[]; setExpenses(data); localStorage.setItem("penny-expense-cache", JSON.stringify(data)); }
    catch { const cached = localStorage.getItem("penny-expense-cache"); if (cached) setExpenses(JSON.parse(cached)); setToast("You’re offline — showing your last synced expenses."); }
    finally { setLoading(false); }
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
    try { const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); if (!res.ok) throw new Error(); const item = await res.json() as Expense; setExpenses(old => [item, ...old]); setModal(false); setForm(f => ({ ...f, merchant: "", amount: "", note: "" })); setToast("Expense added"); }
    catch { setToast("Couldn’t save that expense. Check your connection and try again."); }
    finally { setSaving(false); setTimeout(() => setToast(""), 3500); }
  }
  async function removeExpense(id: number) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) { setExpenses(old => old.filter(e => e.id !== id)); setToast("Expense deleted"); setTimeout(() => setToast(""), 2500); }
  }
  function exportReport() {
    const rows = [["Penny expense report"], ["Generated", new Date().toLocaleString("en-AU")], ["Monthly total", total.toFixed(2)], [], ["Date", "Merchant", "Category", "Amount (AUD)", "Note"], ...expenses.map(e => [e.expenseDate, e.merchant, e.category, e.amount.toFixed(2), e.note ?? ""])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `penny-expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setToast("Report exported"); setTimeout(() => setToast(""), 2500);
  }

  const monthLabel = new Date().toLocaleDateString("en-AU", { month: "long" });
  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#top"><span className="brand-mark">P</span><span>Penny</span></a><nav aria-label="Main navigation"><a className="nav-item active" href="#top"><span>⌂</span> Overview</a><a className="nav-item" href="#expenses"><span>↕</span> Transactions</a><a className="nav-item" href="#insights"><span>◔</span> Insights</a></nav><div className="sidebar-bottom"><div className="storage-note"><span>✓</span><div><strong>Safely saved</strong><small>Your expenses sync automatically.</small></div></div></div></aside>
    <section className="content" id="top">
      <header className="topbar"><div><p className="eyebrow">OVERVIEW</p><h1>Your money, made clear.</h1><p className="subtitle">Here’s where your money went this month.</p></div><div className="header-actions"><button className="secondary" onClick={exportReport}>⇩ <span>Export report</span></button><button className="primary" onClick={() => setModal(true)}>＋ <span>Add expense</span></button></div></header>
      <div className="metric-grid"><article className="metric-card hero-card"><p>Total spent <span className="info">i</span></p><div className="metric-row"><strong>{money.format(total)}</strong></div><small>Across {monthExpenses.length} expense{monthExpenses.length === 1 ? "" : "s"} in {monthLabel}</small><div className="sparkline" aria-hidden="true">{[16, 21, 14, 29, 24, 37, 30, 34, 25, 22, 17, 12].map((h, i) => <i key={i} style={{ height: `${h}px` }}/>)}</div></article><article className="metric-card"><div className="card-icon orange">↗</div><p>Daily average</p><strong>{money.format(dailyAverage)}</strong><small>{new Date().getDate()} days into {monthLabel}</small></article><article className="metric-card"><div className="card-icon purple">◎</div><p>Top category</p><strong>{topCategory}</strong><small>{totals[0] ? `${money.format(totals[0][1])} · ${total ? ((totals[0][1] / total) * 100).toFixed(0) : 0}% of spend` : "Add an expense to see insights"}</small></article></div>
      <div className="toolbar" id="expenses"><div className="search"><span>⌕</span><input aria-label="Search expenses" placeholder="Search expenses" value={search} onChange={e => setSearch(e.target.value)}/></div><select aria-label="Filter by category" value={filter} onChange={e => setFilter(e.target.value)}><option>All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="main-grid"><section className="panel recent"><div className="panel-head"><div><h2>Expenses</h2><p>{filtered.length} record{filtered.length === 1 ? "" : "s"}</p></div><button className="text-button" onClick={() => setModal(true)}>Add new →</button></div><div className="expense-list">{loading ? <div className="empty"><div className="spinner"/>Loading expenses…</div> : filtered.length ? filtered.map(e => { const meta = categoryMeta[e.category] || categoryMeta.Other; return <div className="expense-row" key={e.id}><div className="expense-icon" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.icon}</div><div className="expense-name"><strong>{e.merchant}</strong><small>{e.category}{e.note ? ` · ${e.note}` : ""}</small></div><span className="date">{friendlyDate(e.expenseDate)}</span><strong className="amount">{money.format(e.amount)}</strong><button className="delete" aria-label={`Delete ${e.merchant}`} onClick={() => removeExpense(e.id)}>×</button></div>}) : <div className="empty"><div className="empty-icon">＋</div><strong>No expenses here yet</strong><span>Add your first expense to start seeing patterns.</span><button className="primary" onClick={() => setModal(true)}>Add expense</button></div>}</div></section>
      <section className="panel spending" id="insights"><div className="panel-head"><div><h2>Spending by category</h2><p>{monthLabel} 1–{new Date().getDate()}</p></div></div><div className="donut-wrap"><div className="donut" style={{ background: totals.length ? `conic-gradient(${totals.map(([c, value], i) => { const before = totals.slice(0, i).reduce((s, [, v]) => s + v, 0) / total * 100; const after = (before + value / total * 100); return `${categoryMeta[c]?.color || "#aaa"} ${before}% ${after}%`; }).join(",")})` : "#ece9e1" }}><div><strong>{money.format(total)}</strong><small>Total</small></div></div></div><div className="legend">{totals.length ? totals.slice(0, 6).map(([c, value]) => <span key={c}><i style={{ background: categoryMeta[c]?.color || "#aaa" }}/>{c}<b>{money.format(value)}</b></span>) : <p className="insight-empty">Your category breakdown will appear here.</p>}</div></section></div>
    </section>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW TRANSACTION</p><h2 id="add-title">Add an expense</h2></div><button className="close" onClick={() => setModal(false)} aria-label="Close">×</button></div><form onSubmit={addExpense}><label>Merchant or description<input required autoFocus placeholder="e.g. Corner Cafe" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })}/></label><div className="form-row"><label>Amount (AUD)<input required min="0.01" step="0.01" type="number" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/></label><label>Date<input required type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })}/></label></div><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Note <span>(optional)</span><input placeholder="Add a little context" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save expense"}</button></div></form></section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
