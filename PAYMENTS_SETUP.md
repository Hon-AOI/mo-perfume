# Paystack checkout setup

The store uses Paystack Checkout in NGN. Payment initialization and verification
run on the Express server; the Paystack secret key is never sent to the browser.

## Before accepting payments

1. Copy `.env.example` to `.env` on the server.
2. Add a Paystack **test** secret key to `PAYSTACK_SECRET_KEY` while testing.
   Never add a secret key to HTML or JavaScript, and never commit `.env`.
3. Set `PAYSTACK_CALLBACK_URL` to the full public URL of `payment-return.html`.
   For local development, use `http://localhost:1969/payment-return.html`.
   Use HTTPS on a deployed site.
4. Set `DELIVERY_FEE_NGN` to the agreed delivery amount in naira. Use `0` only
   if delivery is free.
5. Add a `price_ngn` column to `data/perfumes.csv` and set a positive price
   with at most two decimal places for each fragrance you intend to sell.
   The payment server calculates the amount from these catalog prices; it
   ignores any amount sent by the browser.
6. Restart the server with `npm start`, complete a Paystack test transaction,
   and confirm the payment-return page reports a verified payment. Switch to a
   live secret key only after the account and deployed HTTPS callback are ready.

Until the selected products have prices and Paystack, callback, and delivery
settings are configured, checkout remains disabled. No payment is accepted
with missing or invented prices.

## Included flow

- The cart requests a server-calculated quote and requires delivery details.
- The server initializes Paystack Checkout and attaches the order details.
- The callback page verifies the transaction with Paystack on the server and
  confirms the amount and NGN currency before showing success.
