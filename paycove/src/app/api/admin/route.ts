import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();

    const [deals, users, stats] = await Promise.all([
      prisma.deal.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          seller: { select: { name: true, email: true } },
          disputes: true,
        },
      }),
      prisma.user.count(),
      prisma.deal.aggregate({
        _sum: { amount: true, feeAmount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      deals,
      users,
      stats: {
        totalDeals: stats._count,
        totalVolume: stats._sum.amount ?? 0,
        totalFees: stats._sum.feeAmount ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to load admin data" }, { status: 500 });
  }
}
