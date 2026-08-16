import { env } from "cloudflare:workers";

const schema = `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, expense_date TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)`;
async function ready() { await env.DB.prepare(schema).run(); await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC)").run(); }

export async function GET() {
  await ready();
  const result = await env.DB.prepare("SELECT id, merchant, category, amount, expense_date AS expenseDate, note, created_at AS createdAt FROM expenses ORDER BY expense_date DESC, id DESC").all();
  return Response.json(result.results);
}

export async function POST(request: Request) {
  await ready(); const body = await request.json() as Record<string, unknown>;
  const merchant = String(body.merchant || "").trim(); const category = String(body.category || "Other"); const amount = Number(body.amount); const expenseDate = String(body.expenseDate || ""); const note = String(body.note || "").trim() || null;
  if (!merchant || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return Response.json({ error: "Invalid expense" }, { status: 400 });
  const createdAt = new Date().toISOString(); const inserted = await env.DB.prepare("INSERT INTO expenses (merchant, category, amount, expense_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").bind(merchant, category, amount, expenseDate, note, createdAt).first<{ id: number }>();
  return Response.json({ id: inserted!.id, merchant, category, amount, expenseDate, note, createdAt }, { status: 201 });
}
