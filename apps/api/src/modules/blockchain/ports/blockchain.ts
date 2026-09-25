/**
 * Blockchain / tokenization boundary (EPIC-22, Phase 8 — R&D).
 * No network, token standard or custody model is assumed until the legal/business
 * model is decided. These interfaces only reserve the architectural seam.
 */
export const BLOCKCHAIN_NETWORK = Symbol('BLOCKCHAIN_NETWORK');
export const WALLET_PROVIDER = Symbol('WALLET_PROVIDER');

export interface AnchorReceipt {
  network: string;
  transactionId: string;
  anchoredAt: Date;
}

export interface BlockchainNetworkAdapter {
  readonly network: string;
  /** Anchors a document hash (proof of existence); no asset transfer. */
  anchorDocumentHash(sha256Hex: string): Promise<AnchorReceipt>;
  getTransactionStatus(transactionId: string): Promise<'PENDING' | 'CONFIRMED' | 'FAILED'>;
}

export interface WalletProvider {
  readonly provider: string;
  /** Custody model is undecided; implementations must document theirs in an ADR. */
  getAddress(ownerId: string): Promise<string | undefined>;
}
