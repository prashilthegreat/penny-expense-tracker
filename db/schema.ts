import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchant: text("merchant").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  expenseDate: text("expense_date").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_expenses_date").on(table.expenseDate)]);
