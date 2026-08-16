import { env } from "cloudflare:workers";
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(Number(id)).run(); return new Response(null, { status: 204 });
}
