import { NextResponse, type NextRequest } from "next/server";
import { categoryFromSlug } from "@/agents/types";
import { exportRowsForCategory, csvFromRows } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/**
 * Leads export — the organised, complete dataset for a category so a human can
 * manually approach every lead. Everything is flattened into one wide table:
 * name, phone, whatsApp link/status, location, category, website, stage, etc.
 *
 *   /api/categories/:slug/export?format=csv   -> leads-<slug>-<date>.csv
 *   /api/categories/:slug/export?format=json  -> leads-<slug>-<date>.json
 */
export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const category = categoryFromSlug(slug);
  if (!category) return NextResponse.json({ error: "unknown category" }, { status: 404 });

  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  const rows = exportRowsForCategory(category);
  const date = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify({ category, exportedAt: new Date().toISOString(), total: rows.length, leads: rows }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${slug}-${date}.json"`,
      },
    });
  }

  const csv = csvFromRows(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${slug}-${date}.csv"`,
    },
  });
}