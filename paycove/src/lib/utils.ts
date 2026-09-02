import { FEE_PERCENT } from "./constants";

export function formatNaira(amountInKobo: number): string {
  const naira = amountInKobo / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(naira);
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

export function calculateFees(amountInKobo: number, feePercent = FEE_PERCENT) {
  const feeAmount = Math.round(amountInKobo * (feePercent / 100));
  const sellerAmount = amountInKobo - feeAmount;
  return { feeAmount, sellerAmount, total: amountInKobo };
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
