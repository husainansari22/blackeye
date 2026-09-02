import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  role: z.enum(["SELLER", "AGENT"]).default("SELLER"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        password: await hashPassword(body.password),
        phone: body.phone,
        role: body.role,
      },
    });

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
