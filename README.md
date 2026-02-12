# FileZilla Decrypter (Web-based)

🔒 **Secure, client-side decryption for FileZilla SiteManager exports.**

[**🚀 Open Live Demo**](https://streetblock.github.io/filezilla-decrypter/)

FileZilla stores passwords securely using **X25519** key exchange and **AES-GCM** encryption (if you set a master password). This tool allows you to decrypt your exported `sitemanager.xml` file directly in your browser without installing FileZilla.

### Features
* ⚡ **100% Client-Side:** Uses WebCrypto API & TweetNaCl.js. Your data never leaves your device.
* 🌍 **Bilingual:** English & German support.
* 🗝️ **Secure:** Supports the latest FileZilla hybrid encryption logic.
* 📱 **Responsive:** Works on Desktop and Mobile.
* 🔍 **Searchable:** Quickly find specific server credentials.

---

## 🚀 Usage

### Option A: Via FileZilla Export
1. Open FileZilla.
2. Go to `File` -> `Export...`.
3. Check "Export Site Manager entries" and save the XML file.
4. Drop the file into the [Web Tool](https://streetblock.github.io/filezilla-decrypter/).
5. Enter your Master Password if prompted.

### Option B: Manual File Recovery (System Paths)
If you cannot open FileZilla (e.g., after a system crash), you can find the `sitemanager.xml` file here:

| OS | Path |
| :--- | :--- |
| **Windows** | `%APPDATA%\FileZilla\sitemanager.xml` <br> *(Paste this into the Explorer address bar)* |
| **Linux** | `~/.config/filezilla/sitemanager.xml` <br> *(or `~/.filezilla/sitemanager.xml` on older systems)* |
| **macOS** | `~/.config/filezilla/sitemanager.xml` |

> **Note:** You can also use `recentservers.xml` if you just want to recover quick-connect entries.

---

## 🛡️ Security Note
* **Zero Knowledge:** This tool runs entirely in your browser. No data is sent to any server (Google Analytics or similar trackers are NOT included).
* **Open Source:** You can inspect the source code in this repository.
* **Offline Capable:** You can clone this repo and run the `index.html` locally (requires a local server like VS Code "Live Server" due to WebCrypto security restrictions in browsers).

## 🛠️ Tech Stack
* **Crypto:** [TweetNaCl.js](https://tweetnacl.js.org/) + Native WebCrypto API
* **UI:** [Tailwind CSS](https://tailwindcss.com/)
* **Icons:** [Lucide](https://lucide.dev/)

## License
MIT
