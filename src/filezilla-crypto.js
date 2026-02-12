/**
 * Core library for decrypting FileZilla XML exports.
 * Requires: tweetnacl.js (must be available globally as window.nacl)
 */

export class FileZillaCrypto {
    constructor() {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error("WebCrypto API is not available (HTTPS required).");
        }
        if (!window.nacl) {
            throw new Error("TweetNaCl library is missing.");
        }
    }

    // Helper functions (Internal)
    _base64ToBuffer(b64) {
        try {
            if (!b64) return new Uint8Array(0);
            let cleanB64 = b64.replace(/[\r\n\s]/g, '');
            while (cleanB64.length % 4 !== 0) cleanB64 += '=';
            const binaryString = window.atob(cleanB64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
            return bytes;
        } catch (e) {
            return new Uint8Array(0);
        }
    }

    _concatBuffers(...buffers) {
        const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const b of buffers) {
            result.set(b, offset);
            offset += b.length;
        }
        return result;
    }

    _intToBuffer(num) {
        return new Uint8Array([num]);
    }

    /**
     * Attempts to decrypt a single string.
     */
    async decryptString(encryptedBase64, pubkeyBase64, password, knownIterations = null) {
        try {
            if (!password || !encryptedBase64 || !pubkeyBase64) return null;

            const cipherBytes = this._base64ToBuffer(encryptedBase64);
            const pubkeyBytes = this._base64ToBuffer(pubkeyBase64);

            if (pubkeyBytes.length !== 64 || cipherBytes.length < 80) return null;

            const pubPoint = pubkeyBytes.slice(0, 32);
            const pubSalt = pubkeyBytes.slice(32, 64);
            const ephemPoint = cipherBytes.slice(0, 32);
            const ephemSalt = cipherBytes.slice(32, 64);
            const encryptedDataWithTag = cipherBytes.slice(64);

            const passwordKeyMaterial = await window.crypto.subtle.importKey(
                "raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
            );

            // Iterations: Either use the known one or brute-force through the list
            const candidates = knownIterations ? [knownIterations] : [
                100000, 4000, 250000, 1000, 2000, 3000, 5000, 6000, 10000,
                20000, 50000, 60000, 150000, 200000, 300000, 400000, 500000
            ];

            for (const iterations of candidates) {
                try {
                    const privKeyRawBuffer = await window.crypto.subtle.deriveBits(
                        { name: "PBKDF2", salt: pubSalt, iterations: iterations, hash: "SHA-256" },
                        passwordKeyMaterial, 256
                    );
                    const privKeyRaw = new Uint8Array(privKeyRawBuffer);
                    const sharedSecret = window.nacl.scalarMult(privKeyRaw, ephemPoint);

                    // Derive AES Key
                    const aesInput = this._concatBuffers(ephemSalt, this._intToBuffer(0), sharedSecret, ephemPoint, pubPoint, pubSalt);
                    const aesKeyHash = await window.crypto.subtle.digest("SHA-256", aesInput);
                    const aesKey = await window.crypto.subtle.importKey("raw", aesKeyHash, { name: "AES-GCM" }, false, ["decrypt"]);

                    // Derive IV
                    const ivInput = this._concatBuffers(ephemSalt, this._intToBuffer(2), sharedSecret, ephemPoint, pubPoint, pubSalt);
                    const ivHash = await window.crypto.subtle.digest("SHA-256", ivInput);
                    const iv = new Uint8Array(ivHash).slice(0, 12);

                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: iv }, aesKey, encryptedDataWithTag
                    );

                    return { text: new TextDecoder().decode(decryptedBuffer), iterationsUsed: iterations };
                } catch (e) {
                    continue; // Wrong password or wrong iteration count
                }
            }
        } catch (e) {
            console.error(e);
            return null;
        }
        return null;
    }
}

/**
 * Parser for the FileZilla XML format.
 * Returns an array of server objects.
 */
export function parseFileZillaXML(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Invalid XML format");
    }

    const servers = [];

    // Protocol Mapping Helper
    const getProtocolName = (p) => {
        const map = { '0': 'FTP', '1': 'SFTP (SSH)', '2': 'FTPS (Implicit)', '3': 'FTPES (Explicit)', '4': 'HTTP', '5': 'HTTPS' };
        return map[p] || 'FTP';
    };

    const traverse = (node, path = "") => {
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (child.tagName === "Server") {
                const getText = (tag) => child.getElementsByTagName(tag)[0]?.textContent || "";
                const passNode = child.getElementsByTagName("Pass")[0];
                let password = "", passType = "none", pubkey = "";

                if (passNode) {
                    password = passNode.textContent || "";
                    const encoding = passNode.getAttribute("encoding");
                    pubkey = passNode.getAttribute("pubkey") || "";

                    if (encoding === "crypt") passType = "crypt";
                    else if (encoding === "base64") {
                        try { password = window.atob(password.replace(/\s/g, '')); passType = "base64"; }
                        catch { passType = "plain"; }
                    } else passType = password ? "plain" : "none";
                }

                servers.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: getText("Name") || "Unnamed",
                    host: getText("Host"),
                    port: getText("Port") || "21",
                    user: getText("User") || "Anonymous",
                    protocol: getProtocolName(getText("Protocol")),
                    path,
                    password,
                    passType,
                    salt: pubkey,
                    decryptedValue: null
                });
            } else if (child.tagName === "Folder") {
                const folderName = child.textContent.trim().split('\n')[0];
                traverse(child, path ? `${path} / ${folderName}` : folderName);
            } else if (child.tagName === "Servers" || child.tagName === "FileZilla3") {
                traverse(child, path);
            }
        }
    };

    const root = xmlDoc.getElementsByTagName("Servers")[0] || xmlDoc.documentElement;
    traverse(root);
    return servers;
}
