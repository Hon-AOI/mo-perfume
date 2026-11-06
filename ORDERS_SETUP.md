# Order email setup

Customers can submit an order request from the cart. The server validates the
products and delivery details, then sends the request to
`bukunmiisaac1969@gmail.com`. Orders are requests, not paid transactions; confirm
availability, delivery, and payment with the customer.

## Configure SMTP

1. Copy `config/order-email.example.json` to `config/order-email.json`.
2. Fill in the SMTP host, port, TLS setting, username, app password, and an
   authorized sender address from your email provider. Port 587 normally uses
   `"secure": false`; port 465 normally uses `"secure": true`.
3. Keep `config/order-email.json` private. It is ignored by Git. Do not put
   credentials in the website JavaScript or commit them.
4. Start the server with `npm start`, then open `http://localhost:1969/cart.html`.
   The order button becomes available when the server can read the email config.
5. Submit a test order and confirm it arrives in the shop inbox. Check the
   server log and SMTP provider settings if delivery fails.

The app does not load `.env` files or require environment variables. Email
delivery cannot work until valid SMTP details are configured.
