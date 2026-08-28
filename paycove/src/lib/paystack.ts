const PAYSTACK_BASE = "https://api.paystack.co";

function getPaystackSecret() {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

export function isPaystackConfigured() {
  return Boolean(getPaystackSecret());
}

export type InitializePaymentInput = {
  email: string;
  amountInKobo: number;
  reference: string;
  metadata?: Record<string, string | number>;
  callbackUrl?: string;
};

export async function initializePayment(input: InitializePaymentInput) {
  const secret = getPaystackSecret();

  if (!secret) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const callback = input.callbackUrl ?? `${base}/pay/success?reference=${input.reference}`;
    return {
      authorization_url: callback,
      access_code: "mock_access_code",
      reference: input.reference,
      mock: true,
    };
  }

  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountInKobo,
      reference: input.reference,
      metadata: input.metadata,
      callback_url: input.callbackUrl,
    }),
  });

  const data = await response.json();
  if (!data.status) {
    throw new Error(data.message ?? "Paystack initialization failed");
  }

  return data.data as {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function verifyPayment(reference: string) {
  const secret = getPaystackSecret();

  if (!secret) {
    return {
      status: "success",
      reference,
      amount: 0,
      mock: true,
    };
  }

  const response = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    }
  );

  const data = await response.json();
  if (!data.status) {
    throw new Error(data.message ?? "Paystack verification failed");
  }

  return data.data as {
    status: string;
    reference: string;
    amount: number;
    paid_at?: string;
  };
}
