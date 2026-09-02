import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { OR: [{ id }, { publicId: id }] },
    include: {
      seller: { select: { name: true, email: true, phone: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      proofs: { orderBy: { createdAt: "desc" } },
      disputes: { orderBy: { createdAt: "desc" } },
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json({ deal });
}

const shipSchema = z.object({
  trackingInfo: z.string().optional(),
  deliveryNote: z.string().optional(),
  proofUrl: z.string().url().optional(),
  proofType: z.string().default("SHIPPING"),
});

const confirmSchema = z.object({
  action: z.enum(["confirm", "dispute"]),
  reason: z.string().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const deal = await prisma.deal.findFirst({
      where: { OR: [{ id }, { publicId: id }] },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.action === "ship") {
      if (deal.sellerId !== session.id && deal.agentId !== session.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const data = shipSchema.parse(body);
      const updated = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          status: "SHIPPED",
          trackingInfo: data.trackingInfo,
          deliveryNote: data.deliveryNote,
          proofs: data.proofUrl
            ? {
                create: {
                  type: data.proofType,
                  url: data.proofUrl,
                },
              }
            : undefined,
        },
        include: { proofs: true },
      });

      return NextResponse.json({ deal: updated });
    }

    if (body.action === "release") {
      if (session.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updated = await prisma.deal.update({
        where: { id: deal.id },
        data: { status: "RELEASED" },
      });

      await prisma.transaction.create({
        data: {
          dealId: deal.id,
          type: "RELEASE",
          amount: deal.sellerAmount,
          status: "SUCCESS",
        },
      });

      return NextResponse.json({ deal: updated });
    }

    if (body.action === "confirm" || body.action === "dispute") {
      const data = confirmSchema.parse(body);

      if (data.action === "confirm") {
        const updated = await prisma.deal.update({
          where: { id: deal.id },
          data: { status: "DELIVERED" },
        });
        return NextResponse.json({ deal: updated });
      }

      const updated = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          status: "DISPUTED",
          disputes: {
            create: {
              reason: data.reason ?? "Buyer opened a dispute",
            },
          },
        },
        include: { disputes: true },
      });

      return NextResponse.json({ deal: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { OR: [{ id }, { publicId: id }], sellerId: session.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (deal.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "Only unpaid deals can be cancelled" }, { status: 400 });
  }

  await prisma.deal.update({
    where: { id: deal.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
