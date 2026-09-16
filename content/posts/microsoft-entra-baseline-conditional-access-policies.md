---
title: Microsoft Entra Baseline Conditional Access Policies
description: A list of baseline Conditional Access policies to help secure your Microsoft environment.
date: 2026-03-30
author: Nate Hess
image: /assets/blog/entra-conditional-access-baselines-header.webp
imageAlt: Microsoft Entra Baseline Conditional Access Policies title art
tags:
  - Entra
  - Conditional Access
  - Identity Security
  - Hybrid Identity
  - Azure
draft: false
---

> Whoa there! Show me your badge... and your location... and now your device... oh, and approve this notification I send to your phone... oh, sorry, do you mind removing your shoes before you come in?

This article covers why Microsoft Conditional Access matters and a set of recommended baseline policies to start from.

## Why Use Conditional Access

Conditional Access isn't new, but it isn't always the easiest concept to grasp. At a high level, it is the **who, what, when, where, and how** of signing in to Microsoft cloud resources. It gets more complex than simply requiring MFA for everyone, although that baseline should exist.

Conditional Access works as a set of if-then statements. When conditions such as the user's identity, device state, location, or risk level are met, it enforces an action: allow, block, or require an additional control such as multi-factor authentication.

## Baseline Policies

These are a set of baseline policies to start from. Microsoft recommends additional policies as well; whether they belong in a baseline depends on your environment and operating model.

![Conditional Access policy list in Microsoft Entra](/assets/blog/entra-conditional-access-policy-list.webp)

### Naming Convention

Implement a strong naming convention for your policies. A clear policy name makes it easier to understand its targets, conditions, and controls at a glance.

Microsoft provides [recommended naming standards for Conditional Access policies](https://learn.microsoft.com/en-us/entra/identity/conditional-access/plan-conditional-access).

> **Tip:** Leave gaps in policy numbering. Policies change over time, and gaps make it easier to add and organize new policies later.

### CA00 — All Apps: Require MFA for All Users

**What this policy does:** Requires MFA for all users.

**Why this policy is important:** This is the single most important Conditional Access policy to enable. MFA is one of the simplest and most effective ways to secure accounts. There are bypass techniques, but this policy needs to exist first and foremost.

### CA10 — Register Security Info: Require MFA for All Users

**What this policy does:** Microsoft lets users manage their own security information, including self-service password resets, phone numbers, and authentication methods. This policy requires users to satisfy a current MFA method before adding or changing those methods.

**Why this policy is important:** A threat actor who gains access to an account may try to add an MFA method for persistence. Requiring a fresh MFA challenge before a method change adds an important hurdle.

> This policy requires a Temporary Access Pass workflow for users who need to register security information without an existing method. It may not fit every onboarding scenario.

### CA20 — All Apps: Block for All Users when On Travel Advisory List

**What this policy does:** Prevents sign-ins from countries on a travel advisory list.

**Why this policy is important:** It is useful only when your organization does not conduct business in those locations. For a U.S.-only user base, blocking the higher-level countries on the U.S. travel advisory list can be appropriate. It does not prevent sign-ins through anonymous IPs or VPNs, so pair it with controls for that activity.

### CA30 — All Apps: Block for All Users when Using Legacy Authentication

**What this policy does:** Blocks older protocols, such as SMTP, that cannot enforce modern authentication controls.

**Why this policy is important:** Microsoft began disabling many of these protocols by default, but legacy authentication still appears in real environments. Microsoft provides a managed Conditional Access policy for it; whether you use that or a policy you manage, having the control in place is what matters.

Microsoft reports that more than 97 percent of credential-stuffing attacks and more than 99 percent of password-spray attacks use legacy authentication protocols.

### CA40 — All Apps: Block for All Users when Not in US

**What this policy does:** Blocks access outside the U.S.

**Why this policy is important:** This policy is written for a U.S.-based environment. If your users are based elsewhere, consider restricting access to your home country instead. Apply it only when your organization does not need to conduct business outside its approved locations.

### CA50 — All Apps: Block for All Users when in IncidentResponse-BlockSignIn Group

**What this policy does:** Blocks access for users who are placed in a designated group.

**Why this policy is important:** Adding a compromised user to a block-sign-in group is one of the quickest containment actions available. To make it effective, use session control, continuous access evaluation, and a sign-in frequency of **Every time**.

### CA60 — All Apps: Require MFA for All Users when Sign-In is Risky

**What this policy does:** Requires a new MFA challenge when Microsoft identifies a sign-in as risky.

**Why this policy is important:** Microsoft has built-in detections for suspicious account activity. When a sign-in looks risky, a new MFA prompt can help validate the user before access continues.

> Taking action on risky users in Microsoft Entra requires P2 licensing for every user targeted by that policy.

### CA70 — All Apps: Require Risk Remediation for All Users when Risk is Medium or High

**What this policy does:** Requires flagged risky users to be remediated before they can sign in again. Remediation may be an administrator password reset, SSPR, or an MFA reset.

**Why this policy is important:** Microsoft can correlate multiple factors and label a compromised account as a risky user. In environments that support it, blocking users at medium or high risk and requiring administrator-led remediation can offer a stronger control.

> Taking action on risky users in Microsoft Entra requires P2 licensing for every user targeted by that policy.

### CA80 — Azure Management: Block for All Users when Not in Azure Admins Group

**What this policy does:** Requires users to be in a managed, cloud-only group before they can sign in to Azure management portals.

**Why this policy is important:** It prevents general users from accessing Azure management and makes it easier to track the accounts that are allowed to administer Azure, regardless of their privilege level.

### CA90 — Azure Management: Require Strong MFA for All Users when in Azure Admins Group

**What this policy does:** Requires users in the Azure Admins group to use a strong MFA method, such as a passkey or security key, when signing in to Azure management.

**Why this policy is important:** Passkeys and security keys are less susceptible to theft and phishing than traditional MFA methods. Pairing them with cloud-only administrative accounts that do not have email access provides additional protection.

### CA91 — Azure Management: Require MFA for All Users when Activating PIM Roles

**What this policy does:** Requires accounts assigned to privileged roles to satisfy MFA when activating the role.

**Why this policy is important:** If an administrator account is compromised, its privileges should not be readily available. A fresh MFA prompt before PIM role activation reduces that risk.

These are baseline policies, not a comprehensive Conditional Access design. Microsoft will continue to add recommendations, and your policies should evolve with your environment.
