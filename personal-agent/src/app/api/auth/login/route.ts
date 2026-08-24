import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSession,
  sessionCookieOptions,
  verifyAccessCode,
} from "@/lib/auth";

const bodySchema = z.object({
  accessCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());

    if (!verifyAccessCode(body.accessCode)) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    const token = await createSession();
    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
