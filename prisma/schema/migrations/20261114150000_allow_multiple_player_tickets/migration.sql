-- A single Flutterwave payment can issue several individual ticket passes.
-- Keep the ordinary lookup index, but allow the same payment reference on
-- every ticket created by that payment.
DROP INDEX IF EXISTS "Ticket_paymentReference_key";
