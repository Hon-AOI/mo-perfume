const titleElement = document.getElementById("payment-title");
const messageElement = document.getElementById("payment-message");
const referenceElement = document.getElementById("payment-reference");
const reference = new URLSearchParams(window.location.search).get("reference");

async function verifyPayment() {
    if (!reference) {
        titleElement.textContent = "No payment reference found.";
        messageElement.textContent = "Return to your cart to review your order or contact us for help.";
        return;
    }

    referenceElement.textContent = `Reference: ${reference}`;

    try {
        const response = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`);
        const result = await response.json();
        if (!response.ok || result.paid !== true) {
            throw new Error(result.message || "We could not confirm this payment.");
        }

        titleElement.textContent = "Payment confirmed. Thank you.";
        messageElement.textContent = `Your payment of ${new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: result.currency
        }).format(result.amountKobo / 100)} was verified securely.`;
        try {
            localStorage.removeItem("mo-perfume-cart");
            document.querySelectorAll(".cart-count").forEach((element) => {
                element.textContent = "0";
            });
        } catch (error) {
            console.warn("Payment was confirmed, but the local cart could not be cleared:", error);
        }
    } catch (error) {
        console.error("Could not verify payment:", error);
        titleElement.textContent = "Payment not yet confirmed.";
        messageElement.textContent = `${error.message} If you were charged, contact us with the reference above.`;
    }
}

verifyPayment();
