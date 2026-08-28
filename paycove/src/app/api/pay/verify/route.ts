import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPayment } from "@/lib/paystack";

const schema = z.object({
  reference: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const verification = await verifyPayment(body.reference);

    if (verification.status !== "success") {
      return NextResponse.json({ error: "Payment not successful" }, { status: 400 });
    }

    const transaction = await prisma.transaction.findFirst({
      where: { paystackRef: body.reference },
      include: { deal: true },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "SUCCESS" },
    });

    const nextStatus =
      transaction.deal.type === "VERIFY" ? "RELEASED" : "PAID";

    const deal = await prisma.deal.update({
      where: { id: transaction.dealId },
      data: { status: nextStatus, paystackRef: body.reference },
    });

    return NextResponse.json({ deal, verified: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
