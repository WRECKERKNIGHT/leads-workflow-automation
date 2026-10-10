import { NextRequest, NextResponse } from "next/server";
import { getInstitution, updateInstitution, pushOfficeEvent } from "@/lib/db/repo";
import { waLink, isWhatsAppNumber } from "@/lib/whatsapp";
import { whatsappFirstMessage } from "@/agents/types";

export const dynamic = "force-dynamic";

/**
 * Mark a lead as WhatsApp-available and return everything needed to message it
 * in one tap: the wa.me link + a ready-to-send first message. Sending stays a
 * human action (open the chat, send the text) — wa.me needs no API credentials.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const inst = getInstitution(Number(id));
  if (!inst) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  const ready = isWhatsAppNumber(inst.phone);
  if (!ready) {
    return NextResponse.json(
      { ok: false, error: "No usable Indian mobile number on this lead yet — set one first.", phone: inst.phone },
      { status: 400 }
    );
  }

  updateInstitution(inst.id!, { whatsapp_available: 1 });
  pushOfficeEvent("whatsapp", `💬 WhatsApp handoff ready for ${inst.name}`, {
    agentId: "email_sender",
    icon: "💬",
    data: { name: inst.name, phone: inst.phone },
  });

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : whatsappFirstMessage(inst);
  const link = waLink(inst.phone)!;

  return NextResponse.json({
    ok: true,
    name: inst.name,
    phone: inst.phone,
    whatsapp_available: 1,
    waLink: `${link}?text=${encodeURIComponent(message)}`,
    message,
  });
}