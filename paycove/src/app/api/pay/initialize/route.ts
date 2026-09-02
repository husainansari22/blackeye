import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { initializePayment } from "@/lib/paystack";

const schema = z.object({
  publicId: z.string(),
  buyerName: z.string().min(2),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const deal = await prisma.deal.findUnique({
      where: { publicId: body.publicId },
    });

    if (!deal || deal.status === "CANCELLED") {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (!["PENDING_PAYMENT", "DISPUTED"].includes(deal.status)) {
      return NextResponse.json({ error: "Deal is not payable" }, { status: 400 });
    }

    const reference = `pc_${deal.publicId}_${nanoid(8)}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const payment = await initializePayment({
      email: body.buyerEmail,
      amountInKobo: deal.amount,
      reference,
      callbackUrl: `${appUrl}/pay/${deal.publicId}/success?reference=${reference}`,
      metadata: {
        dealId: deal.id,
        publicId: deal.publicId,
      },
    });

    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        buyerName: body.buyerName,
        buyerEmail: body.buyerEmail.toLowerCase(),
        buyerPhone: body.buyerPhone,
        paystackRef: reference,
      },
    });

    await prisma.transaction.create({
      data: {
        dealId: deal.id,
        type: "PAYMENT",
        amount: deal.amount,
        paystackRef: reference,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      authorization_url: payment.authorization_url,
      reference,
      mock: "mock" in payment ? payment.mock : false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 500 });
  }
}
