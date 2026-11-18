# Order email setup

Customers can submit an order request from the cart. The server validates the
products and delivery details, then sends the request to
`buksthegreatt@gmail.com`. Orders are requests, not paid transactions; confirm
availability, delivery, and payment with the customer.

## Deploy on Render

The root `render.yaml` defines a free Node web service. Push the project to
GitHub, then in Render choose **New → Blueprint**, connect the repository, and
apply the Blueprint. Render runs `npm install` and `npm start`, and provides
the `PORT` environment variable automatically.

Add any email or Mailchimp credentials in the Render service's environment
settings. The local `.env` file is ignored by Git and is only for local
development. Free services can spin down when idle, and their local filesystem
is not durable. Configure Mailchimp before collecting real newsletter
subscriptions; the local JSON fallback is not persistent hosting storage.

## Configure SMTP environment

Set these variables in the server's environment (for example, in your hosting
provider's secret settings):

- `SMTP_HOST`: provider SMTP hostname (Gmail: `smtp.gmail.com`)
- `SMTP_PORT`: SMTP port (`587` for STARTTLS or `465` for implicit TLS)
- `SMTP_SECURE`: `false` for port 587; `true` for port 465
- `SMTP_USER`: SMTP account username
- `SMTP_PASSWORD`: SMTP app password
- `SMTP_FROM`: authorized sender address, such as `MO Perfume <you@example.com>`

The `.env.example` file is a reference template. The server loads a local
`.env` file for development; on Render, set these variables in the service's
environment settings instead. Never put credentials in website JavaScript or
commit them. For Gmail, use an app password generated for the account after
enabling two-step verification. Revoke any app password shared in chat and use
a newly generated one.

Start the server with `npm start`, then open `http://localhost:1969/cart.html`.
The order button becomes available when all SMTP environment variables are set.
Submit a test order and confirm it arrives in the shop inbox. Check the server
log and SMTP provider settings if delivery fails.

## Configure newsletter sign-up

The “Notes from MO” form adds sign-ups to a Mailchimp audience using double
opt-in. Mailchimp sends the subscription confirmation; the app also sends a
welcome email after the request is accepted.

Set these additional server environment variables:

- `MAILCHIMP_API_KEY`: a Mailchimp Marketing API key
- `MAILCHIMP_AUDIENCE_ID`: the audience ID from Mailchimp's Audience settings
- `MAILCHIMP_SERVER_PREFIX`: the data-center suffix from the API key (for example, `us17`)

The welcome email uses the `SMTP_*` settings above. The `.env.example` file
includes all required variable names, but is a reference only and is not loaded
by the app. Never commit API keys or SMTP credentials.

Without Mailchimp credentials, newsletter sign-ups are saved locally in
`data/newsletter-subscriptions.json` and accepted as long as local storage is writable.
