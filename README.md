# Rewind Bitcoin

Rewind Bitcoin is a self-custody wallet designed to protect users from theft, coercion and physical attacks.
It implements **Bitcoin Vaults** with a user-friendly interface, letting users safely store their savings while maintaining full control of their keys.

When funds are unvaulted, a **countdown period** begins, allowing the user (or a trusted delegate) to cancel unauthorized transactions by moving the funds to a secure emergency address.

This project is currently being open-sourced. Internal documentation, build guides and contribution instructions will be added soon.

You can learn more about the project at [https://rewindbitcoin.com](https://rewindbitcoin.com).

---

## Getting Started

### Prerequisites

- Node.js and npm
- An **Expo environment configured for local development builds**. Follow the [Expo CLI setup guide](https://docs.expo.dev/get-started/installation/) for your operating system.
- EAS CLI:

  ```bash
  npm install -g eas-cli
  ```

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/bitcoinerlab/rewindbitcoin.git
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

### Running the App

This project uses custom native code and requires a **development build**. It cannot be run with the standard Expo Go app.

**Run on Android:**

```bash
npm run android
```

**Run on iOS:**

```bash
npm run ios
```

---

## Contributing

Rewind Bitcoin is an open project. Once the code cleanup is finished, issues and pull requests will be welcome.
If you want to discuss or propose integrations, feel free to reach out via [landabaso.com](https://landabaso.com) or [x.com/landabaso](https://x.com/landabaso).

---

## License

Copyright © 2025 José Luis Landabaso

This program is free software: you can redistribute it and/or modify
it under the terms of the **GNU General Public License** as published by
the **Free Software Foundation**, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but **without any warranty**; without even the implied warranty of
**merchantability** or **fitness for a particular purpose**. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see [https://www.gnu.org/licenses/](https://www.gnu.org/licenses/).

---

## 🙏 Supporters

The RewindBitcoin Project is proudly supported by the [OpenSats](https://opensats.org) organization.

[![OpenSats logo](https://raw.githubusercontent.com/bitcoinerlab/.github/main/profile/assets/opensats.svg)](https://opensats.org)
