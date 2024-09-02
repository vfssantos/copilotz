const middlewares: any = async (req: any) => {

    const { env } = middlewares;

    env.ENV === 'production' && await validateRequest(req, env.PUBLIC_KEY);

    return req;
}

export default middlewares;

const validateRequest = async (req: any, publicKeyStr: string) => {

    const signature = decodeBase64(req.headers.get("x-signature") || "");

    const payload = req.params;

    // Convert the PEM encoded public key to a CryptoKey object
    const publicKey = await crypto.subtle.importKey(
        "spki",
        decodePem(publicKeyStr),
        {
            name: "ECDSA",
            namedCurve: "P-256", // Ensure this matches the curve used for signing
        },
        true,
        ["verify"]
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
        {
            name: "ECDSA",
            hash: { name: "SHA-256" }, // Ensure this matches the hash function used for signing
        },
        publicKey,
        signature,
        new TextEncoder().encode(payload)
    );

    if (!isValid) {
        throw { status: 401, message: "Invalid signature" };
    }

    return
}


// Helper function to decode a PEM formatted string to a Uint8Array
function decodePem(pem: string): Uint8Array {
    const base64 = pem
        .replace(/-----BEGIN PUBLIC KEY-----/, "")
        .replace(/-----END PUBLIC KEY-----/, "")
        .replace(/\s+/g, "");
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// Helper function to decode a Base64 encoded string to a Uint8Array
function decodeBase64(data: string): Uint8Array {
    return Uint8Array.from(atob(data), c => c.charCodeAt(0));
}