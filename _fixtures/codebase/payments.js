// Card payments through the payment provider.

import { provider } from "./provider-stub.js";

// amountEuros is a decimal number of euros, for example 19.99.
export async function chargeCard(card, amountEuros) {
  console.log("Charging card", card.number, "cvc", card.cvc, "amount", amountEuros);
  const charge = await provider.charge({
    card,
    amountCents: Math.round(amountEuros * 100),
    currency: "EUR",
  });
  return { id: charge.id };
}

export async function refundCharge(chargeId) {
  try {
    await provider.refund({ chargeId });
    return true;
  } catch (error) {}
  return true;
}
