export type TransferDestinationType = "BANK_ACCOUNT" | "CARD" | "PHONE" | "HOST";

export interface TransferInput {
  senderId: string;
  recipientName: string;
  recipientIdentifier: string;
  destinationType: TransferDestinationType;
  amount: number;
  currency: string;
  title: string;
  message?: string;
  maskedDestination: string;
  pinToken?: string;
}

export interface TransferResult {
  success: boolean;
  reference?: string;
  status?: "COMPLETED_SANDBOX" | "PENDING" | "FAILED";
  error?: string;
  requiresPin?: boolean;
}

export interface ContractInviteInput {
  senderId: string;
  recipientIdentifier: string;
  title: string;
  contractType: "SERVICE" | "SALE" | "DEPOSIT" | "RENOVATION" | "CUSTOM";
  amount: number;
  currency: string;
  deadline: string;
  description: string;
}

export interface ContractInviteResult {
  success: boolean;
  id?: string;
  error?: string;
}

interface PaymentProvider {
  createBankTransfer(input: TransferInput): Promise<TransferResult>;
  createCardPayout(input: TransferInput): Promise<TransferResult>;
  createPhoneTransfer(input: TransferInput): Promise<TransferResult>;
  createContractInvite(input: ContractInviteInput): Promise<ContractInviteResult>;
  getTransferStatus(reference: string): Promise<{ status: string } | null>;
}

function generateReference(): string {
  return `TRX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

class SandboxPaymentProvider implements PaymentProvider {
  private async postTransfer(input: TransferInput): Promise<TransferResult> {
    const { pinToken, ...transferData } = input;
    const reference = generateReference();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pinToken) headers["X-Pin-Token"] = pinToken;
      const res = await fetch("/api/sandbox-transfers", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...transferData, reference, status: "COMPLETED_SANDBOX", provider: "SANDBOX" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        if (err.requiresPin) return { success: false, requiresPin: true, error: err.message };
        return { success: false, error: err.message };
      }
      return { success: true, reference, status: "COMPLETED_SANDBOX" };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async createBankTransfer(input: TransferInput): Promise<TransferResult> {
    return this.postTransfer({ ...input, destinationType: "BANK_ACCOUNT" });
  }

  async createCardPayout(input: TransferInput): Promise<TransferResult> {
    return this.postTransfer({ ...input, destinationType: "CARD" });
  }

  async createPhoneTransfer(input: TransferInput): Promise<TransferResult> {
    return this.postTransfer({ ...input, destinationType: "PHONE" });
  }

  async createContractInvite(input: ContractInviteInput): Promise<ContractInviteResult> {
    try {
      const res = await fetch("/api/contract-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        return { success: false, error: err.message };
      }
      const data = await res.json();
      return { success: true, id: data.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getTransferStatus(reference: string): Promise<{ status: string } | null> {
    return { status: "COMPLETED_SANDBOX" };
  }
}

export const paymentProvider = new SandboxPaymentProvider();

export function maskIban(iban: string): string {
  if (!iban || iban.length < 8) return "****";
  return iban.slice(0, 4) + " **** **** " + iban.slice(-4);
}

export function maskCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  return "**** **** **** " + digits.slice(-4);
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return "***";
  return phone.slice(0, 3) + "*** " + phone.slice(-3);
}
