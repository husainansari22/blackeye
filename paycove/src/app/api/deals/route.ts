import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { FEE_PERCENT } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { calculateFees, nairaToKobo } from "@/lib/utils";

const milestoneSchema = z.object({
  title: z.string().min(2),
  amount: z.number().positive(),
});

const schema = z.object({
  type: z.enum([
    "GOODS",
    "VERIFY",
    "SERVICE",
    "HIGH_TICKET",
    "RENT",
    "EVENT",
    "IMPORT",
    "B2B",
  ]),
  title: z.string().min(3),
  description: z.string().optional(),
  amount: z.number().positive(),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  buyerPhone: z.string().optional(),
  milestones: z.array(milestoneSchema).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const deals = await prisma.deal.findMany({
      where: {
        OR: [{ sellerId: session.id }, { agentId: session.id }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        seller: { select: { name: true, email: true } },
        disputes: true,
      },
    });

    return NextResponse.json({ deals });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = schema.parse(await request.json());
    const amountInKobo = nairaToKobo(body.amount);
    const { feeAmount, sellerAmount } = calculateFees(amountInKobo, FEE_PERCENT);

    const deal = await prisma.deal.create({
      data: {
        publicId: nanoid(10),
        type: body.type,
        title: body.title,
        description: body.description,
        amount: amountInKobo,
        feePercent: FEE_PERCENT,
        feeAmount,
        sellerAmount,
        buyerName: body.buyerName,
        buyerEmail: body.buyerEmail?.toLowerCase(),
        buyerPhone: body.buyerPhone,
        sellerId: session.id,
        status: body.type === "VERIFY" ? "PENDING_PAYMENT" : "PENDING_PAYMENT",
        milestones: body.milestones
          ? {
              create: body.milestones.map((milestone, index) => ({
                title: milestone.title,
                amount: nairaToKobo(milestone.amount),
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: { milestones: true },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
