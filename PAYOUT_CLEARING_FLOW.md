# Player payout and clearing flow

This implementation uses admin-controlled manual clearing. It does not send money to a bank or payment provider automatically.

## Player flow

1. Load balance: `GET /api/v1/player/wallet/balance`
2. Load ledger: `GET /api/v1/player/wallet/ledger?page=1&limit=20`
3. Submit request: `POST /api/v1/player/wallet/withdraw`

```json
{
  "bankName": "Bank name",
  "accountName": "Beneficiary name",
  "bankAccount": "0123456789",
  "bankCode": "058",
  "amount": 1000
}
```

The backend validates the 10-digit account format, amount minimum (NGN 1,000), wallet state, and available cash. On success it creates a `PENDING` payout and reserves the amount in escrow. Credits cannot be withdrawn.

4. Load status/history: `GET /api/v1/player/wallet/payouts/mine?page=1&limit=20`. Account numbers are masked in this response.

## Admin and clearing flow

All routes require an admin or super-admin Bearer token.

1. List requests: `GET /api/v1/admin/payouts?status=PENDING&page=1&limit=50`
2. Review: `PATCH /api/v1/admin/payouts/{payoutId}/review`

```json
{ "status": "APPROVED" }
```

Approval requires at least one identity document with `VERIFIED` status. To reject, provide a reason; reserved money is returned to the player's withdrawable balance:

```json
{ "status": "REJECTED", "rejectionReason": "Bank beneficiary name does not match the player's verified identity." }
```

3. After approval, the finance operator sends the bank transfer through the organization's authorized bank/payment-provider channel. Record its reference:

`PATCH /api/v1/admin/payouts/{payoutId}/processing`

```json
{ "transferReference": "BANK-TRANSFER-REFERENCE" }
```

4. Once the bank/provider confirms success, finalize it:

`PATCH /api/v1/admin/payouts/{payoutId}/complete`

```json
{ "transferReference": "BANK-TRANSFER-REFERENCE" }
```

This releases the escrow reserve and marks the withdrawal ledger entry successful. Do not mark a transfer complete before independently confirming it.

5. If the transfer fails, record why; the backend marks it `FAILED` and refunds the reserved amount:

`PATCH /api/v1/admin/payouts/{payoutId}/fail`

```json
{ "reason": "Bank rejected the transfer." }
```

The admin Financials → Payouts screen is the review and clearing queue. It shows live payout records, KYC document state, beneficiary details, status, and the actions above.

## Status path

`PENDING → APPROVED → PROCESSING → COMPLETED`

`PENDING/APPROVED → REJECTED` (automatic refund)

`PROCESSING → FAILED` (automatic refund)

## Deployment

Apply Prisma migration `20261108230000_payout_clearing_lifecycle` before deploying the new backend. A real payment-provider integration, account-name lookup, and automated transfer webhook are not part of this manual-clearing release.
